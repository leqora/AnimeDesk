import { autoDownloadCandidates, nextCheckAt, initialRecord, knownAired, SOURCE_LAG_MS } from '../shared/autoDownload.js'

const FIRST_CHECK_MS = 90 * 1000
const CHECK_EVERY_MS = 30 * 60 * 1000
const MAX_TIMER_MS = 6 * 3600 * 1000

// Hands newly aired episodes of switched-on series to the download queue. Only series title + episode
// numbers are ever used here.
export function createAutoDownloader({
  library, anilist, seriesPrefs, settings, downloads,
  now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
  setInterval: setI = globalThis.setInterval,
  clearInterval: clearI = globalThis.clearInterval,
}) {
  let running = false
  let stopped = false
  let firstTimer = null
  let intervalTimer = null
  let wakeTimer = null

  const prefsFor = (title) => seriesPrefs.getAutoDownload(title)

  const cachedInfo = (e) => {
    try { return anilist.getCached(null, { aniListId: e.aniListId }) } catch (err) {
      console.warn('autoDownloader: cache failed', err?.message)
      return null
    }
  }

  const infoMap = (entries) => {
    const map = {}
    for (const e of entries) {
      if (e?.status !== 'watching' || !e.aniListId) continue
      const info = cachedInfo(e)
      if (info) map[e.aniListId] = info
    }
    return map
  }

  const listEntries = () => {
    try { return library.list() ?? [] } catch (err) {
      console.warn('autoDownloader: library failed', err?.message)
      return []
    }
  }

  // Re-armed after every check: wakes up when the next episode becomes fetchable, never later than 6 h.
  function armWake(entries, infoById, t) {
    if (!running) return
    if (wakeTimer) clearT(wakeTimer)
    let delay = MAX_TIMER_MS
    try {
      const at = nextCheckAt({ entries, prefsFor, infoById, now: t })
      if (Number.isFinite(at)) delay = Math.min(MAX_TIMER_MS, Math.max(1000, at - t))
    } catch (err) { console.warn('autoDownloader: nextCheckAt failed', err?.message) }
    wakeTimer = setT(() => { wakeTimer = null; check() }, delay)
  }

  // Remembers the schedule last seen (AniList drops nextAiring after a finale or in a gap) and settles a
  // pending record once the aired count is known. Never hands anything itself; one write per change.
  function syncRecords(entries, infoById, t) {
    for (const e of entries) {
      if (e?.status !== 'watching' || !e.aniListId || !e.aniCliTitle) continue
      try {
        const rec = seriesPrefs.getAutoDownload(e.aniCliTitle)
        if (!rec) continue
        const info = infoById[e.aniListId]
        let next = rec
        const seen = info?.nextAiring
        const stored = rec.next
        const same = stored && seen && stored.episode === seen.episode && stored.airingAt === seen.airingAt
        // A just-aired episode keeps its own schedule until its lag is over, so it stays held after the
        // confirming refresh already moved the cache on to the next episode.
        const keepStored = stored && seen && seen.episode > stored.episode && t < stored.airingAt + SOURCE_LAG_MS
        if (Number.isInteger(seen?.episode) && Number.isFinite(seen?.airingAt) && !same && !keepStored) {
          next = { ...next, next: { episode: seen.episode, airingAt: seen.airingAt } }
        }
        if (next.pending) {
          const aired = knownAired(info, next, t)
          if (aired != null) {
            const { pending: _pending, ...rest } = next
            next = { ...rest, after: Math.max(rest.after, aired) }
          }
        }
        if (next !== rec) seriesPrefs.setAutoDownload(e.aniCliTitle, next)
      } catch (err) {
        console.warn('autoDownloader: record sync failed', err?.message)
      }
    }
  }

  function check() {
    if (stopped) return
    const t = now()
    const entries = listEntries()
    const infoById = infoMap(entries)
    syncRecords(entries, infoById, t)
    try {
      const dir = settings.get().downloadDir
      // Without a folder nothing is handed over and the boundary stays, so nothing is lost.
      if (dir) {
        const candidates = autoDownloadCandidates({ entries, prefsFor, infoById, now: t })
        for (const c of candidates) {
          try {
            downloads.enqueue({ title: c.aniCliTitle, aniCliTitle: c.aniCliTitle, episodes: c.episodes.map(String), dir, auto: true })
            // Same title as manual downloads (aniCliTitle) so dedup and the folder match.
            // Moves even if enqueue skipped the episodes (already downloaded / queued): never hand them again.
            // If this write fails the next check re-hands the same episodes; enqueue skips queued/downloaded ones.
            seriesPrefs.setAutoDownload(c.aniCliTitle, { ...prefsFor(c.aniCliTitle), after: Math.max(...c.episodes) })
          } catch (err) {
            console.warn('autoDownloader: enqueue failed', err?.message)
          }
        }
      }
    } catch (err) {
      console.warn('autoDownloader: check failed', err?.message)
    }
    armWake(entries, infoById, t)
  }

  function setEnabled(animeId, enabled) {
    const entry = listEntries().find((e) => e.id === animeId)
    if (!entry) return { ok: false, error: 'not-found' }
    if (!entry.aniCliTitle) return { ok: false, error: 'no-title' }
    if (!enabled) {
      seriesPrefs.setAutoDownload(entry.aniCliTitle, null)
      return { ok: true, enabled: false }
    }
    if (!settings.get().downloadDir) return { ok: false, error: 'no-dir' }
    // Idempotent: an existing boundary is kept so a repeated enable cannot skip a backlog.
    // Without a known schedule the record is pending (see syncRecords).
    if (!seriesPrefs.getAutoDownload(entry.aniCliTitle)) seriesPrefs.setAutoDownload(entry.aniCliTitle, initialRecord({ entry, info: cachedInfo(entry), now: now() }))
    check()
    return { ok: true, enabled: true }
  }

  function start() {
    if (running) return
    running = true
    stopped = false
    firstTimer = setT(() => { firstTimer = null; check() }, FIRST_CHECK_MS)
    intervalTimer = setI(() => { check() }, CHECK_EVERY_MS)
  }

  function stop() {
    running = false
    stopped = true
    if (firstTimer) clearT(firstTimer)
    if (intervalTimer) clearI(intervalTimer)
    if (wakeTimer) clearT(wakeTimer)
    firstTimer = intervalTimer = wakeTimer = null
  }

  return { start, stop, check, setEnabled }
}
