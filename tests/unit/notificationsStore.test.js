import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createNotificationsStore } from '../../src/main/notificationsStore.js'

let dir, file
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-')); file = path.join(dir, 'notifications.json') })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('notificationsStore', () => {
  it('adds items and lists them newest first', () => {
    let t = 1000
    const store = createNotificationsStore(file, { now: () => t++ })
    const a = store.add({ animeId: 'a1', title: 'A', episode: 1 })
    store.add({ animeId: 'b1', title: 'B', episode: 2 })
    expect(a).toMatchObject({ animeId: 'a1', title: 'A', episode: 1, at: 1000, read: false })
    expect(typeof a.id).toBe('string')
    expect(store.list().map((i) => i.title)).toEqual(['B', 'A'])
    expect(store.unreadCount()).toBe(2)
  })
  it('keeps at most 30, dropping the oldest', () => {
    const store = createNotificationsStore(file)
    for (let i = 1; i <= 35; i++) store.add({ animeId: `x${i}`, title: `T${i}`, episode: i })
    const items = store.list()
    expect(items).toHaveLength(30)
    expect(items[0].title).toBe('T35')
    expect(items[29].title).toBe('T6')
  })
  it('markAllRead zeroes the unread count', () => {
    const store = createNotificationsStore(file)
    store.add({ animeId: 'a', title: 'A', episode: 1 })
    store.markAllRead()
    expect(store.unreadCount()).toBe(0)
    expect(store.list()[0].read).toBe(true)
  })
  it('persists and reloads', () => {
    const store = createNotificationsStore(file)
    store.add({ animeId: 'a', title: 'A', episode: 1 })
    store.add({ animeId: 'b', title: 'B', episode: 2 })
    store.markAllRead()
    store.add({ animeId: 'c', title: 'C', episode: 3 })
    const again = createNotificationsStore(file)
    expect(again.list().map((i) => i.title)).toEqual(['C', 'B', 'A'])
    expect(again.unreadCount()).toBe(1)
  })
  it('treats a corrupt file as empty', () => {
    fs.writeFileSync(file, '{not json')
    const store = createNotificationsStore(file)
    expect(store.list()).toEqual([])
    expect(store.add({ animeId: 'a', title: 'A', episode: 1 }).title).toBe('A')
  })
  it('treats a wrongly shaped file as empty', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, items: 'nope' }))
    expect(createNotificationsStore(file).list()).toEqual([])
  })
  it('rejects invalid input without storing or notifying', () => {
    const onChange = vi.fn()
    const store = createNotificationsStore(file, { onChange })
    for (const bad of [
      { animeId: 'a', title: '', episode: 1 }, { animeId: 'a', title: '   ', episode: 1 }, { animeId: 'a', title: 5, episode: 1 },
      { animeId: 'a', title: 'A', episode: 0 }, { animeId: 'a', title: 'A', episode: 1.5 }, { animeId: 'a', title: 'A', episode: '2' },
      { animeId: '', title: 'A', episode: 1 }, { animeId: 7, title: 'A', episode: 1 },
    ]) expect(store.add(bad)).toBeNull()
    expect(store.list()).toEqual([])
    expect(onChange).not.toHaveBeenCalled()
  })
  it('drops malformed items on load', () => {
    const good = { id: 'g', animeId: 'a', title: 'A', episode: 1, at: 5, read: false }
    fs.writeFileSync(file, JSON.stringify({ version: 1, items: [null, { bad: true }, good, 'x'] }))
    const store = createNotificationsStore(file)
    expect(store.list()).toEqual([good])
    expect(store.unreadCount()).toBe(1)
    store.markAllRead()
    expect(store.unreadCount()).toBe(0)
  })
  it('calls onChange with { items, unread } on add and markAllRead', () => {
    const onChange = vi.fn()
    const store = createNotificationsStore(file, { onChange })
    store.add({ animeId: 'a', title: 'A', episode: 1 })
    expect(onChange).toHaveBeenLastCalledWith({ items: store.list(), unread: 1 })
    store.markAllRead()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ items: store.list(), unread: 0 })
  })
})
