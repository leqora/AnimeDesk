import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWatchLog, sanitizeWatchLog } from '../../src/main/watchLog.js'

let file, log, n
beforeEach(() => {
  n = 0
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-log-')), 'watchlog.json')
  log = createWatchLog(file, { now: () => `2026-10-01T10:00:0${n}Z`, uuid: () => `w${++n}` })
})

describe('watchLog', () => {
  it('appends entries and persists them', () => {
    expect(log.append({ animeId: 'a', episode: '5', source: 'auto' })).toEqual({ id: 'w1', animeId: 'a', episode: 5, at: '2026-10-01T10:00:01Z', source: 'auto' })
    expect(createWatchLog(file).list()).toHaveLength(1)
  })
  it('removes only the latest entry for an episode', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    log.append({ animeId: 'a', episode: 1, source: 'manual' })
    log.append({ animeId: 'a', episode: 2, source: 'auto' })
    expect(log.removeLatest('a', 1)).toBe(true)
    expect(log.list().map((x) => x.id)).toEqual(['w1', 'w3'])
    expect(log.removeLatest('a', 9)).toBe(false)
  })
  it('removes every entry of a series', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    log.append({ animeId: 'b', episode: 1, source: 'auto' })
    log.append({ animeId: 'a', episode: 2, source: 'auto' })
    expect(log.removeAnime('a')).toBe(2)
    expect(createWatchLog(file).list().map((x) => x.animeId)).toEqual(['b'])
  })
  it('survives a corrupt file', () => {
    fs.writeFileSync(file, '{')
    const l = createWatchLog(file)
    expect(l.wasCorrupt).toBe(true)
    expect(l.list()).toEqual([])
  })
  it('returns copies', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    log.list()[0].episode = 99
    expect(log.list()[0].episode).toBe(1)
  })
  it('restore re-adds missing entries without duplicates', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    log.append({ animeId: 'b', episode: 1, source: 'auto' })
    log.append({ animeId: 'a', episode: 2, source: 'auto' })
    const gone = log.list().filter((e) => e.animeId === 'a')
    log.removeAnime('a')
    expect(log.restore(gone)).toBe(2)
    expect(log.restore(gone)).toBe(0)
    expect(log.list().map((e) => e.id)).toEqual(['w1', 'w2', 'w3'])
    expect(createWatchLog(file).list()).toHaveLength(3)
  })
  it('tolerates valid JSON without entries', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1 }))
    const l = createWatchLog(file)
    expect(l.list()).toEqual([])
    expect(() => l.append({ animeId: 'a', episode: 1, source: 'auto' })).not.toThrow()
  })
})

describe('sanitizeWatchLog', () => {
  const ids = new Set(['a'])
  it('keeps valid entries, drops invalid, assigns uuid, sorts by at', () => {
    const r = sanitizeWatchLog({ entries: [
      { id: 'x2', animeId: 'a', episode: 2, at: '2026-10-02T00:00:00Z', source: 'auto' },
      { animeId: 'a', episode: 1, at: '2026-10-01T00:00:00Z', source: 'manual' },
      { id: 'u', animeId: 'zzz', episode: 1, at: '2026-10-01T00:00:00Z', source: 'auto' },
      { id: 'n', animeId: 'a', episode: Infinity, at: '2026-10-01T00:00:00Z', source: 'auto' },
      { id: 'm', animeId: 'a', episode: 3, source: 'auto' },
      null,
    ] }, ids, { uuid: () => 'new-id' })
    expect(r).toEqual({ version: 1, entries: [
      { id: 'new-id', animeId: 'a', episode: 1, at: '2026-10-01T00:00:00Z', source: 'manual' },
      { id: 'x2', animeId: 'a', episode: 2, at: '2026-10-02T00:00:00Z', source: 'auto' },
    ] })
  })
  it('returns empty for non-object input', () => {
    expect(sanitizeWatchLog(undefined, ids, { uuid: () => 'u' })).toEqual({ version: 1, entries: [] })
  })
})

describe('watchLog snapshot / replaceAll', () => {
  it('snapshot is a deep copy', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    const s = log.snapshot()
    s.entries[0].episode = 99
    expect(log.list()[0].episode).toBe(1)
  })
  it('replaceAll swaps entries, persists, and does not alias', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    const db = { version: 1, entries: [{ id: 'z', animeId: 'b', episode: 4, at: '2026-10-05T00:00:00Z', source: 'auto' }] }
    log.replaceAll(db)
    expect(log.list()).toEqual(db.entries)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(db)
    db.entries[0].episode = 7
    expect(log.list()[0].episode).toBe(4)
    expect(log.removeAnime('b')).toBe(1)
  })
})
