import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createProgress } from '../../src/main/progress.js'
import { EMPTY_STATS } from '../../src/shared/stats.js'
import { EVENTS } from '../../src/shared/channels.js'
import { ACHIEVEMENTS } from '../../src/shared/achievements.js'

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

describe('progress.rebase', () => {
  it('writes a lower level without notifying', () => {
    progress.init()
    level = 3
    progress.rebase()
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ version: 1, lastLevel: 3 })
    expect(events).toEqual([])
    level = 4
    progress.check()
    expect(events.map((e) => e[0])).toEqual([EVENTS.levelUp])
  })
  it('logs instead of throwing when the snapshot fails', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = createProgress({ file, computeSnapshot: () => { throw new Error('boom') }, notify: () => {} })
    expect(() => p.rebase()).not.toThrow()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('progress achievements', () => {
  let achFile, met, clock, ap, aEvents, compute
  const read = () => JSON.parse(fs.readFileSync(achFile, 'utf8'))
  const make = () => createProgress({
    file, achievementsFile: achFile, computeSnapshot: snap, notify: (ch, p) => aEvents.push([ch, p]),
    computeAchievements: (...a) => compute(...a), now: () => clock,
  })
  beforeEach(() => {
    const dir = path.dirname(file)
    achFile = path.join(dir, 'achievements.json')
    met = new Set()
    clock = '2026-01-01T00:00:00.000Z'
    aEvents = []
    level = 7
    compute = () => ACHIEVEMENTS.map((a) => ({ ...a, value: met.has(a.id) ? a.goal : 0, met: met.has(a.id) }))
    ap = make()
  })

  it('retro: missing file writes met ids with now, no event, takeRetro once', () => {
    met.add('episodes-50'); met.add('episodes-250')
    ap.init()
    expect(read().unlocked).toEqual({ 'episodes-50': clock, 'episodes-250': clock })
    expect(aEvents).toEqual([])
    expect(ap.takeRetro()).toEqual({ count: 2 })
    expect(ap.takeRetro()).toEqual({ count: 0 })
  })
  it('retro with nothing met writes empty unlocked', () => {
    ap.init()
    expect(ap.takeRetro()).toEqual({ count: 0 })
    expect(read().unlocked).toEqual({})
  })
  it('corrupt file is re-derived silently', () => {
    fs.writeFileSync(achFile, '{not json')
    met.add('episodes-50')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    ap.init()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
    expect(aEvents).toEqual([])
    expect(ap.takeRetro()).toEqual({ count: 0 })
    expect(read().unlocked).toEqual({ 'episodes-50': clock })
  })
  it('keeps unknown ids after a new unlock', () => {
    fs.writeFileSync(achFile, JSON.stringify({ version: 1, unlocked: { 'old-thing': 'x' } }))
    ap.init()
    met.add('episodes-50')
    ap.check()
    expect(read().unlocked).toEqual({ 'old-thing': 'x', 'episodes-50': clock })
  })
  it('check() unlocks a new id once', () => {
    ap.init()
    met.add('episodes-50')
    ap.check()
    ap.check()
    expect(read().unlocked['episodes-50']).toBe(clock)
    expect(aEvents).toEqual([[EVENTS.achievementsUnlocked, { ids: ['episodes-50'] }]])
  })
  it('orders seriesCompleted, levelUp, achievementsUnlocked', () => {
    ap.init()
    level = 10
    met.add('episodes-50')
    ap.check({ completedTitle: 'A' })
    expect(aEvents.map((e) => e[0])).toEqual([EVENTS.seriesCompleted, EVENTS.levelUp, EVENTS.achievementsUnlocked])
  })
  it('once unlocked stays unlocked', () => {
    ap.init()
    met.add('episodes-50')
    ap.check()
    met.clear()
    expect(ap.snapshot().achievements.find((a) => a.id === 'episodes-50').unlockedAt).toBe(clock)
  })
  it('snapshot() unlocks without check() and notifies once', () => {
    ap.init()
    met.add('episodes-50')
    ap.snapshot()
    ap.snapshot()
    expect(aEvents).toEqual([[EVENTS.achievementsUnlocked, { ids: ['episodes-50'] }]])
  })
  it('snapshot().achievements lists all 21 in order', () => {
    ap.init()
    const list = ap.snapshot().achievements
    expect(list.map((a) => a.id)).toEqual(ACHIEVEMENTS.map((a) => a.id))
    expect(list).toHaveLength(21)
    expect(list[0]).toEqual({ id: ACHIEVEMENTS[0].id, icon: ACHIEVEMENTS[0].icon, goal: ACHIEVEMENTS[0].goal, value: 0, unlockedAt: null })
  })
  it('rebase keeps old dates, dates new ones, drops unmet, no event', () => {
    met.add('episodes-250'); met.add('episodes-50')
    ap.init()
    ap.takeRetro()
    clock = '2026-02-02T00:00:00.000Z'
    met.delete('episodes-50'); met.add('episodes-1000')
    ap.rebase()
    expect(read().unlocked).toEqual({ 'episodes-250': '2026-01-01T00:00:00.000Z', 'episodes-1000': clock })
    expect(aEvents).toEqual([])
    expect(ap.takeRetro()).toEqual({ count: 0 })
  })
  it('survives computeAchievements throwing', () => {
    ap.init()
    compute = () => { throw new Error('boom') }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    level = 10
    expect(ap.check().level).toBe(10)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastLevel).toBe(10)
    const s = ap.snapshot()
    expect(s.level).toBe(10)
    expect(s.achievements).toEqual([])
    err.mockRestore()
  })
})
