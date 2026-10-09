import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { safeDirName } from './paths.js'
import { autoAnswer, menuKind } from './aniCliBridge.js'

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

export function createDownloads({ file, aniCli, onChange = () => {}, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID(), resolvePrefs = null }) {
  const db = readJson(file, { version: 1, items: [] }).data
  const save = () => writeJsonAtomic(file, db)
  // Unfinished items survive an app restart; whatever was running or waiting comes back paused.
  let queue = (db.queue ?? []).map((i) => ({ ...i, status: ['queued', 'downloading'].includes(i.status) ? 'paused' : i.status }))
  let active = null // { item, session }

  const emit = () => {
    db.queue = queue.filter((i) => !['done', 'cancelled'].includes(i.status))
    save()
    onChange()
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
      session = aniCli.startSession({
        query: item.aniCliTitle,
        quality: prefs.quality,
        mode: prefs.mode,
        player: 'download',
        episodes: item.episode,
        downloadDir: targetDir,
        onMenu: async ({ prompt, lines }) => {
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
      pump()
      return
    }
    active = { item, session }
    emit()
    session.done.then((r) => {
      active = null
      if (item.status === 'downloading') {
        if (r.ok) {
          const found = findEpisodeFile(targetDir, item.episode)
          if (found) {
            db.items.push({ id: uuid(), title: item.title, episode: item.episode, path: found, size: fs.statSync(found).size, downloadedAt: now() })
            save()
            item.status = 'done'
            item.percent = 100
          } else {
            item.status = 'error'
            item.error = 'file-not-found'
          }
        } else {
          item.status = 'error'
          item.error = notFound ? 'not-found' : (r.error ?? 'unknown')
        }
      }
      emit()
      pump()
    })
  }

  function pump() {
    if (active) return
    const next = queue.find((i) => i.status === 'queued')
    if (next) start(next)
  }

  const isDownloaded = (title, episode) => db.items.some((e) => e.title === title && e.episode === episode && fs.existsSync(e.path))

  function enqueue({ title, aniCliTitle, episodes, dir }) {
    for (const ep of episodes) {
      const episode = String(ep)
      const existing = queue.find((i) => i.aniCliTitle === aniCliTitle && i.episode === episode && !['done', 'cancelled'].includes(i.status))
      if (existing) {
        // asking again for a stopped episode means "try again", never a second copy
        if (['paused', 'error'].includes(existing.status)) existing.status = 'queued'
        continue
      }
      if (isDownloaded(title, episode)) continue
      queue.push({ id: uuid(), title, aniCliTitle, episode, dir, status: 'queued', percent: 0, error: null })
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
    if (!item || !['paused', 'error'].includes(item.status)) return
    item.status = 'queued'
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

  return {
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
