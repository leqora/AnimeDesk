import { readJson, writeJsonAtomic } from './jsonStore.js'
import { AIRED_GRACE_MS, airedCount } from '../shared/airing.js'

const WINDOW_MS = 24 * 3600 * 1000 // an aired episode older than this is never announced
const REFRESH_FIRST_MS = 60 * 1000
const REFRESH_EVERY_MS = 6 * 3600 * 1000
const MAX_CHECK_DELAY_MS = REFRESH_EVERY_MS

const validId = (id) => Number.isInteger(id) && id > 0
const watched = (entries) => entries.filter((e) => e?.status === 'watching' && validId(e.aniListId))

// Pure. `notified` maps aniListId -> highest episode already accounted for.
// - unseen id: seed with the current aired count, never notify (no flood after an update / first run)
// - new aired episode: notify once (the newest one) if it aired within 24 h. The air time is known only
//   while nextAiring still points at that episode; once the cache moved on it is unknown, so we trust
//   `lastCheckAt` (the last check that ran on freshly refreshed data) being within 24 h instead.
export function dueNotifications({ entries, infoById, notified, lastCheckAt = null, now }) {
  const next = { ...notified }
  const due = []
  for (const e of watched(entries)) {
    const info = infoById?.[e.aniListId]
    if (!info) continue
    const aired = airedCount(info, now)
    const seen = next[e.aniListId]
    if (seen === undefined) {
      next[e.aniListId] = aired ?? 0
      continue
    }
    if (aired == null || aired <= seen) continue
    const na = info.nextAiring
    const recent = now >= na.airingAt
      ? now - na.airingAt <= WINDOW_MS
      : Number.isFinite(lastCheckAt) && now - lastCheckAt <= WINDOW_MS
    next[e.aniListId] = aired
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
  const loaded = readJson(file, { lastCheckAt: null, notified: {} }).data
  const state = {
    lastCheckAt: Number.isFinite(loaded?.lastCheckAt) ? loaded.lastCheckAt : null,
    notified: loaded && typeof loaded.notified === 'object' && loaded.notified && !Array.isArray(loaded.notified) ? { ...loaded.notified } : {},
  }

  let firstRefreshTimer = null
  let intervalTimer = null
  let checkTimer = null
  let graceTimer = null
  let running = false
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

  // `fresh`: the cache was just refreshed, so lastCheckAt may advance (it vouches "nothing newer than this
  // was missed"). Plain timer checks work from possibly stale cache and must not vouch for the 24 h window.
  function check({ fresh = false } = {}) {
    const t = now()
    let entries = []
    try { entries = library.list() } catch (err) { console.warn('airingWatcher: library failed', err?.message) }
    const infoById = infoMap(entries)
    const { due, notified } = dueNotifications({ entries, infoById, notified: state.notified, lastCheckAt: state.lastCheckAt, now: t })
    state.notified = notified
    if (fresh) state.lastCheckAt = t
    persist()
    for (const item of due) {
      try { notify(item) } catch (err) { console.warn('airingWatcher: notify failed', err?.message) }
    }
    if (due.length) armGrace()
    armCheck(entries, infoById, t)
  }

  function refresh() {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const ids = [...new Set(watched(library.list()).map((e) => e.aniListId))]
        if (ids.length) await anilist.refreshAiring(ids)
        check({ fresh: true })
      } catch (err) {
        console.warn('airingWatcher: refresh failed', err?.message) // scheduled runs retry; no retry loop here
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  function start() {
    if (running) return
    running = true
    check()
    firstRefreshTimer = setT(() => { firstRefreshTimer = null; refresh() }, REFRESH_FIRST_MS)
    intervalTimer = setI(() => { refresh() }, REFRESH_EVERY_MS)
  }

  function stop() {
    running = false
    if (firstRefreshTimer) clearT(firstRefreshTimer)
    if (intervalTimer) clearI(intervalTimer)
    if (checkTimer) clearT(checkTimer)
    if (graceTimer) clearT(graceTimer)
    firstRefreshTimer = intervalTimer = checkTimer = graceTimer = null
  }

  return { start, refresh, check, stop }
}
