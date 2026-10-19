import { describe, it, expect } from 'vitest'
import { localDate, autoName, preImportName, toPrune, latestAuto, nextDelay, AUTO_KEEP, PRE_IMPORT_KEEP, MAX_IMPORT_BYTES, IMPORT_TTL_MS } from '../../src/shared/backupRules.js'

const at = new Date(2026, 9, 5, 7, 4, 9).getTime() // local 2026-10-05 07:04:09

describe('backupRules', () => {
  it('constants', () => {
    expect(AUTO_KEEP).toBe(7)
    expect(PRE_IMPORT_KEEP).toBe(5)
    expect(MAX_IMPORT_BYTES).toBe(50 * 1024 * 1024)
    expect(IMPORT_TTL_MS).toBe(10 * 60 * 1000)
  })
  it('names use the local date and time', () => {
    expect(localDate(at)).toBe('2026-10-05')
    expect(autoName(at)).toBe('auto-2026-10-05.json')
    expect(preImportName(at)).toBe('pre-import-2026-10-05T07-04-09.json')
  })
  it('localDate honours an explicit timezone offset (getTimezoneOffset sign)', () => {
    const utc = Date.UTC(2026, 9, 5, 23, 30)
    expect(localDate(utc, 0)).toBe('2026-10-05')
    expect(localDate(utc, -120)).toBe('2026-10-06')
    expect(localDate(utc, 300)).toBe('2026-10-05')
  })
  it('toPrune keeps the 7 newest auto-* and ignores everything else', () => {
    const autos = Array.from({ length: 9 }, (_, i) => `auto-2026-10-${String(i + 1).padStart(2, '0')}.json`)
    const names = [...autos, 'auto-notes.txt', 'auto-2026-10-1.json', 'pre-import-2026-10-01T00-00-00.json', 'other.json']
    expect(toPrune(names, 'auto-', AUTO_KEEP)).toEqual(['auto-2026-10-02.json', 'auto-2026-10-01.json'])
  })
  it('toPrune keeps 5 pre-import-* and ignores auto-*', () => {
    const pre = Array.from({ length: 7 }, (_, i) => `pre-import-2026-10-0${i + 1}T10-00-00.json`)
    const out = toPrune([...pre, 'auto-2026-01-01.json', 'pre-import-x.json'], 'pre-import-', PRE_IMPORT_KEEP)
    expect(out).toEqual(['pre-import-2026-10-02T10-00-00.json', 'pre-import-2026-10-01T10-00-00.json'])
  })
  it('toPrune returns nothing when within the limit', () => {
    expect(toPrune(['auto-2026-10-01.json'], 'auto-', 7)).toEqual([])
  })
  it('latestAuto returns the newest date or null', () => {
    expect(latestAuto(['auto-2026-10-01.json', 'auto-2026-10-03.json', 'auto-notes.txt', 'pre-import-2026-12-01T00-00-00.json'])).toBe('2026-10-03')
    expect(latestAuto(['x.json'])).toBeNull()
    expect(latestAuto([])).toBeNull()
  })
  it('toPrune orders same-second pre-import copies by their numeric suffix', () => {
    const base = 'pre-import-2026-10-19T10-00-00'
    const old = ['pre-import-2026-10-17T10-00-00.json', 'pre-import-2026-10-18T10-00-00.json']
    const names = [`${base}.json`, `${base}-2.json`, `${base}-10.json`, `${base}-3.json`, ...old]
    expect(toPrune(names, 'pre-import-', 5)).toEqual([old[0]])
    // newest first: -10, -3, -2, plain, then the older days
    expect(toPrune(names, 'pre-import-', 3)).toEqual([`${base}.json`, old[1], old[0]])
  })
  it('nextDelay targets the next local midnight + 5 min, capped at 6 h', () => {
    expect(nextDelay(new Date(2026, 9, 19, 23, 59, 30).getTime())).toBe(5 * 60 * 1000 + 30 * 1000)
    expect(nextDelay(new Date(2026, 9, 19, 10, 0, 0).getTime())).toBe(6 * 3600 * 1000)
    expect(nextDelay(new Date(2026, 9, 19, 18, 30, 0).getTime())).toBe(5.5 * 3600 * 1000 + 5 * 60 * 1000)
  })
})
