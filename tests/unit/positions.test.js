import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPositions } from '../../src/main/positions.js'

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
