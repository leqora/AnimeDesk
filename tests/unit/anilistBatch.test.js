import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAniListBatcher } from '../../src/main/anilistBatch.js'
import { ID_BATCH, BY_ID, SEARCH, searchBatchQuery } from '../../src/main/anilistQueries.js'

const tagged = (message, tags) => Object.assign(new Error(message), tags)
const media = (id) => ({ id, title: { romaji: `T${id}` } })

// Same shape as the serial queue in anilist.js.
function makeEnqueue() {
  let queue = Promise.resolve()
  return (task) => {
    const run = queue.then(task)
    queue = run.catch(() => {})
    return run
  }
}

// Fake request routed by the variables it receives; `overrides` may throw or answer for a given call.
function makeRequest({ mediaFor = (id) => media(id), searchFor = (text) => [media(`s:${text}`)], fail } = {}) {
  return vi.fn(async (query, variables) => {
    if (fail) {
      const r = fail(query, variables)
      if (r) throw r
    }
    if ('ids' in variables) return { Page: { media: variables.ids.map(mediaFor).filter(Boolean) } }
    if ('id' in variables) {
      const m = mediaFor(variables.id)
      if (!m) throw tagged('AniList 404', { status: 404 })
      return { Media: m }
    }
    if ('search' in variables) return { Page: { media: searchFor(variables.search) } }
    const out = {}
    Object.keys(variables).forEach((k) => { out[k] = { media: searchFor(variables[k]) } })
    return out
  })
}

