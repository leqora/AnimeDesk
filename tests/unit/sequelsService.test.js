import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSequels, FIRST_RUN_MS, DEBOUNCE_MS, TTL_MS, RETRY_AFTER_FAIL_MS } from '../../src/main/sequels.js'

const MIN = 60_000
const H = 60 * MIN
const T0 = 1_800_000_000_000

const entry = (id, aniListId, over = {}) => ({
  id, title: `Title ${id}`, aniCliTitle: `Title ${id}`, status: 'completed', aniListId,
  lastWatchedAt: new Date(T0 - Number(id.slice(1)) * H).toISOString(), ...over,
})
const sequel = (id, over = {}) => ({
  id, title: `Sequel ${id}`, romaji: `Sequel ${id}`, english: null, format: 'TV', status: 'FINISHED',
  year: 2020, episodes: 12, coverUrl: `http://img/${id}.jpg`, ...over,
})

let libThrows = false
let dir, file, entries, rel, anilist, hidden, settings, svc

function build() {
  svc = createSequels({ file, library: { list: () => { if (libThrows) throw new Error('library down'); return entries } }, anilist, settings })
}

function setup() {
  rel = new Map()
  anilist = {
    getCached: vi.fn(() => null),
    relations: vi.fn(async (ids) => {
      const m = new Map()
      for (const id of ids) if (rel.has(id)) m.set(id, rel.get(id))
      return m
    }),
    poster: vi.fn(async (url) => `data:${url}`),
  }
  hidden = []
  libThrows = false
  settings = {
    get: () => ({ hiddenSequels: [...hidden] }),
    update: vi.fn((patch) => { hidden = [...patch.hiddenSequels]; return { hiddenSequels: [...hidden] } }),
  }
  build()
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const advance = async (ms) => { await vi.advanceTimersByTimeAsync(ms) }
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'))
const ids = () => svc.list().map((s) => s.id).sort((a, b) => a - b)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sequels-'))
  file = path.join(dir, 'cache', 'sequels.json')
  entries = [entry('a1', 100), entry('a2', 200)]
  setup()
  rel.set(100, [sequel(101)])
  rel.set(200, [sequel(201)])
})
afterEach(() => {
  svc.stop()
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('createSequels', () => {
  it('exports the agreed constants', () => {
    expect([FIRST_RUN_MS, DEBOUNCE_MS, TTL_MS, RETRY_AFTER_FAIL_MS]).toEqual([90_000, 30_000, 86_400_000, 3_600_000])
  })

  it('first refresh at +90 s, not before', async () => {
    svc.start()
    await advance(FIRST_RUN_MS - 1)
    expect(anilist.relations).not.toHaveBeenCalled()
    await advance(1)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    expect([...anilist.relations.mock.calls[0][0]].sort()).toEqual([100, 200])
    expect(disk()).toMatchObject({ version: 1, failedAt: null })
    expect(Object.keys(disk().byId).sort()).toEqual(['100', '200'])
  })

  it('refreshes daily while running', async () => {
    svc.start()
    await advance(FIRST_RUN_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    await advance(TTL_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    await advance(TTL_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(3)
  })

  it('check debounces 30 s and re-arms', async () => {
    svc.check()
    await advance(DEBOUNCE_MS - 1000)
    svc.check() // re-arm: the first timer must not fire
    await advance(DEBOUNCE_MS - 1)
    expect(anilist.relations).not.toHaveBeenCalled()
    await advance(1)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
  })

  it('fresh cache (<24 h) makes no request', async () => {
    await svc.refresh()
    anilist.relations.mockClear()
    await advance(TTL_MS - MIN)
    await svc.refresh()
    expect(anilist.relations).not.toHaveBeenCalled()
  })

  it('stale prequel ids are re-queried, fresh ones are not', async () => {
    await svc.refresh() // a1, a2 at T0
    await advance(20 * H)
    entries = [...entries, entry('a3', 300)]
    rel.set(300, [sequel(301)])
    await svc.refresh() // only the new one
    expect(anilist.relations.mock.calls[1][0]).toEqual([300])
    await advance(5 * H) // a1/a2 are now 25 h old, a3 is 5 h old
    await svc.refresh()
    expect([...anilist.relations.mock.calls[2][0]].sort()).toEqual([100, 200])
  })

  it('ids missing from the answer are cached as empty and not re-queried', async () => {
    rel.delete(200)
    await svc.refresh()
    expect(disk().byId['200']).toEqual({ at: T0, sequels: [] })
    anilist.relations.mockClear()
    await svc.refresh()
    expect(anilist.relations).not.toHaveBeenCalled()
  })

  it('uses the getCached id for entries without aniListId and skips unresolved ones', async () => {
    entries = [entry('a1', null), entry('a2', null)]
    anilist.getCached = vi.fn((title) => (title === 'Title a1' ? { id: 100, match: 'exact' } : null))
    build()
    await svc.refresh()
    expect(anilist.relations.mock.calls[0][0]).toEqual([100])
  })

  it('only an exact title match yields an id (close and unversioned entries do not)', async () => {
    entries = [entry('a1', null), entry('a2', null), entry('a3', null)]
    anilist.getCached = vi.fn((title) => ({ 'Title a1': { id: 100, match: 'exact' }, 'Title a2': { id: 200, match: 'close' }, 'Title a3': { id: 300 } })[title] ?? null)
    build()
    await svc.refresh()
    expect(anilist.relations.mock.calls[0][0]).toEqual([100])
  })

  it('failed refresh keeps the cache and retries after 1 h', async () => {
    await svc.refresh()
    expect(ids()).toEqual([101, 201])
    await advance(TTL_MS + MIN) // everything stale
    anilist.relations.mockClear()
    anilist.relations.mockRejectedValueOnce(new Error('offline'))
    await svc.refresh()
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    expect(disk().failedAt).toBe(Date.now())
    expect(ids()).toEqual([101, 201]) // old cache kept
    await advance(58 * MIN)
    svc.check()
    await advance(DEBOUNCE_MS) // 58.5 min after the failure: still paused
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    await advance(MIN + 1000)
    svc.check()
    await advance(DEBOUNCE_MS) // 60 min 1 s after the failure
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    expect(disk().failedAt).toBeNull()
  })

  it('failure pause survives a restart (stored in the file)', async () => {
    await svc.refresh()
    await advance(TTL_MS + MIN)
    anilist.relations.mockRejectedValueOnce(new Error('offline'))
    await svc.refresh()
    anilist.relations.mockClear()
    build()
    await svc.refresh()
    expect(anilist.relations).not.toHaveBeenCalled()
  })

  it('overlapping refresh: one at a time, and calls during a run collapse into one more run', async () => {
    let release
    let inFlight = 0, maxInFlight = 0
    anilist.relations.mockImplementation(async (want) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => { release = r })
      inFlight--
      return new Map(want.map((id) => [id, rel.get(id) ?? []]))
    })
    const first = svc.refresh()
    await flush()
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    entries = [...entries, entry('a3', 300)] // library changed mid-flight
    rel.set(300, [sequel(301)])
    const second = svc.refresh()
    const third = svc.refresh()
    await flush()
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    release(); await flush()
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    expect(anilist.relations.mock.calls[1][0]).toEqual([300])
    release()
    await Promise.all([first, second, third])
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(1)
  })

  it('library change during a refresh schedules another one', async () => {
    let release
    anilist.relations.mockImplementationOnce(async (want) => {
      await new Promise((r) => { release = r })
      return new Map(want.map((id) => [id, rel.get(id) ?? []]))
    })
    svc.check()
    await advance(DEBOUNCE_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    entries = [...entries, entry('a3', 300)]
    rel.set(300, [sequel(301)])
    svc.check()
    await advance(DEBOUNCE_MS) // second refresh requested while the first is still running
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    release()
    await advance(0)
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    expect(ids()).toEqual([101, 201, 301])
  })

  it('stop prevents writes from an in-flight refresh', async () => {
    let release
    anilist.relations.mockImplementationOnce(async (want) => {
      await new Promise((r) => { release = r })
      return new Map(want.map((id) => [id, rel.get(id) ?? []]))
    })
    const cb = vi.fn()
    svc.onChange(cb)
    const p = svc.refresh()
    await flush()
    svc.stop()
    release()
    await p
    expect(fs.existsSync(file)).toBe(false)
    expect(anilist.poster).not.toHaveBeenCalled()
    expect(cb).not.toHaveBeenCalled()
  })

  it('stop clears first-run, daily and debounce timers', async () => {
    svc.start()
    svc.check()
    svc.stop()
    await advance(2 * TTL_MS)
    expect(anilist.relations).not.toHaveBeenCalled()
  })

  it('posters only for shown sequels and reused for the same coverUrl', async () => {
    hidden = [201]
    rel.set(100, [sequel(101), sequel(102, { status: 'FINISHED', romaji: 'Sequel 102' })])
    entries = [entry('a1', 100), entry('a2', 200), entry('a9', 900, { title: 'Sequel 102', aniCliTitle: 'Sequel 102' })]
    rel.set(900, [])
    await svc.refresh()
    // 201 hidden, 102 already in the library by title: only 101 is shown
    expect(anilist.poster.mock.calls.map((c) => c[0])).toEqual(['http://img/101.jpg'])
    expect(disk().posters['101']).toEqual({ coverUrl: 'http://img/101.jpg', dataUrl: 'data:http://img/101.jpg' })
    expect(disk().posters['201']).toBeUndefined()
    expect(disk().posters['102']).toBeUndefined()
    anilist.poster.mockClear()
    await advance(TTL_MS + MIN)
    await svc.refresh() // re-queried, same coverUrl: no poster fetch
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    expect(anilist.poster).not.toHaveBeenCalled()
    await advance(TTL_MS + MIN)
    rel.set(100, [sequel(101, { coverUrl: 'http://img/101b.jpg' })])
    await svc.refresh()
    expect(anilist.poster.mock.calls.map((c) => c[0])).toEqual(['http://img/101b.jpg'])
  })

  it('a failed poster does not fail the refresh and is retried next time', async () => {
    anilist.poster.mockResolvedValueOnce(null)
    await svc.refresh()
    expect(disk().failedAt).toBeNull()
    expect(ids()).toEqual([101, 201])
    anilist.poster.mockClear()
    await svc.refresh()
    expect(anilist.poster).toHaveBeenCalledTimes(1)
  })

  it('list returns the card shape from cache without touching the network', async () => {
    await svc.refresh()
    anilist.relations.mockClear(); anilist.poster.mockClear()
    expect(svc.list()[0]).toEqual({
      id: 101, title: 'Sequel 101', romaji: 'Sequel 101', format: 'TV', status: 'FINISHED', year: 2020,
      episodes: 12, poster: 'data:http://img/101.jpg', fromTitle: 'Title a1', fromId: 'a1',
    })
    build() // a fresh instance reads the same file
    expect(ids()).toEqual([101, 201])
    expect(anilist.relations).not.toHaveBeenCalled()
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('list is empty with no cache file', () => {
    expect(svc.list()).toEqual([])
  })

  it('hide/unhide recompute from cache', async () => {
    await svc.refresh()
    anilist.relations.mockClear(); anilist.poster.mockClear()
    const cb = vi.fn()
    svc.onChange(cb)
    expect(svc.hide(101)).toEqual({ ok: true })
    expect(settings.update).toHaveBeenLastCalledWith({ hiddenSequels: [101] })
    expect(ids()).toEqual([201])
    expect(cb).toHaveBeenCalledTimes(1)
    expect(svc.unhide(101)).toEqual({ ok: true })
    expect(settings.update).toHaveBeenLastCalledWith({ hiddenSequels: [] })
    expect(ids()).toEqual([101, 201])
    expect(cb).toHaveBeenCalledTimes(2)
    expect(anilist.relations).not.toHaveBeenCalled()
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('hide ignores invalid ids and does not duplicate', () => {
    expect(svc.hide(-1)).toEqual({ ok: false })
    expect(svc.hide('x')).toEqual({ ok: false })
    svc.hide(5); svc.hide(5)
    expect(hidden).toEqual([5])
  })

  it('onChange fires only when the visible list changes, and unsubscribes', async () => {
    const cb = vi.fn()
    const off = svc.onChange(cb)
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(1) // cards and posters appeared
    await advance(TTL_MS + MIN)
    await svc.refresh() // same data again
    expect(cb).toHaveBeenCalledTimes(1)
    rel.set(100, [sequel(101), sequel(103)])
    await advance(TTL_MS + MIN)
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    await advance(TTL_MS + MIN)
    rel.set(100, [])
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('a throwing listener does not break the refresh', async () => {
    svc.onChange(() => { throw new Error('boom') })
    const ok = vi.fn()
    svc.onChange(ok)
    await svc.refresh()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('drops the poster of a sequel the user added to the library, and prequels no longer in the library', async () => {
    await svc.refresh()
    expect(disk().posters['101']).toBeDefined()
    entries = [entry('a1', 100), entry('a2', 200), entry('s1', 101, { status: 'watching' })]
    await svc.refresh()
    expect(disk().posters['101']).toBeUndefined()
    expect(disk().posters['201']).toBeDefined()
    entries = [entry('a1', 100)]
    await svc.refresh()
    expect(Object.keys(disk().byId)).toEqual(['100'])
    expect(disk().posters['201']).toBeUndefined()
  })

  it('keeps the poster of a hidden sequel so unhide works offline', async () => {
    await svc.refresh()
    svc.hide(101)
    await svc.refresh()
    expect(disk().posters['101']).toBeDefined()
  })

  it('a refresh with nothing stale and nothing changed does not rewrite the file', async () => {
    await svc.refresh()
    const before = fs.statSync(file).mtimeMs
    const spy = vi.spyOn(fs, 'renameSync')
    svc.check()
    await advance(DEBOUNCE_MS)
    await svc.refresh()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    expect(fs.statSync(file).mtimeMs).toBe(before)
  })

  it('retries one hour after a failed first run without any check()', async () => {
    anilist.relations.mockRejectedValueOnce(new Error('offline'))
    svc.start()
    await advance(FIRST_RUN_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    await advance(RETRY_AFTER_FAIL_MS - 1)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    expect(disk().failedAt).toBeNull()
    await advance(RETRY_AFTER_FAIL_MS * 2) // success cleared the retry: no more requests until the daily one
    expect(anilist.relations).toHaveBeenCalledTimes(2)
  })

  it('a second failure replaces the retry timer and stop() clears it', async () => {
    anilist.relations.mockRejectedValue(new Error('offline'))
    svc.start()
    await advance(FIRST_RUN_MS)
    await advance(RETRY_AFTER_FAIL_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    await advance(RETRY_AFTER_FAIL_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(3)
    svc.stop()
    await advance(RETRY_AFTER_FAIL_MS * 3)
    expect(anilist.relations).toHaveBeenCalledTimes(3)
  })

  it('a status change of a visible sequel emits onChange once', async () => {
    rel.set(100, [sequel(101, { status: 'RELEASING', episodes: null })])
    await svc.refresh()
    const cb = vi.fn()
    svc.onChange(cb)
    await advance(TTL_MS + MIN)
    rel.set(100, [sequel(101, { status: 'FINISHED', episodes: 12 })])
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(svc.list().find((x) => x.id === 101)).toMatchObject({ status: 'FINISHED', episodes: 12 })
    await advance(TTL_MS + MIN)
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('an unreadable library keeps posters and byId on disk and does not rewrite the file', async () => {
    await svc.refresh()
    const before = fs.readFileSync(file, 'utf8')
    expect(Object.keys(disk().posters).sort()).toEqual(['101', '201'])
    libThrows = true
    const spy = vi.spyOn(fs, 'renameSync')
    await advance(TTL_MS + MIN)
    await svc.refresh()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })

  it('a retry timer firing 500 ms early still makes the request', async () => {
    anilist.relations.mockRejectedValueOnce(new Error('offline'))
    svc.start()
    await advance(FIRST_RUN_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() - 500) // the clock reads 500 ms short when the timer fires
    await advance(RETRY_AFTER_FAIL_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(2)
    expect(disk().failedAt).toBeNull()
  })

  it('a failure stored by a previous run: paused at +90 s, then exactly one retry at failedAt + 1 h', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ version: 1, byId: {}, posters: {}, failedAt: T0 - 30 * MIN }))
    build()
    svc.start()
    await advance(FIRST_RUN_MS)
    expect(anilist.relations).not.toHaveBeenCalled()
    await advance(30 * MIN - FIRST_RUN_MS - 1)
    expect(anilist.relations).not.toHaveBeenCalled()
    await advance(1)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    await advance(RETRY_AFTER_FAIL_MS * 2)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    expect(disk().failedAt).toBeNull()
  })

  it('a persisted failedAt far in the future does not busy-loop: bounded timers, one request within 1 h', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ version: 1, byId: {}, posters: {}, failedAt: T0 + 30 * 24 * H }))
    build()
    svc.start()
    await advance(FIRST_RUN_MS)
    expect(anilist.relations).not.toHaveBeenCalled() // still paused
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2) // daily + one retry, nothing re-arming in a loop
    await advance(5000)
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2)
    await advance(RETRY_AFTER_FAIL_MS - 5000 + 1000)
    expect(anilist.relations).toHaveBeenCalledTimes(1) // a request no later than 1 h after the first run
    await advance(RETRY_AFTER_FAIL_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
    expect(disk().failedAt).toBeNull()
  })

  it('a failedAt that ends up in the future between runs is clamped: retry delay never exceeds 1 h', async () => {
    const timers = [] // manual timer table: the retry callback is fired by hand after the clock jump
    const fakeSet = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
    svc = createSequels({ file, library: { list: () => entries }, anilist, settings, setTimeout: fakeSet, clearTimeout: () => {} })
    anilist.relations.mockRejectedValueOnce(new Error('offline'))
    await svc.refresh()
    expect(disk().failedAt).toBe(T0)
    expect(timers).toHaveLength(1)
    vi.setSystemTime(T0 - 40 * 24 * H) // clock corrected backwards: the in-memory failedAt is 40 days ahead
    timers[0].fn() // retry timer fires -> runOnce takes the "paused" path with a future failedAt
    await flush()
    expect(timers).toHaveLength(2) // exactly one re-arm, not a loop
    expect(timers[1].ms).toBeLessThanOrEqual(RETRY_AFTER_FAIL_MS)
    expect(anilist.relations).toHaveBeenCalledTimes(1)
  })

  it('a cached entry stamped in the future is re-queried', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ version: 1, byId: { 100: { at: T0 + 30 * 24 * H, sequels: [] } }, posters: {}, failedAt: null }))
    build()
    await svc.refresh()
    expect([...anilist.relations.mock.calls[0][0]]).toContain(100)
    expect(ids()).toContain(101)
  })

  it('unhide schedules a debounced check so a newly revealed card gets its poster', async () => {
    hidden = [101]
    await svc.refresh()
    expect(anilist.poster).not.toHaveBeenCalledWith('http://img/101.jpg')
    anilist.poster.mockClear()
    svc.unhide(101)
    expect(anilist.poster).not.toHaveBeenCalled()
    await advance(DEBOUNCE_MS)
    expect(anilist.poster).toHaveBeenCalledWith('http://img/101.jpg')
    expect(svc.list().find((s) => s.id === 101).poster).toBe('data:http://img/101.jpg')
  })

  it('tolerates a corrupt cache file', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{not json')
    build()
    expect(svc.list()).toEqual([])
    await svc.refresh()
    expect(anilist.relations).toHaveBeenCalledTimes(1)
  })
})
