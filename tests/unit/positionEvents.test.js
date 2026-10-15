import { describe, it, expect, vi } from 'vitest'
import { createThrottle, connectPositionEvents } from '../../src/main/positionEvents.js'
import { EVENTS } from '../../src/shared/channels.js'

function fakeTimers() {
  const timers = new Map()
  let id = 0
  return {
    setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id },
    clearTimer: (h) => { timers.delete(h) },
    runAll: () => { const all = [...timers.values()]; timers.clear(); for (const t of all) t.fn() },
    count: () => timers.size,
  }
}

describe('createThrottle', () => {
  it('fires at most once per window, at its end', () => {
    const t = fakeTimers()
    const fn = vi.fn()
    const th = createThrottle(fn, 5000, t)
    th.call(); th.call(); th.call()
    expect(fn).not.toHaveBeenCalled()
    expect(t.count()).toBe(1)
    t.runAll()
    expect(fn).toHaveBeenCalledTimes(1)
    th.call()
    t.runAll()
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('flush fires now and cancels the pending call; dispose cancels', () => {
    const t = fakeTimers()
    const fn = vi.fn()
    const th = createThrottle(fn, 5000, t)
    th.call()
    th.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(t.count()).toBe(0)
    th.call()
    th.dispose()
    t.runAll()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('connectPositionEvents', () => {
  it('throttles saves and sends clears immediately', () => {
    const t = fakeTimers()
    let listener
    const off = vi.fn()
    const positions = { onChange: vi.fn((cb) => { listener = cb; return off }) }
    const send = vi.fn()
    const dispose = connectPositionEvents({ positions, send, ...t })
    listener('save'); listener('save')
    expect(send).not.toHaveBeenCalled()
    t.runAll()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(EVENTS.positionsChanged)
    listener('save')
    listener('clear')
    expect(send).toHaveBeenCalledTimes(2)
    expect(t.count()).toBe(0)
    dispose()
    expect(off).toHaveBeenCalled()
  })
})
