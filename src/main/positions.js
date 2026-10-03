import { readJson, writeJsonAtomic } from './jsonStore.js'
import { normalizeTitle } from '../shared/domain.js'
import { shouldOfferResume } from '../shared/player.js'

const DAY_MS = 86400000

export function createPositions(file, { now = () => Date.now() } = {}) {
  const loaded = readJson(file, { version: 1, items: {} }).data
  const db = loaded && !Array.isArray(loaded) && typeof loaded.items === 'object' && loaded.items !== null ? loaded : { version: 1, items: {} }
  const key = (title, episode) => `${normalizeTitle(String(title ?? '')).toLowerCase()}#${String(Number(episode))}`
  const persist = () => {
    try { writeJsonAtomic(file, db) } catch { /* a disk error must not break playback; the in-memory state stays valid */ }
  }

  return {
    get(title, episode) {
      const v = db.items[key(title, episode)]
      return v && shouldOfferResume(v.position, v.duration) ? { position: v.position, duration: v.duration } : null
    },
    save(title, episode, { position, duration }) {
      if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return
      db.items[key(title, episode)] = { position, duration, at: now() }
      persist()
    },
    clear(title, episode) {
      const k = key(title, episode)
      if (!(k in db.items)) return
      delete db.items[k]
      persist()
    },
    prune(maxAgeDays = 60) {
      const cutoff = now() - maxAgeDays * DAY_MS
      let changed = false
      for (const [k, v] of Object.entries(db.items)) if (!(v?.at >= cutoff)) { delete db.items[k]; changed = true }
      if (changed) persist()
    },
  }
}
