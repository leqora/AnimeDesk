import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

const MAX_ITEMS = 30

// Persisted in-app notification list (the "bell"). Items are stored oldest-first and listed newest-first.
// Text is only series title + episode number (no spoilers).
export function createNotificationsStore(file, { now = Date.now, onChange = () => {} } = {}) {
  const loaded = readJson(file, { version: 1, items: [] }).data
  const db = loaded && !Array.isArray(loaded) && Array.isArray(loaded.items) ? loaded : { version: 1, items: [] }

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
      const item = { id: crypto.randomUUID(), animeId, title, episode, at: now(), read: false }
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
