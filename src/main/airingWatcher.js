import { readJson, writeJsonAtomic } from './jsonStore.js'
import { AIRED_GRACE_MS, airedCount } from '../shared/airing.js'

const WINDOW_MS = 24 * 3600 * 1000 // an aired episode older than this is never announced
const REFRESH_FIRST_MS = 60 * 1000
const REFRESH_EVERY_MS = 6 * 3600 * 1000
const MAX_CHECK_DELAY_MS = REFRESH_EVERY_MS

const validId = (id) => Number.isInteger(id) && id > 0
const watched = (entries) => entries.filter((e) => e?.status === 'watching' && validId(e.aniListId))

// Memory per series: { episode, freshAt }. freshAt = last time a check on freshly refreshed data included
// this series; it vouches that nothing newer than that was missed. Old flat { id: episode } is migrated.
const normEntry = (v) => {
  if (Number.isInteger(v) && v >= 0) return { episode: v, freshAt: null }
  if (v && typeof v === 'object' && Number.isInteger(v.episode) && v.episode >= 0) {
    return { episode: v.episode, freshAt: Number.isFinite(v.freshAt) ? v.freshAt : null }
  }
  return null
}
export function normalizeNotified(raw) {
  const out = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, v] of Object.entries(raw)) {
      const n = normEntry(v)
      if (n) out[id] = n
    }
  }
  return out
}

// Pure. `notified` maps aniListId -> { episode, freshAt } (flat numbers accepted).
// - unseen id: seed with the current aired count, never notify (no flood after an update / first run);
//   with no known aired count (no schedule yet) nothing is seeded, so a schedule appearing later seeds silently
// - new aired episode: notify once (the newest one) if it aired within 24 h. The air time is known only
//   while nextAiring still points at that episode; once the cache moved on it is unknown, so we trust the
//   series' OWN freshAt being within 24 h (a series paused or missing from recent fresh checks stays silent).
// - `fresh`: the cache was just refreshed; series with info are stamped freshAt = now.
export function dueNotifications({ entries, infoById, notified, now, fresh = false }) {
  const next = normalizeNotified(notified)
  const due = []
  for (const e of watched(entries)) {
    const info = infoById?.[e.aniListId]
    if (!info) continue
    const aired = airedCount(info, now)
    if (aired == null) continue
    const prev = next[e.aniListId]
    const stamp = fresh ? now : (prev?.freshAt ?? null)
    if (!prev) {
      next[e.aniListId] = { episode: aired, freshAt: stamp }
      continue
    }
    next[e.aniListId] = { episode: Math.max(prev.episode, aired), freshAt: stamp }
    if (aired <= prev.episode) continue
    const na = info.nextAiring
    const recent = now >= na.airingAt
      ? now - na.airingAt <= WINDOW_MS
      : Number.isFinite(prev.freshAt) && now - prev.freshAt <= WINDOW_MS
    if (recent) due.push({ animeId: e.id, aniListId: e.aniListId, title: e.title, episode: aired })
  }
  return { due, notified: next }
}

export function createAiringWatcher({
  library, anilist, file, notify,
  now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
  setInterval: setI = globalThis.setInterval,
  clearInterval: clearI = globalThis.clearInterval,
}) {
  let loaded = null
  try { loaded = readJson(file, { notified: {} }).data } catch (err) { console.warn('airingWatcher: read failed', err?.message) }
  const state = { notified: normalizeNotified(loaded?.notified) }

  let firstRefreshTimer = null
  let intervalTimer = null
  let checkTimer = null
  let graceTimer = null
  let running = false
  let stopped = false
  let inflight = null

  const persist = () => {
    try { writeJsonAtomic(file, state) } catch (err) { console.warn('airingWatcher: write failed', err?.message) }
  }

  const infoMap = (entries) => {
    const map = {}
    for (const e of watched(entries)) {
      const info = anilist.getCached(null, { aniListId: e.aniListId })
      if (info) map[e.aniListId] = info
    }
    return map
  }

  function armCheck(entries, infoById, t) {
    if (!running) return
    if (checkTimer) clearT(checkTimer)
    let delay = MAX_CHECK_DELAY_MS
    for (const e of watched(entries)) {
      const at = infoById[e.aniListId]?.nextAiring?.airingAt
      if (Number.isFinite(at) && at > t) delay = Math.min(delay, at - t)
    }
    checkTimer = setT(() => { checkTimer = null; check() }, delay)
  }

  function armGrace() {
    if (!running) return
    if (graceTimer) clearT(graceTimer)
    graceTimer = setT(() => { graceTimer = null; refresh() }, AIRED_GRACE_MS)
  }

  // `fresh`: the cache was just refreshed, so per-series freshAt may advance. Plain timer checks work from
  // possibly stale cache and must not vouch for the 24 h window.
  // `confirmed`: internal, a cache check run after a failed confirming refresh; it announces from cache.
  // A check that is neither fresh nor confirmed never announces: if something is due it asks for fresh data
  // first (an episode AniList has since delayed must not be announced), and keeps the memory of the due
  // series untouched so the confirming fresh check still sees them as new.
  function check({ fresh = false, confirmed = false } = {}) {
    if (stopped) return
    const t = now()
    let entries = []
    try { entries = library.list() } catch (err) { console.warn('airingWatcher: library failed', err?.message) }
    const infoById = infoMap(entries)
    const { due, notified } = dueNotifications({ entries, infoById, notified: state.notified, now: t, fresh })
    const needsConfirm = !fresh && !confirmed && due.length > 0
    if (needsConfirm) {
      // Persist memory for series that are not due; keep the previous entry for the due ones.
      const merged = { ...notified }
      for (const item of due) {
        const prev = state.notified[item.aniListId]
        if (prev) merged[item.aniListId] = prev
        else delete merged[item.aniListId]
      }
      state.notified = merged
      persist()
      armCheck(entries, infoById, t)
      refresh().then((ok) => {
        if (!ok && !stopped) check({ confirmed: true }) // refresh failed: announce from cache, once
      })
      return
    }
    state.notified = notified
    persist()
    for (const item of due) {
      try { notify(item) } catch (err) { console.warn('airingWatcher: notify failed', err?.message) }
    }
    if (due.length) armGrace()
    armCheck(entries, infoById, t)
  }

  // Resolves true when fresh data was applied and checked, false when the refresh failed or the watcher stopped.
  function refresh() {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const ids = [...new Set(watched(library.list()).map((e) => e.aniListId))]
        if (ids.length) await anilist.refreshAiring(ids)
      } catch (err) {
        console.warn('airingWatcher: refresh failed', err?.message) // scheduled runs retry; no retry loop here
        return false
      } finally {
        inflight = null
      }
      if (stopped) return false
      check({ fresh: true })
      return true
    })()
    return inflight
  }

  function start() {
    if (running) return
    running = true
    stopped = false
    check()
    firstRefreshTimer = setT(() => { firstRefreshTimer = null; refresh() }, REFRESH_FIRST_MS)
    intervalTimer = setI(() => { refresh() }, REFRESH_EVERY_MS)
  }

  function stop() {
    running = false
    stopped = true
    if (firstRefreshTimer) clearT(firstRefreshTimer)
    if (intervalTimer) clearI(intervalTimer)
    if (checkTimer) clearT(checkTimer)
    if (graceTimer) clearT(graceTimer)
    firstRefreshTimer = intervalTimer = checkTimer = graceTimer = null
  }

  return { start, refresh, check, stop }
}
