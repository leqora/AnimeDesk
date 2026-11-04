import { describe, it, expect } from 'vitest'
import { advanceFrontier, previewAllowed, bucketOf, bufferedAhead, canFetch, pruneRecent, createFrameCache } from '../../src/shared/framePreview.js'

describe('advanceFrontier', () => {
  it('follows normal playback', () => {
    expect(advanceFrontier(10, 10, 10.25, false)).toBe(10.25)
    expect(advanceFrontier(10, 10, 13, false)).toBe(13)
  })
  it('ignores jumps, backwards moves and seeking', () => {
    expect(advanceFrontier(10, 10, 13.5, false)).toBe(10)
    expect(advanceFrontier(10, 10, 9, false)).toBe(10)
    expect(advanceFrontier(10, 10, 10.2, true)).toBe(10)
  })
  it('keeps a higher frontier', () => {
    expect(advanceFrontier(50, 4, 4.25, false)).toBe(50)
  })
})

describe('previewAllowed', () => {
  it('handles modes', () => {
    expect(previewAllowed('off', 1, 100)).toBe(false)
    expect(previewAllowed('full', 999, 0)).toBe(true)
    expect(previewAllowed('reached', 30, 30)).toBe(true)
    expect(previewAllowed('reached', 30.1, 30)).toBe(false)
    expect(previewAllowed(undefined, 5, 10)).toBe(true)
    expect(previewAllowed(undefined, 11, 10)).toBe(false)
  })
})

describe('bucketOf', () => {
  it('buckets by 5 s', () => {
    expect(bucketOf(0)).toBe(0)
    expect(bucketOf(4.99)).toBe(0)
    expect(bucketOf(5)).toBe(1)
  })
})

describe('bufferedAhead', () => {
  it('measures buffer after time', () => {
    expect(bufferedAhead([{ start: 0, end: 40 }], 10)).toBe(30)
    expect(bufferedAhead([{ start: 0, end: 5 }, { start: 10.3, end: 30 }], 10)).toBe(20)
    expect(bufferedAhead([{ start: 20, end: 30 }], 10)).toBe(0)
    expect(bufferedAhead([], 10)).toBe(0)
  })
})

describe('canFetch', () => {
  const base = { kind: 'hls', inFlight: false, mainPaused: false, ahead: 15, buffering: false, failed: false, readyState: 4, recent: [], now: 100000 }
  const stamps = (n, t = 99000) => Array.from({ length: n }, () => t)
  it('allows the base case', () => {
    expect(canFetch(base)).toBe(true)
  })
  it('blocks hls when unsafe', () => {
    expect(canFetch({ ...base, ahead: 14.9 })).toBe(false)
    expect(canFetch({ ...base, buffering: true })).toBe(false)
    expect(canFetch({ ...base, failed: true })).toBe(false)
    expect(canFetch({ ...base, readyState: 2 })).toBe(false)
    expect(canFetch({ ...base, inFlight: true })).toBe(false)
    expect(canFetch({ ...base, recent: stamps(12) })).toBe(false)
  })
  it('allows paused main and aged stamps', () => {
    expect(canFetch({ ...base, ahead: 0, mainPaused: true })).toBe(true)
    expect(canFetch({ ...base, recent: [...stamps(11), 30000] })).toBe(true)
  })
  it('file kind ignores network guards', () => {
    expect(canFetch({ ...base, kind: 'file', ahead: 0, buffering: true, recent: stamps(20) })).toBe(true)
    expect(canFetch({ ...base, kind: 'file', inFlight: true })).toBe(false)
  })
})

describe('pruneRecent', () => {
  it('drops old stamps', () => {
    expect(pruneRecent([0, 50000, 99999], 100000)).toEqual([50000, 99999])
  })
})

describe('createFrameCache', () => {
  it('evicts least recently used', () => {
    const c = createFrameCache(2)
    c.set(1, 'a')
    c.set(2, 'b')
    c.get(1)
    c.set(3, 'c')
    expect(c.get(2)).toBeUndefined()
    expect(c.get(1)).toBeDefined()
    expect(c.get(3)).toBeDefined()
    expect(c.nearest(4).bucket).toBe(3)
    expect(c.nearest(10)).toBeNull()
    c.clear()
    expect(c.size).toBe(0)
  })
  it('nearest prefers same, then previous, then next', () => {
    const c = createFrameCache()
    c.set(5, 'x')
    c.set(7, 'y')
    expect(c.nearest(6)).toEqual({ bucket: 5, src: 'x' })
    expect(c.nearest(5)).toEqual({ bucket: 5, src: 'x' })
    expect(c.nearest(4)).toEqual({ bucket: 5, src: 'x' })
  })
})
