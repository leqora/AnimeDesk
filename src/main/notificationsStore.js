import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

const MAX_ITEMS = 30

// Persisted in-app notification list (the "bell"). Items are stored oldest-first and listed newest-first.
// Text is only series title + episode number (no spoilers).
export function createNotificationsStore(file, { now = Date.now, onChange = () => {} } = {}) {
  const loaded = readJson(file, { version: 1, items: [] }).data
  const wellFormed = (i) => i !== null && typeof i === 'object' && typeof i.id === 'string' && typeof i.animeId === 'string' && i.animeId !== '' &&
    typeof i.title === 'string' && i.title.trim() !== '' && Number.isInteger(i.episode) && i.episode > 0 && Number.isFinite(i.at) && typeof i.read === 'boolean'
  const db = { version: 1, items: loaded && !Array.isArray(loaded) && Array.isArray(loaded.items) ? loaded.items.filter(wellFormed) : [] }

  const persist = () => {
    try { writeJsonAtomic(file, db) } catch (err) { console.warn('notifications: write failed', err?.message) } // in-memory state stays valid
  }
  const list = () => db.items.map((i) => ({ ...i })).reverse()
  const unreadCount = () => db.items.filter((i) => !i.read).length
  const changed = () => {
    try { onChange({ items: list(), unread: unreadCount() }) } catch (err) { console.warn('notifications: onChange failed', err?.message) }
  }

  return {
    add({ animeId, title, episode }) {
      if (typeof animeId !== 'string' || animeId === '' || typeof title !== 'string' || title.trim() === '' || !Number.isInteger(episode) || episode <= 0) return null
      const item = { id: crypto.randomUUID(), animeId, title: title.trim(), episode, at: now(), read: false }
      db.items.push(item)
      if (db.items.length > MAX_ITEMS) db.items.splice(0, db.items.length - MAX_ITEMS)
      persist()
      changed()
      return { ...item }
    },
    list,
    markAllRead() {
      for (const i of db.items) i.read = true
      persist()
      changed()
    },
    unreadCount,
  }
}