describe('createAniListBatcher', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const setup = (reqOpts, batcherOpts) => {
    const request = makeRequest(reqOpts)
    const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request, ...batcherOpts })
    return { request, batcher }
  }
  const tick = () => vi.advanceTimersByTimeAsync(40)

  it('merges 3 searches in the window into one aliased request', async () => {
    const { request, batcher } = setup()
    const ps = ['a', 'b', 'c'].map((t) => batcher.search(t))
    await tick()
    const res = await Promise.all(ps)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(searchBatchQuery(3), { s0: 'a', s1: 'b', s2: 'c' })
    expect(res).toEqual([[media('s:a')], [media('s:b')], [media('s:c')]])
  })

  it('merges 3 ids into one id_in request; a missing id resolves null', async () => {
    const { request, batcher } = setup({ mediaFor: (id) => (id === 2 ? null : media(id)) })
    const ps = [1, 2, 3].map((i) => batcher.byId(i))
    await tick()
    expect(await Promise.all(ps)).toEqual([media(1), null, media(3)])
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(ID_BATCH, { ids: [1, 2, 3] })
  })

  it('matches answers to ids by Number(m.id)', async () => {
    const request = vi.fn(async () => ({ Page: { media: [{ id: '5' }, { id: 4 }] } }))
    const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request })
    const ps = [4, 5].map((i) => batcher.byId(i))
    await tick()
    expect(await Promise.all(ps)).toEqual([{ id: 4 }, { id: '5' }])
  })

  it('one id uses BY_ID; one search uses SEARCH', async () => {
    const { request, batcher } = setup()
    const p = batcher.byId(7)
    const q = batcher.search('x')
    await tick()
    expect(await p).toEqual(media(7))
    expect(await q).toEqual([media('s:x')])
    expect(request).toHaveBeenNthCalledWith(1, BY_ID, { id: 7 })
    expect(request).toHaveBeenNthCalledWith(2, SEARCH, { search: 'x' })
  })

  it('BY_ID 404 resolves null', async () => {
    const { batcher } = setup({ mediaFor: () => null })
    const p = batcher.byId(9)
    await tick()
    expect(await p).toBeNull()
  })

  it('BY_ID with Media null resolves null', async () => {
    const request = vi.fn(async () => ({ Media: null }))
    const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request })
    const p = batcher.byId(9)
    await tick()
    expect(await p).toBeNull()
  })

  it('ids and searches in one window -> 2 requests, ids first', async () => {
    const { request, batcher } = setup()
    const ps = [batcher.search('a'), batcher.byId(1), batcher.search('b'), batcher.byId(2)]
    await tick()
    await Promise.all(ps)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][0]).toBe(ID_BATCH)
    expect(request.mock.calls[1][0]).toBe(searchBatchQuery(2))
  })

  it('flushes at once at 10 distinct searches; the 11th goes in the next request', async () => {
    const { request, batcher } = setup()
    const ps = Array.from({ length: 11 }, (_, i) => batcher.search(`t${i}`))
    await vi.advanceTimersByTimeAsync(0) // no window wait: the cap hands the wave over at once
    await Promise.all(ps)
    expect(request).toHaveBeenCalledTimes(2)
    expect(Object.keys(request.mock.calls[0][1])).toHaveLength(10)
    expect(request).toHaveBeenLastCalledWith(SEARCH, { search: 't10' })
  })

  it('flushes at once at 50 distinct ids; the 51st goes in the next request', async () => {
    const { request, batcher } = setup()
    const ps = Array.from({ length: 51 }, (_, i) => batcher.byId(i + 1))
    await vi.advanceTimersByTimeAsync(0)
    await Promise.all(ps)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][1].ids).toHaveLength(50)
    expect(request).toHaveBeenLastCalledWith(BY_ID, { id: 51 })
  })

  it('duplicates do not count toward the cap', async () => {
    const { request, batcher } = setup()
    const ps = []
    for (let i = 0; i < 20; i++) ps.push(batcher.search(`t${i % 9}`))
    await vi.advanceTimersByTimeAsync(0)
    expect(request).not.toHaveBeenCalled()
    await tick()
    await Promise.all(ps)
    expect(request).toHaveBeenCalledTimes(1)
    expect(Object.keys(request.mock.calls[0][1])).toHaveLength(9)
  })

  it('same id / same exact text share one promise and one alias', async () => {
    const { request, batcher } = setup()
    const a = batcher.search('same')
    const b = batcher.search('same')
    const c = batcher.search('Same')
    const i1 = batcher.byId(3)
    const i2 = batcher.byId(3)
    await tick()
    const [ra, rb, rc, r1, r2] = await Promise.all([a, b, c, i1, i2])
    expect(ra).toBe(rb)
    expect(rc).not.toBe(ra)
    expect(r1).toBe(r2)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenCalledWith(BY_ID, { id: 3 })
    expect(request).toHaveBeenCalledWith(searchBatchQuery(2), { s0: 'same', s1: 'Same' })
  })

  it('non-positive-integer ids (0, -1, 1.5, "7", null) resolve null without a request', async () => {
    const { request, batcher } = setup()
    const res = await Promise.all([0, -1, 1.5, '7', null, undefined, NaN].map((x) => batcher.byId(x)))
    expect(res.every((r) => r === null)).toBe(true)
    await tick()
    expect(request).not.toHaveBeenCalled()
  })

  it('ids above the GraphQL Int range resolve null without a request and do not poison the wave', async () => {
    const { request, batcher } = setup()
    const ps = [2147483648, Number.MAX_SAFE_INTEGER, 5, 6].map((x) => batcher.byId(x))
    await tick()
    const res = await Promise.all(ps)
    expect(res.map((r) => r && r.id)).toEqual([null, null, 5, 6])
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(ID_BATCH, { ids: [5, 6] })
    const top = batcher.byId(2147483647) // the largest valid Int still goes out
    await tick()
    expect((await top).id).toBe(2147483647)
  })

  it('waits for waitGate between the ids part and the searches part of one task', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    const waitGate = vi.fn(() => gate)
    const { request, batcher } = setup({}, { waitGate })
    const ids = [batcher.byId(1), batcher.byId(2)]
    const searches = [batcher.search('a'), batcher.search('b')]
    await tick()
    await Promise.all(ids)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(ID_BATCH, { ids: [1, 2] })
    expect(waitGate).toHaveBeenCalledTimes(1)
    release()
    await Promise.all(searches)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenLastCalledWith(searchBatchQuery(2), { s0: 'a', s1: 'b' })
  })

  it('blank text resolves [] without a request', async () => {
    const { request, batcher } = setup()
    const res = await Promise.all(['', '   ', '\n\t', null, undefined].map((x) => batcher.search(x)))
    expect(res).toEqual([[], [], [], [], []])
    await tick()
    expect(request).not.toHaveBeenCalled()
  })

  it('text with quotes, backslash, $, braces and a newline is sent only as a variable', async () => {
    const { request, batcher } = setup()
    const nasty = 'a"b\\c $d {e} }\n{ f'
    const p = batcher.search(nasty)
    const q = batcher.search('plain')
    await tick()
    expect(await p).toEqual([media(`s:${nasty}`)])
    expect(await q).toEqual([media('s:plain')])
    const [query, vars] = request.mock.calls[0]
    expect(query).not.toContain(nasty)
    expect(query).not.toContain('plain')
    expect(vars).toEqual({ s0: nasty, s1: 'plain' })
  })

  it('a null alias rejects only that search', async () => {
    const request = vi.fn(async () => ({ s0: { media: [media(1)] }, s1: null, s2: { media: [media(3)] } }))
    const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request })
    const ps = ['a', 'b', 'c'].map((t) => batcher.search(t))
    const settled = Promise.allSettled(ps)
    await tick()
    const [a, b, c] = await settled
    expect(a.status).toBe('fulfilled')
    expect(b.status).toBe('rejected')
    expect(c.status).toBe('fulfilled')
    expect(c.value).toEqual([media(3)])
  })

  it('400 on a search batch splits into halves; a lone member uses SEARCH', async () => {
    const fail = (query) => {
      const aliases = (query.match(/\bs\d+: Page/g) ?? []).length
      return aliases > 2 ? tagged('AniList 400', { status: 400 }) : null
    }
    const { request, batcher } = setup({ fail })
    const texts = ['a', 'b', 'c', 'd', 'e']
    const ps = texts.map((t) => batcher.search(t))
    await tick()
    expect(await Promise.all(ps)).toEqual(texts.map((t) => [media(`s:${t}`)]))
    // 5 -> (2,3); 3 -> (1,2) => SEARCH for the lone member
    expect(request.mock.calls.some(([q, v]) => q === SEARCH && 'search' in v)).toBe(true)
  })

  it('a graphql error also splits', async () => {
    let first = true
    const fail = () => {
      if (first) { first = false; return tagged('bad', { graphql: true }) }
      return null
    }
    const { request, batcher } = setup({ fail })
    const ps = ['a', 'b'].map((t) => batcher.search(t))
    await tick()
    expect(await Promise.all(ps)).toEqual([[media('s:a')], [media('s:b')]])
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('a request that always answers 400 rejects every member with a bounded number of calls (<= 2n)', async () => {
    const request = vi.fn(async () => { throw tagged('AniList 400', { status: 400 }) })
    const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request })
    const n = 10
    const ps = Array.from({ length: n }, (_, i) => batcher.search(`t${i}`))
    const settled = Promise.allSettled(ps)
    await vi.advanceTimersByTimeAsync(0)
    const res = await settled
    expect(res.every((r) => r.status === 'rejected')).toBe(true)
    expect(request.mock.calls.length).toBeLessThanOrEqual(2 * n)
  })

  it('any error on the ids request rejects all ids without retrying', async () => {
    for (const err of [tagged('AniList 400', { status: 400 }), tagged('boom', {}), tagged('AniList 500', { status: 500 })]) {
      const request = vi.fn(async () => { throw err })
      const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request })
      const ps = [1, 2, 3, 4, 5].map((i) => batcher.byId(i))
      const settled = Promise.allSettled(ps)
      await tick()
      const res = await settled
      expect(res.every((r) => r.status === 'rejected' && r.reason === err)).toBe(true)
      expect(request).toHaveBeenCalledTimes(1)
    }
  })

  it('a failing ids request does not stop the searches of the same wave', async () => {
    const request = vi.fn(async (query, variables) => {
      if ('ids' in variables) throw tagged('AniList 500', { status: 500 })
      return { s0: { media: [] }, s1: { media: [] } }
    })
    const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request })
    const ids = Promise.allSettled([batcher.byId(1), batcher.byId(2)])
    const searches = [batcher.search('a'), batcher.search('b')]
    await tick()
    expect((await ids).every((r) => r.status === 'rejected')).toBe(true)
    expect(await Promise.all(searches)).toEqual([[], []])
  })

  it('network error / 429 / 500 on searches rejects all searches without retrying', async () => {
    for (const err of [tagged('network down', {}), tagged('AniList 429', { status: 429 }), tagged('AniList 500', { status: 500 })]) {
      const request = vi.fn(async () => { throw err })
      const batcher = createAniListBatcher({ enqueue: makeEnqueue(), request })
      const ps = ['a', 'b', 'c'].map((t) => batcher.search(t))
      const settled = Promise.allSettled(ps)
      await tick()
      const res = await settled
      expect(res.every((r) => r.status === 'rejected' && r.reason === err)).toBe(true)
      expect(request).toHaveBeenCalledTimes(1)
    }
  })

  it('members that arrive while the queue is blocked go out together', async () => {
    const enqueue = makeEnqueue()
    const request = makeRequest()
    const batcher = createAniListBatcher({ enqueue, request })
    let release
    const blocker = enqueue(() => new Promise((r) => { release = r }))
    const ps = []
    for (let w = 0; w < 5; w++) {
      for (let i = 0; i < 5; i++) ps.push(batcher.search(`t${w * 5 + i}`))
      await tick()
    }
    expect(request).not.toHaveBeenCalled()
    release()
    await blocker
    await vi.advanceTimersByTimeAsync(0)
    const res = await Promise.all(ps)
    expect(res).toHaveLength(25)
    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls.map(([, v]) => Object.keys(v).length)).toEqual([10, 10, 5])
    expect(res[24]).toEqual([media('s:t24')])
  })

  it('windowMs 0 still hands over through the timer', async () => {
    const { request, batcher } = setup({}, { windowMs: 0 })
    const p = batcher.byId(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(await p).toEqual(media(1))
    expect(request).toHaveBeenCalledTimes(1)
  })
})
