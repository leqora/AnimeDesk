import fs from 'node:fs'
import { createPosterLimiter } from './posterLimiter.js'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { RULES_VERSION } from '../shared/recommendations.js'
import { libraryMatch } from '../shared/schedule.js'
import { RAIL_KEYS, buildRails, nextSeason, seasonOf } from '../shared/discover.js'

export const TTL_MS = 43_200_000
export const RETRY_AFTER_FAIL_MS = 3_600_000
export const FORCE_MIN_MS = 60_000
export const MAX_POSTER_IDS = 40
export const POSTER_CONCURRENCY = 4
const FILE_VERSION = 1
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const validId = (id) => Number.isInteger(id) && id > 0
const str = (v) => (typeof v === 'string' ? v : null)
const numOrNull = (v) => (Number.isFinite(v) ? v : null)
const cleanSeason = (s) => (isObj(s) && SEASONS.includes(s.season) && Number.isInteger(s.year) ? { season: s.season, year: s.year } : null)

// Keeps only well-formed discover items (the raw shape anilist.discover returns); anything else in the file is dropped.
function cleanItem(i) {
  if (!isObj(i) || !validId(i.id) || typeof i.shown !== 'boolean') return null
  if (i.coverUrl !== null && typeof i.coverUrl !== 'string') return null
  const start = isObj(i.start) && Number.isInteger(i.start.year)
    ? { year: i.start.year, month: Number.isInteger(i.start.month) ? i.start.month : null }
    : null
  return {
    id: i.id, title: str(i.title), romaji: str(i.romaji), english: str(i.english), format: str(i.format), status: str(i.status),
    year: numOrNull(i.year), episodes: numOrNull(i.episodes),
    genres: Array.isArray(i.genres) ? i.genres.filter((g) => typeof g === 'string') : [],
    start, coverUrl: i.coverUrl, shown: i.shown,
  }
}

function cleanRaw(r) {
  const out = {}
  for (const key of RAIL_KEYS) out[key] = (Array.isArray(r?.[key]) ? r[key] : []).map(cleanItem).filter(Boolean)
  return out
}

