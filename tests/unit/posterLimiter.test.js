import { describe, it, expect, vi } from 'vitest'
import { createPosterLimiter } from '../../src/main/posterLimiter.js'

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

describe('createPosterLimiter', () => {
  it('runs at most `concurrency` tasks at once and passes a freed slot to the next waiter', async () => {
    const lim = createPosterLimiter({ concurrency: 4, timeoutMs: 1e9 })
    let active = 0
    let peak = 0
    const gates = []
    const task = () => new Promise((resolve) => {
      active++; peak = Math.max(peak, active)
      gates.push(() => { active--; resolve('x') })
    })
    const all = Promise.all(Array.from({ length: 10 }, (_, i) => lim.download(`k${i}`, task)))
    await flush()
    expect(active).toBe(4)
    for (let n = 0; n < 20; n++) { while (gates.length) gates.shift()(); await flush() }
    expect(await all).toEqual(Array(10).fill('x'))
    expect(peak).toBe(4)
  })

  it('gives the caller null after timeoutMs but keeps the slot until the task settles', async () => {
    vi.useFakeTimers()
    try {
      const lim = createPosterLimiter({ concurrency: 1, timeoutMs: 100 })
      let finish
      const slow = vi.fn(() => new Promise((r) => { finish = () => r('late') }))
      const fast = vi.fn(async () => 'fast')
      const a = lim.download('a', slow)
      const b = lim.download('b', fast)
      await vi.advanceTimersByTimeAsync(0)
      expect(slow).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(await a).toBeNull()
      expect(fast).not.toHaveBeenCalled() // the slot is still held by the timed-out task
      finish()
      await vi.advanceTimersByTimeAsync(0)
      expect(fast).toHaveBeenCalledTimes(1)
      expect(await b).toBe('fast')
    } finally {
      vi.useRealTimers()
    }
  })

  it('the same key shares one download; a rejection is null', async () => {
    const lim = createPosterLimiter({ concurrency: 2, timeoutMs: 1e9 })
    const task = vi.fn(async () => 'v')
    expect(await Promise.all([lim.download('k', task), lim.download('k', task)])).toEqual(['v', 'v'])
    expect(task).toHaveBeenCalledTimes(1)
    expect(await lim.download('bad', async () => { throw new Error('x') })).toBeNull()
  })
})
