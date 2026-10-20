import { readJson, writeJsonAtomic } from './jsonStore.js'
import { RULES_VERSION, seedsFrom, pickPersonal, pickTrending, pickSimilar, decideMode } from '../shared/recommendations.js'

export const FIRST_RUN_MS = 120_000
export const DEBOUNCE_MS = 30_000
export const SEED_TTL_MS = 604_800_000
export const TRENDING_TTL_MS = 86_400_000
export const RETRY_AFTER_FAIL_MS = 3_600_000
export const KEEP_HIDDEN_POSTERS = 20
const DAY_MS = 86_400_000
const SLACK_MS = 1000 // a timer that fires a hair early must still find the expiring entries stale
const FILE_VERSION = 1

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const validId = (id) => Number.isInteger(id) && id > 0
const str = (v) => (typeof v === 'string' ? v : null)
const num = (v) => (Number.isFinite(v) ? v : null)

// Keeps only well-formed items (spec 12); fields the rules do not use are normalised, never trusted.
function cleanItem(i) {
  if (!isObj(i) || !validId(i.id) || !Number.isInteger(i.rank) || i.rank < 0 || typeof i.eligible !== 'boolean') return null
  if (i.coverUrl !== null && typeof i.coverUrl !== 'string') return null
  return {
    id: i.id, title: str(i.title), romaji: str(i.romaji), english: str(i.english), format: str(i.format), status: str(i.status),
    year: num(i.year), episodes: num(i.episodes), genres: Array.isArray(i.genres) ? i.genres.filter((g) => typeof g === 'string').slice(0, 3) : [],
    coverUrl: i.coverUrl, rank: i.rank, rating: num(i.rating), eligible: i.eligible,
  }
}
const cleanItems = (arr) => (Array.isArray(arr) ? arr.map(cleanItem).filter(Boolean) : [])

// Card shape of list() / forSeries() (no cover URL, no rank, no rating).
const card = (i, poster, from) => ({
  id: i.id, title: i.title, romaji: i.romaji, format: i.format, status: i.status, year: i.year,
  episodes: i.episodes, genres: i.genres, poster, ...from,
})

