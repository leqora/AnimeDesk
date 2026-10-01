import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

export function createWatchLog(file, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  const loaded = readJson(file, { version: 1, entries: [] })
  const db = loaded.data
  const save = () => writeJsonAtomic(file, db)

  return {
    wasCorrupt: loaded.corrupt,
    list: () => db.entries.map((e) => ({ ...e })),
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
    removeAnime(animeId) {
      const before = db.entries.length
      db.entries = db.entries.filter((e) => e.animeId !== animeId)
      const removed = before - db.entries.length
      if (removed) save()
      return removed
    },
  }
}
