import { autoDownloadCandidates, nextCheckAt, initialAfter } from '../shared/autoDownload.js'

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

  function check() {
    if (stopped) return
    const t = now()
    const entries = listEntries()
    const infoById = infoMap(entries)
    try {
      const dir = settings.get().downloadDir
      // Without a folder nothing is handed over and the boundary stays, so nothing is lost.
      if (dir) {
        const candidates = autoDownloadCandidates({ entries, prefsFor, infoById, now: t })
        for (const c of candidates) {
          const entry = entries.find((e) => e.id === c.animeId)
          try {
            downloads.enqueue({ title: entry?.title ?? c.aniCliTitle, aniCliTitle: c.aniCliTitle, episodes: c.episodes.map(String), dir, auto: true })
            // Moves even if enqueue skipped the episodes (already downloaded / queued): never hand them again.
            seriesPrefs.setAutoDownload(c.aniCliTitle, { after: Math.max(...c.episodes) })
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
    seriesPrefs.setAutoDownload(entry.aniCliTitle, { after: initialAfter({ entry, info: cachedInfo(entry), now: now() }) })
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
