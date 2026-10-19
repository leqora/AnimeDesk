import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

// Validates an imported log: only entries of known series with a finite episode and a time stay; sorted by time.
export function sanitizeWatchLog(raw, animeIds, { uuid = () => crypto.randomUUID() } = {}) {
  const src = raw !== null && typeof raw === 'object' && Array.isArray(raw.entries) ? raw.entries : []
  const entries = []
  for (const e of src) {
    if (e === null || typeof e !== 'object') continue
    if (typeof e.animeId !== 'string' || !animeIds.has(e.animeId)) continue
    if (typeof e.episode !== 'number' || !Number.isFinite(e.episode)) continue
    if (typeof e.at !== 'string' || !e.at || typeof e.source !== 'string') continue
    entries.push({ id: typeof e.id === 'string' && e.id ? e.id : uuid(), animeId: e.animeId, episode: e.episode, at: e.at, source: e.source })
  }
  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return { version: 1, entries }
}

export function createWatchLog(file, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  const loaded = readJson(file, { version: 1, entries: [] })
  let db = loaded.data
  if (!Array.isArray(db.entries)) db.entries = []
  const save = () => writeJsonAtomic(file, db)

  return {
    wasCorrupt: loaded.corrupt,
    list: () => db.entries.map((e) => ({ ...e })),
    snapshot: () => ({ version: 1, entries: structuredClone(db.entries) }),
    // `next` is already sanitized; written first so a failed write leaves the current data untouched.
    replaceAll(next) {
      const fresh = { version: 1, entries: structuredClone(next.entries) }
      writeJsonAtomic(file, fresh)
      db = fresh
    },
    append({ animeId, episode, source }) {
      const entry = { id: uuid(), animeId, episode: Number(episode), at: now(), source }
      db.entries.push(entry)
      save()
      return { ...entry }
    },
    removeLatest(animeId, episode) {
      const ep = Number(episode)
      const i = db.entries.findLastIndex((e) => e.animeId === animeId && e.episode === ep)
      if (i < 0) return false
      db.entries.splice(i, 1)
      save()
      return true
    },
    // Re-add entries that are not present (by id), keeping the log ordered by time.
    restore(entries) {
      const have = new Set(db.entries.map((e) => e.id))
      const missing = entries.filter((e) => !have.has(e.id)).map((e) => ({ ...e }))
      if (!missing.length) return 0
      db.entries = [...db.entries, ...missing].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      save()
      return missing.length
    },
    removeAnime(animeId) {
      const before = db.entries.length
      db.entries = db.entries.filter((e) => e.animeId !== animeId)
      const removed = before - db.entries.length
      if (removed) save()
      return removed
    },
  }
}
