import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { safeDirName } from './paths.js'
import { autoAnswer } from './aniCliBridge.js'

export function parseProgress(line) {
  const m = /\[download\]\s+([\d.]+)%/.exec(line)
  return m ? Number(m[1]) : null
}

function findEpisodeFile(dir, episode) {
  let names
  try { names = fs.readdirSync(dir) } catch { return null }
  const name = names.find((n) => n.endsWith(` Episode ${episode}.mp4`))
  return name ? path.join(dir, name) : null
}

export function createDownloads({ file, aniCli, onChange = () => {}, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() }) {
  const db = readJson(file, { version: 1, items: [] }).data
  const save = () => writeJsonAtomic(file, db)
  let queue = []
  let active = null // { item, session }

  const emit = () => onChange()

  function start(item) {
    const targetDir = path.join(item.dir, safeDirName(item.title))
    item.status = 'downloading'
    item.percent = 0
    item.error = null
    const session = aniCli.startSession({
      query: item.aniCliTitle,
      player: 'download',
      episodes: item.episode,
      downloadDir: targetDir,
      onMenu: async ({ prompt, lines }) => autoAnswer(prompt, lines, { anime: item.aniCliTitle, episode: item.episode }),
      onLine: (line) => {
        const p = parseProgress(line)
        if (p != null) { item.percent = p; emit() }
      },
    })
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
          item.error = r.error ?? 'unknown'
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

  function enqueue({ title, aniCliTitle, episodes, dir }) {
    for (const episode of episodes) {
      queue.push({ id: uuid(), title, aniCliTitle, episode: String(episode), dir, status: 'queued', percent: 0, error: null })
    }
    emit()
    pump()
    return queueItems()
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
    enqueue, pause, resume, cancel, queueItems,
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
