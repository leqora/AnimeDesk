import fs from 'node:fs'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { RULES_VERSION } from '../shared/recommendations.js'
import { dayWindow, libraryMatch, shownInAll } from '../shared/schedule.js'

export const TTL_MS = 21_600_000
export const RETRY_AFTER_FAIL_MS = 3_600_000
export const FORCE_MIN_MS = 60_000
export const MAX_POSTER_IDS = 40
export const POSTER_CONCURRENCY = 4
const FILE_VERSION = 1

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const validId = (id) => Number.isInteger(id) && id > 0
const str = (v) => (typeof v === 'string' ? v : null)

// Keeps only well-formed schedule items; anything else in the file is dropped, never trusted.
function cleanItem(i) {
  if (!isObj(i) || !validId(i.mediaId) || !Number.isInteger(i.episode) || i.episode < 1) return null
  if (!Number.isFinite(i.airingAt) || typeof i.isAdult !== 'boolean' || typeof i.poster !== 'boolean') return null
  if (i.coverUrl !== null && typeof i.coverUrl !== 'string') return null
  return {
    mediaId: i.mediaId, episode: i.episode, airingAt: i.airingAt, title: str(i.title), romaji: str(i.romaji),
    english: str(i.english), format: str(i.format), isAdult: i.isAdult, coverUrl: i.coverUrl, poster: i.poster,
  }
}

