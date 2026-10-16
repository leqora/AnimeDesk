import { describe, it, expect } from 'vitest'
import { add, remove, visible, MAX_VISIBLE, DEFAULT_MS, ACTION_MS } from '../../src/renderer/toast/toastQueue.js'

const mk = (id) => ({ id, message: `m${id}` })

describe('toastQueue', () => {
  it('exposes the timing constants', () => {
    expect(MAX_VISIBLE).toBe(3)
    expect(DEFAULT_MS).toBe(3000)
    expect(ACTION_MS).toBe(6000)
  })
  it('visible returns at most 3 in insertion order', () => {
    let q = []
    for (const id of [1, 2, 3, 4, 5]) q = add(q, mk(id))
    expect(visible(q).map((x) => x.id)).toEqual([1, 2, 3])
  })
  it('remove promotes the next queued toast', () => {
    let q = []
    for (const id of [1, 2, 3, 4]) q = add(q, mk(id))
    q = remove(q, 2)
    expect(visible(q).map((x) => x.id)).toEqual([1, 3, 4])
  })
  it('does not mutate the input queue', () => {
    const q = [mk(1)]
    add(q, mk(2)); remove(q, 1)
    expect(q).toEqual([mk(1)])
  })
})
