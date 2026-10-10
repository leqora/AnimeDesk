import { describe, it, expect, vi } from 'vitest'
import { createCelebrations } from '../../src/main/celebrations.js'
import { EVENTS } from '../../src/shared/channels.js'

describe('celebrations', () => {
  it('passes everything through when nothing is playing', () => {
    const send = vi.fn()
    const c = createCelebrations(send)
    c.notify(EVENTS.levelUp, { level: 3 })
    expect(send).toHaveBeenCalledWith(EVENTS.levelUp, { level: 3 })
  })
  it('holds only level-up and series-completed while playing, then sends them in order', () => {
    const send = vi.fn()
    const c = createCelebrations(send)
    c.hold()
    c.notify(EVENTS.seriesCompleted, { title: 'A', xp: 50 })
    c.notify(EVENTS.libraryChanged)
    c.notify(EVENTS.levelUp, { level: 4 })
    expect(send.mock.calls).toEqual([[EVENTS.libraryChanged, undefined]])
    c.release()
    expect(send.mock.calls.slice(1)).toEqual([[EVENTS.seriesCompleted, { title: 'A', xp: 50 }], [EVENTS.levelUp, { level: 4 }]])
  })
  it('waits for the last release when holds nest', () => {
    const send = vi.fn()
    const c = createCelebrations(send)
    c.hold(); c.hold()
    c.notify(EVENTS.levelUp, { level: 2 })
    c.release()
    expect(send).not.toHaveBeenCalled()
    c.release()
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('never goes below zero on an extra release', () => {
    const send = vi.fn()
    const c = createCelebrations(send)
    c.release()
    c.hold()
    c.notify(EVENTS.levelUp, { level: 2 })
    expect(send).not.toHaveBeenCalled()
  })
})