// Weekly airing schedule (cache/schedule.json). Only episode numbers and air times are handled: no descriptions, no episode
// titles/images, so nothing here goes through seriesEpisodes.js. The network is asked only from list() (never at start, never
// by a timer): when there is no record, it is older than 6 h or from another local day. list() answers at once with what it has
// and refreshes in the background; a failure keeps the record and pauses the network for 1 h (force skips the pause at most
// once a minute). Posters: a library poster comes from the AniList cache (no network), a later part / side story outside the
// library is never downloaded. forget() wipes everything without touching the network, stop() makes in-flight results no-ops.
export function createSchedule({
  file, library, anilist,
  now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
  posterTimeoutMs = 8000,
}) {
  let record = null // { fetchedAt, from, to, items }
  let posters = {} // { [mediaId]: { coverUrl, dataUrl } }
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
      if (data?.rules === RULES_VERSION && Number.isFinite(data.fetchedAt) && Number.isFinite(data.from) && Number.isFinite(data.to) && Array.isArray(data.items)) {
        record = { fetchedAt: data.fetchedAt, from: data.from, to: data.to, items: data.items.map(cleanItem).filter(Boolean) }
      }
    } catch (err) {
      console.warn('schedule: load failed', err?.message)
      record = null; posters = {}; failedAt = null
    }
  }

  function persist() {
    try {
      writeJsonAtomic(file, {
        version: FILE_VERSION, rules: RULES_VERSION, fetchedAt: record?.fetchedAt ?? null, from: record?.from ?? null,
        to: record?.to ?? null, items: record?.items ?? [], posters, failedAt,
      })
      return true
    } catch (err) {
      console.warn('schedule: save failed', err?.message)
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
      console.warn('schedule: library failed', err?.message)
      return []
    }
  }
  const getCachedId = (title) => {
    const info = anilist.getCached(title)
    return info?.match === 'exact' ? info.id : null
  }

  // Poster of the library entry straight from the AniList cache, or null when it is not a sure record (spec 15).
  function libraryPoster(item, entry) {
    if (!entry) return null
    let info = null
    try {
      if (entry.aniListId != null) info = anilist.getCached(entry.title, { aniListId: entry.aniListId })
      else {
        const byTitle = anilist.getCached(entry.title)
        info = byTitle?.match === 'exact' ? byTitle : null
      }
    } catch { info = null }
    return info && info.id === item.mediaId && typeof info.poster === 'string' && info.poster ? info.poster : null
  }

  // A stored failure stamp from the future counts as "just now".
  function isPaused(t) {
    if (failedAt != null && failedAt > t) failedAt = t
    return failedAt != null && t - failedAt < RETRY_AFTER_FAIL_MS
  }

  function needsRefresh(t, w) {
    return !record || record.from !== w.from || record.fetchedAt > t || t - record.fetchedAt >= TTL_MS
  }

  function startRefresh(w) {
    const g = gen
    let call
    try { call = Promise.resolve(anilist.schedule(w.from, w.to)) } catch (err) { call = Promise.reject(err) }
    const p = (async () => {
      try { // the first await keeps `finally` from running before inflight is assigned
        const items = ((await call) ?? []).map(cleanItem).filter(Boolean)
        if (stopped || g !== gen) return
        record = { fetchedAt: now(), from: w.from, to: w.to, items }
        failedAt = null
        const keep = new Set(items.map((i) => String(i.mediaId)))
        for (const id of Object.keys(posters)) if (!keep.has(id)) delete posters[id]
        persist()
      } catch (err) {
        if (stopped || g !== gen) return
        console.warn('schedule: refresh failed', err?.message)
        failedAt = now()
        persist()
      } finally {
        if (inflight === p) inflight = null
        if (!stopped && g === gen) notify()
      }
    })()
    inflight = p
  }

  function list({ force = false } = {}) {
    load()
    const t = now()
    const w = dayWindow(t)
    if (!stopped && !inflight && needsRefresh(t, w)) {
      if (!isPaused(t)) {
        if (force) lastForceAt = t
        startRefresh(w)
      } else if (force && (lastForceAt == null || lastForceAt > t || t - lastForceAt >= FORCE_MIN_MS)) {
        lastForceAt = t
        startRefresh(w)
      }
    }
    const entries = entriesNow()
    const items = []
    for (const it of record?.items ?? []) {
      if (!(it.airingAt >= w.from && it.airingAt < w.to)) continue
      const entry = libraryMatch(it, entries, getCachedId)
      if (!entry && !shownInAll(it)) continue
      items.push({
        mediaId: it.mediaId, episode: it.episode, airingAt: it.airingAt, title: it.title, romaji: it.romaji, format: it.format,
        entryId: entry?.id ?? null,
        posterHidden: it.poster === false && !libraryPoster(it, entry),
      })
    }
    let state
    if (!record) state = !inflight && failedAt != null ? 'error' : 'loading'
    else state = failedAt != null ? 'stale' : 'ok'
    return { state, refreshing: !!inflight, fetchedAt: record?.fetchedAt ?? null, from: w.from, days: w.days, items }
  }

  // One download that gives up (null) after posterTimeoutMs.
  async function download(url) {
    let timer
    const timeout = new Promise((resolve) => { timer = setT(() => resolve(null), posterTimeoutMs) })
    try {
      return await Promise.race([Promise.resolve().then(() => anilist.poster(url)).catch(() => null), timeout])
    } finally {
      clearT(timer)
    }
  }

  async function posterList(ids) {
    load()
    const g = gen
    const wanted = [...new Set((Array.isArray(ids) ? ids : []).slice(0, MAX_POSTER_IDS))]
    const result = {}
    const entries = entriesNow()
    const todo = []
    for (const id of wanted) {
      result[id] = null
      const item = (record?.items ?? []).find((i) => i.mediaId === Number(id))
      if (!item) continue
      const entry = libraryMatch(item, entries, getCachedId)
      const own = libraryPoster(item, entry)
      if (own) { result[id] = own; continue }
      if (item.poster === false || (item.isAdult && !entry) || !item.coverUrl) continue
      const cached = posters[item.mediaId]
      if (cached && cached.coverUrl === item.coverUrl) { result[id] = cached.dataUrl; continue }
      todo.push({ id, item })
    }
    let next = 0
    const worker = async () => {
      while (next < todo.length && !stopped && g === gen) {
        const { id, item } = todo[next++]
        const dataUrl = await download(item.coverUrl)
        if (stopped || g !== gen) return
        if (typeof dataUrl === 'string' && dataUrl) {
          posters[item.mediaId] = { coverUrl: item.coverUrl, dataUrl }
          result[id] = dataUrl
          persist()
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(POSTER_CONCURRENCY, todo.length) }, worker))
    return result
  }

  function forget() {
    gen++
    loaded = true
    record = null; posters = {}; failedAt = null; lastForceAt = null; inflight = null
    try { fs.rmSync(file, { force: true }) } catch (err) { console.warn('schedule: forget failed', err?.message) }
    if (!stopped) notify()
  }

  function onChange(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  function stop() { stopped = true }

  return { list, posters: posterList, forget, onChange, stop }
}
