import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSchedule, TTL_MS, RETRY_AFTER_FAIL_MS, FORCE_MIN_MS, MAX_POSTER_IDS, POSTER_CONCURRENCY } from '../../src/main/schedule.js'
import { RULES_VERSION } from '../../src/shared/recommendations.js'
import { dayWindow } from '../../src/shared/schedule.js'

const MIN = 60_000
const H = 60 * MIN
const T0 = new Date(2026, 5, 10, 12, 0, 0).getTime() // local noon

const item = (mediaId, over = {}) => ({
  mediaId, episode: 3, airingAt: T0 + H, title: `Show ${mediaId}`, romaji: `Show ${mediaId}`, english: null, format: 'TV',
  isAdult: false, coverUrl: `http://img/${mediaId}.jpg`, poster: true, ...over,
})

let dir, file, clock, entries, fetched, anilist, cache, svc

function build(extra = {}) {
  svc = createSchedule({ file, library: { list: () => entries }, anilist, now: () => clock, ...extra })
}
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve() }
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'))
const refreshed = async (opts) => { const r = svc.list(opts); await flush(); return r }

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-'))
  file = path.join(dir, 'cache', 'schedule.json')
  clock = T0
  entries = []
  cache = {}
  fetched = [item(1), item(2)]
  anilist = {
    schedule: vi.fn(async () => fetched),
    getCached: vi.fn((title, { aniListId } = {}) => cache[aniListId ? `id:${aniListId}` : title] ?? null),
    poster: vi.fn(async (url) => `data:${url}`),
  }
  build()
})
afterEach(() => {
  svc.stop()
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('createSchedule refresh', () => {
  it('exports the agreed constants', () => {
    expect([TTL_MS, RETRY_AFTER_FAIL_MS, FORCE_MIN_MS, MAX_POSTER_IDS, POSTER_CONCURRENCY]).toEqual([21_600_000, 3_600_000, 60_000, 40, 4])
  })

  it('does nothing until list() is called', async () => {
    await flush()
    expect(anilist.schedule).not.toHaveBeenCalled()
  })

  it('first list() is loading, fetches the window once, emits, then ok', async () => {
    const onChange = vi.fn()
    svc.onChange(onChange)
    const r = svc.list()
    expect(r).toMatchObject({ state: 'loading', refreshing: true, fetchedAt: null, items: [] })
    const w = dayWindow(T0)
    expect(anilist.schedule).toHaveBeenCalledTimes(1)
    expect(anilist.schedule).toHaveBeenCalledWith(w.from, w.to)
    await flush()
    expect(onChange).toHaveBeenCalledTimes(1)
    const r2 = svc.list()
    expect(r2).toMatchObject({ state: 'ok', refreshing: false, fetchedAt: T0, from: w.from, days: w.days })
    expect(r2.items.map((i) => i.mediaId)).toEqual([1, 2])
    expect(r2.items[0]).toEqual({ mediaId: 1, episode: 3, airingAt: T0 + H, title: 'Show 1', romaji: 'Show 1', format: 'TV', entryId: null, posterHidden: false })
  })

  it('no second call within 6 h on the same day; one after 6 h', async () => {
    await refreshed()
    clock = T0 + 5 * H
    svc.list(); await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(1)
    clock = T0 + 6 * H
    svc.list(); await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(2)
  })

  it('refreshes after local midnight even when younger than 6 h', async () => {
    clock = new Date(2026, 5, 10, 23, 0, 0).getTime()
    await refreshed()
    clock = new Date(2026, 5, 11, 0, 30, 0).getTime()
    svc.list(); await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(2)
    expect(anilist.schedule).toHaveBeenLastCalledWith(dayWindow(clock).from, dayWindow(clock).to)
  })

  it('concurrent list() calls share one refresh', async () => {
    svc.list(); svc.list(); svc.list()
    await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(1)
  })

  it('failure without a record is error; with a record it is stale and the record is kept', async () => {
    anilist.schedule.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    expect(svc.list().state).toBe('error')
    expect(svc.list().items).toEqual([])
    clock = T0 + RETRY_AFTER_FAIL_MS
    await refreshed()
    expect(svc.list().state).toBe('ok')
    clock = T0 + RETRY_AFTER_FAIL_MS + 7 * H
    anilist.schedule.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    const r = svc.list()
    expect(r.state).toBe('stale')
    expect(r.items.length).toBe(2)
    expect(r.fetchedAt).toBe(T0 + RETRY_AFTER_FAIL_MS)
  })

  it('a refresh running on an old record is ok + refreshing', async () => {
    await refreshed()
    clock = T0 + 7 * H
    let release
    anilist.schedule.mockImplementationOnce(() => new Promise((r) => { release = () => r(fetched) }))
    const r = svc.list()
    expect(r).toMatchObject({ state: 'ok', refreshing: true })
    release(); await flush()
    expect(svc.list().refreshing).toBe(false)
  })

  it('pauses 1 h after a failure; a future failedAt counts as now', async () => {
    anilist.schedule.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    clock = T0 + RETRY_AFTER_FAIL_MS - 1
    svc.list(); await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(1)
    clock = T0 + RETRY_AFTER_FAIL_MS
    svc.list(); await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(2)

    // stored failedAt in the future
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ version: 1, rules: RULES_VERSION, failedAt: clock + 10 * H, items: [], posters: {} }))
    build()
    svc.list(); await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(2)
    clock += RETRY_AFTER_FAIL_MS
    svc.list(); await flush()
    expect(anilist.schedule).toHaveBeenCalledTimes(3)
  })

  it('force bypasses the pause, but only once per 60 s', async () => {
    anilist.schedule.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    anilist.schedule.mockRejectedValueOnce(new Error('down'))
    clock += 1000
    await refreshed({ force: true })
    expect(anilist.schedule).toHaveBeenCalledTimes(2)
    clock += 30_000
    await refreshed({ force: true })
    expect(anilist.schedule).toHaveBeenCalledTimes(2)
    clock += 31_000
    await refreshed({ force: true })
    expect(anilist.schedule).toHaveBeenCalledTimes(3)
  })

  it('drops the record on RULES_VERSION mismatch but keeps posters; invalid items are dropped', async () => {
    const w = dayWindow(T0)
    const stored = (rules, items) => JSON.stringify({
      version: 1, rules, fetchedAt: T0, from: w.from, to: w.to, items, failedAt: null,
      posters: { 1: { coverUrl: 'http://img/1.jpg', dataUrl: 'data:keep' } },
    })
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, stored(RULES_VERSION + 1, [item(1)]))
    build()
    expect(svc.list().state).toBe('loading')
    await flush()
    fs.writeFileSync(file, stored(RULES_VERSION, [item(1), { mediaId: 'x' }, null, item(2, { poster: 'yes' })]))
    build()
    const r = svc.list()
    expect(r.state).toBe('ok')
    expect(r.items.map((i) => i.mediaId)).toEqual([1])
    expect(anilist.schedule).toHaveBeenCalledTimes(1)
    expect((await svc.posters([1]))[1]).toBe('data:keep')
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('an unreadable file gives the empty state without throwing', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{not json')
    build()
    expect(() => svc.list()).not.toThrow()
    expect(svc.list().state).toBe('loading')
  })

  it('keeps only items inside the current window', async () => {
    fetched = [item(1), item(2, { airingAt: dayWindow(T0).to + H }), item(3, { airingAt: dayWindow(T0).from - H })]
    await refreshed()
    expect(svc.list().items.map((i) => i.mediaId)).toEqual([1])
  })
})

