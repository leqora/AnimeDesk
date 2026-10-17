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
  it('recordWatched moves paused to watching and completes only when every episode is watched', () => {
    const e = lib.add({ title: 'Show', aniCliTitle: 'Show', totalEpisodes: 3 })
    lib.update(e.id, { status: 'paused' })
    expect(lib.recordWatched({ aniCliTitle: 'show', episode: 2 }).status).toBe('watching')
    // the last episode alone does not finish the series while episode 1 is unwatched
    expect(lib.recordWatched({ aniCliTitle: 'Show', episode: 3 }).status).toBe('watching')
    expect(lib.recordWatched({ aniCliTitle: 'Show', episode: 1 }).status).toBe('completed')
    expect(lib.recordWatched({ aniCliTitle: 'Show', episode: 2 }).status).toBe('completed')
  })
  it('recordWatched does not count specials like 1.5 as regular episodes', () => {
    lib.add({ title: 'S', aniCliTitle: 'S', totalEpisodes: 2 })
    lib.recordWatched({ aniCliTitle: 'S', episode: 1 })
    expect(lib.recordWatched({ aniCliTitle: 'S', episode: '1.5' }).status).toBe('watching')
    expect(lib.recordWatched({ aniCliTitle: 'S', episode: 2 }).status).toBe('completed')
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
  it('restore puts the entry back with its id and fields', () => {
    const e = lib.add({ title: 'Show', aniCliTitle: 'Show', totalEpisodes: 12 })
    lib.update(e.id, { watchedEpisodes: [1, 2], comment: 'note', rating: 8 })
    lib.setEpisodeNote(e.id, 1, 'ep note')
    lib.setPinned(e.id, true)
    const snapshot = lib.get(e.id)
    lib.remove(e.id)
    expect(lib.get(e.id)).toBeNull()
    expect(lib.restore(snapshot)).toEqual(snapshot)
    expect(lib.get(e.id)).toEqual(snapshot)
    expect(createLibrary(file).get(e.id)).toEqual(snapshot)
  })
  it('restore refuses an existing id or same title key', () => {
    const e = lib.add({ title: 'Show', aniCliTitle: 'Show' })
    expect(() => lib.restore(lib.get(e.id))).toThrow('conflict')
    const copy = { ...lib.get(e.id), id: 'other-id' }
    expect(() => lib.restore(copy)).toThrow('conflict')
    expect(lib.list()).toHaveLength(1)
  })
  it('restore unpins when the pin limit is full', () => {
    const gone = lib.add({ title: 'Gone' })
    lib.setPinned(gone.id, true)
    const snapshot = lib.get(gone.id)
    lib.remove(gone.id)
    for (let i = 0; i < 5; i++) lib.setPinned(lib.add({ title: `P${i}` }).id, true)
    expect(lib.restore(snapshot).pinnedAt).toBeNull()
    expect(lib.get(gone.id).pinnedAt).toBeNull()
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

  describe('confirmed AniList match', () => {
    it('add writes aniListConfirmed false; old stored entries without it read as false', () => {
      const e = lib.add({ title: 'A' })
      expect(e.aniListConfirmed).toBe(false)
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      expect(raw.anime[e.id].aniListConfirmed).toBe(false)
      delete raw.anime[e.id].aniListConfirmed
      fs.writeFileSync(file, JSON.stringify(raw))
      const l = createLibrary(file, opts())
      expect(l.get(e.id).aniListConfirmed).toBe(false)
      expect(l.list()[0].aniListConfirmed).toBe(false)
      const found = l.findByAniCliTitle('A')
      expect(found).not.toBeNull()
      expect(found.aniListConfirmed).toBe(false)
    })
    it('confirmAniList sets aniListId and aniListConfirmed and persists', () => {
      const e = lib.add({ title: 'A' })
      const r = lib.confirmAniList(e.id, 101)
      expect(r.ok).toBe(true)
      expect(r.entry).toMatchObject({ id: e.id, aniListId: 101, aniListConfirmed: true })
      expect(createLibrary(file).get(e.id)).toMatchObject({ aniListId: 101, aniListConfirmed: true })
      expect(lib.findConfirmed(101).id).toBe(e.id)
      expect(lib.findConfirmed(999)).toBeNull()
    })
    it('refuses a media id already confirmed by another entry and leaves the second untouched', () => {
      const a = lib.add({ title: 'First' })
      const b = lib.add({ title: 'Second', aniListId: 7 })
      lib.confirmAniList(a.id, 101)
      const before = lib.get(b.id)
      expect(lib.confirmAniList(b.id, 101)).toEqual({ ok: false, error: 'taken', title: 'First' })
      expect(lib.get(b.id)).toEqual(before)
    })
    it('re-confirming the same entry is ok; an unconfirmed holder does not block', () => {
      const a = lib.add({ title: 'A', aniListId: 5 })
      const b = lib.add({ title: 'B' })
      expect(lib.confirmAniList(b.id, 5).ok).toBe(true)
      expect(lib.confirmAniList(b.id, 5).ok).toBe(true)
      expect(lib.get(a.id).aniListConfirmed).toBe(false)
    })
    it('confirmAniList throws on an unknown id', () => {
      expect(() => lib.confirmAniList('nope', 1)).toThrow('unknown anime id')
    })
    it('confirmAniList rejects an invalid media id', () => {
      const e = lib.add({ title: 'A' })
      for (const bad of [0, -1, 1.5, '5', null, undefined, NaN]) {
        expect(() => lib.confirmAniList(e.id, bad)).toThrow('invalid aniListId')
      }
      expect(lib.get(e.id).aniListConfirmed).toBe(false)
    })
    it('restore drops the confirmation when another entry confirmed the same media id meanwhile', () => {
      const a = lib.add({ title: 'A', aniCliTitle: 'A' })
      lib.confirmAniList(a.id, 101)
      const snapshot = lib.get(a.id)
      lib.remove(a.id)
      const b = lib.add({ title: 'B', aniCliTitle: 'B' })
      lib.confirmAniList(b.id, 101)
      const restored = lib.restore(snapshot)
      expect(restored).toMatchObject({ aniListId: 101, aniListConfirmed: false })
      expect(lib.findConfirmed(101).id).toBe(b.id)
      expect(lib.list().filter((x) => x.aniListConfirmed && x.aniListId === 101)).toHaveLength(1)
    })
    it('update resets confirmation only when aniListId changes', () => {
      const e = lib.add({ title: 'A' })
      lib.confirmAniList(e.id, 101)
      expect(lib.update(e.id, { aniListId: 101, comment: 'x' }).aniListConfirmed).toBe(true)
      const changed = lib.update(e.id, { aniListId: 202 })
      expect(changed).toMatchObject({ aniListId: 202, aniListConfirmed: false })
    })
    it('update cannot set aniListConfirmed', () => {
      const e = lib.add({ title: 'A', aniListId: 3 })
      expect(lib.update(e.id, { aniListConfirmed: true }).aniListConfirmed).toBe(false)
      expect(lib.update(e.id, { aniListId: 3, aniListConfirmed: true }).aniListConfirmed).toBe(false)
    })
    it('restore keeps aniListConfirmed as it was', () => {
      const e = lib.add({ title: 'Show', aniCliTitle: 'Show' })
      lib.confirmAniList(e.id, 55)
      const snapshot = lib.get(e.id)
      lib.remove(e.id)
      expect(lib.restore(snapshot).aniListConfirmed).toBe(true)
      expect(createLibrary(file).get(e.id)).toMatchObject({ aniListId: 55, aniListConfirmed: true })
      const f = lib.add({ title: 'Other', aniCliTitle: 'Other' })
      const snap2 = lib.get(f.id)
      lib.remove(f.id)
      expect(lib.restore(snap2).aniListConfirmed).toBe(false)
    })
  })
})
