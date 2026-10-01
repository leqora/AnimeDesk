import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWatchLog } from '../../src/main/watchLog.js'

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
})
