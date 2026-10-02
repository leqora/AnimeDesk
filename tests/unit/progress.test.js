import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createProgress } from '../../src/main/progress.js'
import { EMPTY_STATS } from '../../src/shared/stats.js'
import { EVENTS } from '../../src/shared/channels.js'

let file, level, events, progress
const snap = () => ({ level, title: level >= 10 ? 'veteran' : 'rookie', xp: level * 100 })
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-prog-')), 'profile.json')
  level = 7
  events = []
  progress = createProgress({ file, computeSnapshot: snap, notify: (ch, p) => events.push([ch, p]) })
})

describe('progress', () => {
  it('first run records level without an event', () => {
    progress.init()
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ version: 1, lastLevel: 7 })
    expect(events).toEqual([])
    progress.check()
    expect(events).toEqual([])
  })
  it('check() on a missing file also records silently', () => {
    progress.check()
    expect(events).toEqual([])
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastLevel).toBe(7)
  })
  it('emits exactly one level-up when the level rises', () => {
    progress.init()
    level = 10
    progress.check()
    progress.check()
    expect(events).toEqual([[EVENTS.levelUp, { level: 10, title: 'veteran' }]])
  })
  it('never repeats a level-up for an already reached level', () => {
    progress.init()
    level = 6
    progress.check()
    level = 7
    progress.check()
    expect(events).toEqual([])
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastLevel).toBe(7)
    level = 9
    progress.check()
    level = 8
    progress.check()
    level = 9
    progress.check()
    expect(events).toEqual([[EVENTS.levelUp, { level: 9, title: 'rookie' }]])
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastLevel).toBe(9)
  })
  it('treats a non-numeric lastLevel like a missing file', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, lastLevel: 'x' }))
    progress.check()
    expect(events).toEqual([])
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastLevel).toBe(7)
    fs.writeFileSync(file, JSON.stringify({ version: 1 }))
    progress.check()
    expect(events).toEqual([])
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastLevel).toBe(7)
  })
  it('survives an unreadable profile file', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-prog-dir-'))
    const bad = createProgress({ file: dir, computeSnapshot: snap, notify: (ch, p) => events.push([ch, p]) })
    expect(() => bad.init()).not.toThrow()
    expect(bad.check({ completedTitle: 'Show' })).toEqual(EMPTY_STATS)
    expect(events).toEqual([])
    expect(fs.statSync(dir).isDirectory()).toBe(true)
    expect(fs.readdirSync(dir)).toEqual([])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('survives a failing snapshot', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = createProgress({ file, computeSnapshot: () => { throw new Error('boom') }, notify: (ch, p) => events.push([ch, p]) })
    expect(() => bad.init()).not.toThrow()
    expect(bad.check({ completedTitle: 'Show' })).toEqual(EMPTY_STATS)
    expect(bad.snapshot()).toEqual(EMPTY_STATS)
    expect(events).toEqual([])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('announces a completed series before a level-up', () => {
    progress.init()
    level = 8
    progress.check({ completedTitle: 'Show' })
    expect(events.map((e) => e[0])).toEqual([EVENTS.seriesCompleted, EVENTS.levelUp])
    expect(events[0][1]).toEqual({ title: 'Show', xp: 50 })
  })
  it('snapshot returns the current stats', () => {
    expect(progress.snapshot()).toEqual({ level: 7, title: 'rookie', xp: 700 })
  })
})
