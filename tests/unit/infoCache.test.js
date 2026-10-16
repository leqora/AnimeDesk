import { describe, it, expect, vi } from 'vitest'
import { infoCache, INFO_TTL_MS } from '../../src/renderer/anilist/infoCache.js'
import { AIRED_GRACE_MS } from '../../src/shared/airing.js'

const fakeApi = (impl = async () => ({ id: 1, poster: 'p' })) => ({ anilist: { forTitle: vi.fn(impl) } })

describe('infoCache', () => {
  it('get dedupes concurrent calls', async () => {
    const api = fakeApi()
    const c = infoCache(api)
    const [a, b] = await Promise.all([c.get('Frieren'), c.get('Frieren')])
    expect(api.anilist.forTitle).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })
  it('peek is undefined before and returns the stored info after get resolves', async () => {
    const api = fakeApi()
    const c = infoCache(api)
    expect(c.peek('Frieren')).toBeUndefined()
    await c.get('Frieren')
    expect(c.peek('Frieren')).toEqual({ id: 1, poster: 'p' })
  })
  it('keys by aniListId when present', async () => {
    const api = fakeApi()
    const c = infoCache(api)
    await c.get('A', 5)
    expect(c.peek('B', 5)).toBeDefined()
    expect(c.peek('A')).toBeUndefined()
  })
  it('info expires after 10 minutes', async () => {
    let t = 1000
    const api = fakeApi()
    const c = infoCache(api, { now: () => t })
    await c.get('X')
    t += INFO_TTL_MS - 1
    expect(c.peek('X')).toBeDefined()
    t += 1
    expect(c.peek('X')).toBeUndefined()
    await c.get('X')
    expect(api.anilist.forTitle).toHaveBeenCalledTimes(2)
  })
  it('airing info expires at airingAt + 1 h even within 10 minutes', async () => {
    let t = 0
    // airingAt + 1 h is only 1 minute away, well inside the 10 minute TTL
    const api = fakeApi(async () => ({ id: 1, nextAiring: { episode: 3, airingAt: 60 * 1000 - AIRED_GRACE_MS } }))
    const c = infoCache(api, { now: () => t })
    await c.get('X')
    t = 60 * 1000 - 1
    expect(c.peek('X')).toBeDefined()
    t = 60 * 1000
    expect(c.peek('X')).toBeUndefined()
  })
  it('null result is cached for 10 minutes', async () => {
    let t = 0
    const api = fakeApi(async () => null)
    const c = infoCache(api, { now: () => t })
    expect(await c.get('X')).toBeNull()
    expect(c.peek('X')).toBeNull()
    await c.get('X')
    expect(api.anilist.forTitle).toHaveBeenCalledTimes(1)
    t = INFO_TTL_MS
    expect(c.peek('X')).toBeUndefined()
  })
  it('a rejected get is not cached', async () => {
    const api = fakeApi()
    api.anilist.forTitle.mockRejectedValueOnce(new Error('net'))
    const c = infoCache(api)
    await expect(c.get('X')).rejects.toThrow('net')
    expect(c.peek('X')).toBeUndefined()
    expect(await c.get('X')).toEqual({ id: 1, poster: 'p' })
    expect(api.anilist.forTitle).toHaveBeenCalledTimes(2)
  })
  it('separate api objects have separate caches', async () => {
    const a = fakeApi()
    const b = fakeApi()
    await infoCache(a).get('X')
    expect(infoCache(b).peek('X')).toBeUndefined()
    expect(infoCache(a)).toBe(infoCache(a))
  })
  it('a lookup by title also fills the id key of the resolved info', async () => {
    const api = fakeApi(async () => ({ id: 42, poster: 'p' }))
    const c = infoCache(api)
    await c.get('X')
    expect(c.peek('X', 42)).toEqual({ id: 42, poster: 'p' })
  })
  it('turns a synchronous throw into a rejection', async () => {
    const api = { anilist: { forTitle: vi.fn(() => { throw new Error('boom') }) } }
    const c = infoCache(api)
    await expect(c.get('X')).rejects.toThrow('boom')
    expect(c.peek('X')).toBeUndefined()
  })
})
