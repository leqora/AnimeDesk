import { readJson, writeJsonAtomic } from './jsonStore.js'
import { normalizeTitle } from '../shared/domain.js'
import { shouldOfferResume } from '../shared/player.js'

const DAY_MS = 86400000

// Validates imported positions: key `<title>#<episode>`, finite position, duration > 0, finite `at`.
export function sanitizePositions(raw) {
  const items = {}
  const src = raw !== null && typeof raw === 'object' && !Array.isArray(raw) && raw.items !== null && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {}
  for (const [k, v] of Object.entries(src)) {
    // the title may itself contain '#': the episode is whatever follows the last one
    const cut = k.lastIndexOf('#')
    const ep = k.slice(cut + 1)
    if (cut < 1 || ep === '' || String(Number(ep)) !== ep) continue
    if (v === null || typeof v !== 'object') continue
    if (!Number.isFinite(v.position) || !Number.isFinite(v.duration) || v.duration <= 0 || !Number.isFinite(v.at)) continue
    items[k] = { position: v.position, duration: v.duration, at: v.at }
  }
  return { version: 1, items }
}

export function createPositions(file, { now = () => Date.now() } = {}) {
  const loaded = readJson(file, { version: 1, items: {} }).data
  let db = loaded && !Array.isArray(loaded) && typeof loaded.items === 'object' && loaded.items !== null ? loaded : { version: 1, items: {} }
  const key = (title, episode) => `${normalizeTitle(String(title ?? '')).toLowerCase()}#${String(Number(episode))}`
  const persist = () => {
    try { writeJsonAtomic(file, db) } catch (err) { console.warn('positions: write failed', err?.message) } // a disk error must not break playback; in-memory state stays valid
  }
  const listeners = new Set()
  const emit = (kind) => {
    for (const cb of listeners) {
      try { cb(kind) } catch (err) { console.warn('positions: listener failed', err?.message) } // a listener must not break saving
    }
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
      emit('save')
    },
    clear(title, episode) {
      const k = key(title, episode)
      if (!(k in db.items)) return
      delete db.items[k]
      persist()
      emit('clear')
    },
    prune(maxAgeDays = 60) {
      const cutoff = now() - maxAgeDays * DAY_MS
      let changed = false
      for (const [k, v] of Object.entries(db.items)) if (!(v?.at >= cutoff)) { delete db.items[k]; changed = true }
      if (changed) { persist(); emit('prune') }
    },
    // Every resumable position of one series, keyed by episode ('4', '12.5'). The '#' in the prefix keeps
    // "Naruto" from matching "Naruto Shippuden".
    forSeries(title) {
      const name = normalizeTitle(String(title ?? '')).toLowerCase()
      const out = {}
      if (!name) return out
      const prefix = `${name}#`
      for (const [k, v] of Object.entries(db.items)) {
        if (k.startsWith(prefix) && v && shouldOfferResume(v.position, v.duration)) out[k.slice(prefix.length)] = { position: v.position, duration: v.duration }
      }
      return out
    },
    snapshot: () => ({ version: 1, items: structuredClone(db.items) }),
    // `next` is already sanitized. Unlike `persist`, a failed write throws (before anything changes).
    replaceAll(next) {
      const fresh = { version: 1, items: structuredClone(next.items) }
      writeJsonAtomic(file, fresh)
      db = fresh
      emit('clear')
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
