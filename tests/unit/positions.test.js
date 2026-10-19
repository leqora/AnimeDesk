import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPositions, sanitizePositions } from '../../src/main/positions.js'

let file
beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-pos-')), 'positions.json') })

describe('positions', () => {
  it('saves and returns a resumable position per normalized title and episode', () => {
    const p = createPositions(file, { now: () => 1000 })
    p.save('Show (12 episodes)', '03', { position: 600, duration: 1400 })
    expect(createPositions(file).get('show', 3)).toEqual({ position: 600, duration: 1400 })
    expect(p.get('show', 4)).toBeNull()
  })
  it('only offers positions in the resumable range', () => {
    const p = createPositions(file)
    p.save('A b', 1, { position: 5, duration: 1400 })
    expect(p.get('A b', 1)).toBeNull()
    p.save('A b', 1, { position: 1300, duration: 1400 })
    expect(p.get('A b', 1)).toBeNull()
  })
  it('ignores invalid saves and clears entries', () => {
    const p = createPositions(file)
    p.save('A b', 1, { position: NaN, duration: 1400 })
    p.save('A b', 1, { position: 100, duration: 0 })
    expect(p.get('A b', 1)).toBeNull()
    p.save('A b', 1, { position: 100, duration: 1400 })
    p.clear('A b', 1)
    expect(p.get('A b', 1)).toBeNull()
    p.clear('Nothing', 9)
  })
  it('prunes entries older than the given age', () => {
    let t = 0
    const p = createPositions(file, { now: () => t })
    p.save('Old', 1, { position: 100, duration: 1400 })
    t = 61 * 86400000
    p.save('New', 1, { position: 100, duration: 1400 })
    p.prune(60)
    expect(p.get('Old', 1)).toBeNull()
    expect(p.get('New', 1)).not.toBeNull()
  })
  it('survives a hand-edited or corrupt file', () => {
    fs.writeFileSync(file, JSON.stringify({ items: { 'show#1': { position: 'x', duration: null } } }))
    expect(createPositions(file).get('Show', 1)).toBeNull()
    fs.writeFileSync(file, JSON.stringify([1, 2]))
    expect(createPositions(file).get('Show', 1)).toBeNull()
    fs.writeFileSync(file, '{broken')
    const p = createPositions(file)
    p.save('Show', 1, { position: 100, duration: 1400 })
    expect(p.get('Show', 1)).toEqual({ position: 100, duration: 1400 })
  })
  it('does not throw when the disk write fails', () => {
    const blocker = path.join(path.dirname(file), 'blocker')
    fs.writeFileSync(blocker, 'x')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = createPositions(path.join(blocker, 'sub', 'positions.json'), { now: () => 0 })
    expect(() => p.save('A b', 1, { position: 100, duration: 1400 })).not.toThrow()
    expect(p.get('A b', 1)).toEqual({ position: 100, duration: 1400 })
    expect(() => p.clear('A b', 1)).not.toThrow()
    p.save('A b', 2, { position: 100, duration: 1400 })
    expect(() => p.prune(60)).not.toThrow()
    expect(warn).toHaveBeenCalledWith('positions: write failed', expect.any(String))
    warn.mockRestore()
  })
  it('lists the resumable positions of one series only', () => {
    const p = createPositions(file)
    p.save('Naruto', 4, { position: 495, duration: 1440 })
    p.save('Naruto', '05', { position: 5, duration: 1440 }) // too early: not resumable
    p.save('Naruto Shippuden', 1, { position: 300, duration: 1440 })
    p.save('Naruto', 12.5, { position: 100, duration: 1440 })
    expect(p.forSeries('NARUTO')).toEqual({ 4: { position: 495, duration: 1440 }, '12.5': { position: 100, duration: 1440 } })
    expect(p.forSeries('Naruto Shippuden')).toEqual({ 1: { position: 300, duration: 1440 } })
    expect(p.forSeries('')).toEqual({})
    expect(p.forSeries(null)).toEqual({})
  })
  it('reports real changes to listeners until they unsubscribe', () => {
    let t = 0
    const p = createPositions(file, { now: () => t })
    const seen = []
    const off = p.onChange((kind) => seen.push(kind))
    p.save('A b', 1, { position: 100, duration: 1400 })
    p.save('A b', 1, { position: NaN, duration: 1400 }) // ignored save: no event
    p.clear('A b', 1)
    p.clear('A b', 1) // nothing to clear: no event
    p.save('Old', 1, { position: 100, duration: 1400 })
    t = 61 * 86400000
    p.prune(60)
    p.prune(60) // nothing left to prune: no event
    off()
    p.save('A b', 2, { position: 100, duration: 1400 })
    expect(seen).toEqual(['save', 'clear', 'save', 'prune'])
  })
  it('keeps working when a listener throws', () => {
    const p = createPositions(file)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ok = vi.fn()
    p.onChange(() => { throw new Error('boom') })
    p.onChange(ok)
    p.save('A b', 1, { position: 100, duration: 1400 })
    expect(ok).toHaveBeenCalledWith('save')
    expect(p.get('A b', 1)).not.toBeNull()
    warn.mockRestore()
  })
})