// "Otkrij" page cache (cache/discover.json). Only title, poster, year, format, episode count and genres of a series are handled:
// nothing about single episodes (spec 9), so nothing here goes through seriesEpisodes.js. The network is asked only from list()
// (the page being open; never at start, never by a timer, never from the tray) (spec 11): when there is no record, it is older
// than 12 h, its fetchedAt is in the future, or it is from another season. list() answers at once with what it has and refreshes
// in the background; a failure keeps the record and pauses the network for 1 h (force skips the pause at most once a minute).
// A library poster is not special-cased here: posters come from the stored coverUrl through a service-wide limiter of 4
// downloads. forget() wipes everything without touching the network, stop() makes in-flight results no-ops.
export function createDiscover({
  file, library, anilist, settings,
  now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
  posterTimeoutMs = 8000,
}) {
  let record = null // { fetchedAt, season, raw }
  let posters = {} // { [id]: { coverUrl, dataUrl } }
  let failedAt = null
  let lastForceAt = null
  let loaded = false
  let stopped = false
  let inflight = null
  let gen = 0 // bumped by forget(): results of work started before it are discarded
  const listeners = new Set()

  function load() {
    if (loaded) return
    loaded = true
    try {
      const { data } = readJson(file, {})
      if (isObj(data?.posters)) {
        for (const [id, v] of Object.entries(data.posters)) {
          if (isObj(v) && typeof v.coverUrl === 'string' && typeof v.dataUrl === 'string') posters[id] = { coverUrl: v.coverUrl, dataUrl: v.dataUrl }
        }
      }
      if (Number.isFinite(data?.failedAt)) failedAt = data.failedAt
      const season = cleanSeason(data?.season)
      if (data?.rules === RULES_VERSION && Number.isFinite(data.fetchedAt) && season && isObj(data.raw)) {
        record = { fetchedAt: data.fetchedAt, season, raw: cleanRaw(data.raw) }
      }
    } catch (err) {
      console.warn('discover: load failed', err?.message)
      record = null; posters = {}; failedAt = null
    }
  }

  function persist() {
    try {
      writeJsonAtomic(file, {
        version: FILE_VERSION, rules: RULES_VERSION, fetchedAt: record?.fetchedAt ?? null, season: record?.season ?? null,
        raw: record?.raw ?? { season: [], upcoming: [], movies: [], trending: [] }, posters, failedAt,
      })
      return true
    } catch (err) {
      console.warn('discover: save failed', err?.message)
      return false
    }
  }

  function notify() {
    for (const fn of [...listeners]) {
      try { fn() } catch { /* a listener must not break the service */ }
    }
  }

  // An unreadable library counts as empty (no error shown, nothing is wiped).
  const entriesNow = () => {
    try { return library.list() ?? [] } catch (err) {
      console.warn('discover: library failed', err?.message)
      return []
    }
  }
  const hiddenNow = () => {
    const v = settings.get().hiddenRecommendations
    return Array.isArray(v) ? v.filter(Number.isInteger) : []
  }
  // The AniList title cache is read synchronously; ids only when the match is exact.
  function lookups() {
    const memo = new Map()
    const getCachedId = (title) => {
      if (!memo.has(title)) {
        let info = null
        try { info = anilist.getCached(title) ?? null } catch { info = null }
        memo.set(title, info)
      }
      const info = memo.get(title)
      return info?.match === 'exact' ? info.id : null
    }
    return { getCachedId }
  }
  const matchOf = (item, entries, getCachedId) =>
    libraryMatch({ mediaId: item.id, romaji: item.romaji, english: item.english, title: item.title }, entries, getCachedId)

  // A stored failure stamp from the future counts as "just now".
  function isPaused(t) {
    if (failedAt != null && failedAt > t) failedAt = t
    return failedAt != null && t - failedAt < RETRY_AFTER_FAIL_MS
  }

  function needsRefresh(t, cur) {
    return !record || record.fetchedAt > t || t - record.fetchedAt >= TTL_MS ||
      record.season.season !== cur.season || record.season.year !== cur.year
  }

  function startRefresh(cur) {
    const g = gen
    const nx = nextSeason(cur)
    let call
    try { call = Promise.resolve(anilist.discover({ season: cur.season, year: cur.year, nextSeason: nx.season, nextYear: nx.year })) } catch (err) { call = Promise.reject(err) }
    const p = (async () => {
      try { // the first await keeps `finally` from running before inflight is assigned
        const raw = cleanRaw(await call)
        if (stopped || g !== gen) return
        record = { fetchedAt: now(), season: cur, raw }
        failedAt = null
        const keep = new Set(RAIL_KEYS.flatMap((k) => raw[k].map((i) => String(i.id))))
        for (const id of Object.keys(posters)) if (!keep.has(id)) delete posters[id]
        persist()
      } catch (err) {
        if (stopped || g !== gen) return
        console.warn('discover: refresh failed', err?.message)
        failedAt = now()
        persist()
      } finally {
        if (inflight === p) inflight = null
        if (!stopped && g === gen) notify()
      }
    })()
    inflight = p
  }

  // Rails as the service sees them now (library read fresh), items still carrying coverUrl.
  function currentRails(entries, getCachedId) {
    const raw = record?.raw ?? { season: [], upcoming: [], movies: [], trending: [] }
    return buildRails(raw, { isInLibrary: (i) => matchOf(i, entries, getCachedId) !== null })
  }

  function list({ force = false } = {}) {
    load()
    const t = now()
    const cur = seasonOf(t)
    if (!stopped && !inflight && needsRefresh(t, cur)) {
      if (!isPaused(t)) {
        if (force) lastForceAt = t
        startRefresh(cur)
      } else if (force && (lastForceAt == null || lastForceAt > t || t - lastForceAt >= FORCE_MIN_MS)) {
        lastForceAt = t
        startRefresh(cur)
      }
    }
    const entries = entriesNow()
    const { getCachedId } = lookups()
    const built = currentRails(entries, getCachedId)
    const rails = {}
    for (const key of RAIL_KEYS) {
      rails[key] = built[key].map((i) => ({
        id: i.id, title: i.title, romaji: i.romaji, format: i.format, status: i.status, year: i.year, episodes: i.episodes,
        genres: i.genres, start: i.start, entryId: matchOf(i, entries, getCachedId)?.id ?? null,
      }))
    }
    let state
    if (!record) state = !inflight && failedAt != null ? 'error' : 'loading'
    else state = failedAt != null ? 'stale' : 'ok'
    // When a forced retry becomes allowed again (null when it is allowed now or nothing is waiting for it).
    const retryAt = !inflight && needsRefresh(t, cur) && isPaused(t) && lastForceAt != null && lastForceAt <= t && t - lastForceAt < FORCE_MIN_MS
      ? lastForceAt + FORCE_MIN_MS
      : null
    const season = record?.season ?? cur
    return {
      state, refreshing: !!inflight, fetchedAt: record?.fetchedAt ?? null, retryAt,
      season, next: nextSeason(season), rails, hiddenIds: hiddenNow(),
    }
  }

  // At most POSTER_CONCURRENCY downloads at once across all posters() calls (shared limiter).
  const limiter = createPosterLimiter({ concurrency: POSTER_CONCURRENCY, timeoutMs: posterTimeoutMs, setTimeout: setT, clearTimeout: clearT })
  // Stopped or forgotten while waiting for a slot: the download is not started (the slot still passes on).
  const download = (g, key, url) => limiter.download(key, () => ((stopped || g !== gen) ? null : anilist.poster(url, { timeoutMs: posterTimeoutMs })))

  async function posterList(ids) {
    load()
    const g = gen
    const wanted = [...new Set((Array.isArray(ids) ? ids : []).slice(0, MAX_POSTER_IDS))]
    const result = {}
    const { getCachedId } = lookups()
    const built = currentRails(entriesNow(), getCachedId)
    const byId = new Map(RAIL_KEYS.flatMap((k) => built[k]).map((i) => [i.id, i]))
    const todo = []
    let added = false
    for (const id of wanted) {
      result[id] = null
      const item = byId.get(Number(id))
      if (!item || !item.coverUrl) continue
      const cached = posters[item.id]
      if (cached && cached.coverUrl === item.coverUrl) { result[id] = cached.dataUrl; continue }
      todo.push({ id, item })
    }
    await Promise.all(todo.map(async ({ id, item }) => {
      const dataUrl = await download(g, `${g}|${item.id}|${item.coverUrl}`, item.coverUrl)
      if (stopped || g !== gen) return
      if (typeof dataUrl === 'string' && dataUrl) {
        posters[item.id] = { coverUrl: item.coverUrl, dataUrl }
        result[id] = dataUrl
        added = true
      }
    }))
    if (added && !stopped && g === gen) persist() // once per batch
    return result
  }

  function forget() {
    gen++
    loaded = true
    record = null; posters = {}; failedAt = null; lastForceAt = null; inflight = null
    try { fs.rmSync(file, { force: true }) } catch (err) { console.warn('discover: forget failed', err?.message) }
    if (!stopped) notify()
  }

  function onChange(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  function stop() { stopped = true }

  return { list, posters: posterList, forget, onChange, stop }
}
