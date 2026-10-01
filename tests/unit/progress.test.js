import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createProgress } from '../../src/main/progress.js'
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
  it('records a lower level silently and levels up again later', () => {
    progress.init()
    level = 6
    progress.check()
    expect(events).toEqual([])
    level = 7
    progress.check()
    expect(events).toEqual([[EVENTS.levelUp, { level: 7, title: 'rookie' }]])
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