describe('sanitizePositions', () => {
  it('keeps valid items and drops invalid ones', () => {
    const r = sanitizePositions({ version: 1, items: {
      'show#1': { position: 600, duration: 1400, at: 5, extra: 1 },
      'show#2': { position: 600, duration: 0, at: 5 },
      'show#3': { position: NaN, duration: 1400, at: 5 },
      'nohash': { position: 600, duration: 1400, at: 5 },
      'show#4': { position: 600, duration: 1400 },
      'show#5': null,
    } })
    expect(r).toEqual({ version: 1, items: { 'show#1': { position: 600, duration: 1400, at: 5 } } })
  })
  it('returns empty when not an object', () => {
    expect(sanitizePositions([])).toEqual({ version: 1, items: {} })
    expect(sanitizePositions(null)).toEqual({ version: 1, items: {} })
  })
})

describe('positions snapshot / replaceAll', () => {
  it('replaceAll swaps data, persists, fires clear and does not alias', () => {
    const p = createPositions(file, { now: () => 1000 })
    p.save('Old', 1, { position: 600, duration: 1400 })
    const cb = vi.fn()
    p.onChange(cb)
    const snap = p.snapshot()
    snap.items['old#1'].position = 1
    expect(p.get('Old', 1).position).toBe(600)
    const db = { version: 1, items: { 'new#2': { position: 700, duration: 1400, at: 5 } } }
    p.replaceAll(db)
    expect(cb).toHaveBeenCalledWith('clear')
    expect(p.get('Old', 1)).toBeNull()
    expect(p.get('New', 2)).toEqual({ position: 700, duration: 1400 })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(db)
    db.items['new#2'].position = 1
    expect(p.get('New', 2).position).toBe(700)
  })
  it('replaceAll throws when the write fails (and does not emit)', () => {
    const p = createPositions(file)
    const cb = vi.fn()
    p.onChange(cb)
    fs.mkdirSync(`${file}.tmp`)
    expect(() => p.replaceAll({ version: 1, items: {} })).toThrow()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('positions with a #-prefixed title', () => {
  it('sanitizePositions keeps it and it round-trips through the store', () => {
    const p = createPositions(file, { now: () => 1000 })
    p.save('#Compass 2.0', 1, { position: 600, duration: 1400 })
    const snap = p.snapshot()
    expect(Object.keys(snap.items)).toEqual(['#compass 2.0#1'])
    const clean = sanitizePositions(snap)
    expect(clean).toEqual(snap)
    const q = createPositions(path.join(path.dirname(file), 'other.json'))
    q.replaceAll(clean)
    expect(q.get('#Compass 2.0', 1)).toEqual({ position: 600, duration: 1400 })
  })
  it('requires a canonical episode part', () => {
    const v = { position: 600, duration: 1400, at: 5 }
    const r = sanitizePositions({ items: { 'a#1': v, 'a#01': v, 'a#x': v, 'a#12.5': v, 'a#': v, '#1': v } })
    expect(Object.keys(r.items).sort()).toEqual(['a#1', 'a#12.5'])
  })
})