// "Recommended for you" rail + "Similar" section of the detail: asks AniList (batched per seed, 7 days; trending 24 h
// only while the personal list is empty), keeps answers and posters of the shown cards in cache/recommendations.json
// and serves list() from that cache only. One refresh at a time (a request during a run runs once more afterwards),
// a failure keeps the old cache and pauses the network for 1 h, stop() makes any in-flight result a no-op.
export function createRecommendations({
  file, library, anilist, settings,
  now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
  posterTimeoutMs = 8000,
}) {
  let bySeed = {} // { [seedId]: { at, recs } }
  let trending = null // { at, items }
  let posters = {} // { [id]: { coverUrl, dataUrl } }
  let failedAt = null
  let loaded = false
  let stopped = false
  let inflight = null
  let again = false
  let firstTimer = null
  let dailyTimer = null
  let debounceTimer = null
  let retryTimer = null
  let dirty = false
  let lastSig = null
  const similarInflight = new Map()
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
      if (data?.rules === RULES_VERSION) {
        if (isObj(data.bySeed)) {
          for (const [id, v] of Object.entries(data.bySeed)) {
            if (isObj(v) && Number.isFinite(v.at) && Array.isArray(v.recs)) bySeed[id] = { at: v.at, recs: cleanItems(v.recs) }
          }
        }
        if (isObj(data.trending) && Number.isFinite(data.trending.at) && Array.isArray(data.trending.items)) {
          trending = { at: data.trending.at, items: cleanItems(data.trending.items) }
        }
      }
    } catch (err) {
      console.warn('recommendations: load failed', err?.message)
      bySeed = {}; trending = null; posters = {}; failedAt = null
    }
  }

  function persist() {
    try {
      writeJsonAtomic(file, { version: FILE_VERSION, rules: RULES_VERSION, bySeed, trending, posters, failedAt })
      return true
    } catch (err) {
      console.warn('recommendations: save failed', err?.message)
      return false
    }
  }

  // null = the library could not be read (callers must not mistake that for an empty library).
  const entriesNow = () => {
    try { return library.list() ?? [] } catch (err) {
      console.warn('recommendations: library failed', err?.message)
      return null
    }
  }
  // A poster is only valid while the cover it was downloaded from is still the item's cover.
  const posterOf = (i) => (i.coverUrl && posters[i.id]?.coverUrl === i.coverUrl ? posters[i.id].dataUrl : null)
  const getCachedId = (title) => {
    const info = anilist.getCached(title)
    return info?.match === 'exact' ? info.id : null
  }
  const hiddenNow = () => settings.get().hiddenRecommendations ?? []

  function compute(entries) {
    const seeds = seedsFrom(entries, getCachedId)
    const recsBySeed = {}
    for (const [id, v] of Object.entries(bySeed)) recsBySeed[id] = v.recs
    const hidden = hiddenNow()
    const personal = pickPersonal(seeds, recsBySeed, entries, hidden, getCachedId)
    const { mode, hint } = decideMode(seeds, personal)
    const items = mode === 'personal' ? personal : pickTrending(trending?.items ?? [], entries, hidden, getCachedId)
    return { seeds, mode, hint, items }
  }

  function list() {
    load()
    const { mode, hint, items } = compute(entriesNow() ?? [])
    return {
      mode, hint,
      items: items.map((i) => card(i, posterOf(i), { fromTitle: i.fromTitle ?? null, fromId: i.fromId ?? null })),
    }
  }

  // What the rail renders, minus the data URLs (only whether a poster exists): any visible change must emit.
  const signature = () => {
    const { mode, hint, items } = compute(entriesNow() ?? [])
    return JSON.stringify([mode, hint, ...items.map((i) => [
      i.id, i.title, i.romaji, i.format, i.status, i.year, i.episodes, i.genres, i.fromTitle ?? null, i.fromId ?? null, i.coverUrl, !!posterOf(i),
    ])])
  }

  function notify() {
    for (const fn of [...listeners]) {
      try { fn() } catch { /* a listener must not break the service */ }
    }
  }

  // Emits only when what list() returns differs from what listeners last saw.
  function emitIfChanged() {
    const sig = signature()
    if (sig === lastSig) return
    lastSig = sig
    notify()
  }

  // A stored failure stamp from the future (clock corrected, damaged file) counts as "just now": it must never push
  // the retry beyond 1 h (an overflowing setTimeout delay fires at once and would loop).
  function isPaused(t) {
    if (failedAt != null && failedAt > t) { failedAt = t; dirty = true }
    return failedAt != null && t - failedAt + SLACK_MS < RETRY_AFTER_FAIL_MS
  }

  function failRefresh(err) {
    console.warn('recommendations: refresh failed', err?.message)
    failedAt = now()
    if (persist()) dirty = false
    armRetry()
    if (!stopped) emitIfChanged() // seeds may have changed the list before the trending request failed
  }

  async function runOnce() {
    load()
    if (lastSig === null) lastSig = signature()
    const entries = entriesNow()
    const t = now()
    if (entries === null) {
      // Unreadable library: no seeds can be told from "no seeds" - no requests, no pruning, nothing is wiped.
    } else if (!isPaused(t)) {
      const seeds = seedsFrom(entries, getCachedId)
      const age = (id) => (bySeed[id] ? t - bySeed[id].at : Infinity)
      const stale = seeds.filter((s) => !bySeed[s.id] || bySeed[s.id].at > t || age(s.id) + SLACK_MS >= SEED_TTL_MS).map((s) => s.id)
      if (stale.length) {
        // Seeds that expire within 24 h ride along so the expiries do not spread into one request a day.
        const query = [...stale, ...seeds.map((s) => s.id).filter((id) => !stale.includes(id) && age(id) + DAY_MS + SLACK_MS >= SEED_TTL_MS)]
        let answer
        try {
          answer = await anilist.recommendations(query)
        } catch (err) {
          if (stopped) return
          failRefresh(err)
          return
        }
        if (stopped) return
        // Ids AniList did not answer are cached as empty too, so they are not re-queried every refresh.
        for (const id of query) bySeed[id] = { at: t, recs: cleanItems(answer?.get(id)) }
        dirty = true
      }
      // Trending is only worth a request while the personal list is empty.
      if (compute(entries).mode === 'trending' && (!trending || trending.at > t || t - trending.at + SLACK_MS >= TRENDING_TTL_MS)) {
        let items
        try {
          items = await anilist.trending()
        } catch (err) {
          if (stopped) return
          failRefresh(err)
          return
        }
        if (stopped) return
        trending = { at: t, items: cleanItems(items) }
        dirty = true
      }
      if (failedAt != null) { failedAt = null; dirty = true }
      clearRetry()
      // Old answers of ids that are no longer seeds drop out (an empty/unreadable library must not wipe the cache).
      if (seeds.length) {
        const keep = new Set(seeds.map((s) => String(s.id)))
        for (const [id, v] of Object.entries(bySeed)) if (!keep.has(id) && (v.at > t || t - v.at > SEED_TTL_MS)) { delete bySeed[id]; dirty = true }
      }
      if (!(await fetchPosters(entries))) return
      prunePosters(entries)
      if (dirty && persist()) dirty = false
    } else if (!retryTimer) {
      armRetry(failedAt + RETRY_AFTER_FAIL_MS - t)
    }
    if (stopped) return
    emitIfChanged()
  }

  // Posters only for what the rail would show now; a poster that fails to download is retried next refresh.
  async function fetchPosters(entries) {
    for (const i of compute(entries).items) {
      if (!i.coverUrl) {
        if (posters[i.id]) { delete posters[i.id]; dirty = true }
        continue
      }
      if (posters[i.id]?.coverUrl === i.coverUrl) continue
      const dataUrl = await anilist.poster(i.coverUrl)
      if (stopped) return false
      if (dataUrl) { posters[i.id] = { coverUrl: i.coverUrl, dataUrl }; dirty = true }
    }
    return true
  }

  // Posters are kept only for what is shown now plus the 20 most recently hidden ids (so "undo" works offline).
  function prunePosters(entries) {
    const keep = new Set([...compute(entries).items.map((i) => String(i.id)), ...hiddenNow().slice(0, KEEP_HIDDEN_POSTERS).map(String)])
    for (const id of Object.keys(posters)) if (!keep.has(id)) { delete posters[id]; dirty = true }
  }

  function clearRetry() {
    if (retryTimer) clearT(retryTimer)
    retryTimer = null
  }

  // One shot at failedAt + 1 h so an offline start does not wait for the daily timer.
  function armRetry(delay = RETRY_AFTER_FAIL_MS) {
    clearRetry()
    retryTimer = setT(() => { retryTimer = null; fire() }, Math.min(RETRY_AFTER_FAIL_MS, Math.max(1000, delay)))
  }

  function refresh() {
    if (stopped) return Promise.resolve()
    if (inflight) {
      again = true
      return inflight
    }
    inflight = (async () => {
      try {
        do {
          again = false
          try { await runOnce() } catch (err) { console.warn('recommendations: refresh error', err?.message) }
        } while (again && !stopped)
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  const fire = () => { refresh() }

  function armDaily() {
    if (dailyTimer) clearT(dailyTimer)
    dailyTimer = setT(() => { dailyTimer = null; armDaily(); fire() }, DAY_MS)
  }

  function start() {
    stopped = false
    if (firstTimer) clearT(firstTimer)
    firstTimer = setT(() => { firstTimer = null; armDaily(); fire() }, FIRST_RUN_MS)
  }

  function check() {
    if (stopped) return
    if (debounceTimer) clearT(debounceTimer)
    debounceTimer = setT(() => { debounceTimer = null; fire() }, DEBOUNCE_MS)
  }

  function stop() {
    stopped = true
    again = false
    for (const t of [firstTimer, dailyTimer, debounceTimer, retryTimer]) if (t) clearT(t)
    firstTimer = dailyTimer = debounceTimer = retryTimer = null
  }

  // "Similar" cards of a detail page: at most 8, own request when the seed has no fresh answer.
  async function forSeries(id) {
    if (!validId(id) || stopped) return { items: [] }
    load()
    const t = now()
    const hit = bySeed[id]
    let recs
    if (hit && hit.at <= t && t - hit.at + SLACK_MS < SEED_TTL_MS) {
      recs = hit.recs
    } else {
      if (isPaused(t)) return { items: [] }
      let p = similarInflight.get(id)
      if (!p) {
        p = (async () => {
          try {
            const answer = await anilist.recommendations([id])
            return cleanItems(answer?.get(id))
          } catch (err) {
            console.warn('recommendations: similar failed', err?.message)
            return null
          }
        })().finally(() => similarInflight.delete(id))
        similarInflight.set(id, p)
      }
      recs = await p
      if (stopped || recs === null) return { items: [] }
      if (bySeed[id]?.recs !== recs) {
        if (lastSig === null) lastSig = signature() // the first thing that happens must not look like a change
        bySeed[id] = { at: t, recs }
        persist()
        emitIfChanged()
      }
    }
    const picked = pickSimilar(recs, entriesNow() ?? [], hiddenNow(), getCachedId)
    const items = await Promise.all(picked.map(async (i) => card(i, await posterFor(i), {})))
    return stopped ? { items: [] } : { items }
  }

  // Cached poster when the cover is unchanged, otherwise one download that gives up after posterTimeoutMs.
  async function posterFor(i) {
    if (posters[i.id] && posters[i.id].coverUrl === i.coverUrl) return posters[i.id].dataUrl
    if (!i.coverUrl) return null
    let timer
    const timeout = new Promise((resolve) => { timer = setT(() => resolve(null), posterTimeoutMs) })
    try {
      return await Promise.race([Promise.resolve().then(() => anilist.poster(i.coverUrl)).catch(() => null), timeout])
    } finally {
      clearT(timer)
    }
  }

  function setHidden(next) {
    load()
    settings.update({ hiddenRecommendations: next })
    lastSig = signature()
    notify()
    check() // a card that just became visible (e.g. the 21st candidate) needs its poster
    return { ok: true }
  }

  function hide(id) {
    if (!validId(id)) return { ok: false }
    return setHidden([id, ...hiddenNow().filter((h) => h !== id)])
  }

  function unhide(id) {
    if (!validId(id)) return { ok: false }
    return setHidden(hiddenNow().filter((h) => h !== id))
  }

  function onChange(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  return { start, check, refresh, list, hide, unhide, forSeries, onChange, stop }
}
