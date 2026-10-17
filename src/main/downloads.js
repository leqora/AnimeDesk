import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { safeDirName } from './paths.js'
import { autoAnswer, menuKind } from './aniCliBridge.js'
import { RETRYABLE_ERRORS, retryDelayMs, shouldGiveUp } from '../shared/autoDownload.js'

export function parseProgress(line) {
  const m = /\[download\]\s+([\d.]+)%/.exec(line)
  return m ? Number(m[1]) : null
}

// ani-cli names the file after its raw title, so a "/" in the title puts it in a subfolder.
function findEpisodeFile(dir, episode) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return null }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isFile() && e.name.endsWith(` Episode ${episode}.mp4`)) return full
    if (e.isDirectory()) {
      const found = findEpisodeFile(full, episode)
      if (found) return found
    }
  }
  return null
}

export function createDownloads({ file, aniCli, onChange = () => {}, onFinished = () => {}, now =() => new Date().toISOString(), uuid = () => crypto.randomUUID(), resolvePrefs = null, episodeLists = null, clock = Date.now, setTimeout: setTimer = setTimeout, clearTimeout: clearTimer = clearTimeout }) {
  const db = readJson(file, { version: 1, items: [] }).data
  const save = () => writeJsonAtomic(file, db)
  // Unfinished items survive an app restart; whatever was running or queued comes back paused.
  // Items waiting for a retry keep their status and retryAt, so the timer picks them up again.
  let queue = (db.queue ?? []).map((i) => ({ ...i, status: ['queued', 'downloading'].includes(i.status) ? 'paused' : i.status }))
  let active = null // { item, session }
  let retryTimer = null
  let disposed = false
  const MAX_TIMER_MS = 2 ** 31 - 1 // setTimeout overflows beyond this

  // Called once per item that ends as done or error (never for cancelled/paused).
  const finished = (item) => {
    try { onFinished({ title: item.title, episode: item.episode, status: item.status }) } catch (err) { console.warn('downloads: onFinished failed', err?.message) }
  }

  const emit = () => {
    db.queue = queue.filter((i) => !['done', 'cancelled'].includes(i.status))
    save()
    armRetryTimer()
    onChange()
  }

  // One timer, set for the earliest retryAt among waiting items; emit() re-arms it after every change.
  function armRetryTimer() {
    if (retryTimer != null) { clearTimer(retryTimer); retryTimer = null }
    if (disposed) return
    let earliest = null
    for (const i of queue) if (i.status === 'waiting' && (earliest == null || i.retryAt < earliest)) earliest = i.retryAt
    if (earliest == null) return
    retryTimer = setTimer(onRetryTimer, Math.min(Math.max(0, earliest - clock()), MAX_TIMER_MS))
  }

  function onRetryTimer() {
    retryTimer = null
    if (disposed) return
    const nowMs = clock()
    for (const i of queue) {
      if (i.status === 'waiting' && i.retryAt <= nowMs) { i.status = 'queued'; i.retryAt = null }
    }
    emit()
    pump()
  }

  // An auto item with a retryable error waits for its next attempt until it has been tried for too long.
  // Returns true when the item went to waiting.
  function scheduleRetry(item, error) {
    if (!item.auto || !RETRYABLE_ERRORS.includes(error)) return false
    const nowMs = clock()
    item.attempts = (item.attempts ?? 0) + 1
    item.firstTriedAt = item.firstTriedAt ?? nowMs
    if (shouldGiveUp({ firstTriedAt: item.firstTriedAt, now: nowMs })) return false
    item.status = 'waiting'
    item.error = error
    item.percent = 0
    item.retryAt = nowMs + retryDelayMs(item.attempts)
    return true
  }

  function start(item) {
    const targetDir = path.join(item.dir, safeDirName(item.title))
    item.status = 'downloading'
    item.percent = 0
    item.error = null
    let session
    let notFound = false
    try {
      fs.mkdirSync(targetDir, { recursive: true }) // ani-cli never creates it
      const prefs = resolvePrefs ? resolvePrefs(item.aniCliTitle) : {}
      item.mode = prefs.mode ?? null
      session = aniCli.startSession({
        query: item.aniCliTitle,
        quality: prefs.quality,
        mode: prefs.mode,
        player: 'download',
        episodes: item.episode,
        downloadDir: targetDir,
        onMenu: async ({ prompt, lines }) => {
          if (menuKind(prompt) === 'episode' && item.mode) {
            try { episodeLists?.set(item.aniCliTitle, item.mode, lines) } catch (err) { console.warn('downloads: saving the episode list failed', err?.message) }
          }
          const answer = autoAnswer(prompt, lines, { anime: item.aniCliTitle, episode: item.episode })
          if (answer == null && menuKind(prompt) === 'anime') notFound = true
          return answer
        },
        onLine: (line) => {
          const p = parseProgress(line)
          if (p != null) { item.percent = p; onChange() } // progress is not worth a disk write per line
        },
      })
    } catch (err) {
      // e.g. "tools-missing" or a folder that cannot be created: fail this item, keep the queue moving
      item.status = 'error'
      item.error = err.message
      emit()
      finished(item)
      pump()
      return
    }
    active = { item, session }
    emit()
    session.done.then((r) => {
      active = null
      const wasDownloading = item.status === 'downloading'
      if (wasDownloading) {
        if (r.ok) {
          const found = findEpisodeFile(targetDir, item.episode)
          if (found) {
            db.items.push({ id: uuid(), title: item.title, episode: item.episode, path: found, size: fs.statSync(found).size, downloadedAt: now(), ...(item.mode ? { mode: item.mode } : {}) })
            save()
            item.status = 'done'
            item.percent = 100
          } else {
            item.status = 'error'
            item.error = 'file-not-found'
          }
        } else {
          const error = notFound ? 'not-found' : (r.error ?? 'unknown')
          if (!scheduleRetry(item, error)) {
            item.status = 'error'
            item.error = error
          }
        }
      }
      emit()
      if (wasDownloading && item.status !== 'waiting') finished(item)
      pump()
    })
  }

  function pump() {
    if (active) return
    const next = queue.find((i) => i.status === 'queued')
    if (next) start(next)
  }

  const isDownloaded = (title, episode) => db.items.some((e) => e.title === title && e.episode === episode && fs.existsSync(e.path))

  function enqueue({ title, aniCliTitle, episodes, dir, auto = false }) {
    for (const ep of episodes) {
      const episode = String(ep)
      const existing = queue.find((i) => i.aniCliTitle === aniCliTitle && i.episode === episode && !['done', 'cancelled'].includes(i.status))
      if (existing) {
        // asking again for a stopped episode means "try again", never a second copy
        if (['paused', 'error'].includes(existing.status)) existing.status = 'queued'
        continue
      }
      if (isDownloaded(title, episode)) continue
      queue.push({ id: uuid(), title, aniCliTitle, episode, dir, status: 'queued', percent: 0, error: null, ...(auto ? { auto: true } : {}) })
    }
    emit()
    pump()
    return queueItems()
  }

  function retryFailed() {
    for (const i of queue) if (i.status === 'error') i.status = 'queued'
    emit()
    pump()
  }

  function pause(id) {
    const item = queue.find((i) => i.id === id)
    if (!item) return
    if (item.status === 'downloading' && active?.item === item) {
      item.status = 'paused'
      active.session.kill()
    } else if (item.status === 'queued') {
      item.status = 'paused'
    }
    emit()
  }

  function resume(id) {
    const item = queue.find((i) => i.id === id)
    if (!item || !['paused', 'error', 'waiting'].includes(item.status)) return
    item.status = 'queued'
    item.retryAt = null
    emit()
    pump()
  }

  function cancel(id) {
    const item = queue.find((i) => i.id === id)
    if (!item) return
    queue = queue.filter((i) => i !== item)
    if (active?.item === item) {
      item.status = 'cancelled'
      active.session.kill()
    }
    emit()
  }

  const queueItems = () => queue.map((i) => ({ ...i }))
  const withMissing = (e) => ({ ...e, missing: !fs.existsSync(e.path) })

  armRetryTimer() // a retryAt that passed while the app was closed fires right away

  return {
    dispose() { disposed = true; if (retryTimer != null) { clearTimer(retryTimer); retryTimer = null } },
    enqueue, retryFailed, pause, resume, cancel, queueItems,
    listDownloaded: () => db.items.map(withMissing),
    getDownloaded: (id) => { const e = db.items.find((x) => x.id === id); return e ? withMissing(e) : null },
    removeDownloaded(id, { deleteFile = false } = {}) {
      const e = db.items.find((x) => x.id === id)
      if (!e) return false
      if (deleteFile) fs.rmSync(e.path, { force: true })
      db.items = db.items.filter((x) => x !== e)
      save()
      return true
    },
  }
}