describe('createSchedule library', () => {
  it('matches by aniListId, ignores dropped, keeps adult only inside the library', async () => {
    fetched = [item(1), item(2), item(3, { isAdult: true, poster: false }), item(4, { isAdult: true, poster: false }), item(5, { format: 'MUSIC' })]
    entries = [
      { id: 'e1', title: 'Other name', aniListId: 1, status: 'watching' },
      { id: 'e2', title: 'Unrelated', aniListId: 2, status: 'dropped' },
      { id: 'e3', title: 'Hidden', aniListId: 3, status: 'watching' },
    ]
    await refreshed()
    const r = svc.list()
    expect(r.items.map((i) => [i.mediaId, i.entryId])).toEqual([[1, 'e1'], [2, null], [3, 'e3']])
  })

  it('title ids are used only for an exact cache match', async () => {
    cache['Exact'] = { id: 1, match: 'exact' }
    cache['Close'] = { id: 2, match: 'close' }
    entries = [{ id: 'e1', title: 'Exact', status: 'watching' }, { id: 'e2', title: 'Close', status: 'watching' }]
    await refreshed()
    expect(svc.list().items.map((i) => i.entryId)).toEqual(['e1', null])
  })

  it('posterHidden: poster false and no sure library poster', async () => {
    fetched = [item(1, { poster: false }), item(2, { poster: false }), item(3, { poster: false })]
    entries = [{ id: 'e1', title: 'A', aniListId: 1, status: 'watching' }, { id: 'e2', title: 'B', aniListId: 2, status: 'watching' }]
    cache['id:1'] = { id: 1, poster: 'data:lib1', match: 'exact' }
    await refreshed()
    expect(svc.list().items.map((i) => i.posterHidden)).toEqual([false, true, true])
  })
})

