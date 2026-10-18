import { readJson, writeJsonAtomic } from './jsonStore.js'
import { pickMissedSequels, sourceIds } from '../shared/sequels.js'

export const FIRST_RUN_MS = 90_000
export const DEBOUNCE_MS = 30_000
export const TTL_MS = 86_400_000
export const RETRY_AFTER_FAIL_MS = 3_600_000
const TTL_SLACK_MS = 1000 // a timer that fires a hair early must still find the 24 h entries stale
const FILE_VERSION = 1

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

// "Missed sequels" rail: for every completed series asks AniList (batched, cached 24 h per prequel) which sequels
// exist, keeps the answers and the posters of the shown ones in cache/sequels.json, and serves list() from that
// cache only. One refresh at a time (a request during a run runs once more afterwards), a failure keeps the old
// cache and pauses the network for 1 h, stop() makes any in-flight result a no-op.
export function createSequels({
  file, library, anilist, settings,
  now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
}) {
  let byId = {} // { [prequelId]: { at, sequels } }
  let posters = {} // { [sequelId]: { coverUrl, dataUrl } }
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
  const listeners = new Set()

  function load() {
    if (loaded) return
    loaded = true
    try {
      const { data } = readJson(file, {})
      if (isObj(data?.byId)) {
        for (const [id, v] of Object.entries(data.byId)) {
          if (isObj(v) && Number.isFinite(v.at) && Array.isArray(v.sequels)) byId[id] = { at: v.at, sequels: v.sequels.filter((s) => isObj(s) && Number.isInteger(s.id)) }
        }
      }
      if (isObj(data?.posters)) {
        for (const [id, v] of Object.entries(data.posters)) {
          if (isObj(v) && typeof v.coverUrl === 'string' && typeof v.dataUrl === 'string') posters[id] = { coverUrl: v.coverUrl, dataUrl: v.dataUrl }
        }
      }
      if (Number.isFinite(data?.failedAt)) failedAt = data.failedAt
    } catch (err) {
      console.warn('sequels: load failed', err?.message)
      byId = {}; posters = {}; failedAt = null
    }
  }

  function persist() {
    try {
      writeJsonAtomic(file, { version: FILE_VERSION, byId, posters, failedAt })
      return true
    } catch (err) {
      console.warn('sequels: save failed', err?.message)
      return false
    }
  }

  const entriesNow = () => {
    try { return library.list() ?? [] } catch (err) {
      console.warn('sequels: library failed', err?.message)
      return []
    }
  }
  const getCachedId = (title) => anilist.getCached(title)?.id ?? null
  const hiddenNow = () => settings.get().hiddenSequels ?? []

  function visible(entries) {
    const sequelsById = {}
    for (const [id, v] of Object.entries(byId)) sequelsById[id] = v.sequels
    return pickMissedSequels(entries, sequelsById, hiddenNow(), getCachedId)
  }

  function list() {
    load()
    return visible(entriesNow()).map((s) => ({
      id: s.id, title: s.title, romaji: s.romaji, format: s.format, status: s.status, year: s.year,
      episodes: s.episodes, poster: posters[s.id]?.dataUrl ?? null, fromTitle: s.fromTitle, fromId: s.fromId,
    }))
  }

  // What the rail renders, minus the data URLs (only whether a poster exists): any visible change must emit.
  const signature = () => JSON.stringify(visible(entriesNow()).map((s) => [
    s.id, s.fromId, s.title, s.format, s.status, s.year, s.episodes, s.coverUrl, !!posters[s.id],
  ]))

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

  async function runOnce() {
    load()
    if (lastSig === null) lastSig = signature()
    const entries = entriesNow()
    const t = now()
    // A stored failure stamp from the future (clock corrected, damaged file) counts as "just now": it must never push
    // the retry beyond 1 h (an overflowing setTimeout delay fires at once and would loop).
    if (failedAt != null && failedAt > t) { failedAt = t; dirty = true }
    // Same slack as the TTL: a retry timer that fires a hair early must not find itself still paused.
    const paused = failedAt != null && t - failedAt + TTL_SLACK_MS < RETRY_AFTER_FAIL_MS

    if (!paused) {
      const wanted = [...new Set(sourceIds(entries, getCachedId).map((s) => s.prequelId))]
      const stale = wanted.filter((id) => !byId[id] || byId[id].at > t || t - byId[id].at + TTL_SLACK_MS >= TTL_MS)
      if (stale.length) {
        let answer
        try {
          answer = await anilist.relations(stale)
        } catch (err) {
          if (stopped) return
          console.warn('sequels: refresh failed', err?.message)
          failedAt = now()
          if (persist()) dirty = false
          armRetry()
          return
        }
        if (stopped) return
        // Ids AniList did not answer (deleted/unknown media) are cached as empty too, so they are not re-queried every refresh.
        for (const id of stale) byId[id] = { at: t, sequels: answer?.get(id) ?? [] }
        dirty = true
      }
      if (failedAt != null) { failedAt = null; dirty = true }
      clearRetry()
      // Prequels that are no longer completed library entries drop out of the cache (an unreadable library must not wipe it).
      if (wanted.length) {
        const keep = new Set(wanted.map(String))
        for (const id of Object.keys(byId)) if (!keep.has(id)) { delete byId[id]; dirty = true }
      }
      if (!(await fetchPosters(entries))) return
      if (wanted.length) prunePosters(entries) // no sources (unreadable library): keep every poster too
      if (dirty && persist()) dirty = false
    } else if (!retryTimer) {
      armRetry(failedAt + RETRY_AFTER_FAIL_MS - t)
    }
    if (stopped) return
    emitIfChanged()
  }

  // Posters only for what the rail would show now; a poster that fails to download is retried next refresh.
  async function fetchPosters(entries) {
    for (const s of visible(entries)) {
      if (!s.coverUrl || posters[s.id]?.coverUrl === s.coverUrl) continue
      const dataUrl = await anilist.poster(s.coverUrl)
      if (stopped) return false
      if (dataUrl) { posters[s.id] = { coverUrl: s.coverUrl, dataUrl }; dirty = true }
    }
    return true
  }

  // Posters are kept only for what is shown now plus hidden ids (so "undo" works offline).
  function prunePosters(entries) {
    const keep = new Set([...visible(entries).map((s) => String(s.id)), ...hiddenNow().map(String)])
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
          try { await runOnce() } catch (err) { console.warn('sequels: refresh error', err?.message) }
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
    dailyTimer = setT(() => { dailyTimer = null; armDaily(); fire() }, TTL_MS)
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

  function setHidden(next) {
    load()
    settings.update({ hiddenSequels: next })
    lastSig = signature()
    notify()
    check() // a card that just became visible (e.g. the 21st candidate) needs its poster
    return { ok: true }
  }

  const validId = (id) => Number.isInteger(id) && id > 0

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

  return { start, check, refresh, list, hide, unhide, onChange, stop }
}
