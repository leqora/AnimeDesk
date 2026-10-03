import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLibrary } from '../../src/main/library.js'

let file, lib, n
const opts = () => ({ now: () => `2026-10-01T00:00:0${n}Z`, uuid: () => `id-${++n}` })
beforeEach(() => {
  n = 0
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-lib-')), 'library.json')
  lib = createLibrary(file, opts())
})

describe('library', () => {
  it('pins up to 5 series and keeps the first pin time when re-pinned', () => {
    let t = 0
    const lib = createLibrary(file, { now: () => `2026-10-03T00:00:0${t++}Z` })
    const ids = Array.from({ length: 6 }, (_, i) => lib.add({ title: `S${i}` }).id)
    expect(lib.get(ids[0]).pinnedAt).toBeNull()
    const first = lib.setPinned(ids[0], true).pinnedAt
    expect(first).toMatch(/^2026/)
    expect(lib.setPinned(ids[0], true).pinnedAt).toBe(first)
    for (const id of ids.slice(1, 5)) lib.setPinned(id, true)
    expect(() => lib.setPinned(ids[5], true)).toThrow('pin-limit')
    expect(lib.get(ids[5]).pinnedAt).toBeNull()
    lib.setPinned(ids[0], false)
    expect(lib.get(ids[0]).pinnedAt).toBeNull()
    expect(lib.setPinned(ids[5], true).pinnedAt).toMatch(/^2026/)
  })
  it('treats entries saved before pins existed as unpinned', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, anime: { a: { id: 'a', title: 'Old', aniCliTitle: null, aniListId: null, status: 'planned', rating: null, comment: '', totalEpisodes: null, watchedEpisodes: [], episodeNotes: {}, addedAt: 'x', updatedAt: 'x', lastWatchedAt: null } } }))
    const lib = createLibrary(file)
    expect(lib.setPinned('a', true).pinnedAt).toBeTruthy()
  })
  it('adds an entry with defaults and persists it', () => {
    const e = lib.add({ title: 'Frieren' })
    expect(e).toMatchObject({ id: 'id-1', title: 'Frieren', status: 'planned', rating: null, comment: '', watchedEpisodes: [], episodeNotes: {}, lastWatchedAt: null })
    expect(createLibrary(file).list()).toHaveLength(1)
  })
  it('rejects invalid rating, status and empty title', () => {
    const e = lib.add({ title: 'X' })
    expect(() => lib.update(e.id, { rating: 11 })).toThrow()
    expect(() => lib.update(e.id, { rating: 7.5 })).toThrow()
    expect(() => lib.update(e.id, { status: 'binging' })).toThrow()
    expect(() => lib.add({ title: '  ' })).toThrow()
    expect(lib.update(e.id, { rating: null }).rating).toBeNull()
  })
  it('updates editable fields, sorts and de-duplicates watched episodes', () => {
    const e = lib.add({ title: 'X' })
    const u = lib.update(e.id, { rating: 9, comment: 'odlično', watchedEpisodes: [3, 1, 3, '2'], id: 'hack' })
    expect(u).toMatchObject({ id: e.id, rating: 9, comment: 'odlično', watchedEpisodes: [1, 2, 3] })
  })
  it('stores and deletes per-episode notes', () => {
    const e = lib.add({ title: 'X' })
    expect(lib.setEpisodeNote(e.id, 5, 'plakao').episodeNotes).toEqual({ 5: 'plakao' })
    expect(lib.setEpisodeNote(e.id, '5', '   ').episodeNotes).toEqual({})
  })
  it('recordWatched creates a watching entry for an unknown title', () => {
    const e = lib.recordWatched({ aniCliTitle: 'Dandadan (12 episodes)', episode: '1' })
    expect(e).toMatchObject({ title: 'Dandadan', aniCliTitle: 'Dandadan', status: 'watching', watchedEpisodes: [1] })
    expect(e.lastWatchedAt).not.toBeNull()
  })
  it('recordWatched moves paused to watching and last episode to completed', () => {
    const e = lib.add({ title: 'Show', aniCliTitle: 'Show', totalEpisodes: 3 })
    lib.update(e.id, { status: 'paused' })
    expect(lib.recordWatched({ aniCliTitle: 'show', episode: 2 }).status).toBe('watching')
    expect(lib.recordWatched({ aniCliTitle: 'Show', episode: 3 }).status).toBe('completed')
    expect(lib.recordWatched({ aniCliTitle: 'Show', episode: 1 }).status).toBe('completed')
  })
  it('recordWatched fills totalEpisodes only when unknown', () => {
    lib.recordWatched({ aniCliTitle: 'A', episode: 1, totalEpisodes: 12 })
    expect(lib.findByAniCliTitle('A').totalEpisodes).toBe(12)
    lib.recordWatched({ aniCliTitle: 'A', episode: 2, totalEpisodes: 24 })
    expect(lib.findByAniCliTitle('A').totalEpisodes).toBe(12)
  })
  it('keeps decimal episodes like 12.5', () => {
    expect(lib.recordWatched({ aniCliTitle: 'B', episode: '12.5' }).watchedEpisodes).toEqual([12.5])
  })
  it('removes entries', () => {
    const e = lib.add({ title: 'X' })
    expect(lib.remove(e.id)).toBe(true)
    expect(lib.list()).toEqual([])
    expect(lib.remove('nope')).toBe(false)
  })
  it('reports a corrupt file', () => {
    fs.writeFileSync(file, 'nope')
    const l = createLibrary(file)
    expect(l.wasCorrupt).toBe(true)
    expect(l.list()).toEqual([])
  })
  it('returns copies so callers cannot mutate state', () => {
    const e = lib.add({ title: 'X' })
    lib.get(e.id).watchedEpisodes.push(99)
    expect(lib.get(e.id).watchedEpisodes).toEqual([])
  })
})