describe('createSchedule posters', () => {
  it('library item with aniListId gets the cached poster, no download', async () => {
    fetched = [item(1, { poster: false })]
    entries = [{ id: 'e1', title: 'A', aniListId: 1, status: 'watching' }]
    cache['id:1'] = { id: 1, poster: 'data:lib1' }
    await refreshed()
    expect(await svc.posters([1])).toEqual({ 1: 'data:lib1' })
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('library item linked only by a close title match and poster false gets null without download', async () => {
    fetched = [item(1, { poster: false })]
    entries = [{ id: 'e1', title: 'A', status: 'watching' }]
    cache['A'] = { id: 1, poster: 'data:close', match: 'close' }
    await refreshed()
    expect(await svc.posters([1])).toEqual({ 1: null })
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('an exact title match with the same id supplies the library poster', async () => {
    fetched = [item(1, { poster: false })]
    entries = [{ id: 'e1', title: 'A', status: 'watching' }]
    cache['A'] = { id: 1, poster: 'data:exact', match: 'exact' }
    await refreshed()
    expect(await svc.posters([1])).toEqual({ 1: 'data:exact' })
  })

  it('outside item with poster false is null and never downloaded', async () => {
    fetched = [item(1, { poster: false })]
    await refreshed()
    expect(await svc.posters([1, 99])).toEqual({ 1: null, 99: null })
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('downloads an allowed item once, caches it in the file, refetches when coverUrl changes', async () => {
    await refreshed()
    expect(await svc.posters([1])).toEqual({ 1: 'data:http://img/1.jpg' })
    expect(await svc.posters([1])).toEqual({ 1: 'data:http://img/1.jpg' })
    expect(anilist.poster).toHaveBeenCalledTimes(1)
    expect(disk().posters[1]).toEqual({ coverUrl: 'http://img/1.jpg', dataUrl: 'data:http://img/1.jpg' })
    fetched = [item(1, { coverUrl: 'http://img/new.jpg' })]
    clock = T0 + 7 * H
    await refreshed()
    expect(await svc.posters([1])).toEqual({ 1: 'data:http://img/new.jpg' })
    expect(anilist.poster).toHaveBeenCalledTimes(2)
  })

  it('handles at most 40 ids', async () => {
    fetched = Array.from({ length: 45 }, (_, i) => item(i + 1))
    await refreshed()
    const r = await svc.posters(fetched.map((i) => i.mediaId))
    expect(Object.keys(r).length).toBe(40)
    expect(anilist.poster).toHaveBeenCalledTimes(40)
  })

  it('never runs more than 4 downloads at once', async () => {
    fetched = Array.from({ length: 12 }, (_, i) => item(i + 1))
    await refreshed()
    let active = 0
    let peak = 0
    anilist.poster.mockImplementation(async (url) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return `data:${url}`
    })
    const r = await svc.posters(fetched.map((i) => i.mediaId))
    expect(Object.values(r).every((v) => v)).toBe(true)
    expect(peak).toBe(4)
  })

  it('a slow download yields null after 8 s (fake clock drives the service timer)', async () => {
    vi.useFakeTimers()
    build() // after useFakeTimers so the service captures the fake setTimeout
    await refreshed()
    anilist.poster.mockImplementation(() => new Promise(() => {}))
    const p = svc.posters([1])
    let done = false
    p.then(() => { done = true })
    await vi.advanceTimersByTimeAsync(7999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toEqual({ 1: null })
  })

  it('reads each distinct cache key once per list() / posters() call', async () => {
    fetched = Array.from({ length: 50 }, (_, i) => item(i + 1, { poster: false }))
    entries = ['A', 'B', 'C'].map((t, i) => ({ id: `e${i}`, title: t, status: 'watching' }))
    await refreshed()
    anilist.getCached.mockClear()
    svc.list()
    expect(anilist.getCached.mock.calls.length).toBeLessThanOrEqual(3)
    anilist.getCached.mockClear()
    await svc.posters(fetched.map((i) => i.mediaId))
    expect(anilist.getCached.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('writes the file once per poster batch', async () => {
    await refreshed()
    const spy = vi.spyOn(fs, 'renameSync')
    await svc.posters([1, 2])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('failed downloads are not stored', async () => {
    await refreshed()
    anilist.poster.mockResolvedValue(null)
    expect(await svc.posters([1])).toEqual({ 1: null })
    expect(disk().posters).toEqual({})
  })

  it('prunes posters of media no longer in items on refresh', async () => {
    await refreshed()
    await svc.posters([1, 2])
    fetched = [item(2)]
    clock = T0 + 7 * H
    await refreshed()
    expect(Object.keys(disk().posters)).toEqual(['2'])
  })
})

describe('createSchedule forget / stop', () => {
  it('forget removes the file; the next list() is loading and fetches', async () => {
    await refreshed()
    expect(fs.existsSync(file)).toBe(true)
    const onChange = vi.fn()
    svc.onChange(onChange)
    svc.forget()
    expect(fs.existsSync(file)).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(svc.list().state).toBe('loading')
    expect(anilist.schedule).toHaveBeenCalledTimes(2)
    await flush()
    expect(svc.list().state).toBe('ok')
  })

  it('forget also clears the failure pause', async () => {
    anilist.schedule.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    svc.forget()
    svc.list()
    expect(anilist.schedule).toHaveBeenCalledTimes(2)
  })

  it('a refresh in flight during forget() does not write', async () => {
    let release
    anilist.schedule.mockImplementationOnce(() => new Promise((r) => { release = () => r(fetched) }))
    svc.list()
    svc.forget()
    release(); await flush()
    expect(fs.existsSync(file)).toBe(false)
    expect(svc.list().state).toBe('loading')
  })

  it('stop() makes an in-flight result a no-op', async () => {
    let release
    anilist.schedule.mockImplementationOnce(() => new Promise((r) => { release = () => r(fetched) }))
    const onChange = vi.fn()
    svc.onChange(onChange)
    svc.list()
    svc.stop()
    release(); await flush()
    expect(fs.existsSync(file)).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('onChange returns an unsubscribe', async () => {
    const fn = vi.fn()
    svc.onChange(fn)()
    await refreshed()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('createSchedule shared poster limiter', () => {
  const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }

  it('two overlapping posters() calls never exceed 4 downloads in flight overall', async () => {
    fetched = Array.from({ length: 12 }, (_, i) => item(i + 1))
    await refreshed()
    let active = 0
    let peak = 0
    anilist.poster.mockImplementation(async (url) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return `data:${url}`
    })
    const [a, b] = await Promise.all([svc.posters([1, 2, 3, 4, 5, 6]), svc.posters([7, 8, 9, 10, 11, 12])])
    expect(Object.values({ ...a, ...b }).every((v) => v)).toBe(true)
    expect(peak).toBe(4)
    expect(anilist.poster).toHaveBeenCalledTimes(12)
  })

  it('the same id requested by two overlapping calls downloads once and both get the data URL', async () => {
    await refreshed()
    const gate = deferred()
    anilist.poster.mockImplementation(async (url) => { await gate.promise; return `data:${url}` })
    const p1 = svc.posters([1])
    const p2 = svc.posters([1])
    await flush()
    gate.resolve()
    expect(await p1).toEqual({ 1: 'data:http://img/1.jpg' })
    expect(await p2).toEqual({ 1: 'data:http://img/1.jpg' })
    expect(anilist.poster).toHaveBeenCalledTimes(1)
  })

  it('a download that timed out keeps its slot until it really settles', async () => {
    vi.useFakeTimers()
    build()
    fetched = Array.from({ length: 5 }, (_, i) => item(i + 1))
    await refreshed()
    const gates = []
    anilist.poster.mockImplementation((url) => { const g = deferred(); gates.push(g); return g.promise.then(() => `data:${url}`) })
    const p = svc.posters([1, 2, 3, 4, 5])
    await vi.advanceTimersByTimeAsync(0)
    expect(anilist.poster).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(8000)
    expect(anilist.poster).toHaveBeenCalledTimes(4) // the four timed out for the caller but still hold their slots
    gates[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(anilist.poster).toHaveBeenCalledTimes(5)
    gates[4].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(await p).toEqual({ 1: null, 2: null, 3: null, 4: null, 5: 'data:http://img/5.jpg' })
  })

  it('forget() during an in-flight batch leaves the file deleted', async () => {
    await refreshed()
    const gate = deferred()
    anilist.poster.mockImplementation(async (url) => { await gate.promise; return `data:${url}` })
    const p = svc.posters([1, 2])
    await flush()
    svc.forget()
    gate.resolve()
    await p
    await flush()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('stop() during an in-flight batch writes nothing afterwards', async () => {
    await refreshed()
    const before = fs.readFileSync(file, 'utf8')
    const gate = deferred()
    anilist.poster.mockImplementation(async (url) => { await gate.promise; return `data:${url}` })
    const p = svc.posters([1, 2])
    await flush()
    svc.stop()
    gate.resolve()
    await p
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })
})

describe('createSchedule poster timeout and queued downloads', () => {
  const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
  const gated = () => {
    const gates = []
    anilist.poster.mockImplementation((url) => { const g = deferred(); gates.push(g); return g.promise.then(() => `data:${url}`) })
    return gates
  }

  it('passes the poster timeout to anilist.poster', async () => {
    await refreshed()
    await svc.posters([1])
    expect(anilist.poster).toHaveBeenCalledWith('http://img/1.jpg', { timeoutMs: 8000 })
  })

  it('a download waiting for a slot does not start after stop()', async () => {
    fetched = Array.from({ length: 5 }, (_, i) => item(i + 1))
    await refreshed()
    const gates = gated()
    const p = svc.posters([1, 2, 3, 4, 5])
    await flush()
    expect(anilist.poster).toHaveBeenCalledTimes(4)
    svc.stop()
    gates.forEach((g) => g.resolve())
    const r = await p
    await flush()
    expect(anilist.poster).toHaveBeenCalledTimes(4)
    expect(r[5]).toBeNull()
  })

  it('a download waiting for a slot does not start after forget(), and a new list gets the poster', async () => {
    fetched = Array.from({ length: 5 }, (_, i) => item(i + 1))
    await refreshed()
    const gates = gated()
    const p = svc.posters([1, 2, 3, 4, 5])
    await flush()
    svc.forget()
    gates.forEach((g) => g.resolve())
    const r = await p
    await flush()
    expect(anilist.poster).toHaveBeenCalledTimes(4)
    expect(r[5]).toBeNull()
    anilist.poster.mockImplementation(async (url) => `data:${url}`)
    await refreshed()
    expect(await svc.posters([5])).toEqual({ 5: 'data:http://img/5.jpg' })
    expect(anilist.poster).toHaveBeenCalledTimes(5)
  })

  it('rejected poster download returns null, frees the slot and retries next call', async () => {
    fetched = Array.from({ length: 5 }, (_, i) => item(i + 1))
    await refreshed()
    anilist.poster.mockImplementation(async (url) => {
      if (url.endsWith('/5.jpg')) return `data:${url}`
      throw new Error('x')
    })
    const r = await svc.posters([1, 2, 3, 4, 5])
    expect(r).toEqual({ 1: null, 2: null, 3: null, 4: null, 5: 'data:http://img/5.jpg' })
    expect(Object.keys(disk().posters)).toEqual(['5'])
    await svc.posters([1])
    expect(anilist.poster).toHaveBeenCalledTimes(6)
  })
})

describe('createSchedule retryAt', () => {
  const fail = () => { anilist.schedule.mockRejectedValue(new Error('down')) }

  it('null when not paused', async () => {
    expect((await refreshed()).retryAt).toBeNull()
  })

  it('null when a forced retry is allowed', async () => {
    fail()
    await refreshed()
    clock = T0 + 5 * MIN
    expect(svc.list().retryAt).toBeNull()
    clock = T0 + 10 * MIN
    await refreshed({ force: true })
    clock = T0 + 10 * MIN + FORCE_MIN_MS
    expect(svc.list().retryAt).toBeNull()
  })

  it('lastForceAt + 60 s while paused after a forced retry', async () => {
    fail()
    await refreshed()
    clock = T0 + 10 * MIN
    await refreshed({ force: true })
    clock = T0 + 10 * MIN + 5000
    expect(svc.list().retryAt).toBe(T0 + 10 * MIN + FORCE_MIN_MS)
  })

  it('null after a successful refresh', async () => {
    fail()
    await refreshed()
    clock = T0 + 10 * MIN
    await refreshed({ force: true })
    anilist.schedule.mockImplementation(async () => fetched)
    clock = T0 + 10 * MIN + FORCE_MIN_MS
    await refreshed({ force: true })
    clock = T0 + 10 * MIN + FORCE_MIN_MS + 1000
    expect(svc.list().retryAt).toBeNull()
  })

  it('null when lastForceAt is in the future (clock moved back)', async () => {
    fail()
    await refreshed()
    clock = T0 + 10 * MIN
    await refreshed({ force: true })
    clock = T0 + 5 * MIN
    expect(svc.list().retryAt).toBeNull()
  })
})
