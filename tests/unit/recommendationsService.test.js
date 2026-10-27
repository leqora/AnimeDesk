import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createRecommendations, FIRST_RUN_MS, DEBOUNCE_MS, SEED_TTL_MS, TRENDING_TTL_MS, RETRY_AFTER_FAIL_MS, KEEP_HIDDEN_POSTERS,
} from '../../src/main/recommendations.js'
import { RULES_VERSION } from '../../src/shared/recommendations.js'

const MIN = 60_000
const H = 60 * MIN
const DAY = 24 * H
const T0 = 1_800_000_000_000

const entry = (id, aniListId, over = {}) => ({
  id, title: `Title ${id}`, aniCliTitle: `Title ${id}`, status: 'completed', aniListId, rating: 9,
  lastWatchedAt: new Date(T0 - Number(id.slice(1)) * H).toISOString(), ...over,
})
const rec = (id, rank = 0, over = {}) => ({
  id, title: `Rec ${id}`, romaji: `Rec ${id}`, english: null, format: 'TV', status: 'FINISHED', year: 2020, episodes: 12,
  genres: ['Action'], coverUrl: `http://img/${id}.jpg`, rank, rating: 50, eligible: true, ...over,
})

let dir, file, entries, recs, trendingItems, anilist, hidden, settings, svc

function build(extra = {}) {
  svc = createRecommendations({ file, library: { list: () => entries }, anilist, settings, ...extra })
}

function setup() {
  recs = new Map()
  trendingItems = [rec(900, 0, { rating: null }), rec(901, 1, { rating: null })]
  anilist = {
    getCached: vi.fn(() => null),
    recommendations: vi.fn(async (ids) => {
      const m = new Map()
      for (const id of ids) m.set(id, recs.get(id) ?? [])
      return m
    }),
    trending: vi.fn(async () => trendingItems),
    poster: vi.fn(async (url) => `data:${url}`),
  }
  hidden = []
  settings = {
    get: () => ({ hiddenRecommendations: [...hidden] }),
    update: vi.fn((patch) => { hidden = [...patch.hiddenRecommendations]; return patch }),
  }
  build()
}

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve() }
const advance = async (ms) => { await vi.advanceTimersByTimeAsync(ms) }
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'))
const ids = () => svc.list().items.map((s) => s.id)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recs-'))
  file = path.join(dir, 'cache', 'recommendations.json')
  entries = [entry('a1', 100), entry('a2', 200)]
  setup()
  recs.set(100, [rec(101, 0), rec(102, 1)])
  recs.set(200, [rec(201, 0), rec(102, 2)])
})
afterEach(() => {
  svc.stop()
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('createRecommendations', () => {
  it('exports the agreed constants', () => {
    expect([FIRST_RUN_MS, DEBOUNCE_MS, SEED_TTL_MS, TRENDING_TTL_MS, RETRY_AFTER_FAIL_MS, KEEP_HIDDEN_POSTERS])
      .toEqual([120_000, 30_000, 604_800_000, 86_400_000, 3_600_000, 20])
  })

  it('first refresh at +120 s, not before', async () => {
    svc.start()
    await advance(FIRST_RUN_MS - 1)
    expect(anilist.recommendations).not.toHaveBeenCalled()
    await advance(1)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    expect([...anilist.recommendations.mock.calls[0][0]].sort()).toEqual([100, 200])
    expect(disk()).toMatchObject({ version: 1, rules: RULES_VERSION, failedAt: null, trending: null })
    expect(Object.keys(disk().bySeed).sort()).toEqual(['100', '200'])
  })

  it('library change refreshes after the 30 s debounce, which re-arms', async () => {
    svc.check()
    await advance(DEBOUNCE_MS - 1000)
    svc.check()
    await advance(DEBOUNCE_MS - 1)
    expect(anilist.recommendations).not.toHaveBeenCalled()
    await advance(1)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
  })

  it('runs daily while started', async () => {
    svc.start()
    await advance(FIRST_RUN_MS)
    await advance(DAY)
    await advance(DAY)
    // the seeds are fresh for 7 days: the daily runs happen but only the ones that find something stale ask
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    await advance(6 * DAY)
    expect(anilist.recommendations).toHaveBeenCalledTimes(2)
  })

  it('seeds younger than 7 days are not queried, stale ones are, and seeds expiring within 24 h ride along', async () => {
    await svc.refresh()
    anilist.recommendations.mockClear()
    await advance(SEED_TTL_MS - 2 * DAY)
    await svc.refresh()
    expect(anilist.recommendations).not.toHaveBeenCalled()
    entries = [...entries, entry('a3', 300)]
    await svc.refresh() // only the new seed; a1/a2 expire in 2 days
    expect(anilist.recommendations.mock.calls[0][0]).toEqual([300])
    await advance(DAY + 12 * H) // a1/a2 expire in 12 h, a3 is fresh
    anilist.recommendations.mockClear()
    await svc.refresh()
    expect(anilist.recommendations).not.toHaveBeenCalled()
    await advance(12 * H + MIN) // a1/a2 stale; a3 (age 2.5 d) must not ride along
    await svc.refresh()
    expect([...anilist.recommendations.mock.calls[0][0]].sort()).toEqual([100, 200])
  })

  it('a stale seed pulls in seeds that expire within the next 24 h', async () => {
    await svc.refresh() // a1, a2 at T0
    await advance(3 * DAY)
    entries = [...entries, entry('a3', 300)]
    await svc.refresh() // a3 at T0 + 3 d
    await advance(4 * DAY - H) // a1/a2: 6 d 23 h old (expire in 1 h), a3 fresh
    anilist.recommendations.mockClear()
    entries = [...entries, entry('a4', 400)] // brand new, stale by definition
    await svc.refresh()
    expect([...anilist.recommendations.mock.calls[0][0]].sort((a, b) => a - b)).toEqual([100, 200, 400])
  })

  it('ids missing from the answer are cached as empty and not re-queried', async () => {
    anilist.recommendations.mockResolvedValueOnce(new Map([[100, recs.get(100)]]))
    await svc.refresh()
    expect(disk().bySeed['200']).toEqual({ at: T0, recs: [] })
    anilist.recommendations.mockClear()
    await svc.refresh()
    expect(anilist.recommendations).not.toHaveBeenCalled()
  })

  it('personal mode: ranks by seeds and carries the "because of" seed', async () => {
    await svc.refresh()
    const r = svc.list()
    expect(r.mode).toBe('personal')
    expect(r.hint).toBe(false)
    expect(new Set(r.items.map((i) => i.id))).toEqual(new Set([101, 102, 201]))
    expect(r.items.find((i) => i.id === 101)).toEqual({
      id: 101, title: 'Rec 101', romaji: 'Rec 101', format: 'TV', status: 'FINISHED', year: 2020, episodes: 12,
      genres: ['Action'], poster: 'data:http://img/101.jpg', fromTitle: 'Title a1', fromId: 'a1',
    })
  })

  it('trending is not requested while the personal list is non-empty', async () => {
    await svc.refresh()
    expect(anilist.trending).not.toHaveBeenCalled()
    expect(disk().trending).toBeNull()
  })

  it('trending is requested when the personal list is empty, at most every 24 h', async () => {
    recs.clear()
    await svc.refresh()
    expect(anilist.trending).toHaveBeenCalledTimes(1)
    const r = svc.list()
    expect(r).toMatchObject({ mode: 'trending', hint: false })
    expect(r.items.map((i) => i.id)).toEqual([900, 901])
    expect(r.items[0]).toMatchObject({ fromTitle: null, fromId: null, poster: 'data:http://img/900.jpg' })
    await advance(DAY - MIN)
    await svc.refresh()
    expect(anilist.trending).toHaveBeenCalledTimes(1)
    await advance(MIN + 1)
    await svc.refresh()
    expect(anilist.trending).toHaveBeenCalledTimes(2)
  })

  it('no seeds: trending with the hint', async () => {
    entries = []
    await svc.refresh()
    expect(anilist.recommendations).not.toHaveBeenCalled()
    expect(svc.list()).toMatchObject({ mode: 'trending', hint: 'rate' })
    expect(ids()).toEqual([900, 901])
  })

  it('list is empty trending with no cache file and never touches the network', () => {
    expect(svc.list()).toEqual({ mode: 'trending', hint: false, items: [] })
    expect(anilist.recommendations).not.toHaveBeenCalled()
    expect(anilist.trending).not.toHaveBeenCalled()
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('only an exact title match yields a seed id', async () => {
    entries = [entry('a1', null), entry('a2', null), entry('a3', null)]
    anilist.getCached = vi.fn((title) => ({ 'Title a1': { id: 100, match: 'exact' }, 'Title a2': { id: 200, match: 'close' }, 'Title a3': { id: 300 } })[title] ?? null)
    build()
    await svc.refresh()
    expect(anilist.recommendations.mock.calls[0][0]).toEqual([100])
  })

  it('failure keeps the cache, stamps failedAt and retries once after 1 h', async () => {
    await svc.refresh()
    const before = ids()
    await advance(SEED_TTL_MS + MIN)
    anilist.recommendations.mockClear()
    anilist.recommendations.mockRejectedValueOnce(new Error('offline'))
    await svc.refresh()
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    expect(disk().failedAt).toBe(Date.now())
    expect(ids()).toEqual(before)
    await advance(58 * MIN)
    svc.check()
    await advance(DEBOUNCE_MS)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    await advance(2 * MIN) // the single retry timer fires at +1 h
    expect(anilist.recommendations).toHaveBeenCalledTimes(2)
    expect(disk().failedAt).toBeNull()
    await advance(2 * RETRY_AFTER_FAIL_MS)
    expect(anilist.recommendations).toHaveBeenCalledTimes(2)
  })

  it('a failed trending request also pauses and keeps the cache', async () => {
    recs.clear()
    await svc.refresh()
    await advance(TRENDING_TTL_MS + MIN)
    anilist.trending.mockRejectedValueOnce(new Error('offline'))
    await svc.refresh()
    expect(disk().failedAt).toBe(Date.now())
    expect(ids()).toEqual([900, 901])
  })

  it('a failedAt in the future counts as now and the pause survives a restart', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ version: 1, rules: RULES_VERSION, bySeed: {}, trending: null, posters: {}, failedAt: T0 + 10 * DAY }))
    build()
    await svc.refresh()
    expect(anilist.recommendations).not.toHaveBeenCalled()
    await advance(RETRY_AFTER_FAIL_MS + 1000)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
  })

  it('RULES_VERSION mismatch drops answers but keeps posters; invalid items are dropped on load', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const good = rec(101, 0)
    fs.writeFileSync(file, JSON.stringify({
      version: 1, rules: RULES_VERSION + 1, failedAt: null, trending: { at: T0, items: [good] },
      bySeed: { 100: { at: T0, recs: [good] } }, posters: { 101: { coverUrl: good.coverUrl, dataUrl: 'data:x' } },
    }))
    build()
    expect(svc.list().items).toEqual([])
    hidden = [101] // keeps the poster of 101 through pruning
    await svc.refresh()
    expect(anilist.recommendations).toHaveBeenCalledTimes(1) // old answers dropped: the seeds are queried again
    expect(disk().posters['101']).toEqual({ coverUrl: good.coverUrl, dataUrl: 'data:x' })
    hidden = []
    fs.writeFileSync(file, JSON.stringify({
      version: 1, rules: RULES_VERSION, failedAt: null, trending: null, posters: {},
      bySeed: {
        100: { at: T0, recs: [good, { ...rec(102, 1), eligible: 'yes' }, { ...rec(103, -1) }, { ...rec(0, 1) }, { ...rec(104, 1), coverUrl: 5 }, { ...rec(105, 1), rank: 1.5 }, null, 'x'] },
        200: { at: T0, recs: [] },
      },
    }))
    build()
    expect(ids()).toEqual([101])
    fs.writeFileSync(file, '{ not json')
    build()
    expect(svc.list().items).toEqual([])
  })

  it('bySeed pruning: non-seed AND older than 7 days, only when there is at least one seed', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({
      version: 1, rules: RULES_VERSION, failedAt: null, trending: null, posters: {},
      bySeed: {
        100: { at: T0 - DAY, recs: [] }, 200: { at: T0 - DAY, recs: [] },
        7: { at: T0 - 8 * DAY, recs: [] }, 8: { at: T0 - DAY, recs: [] },
      },
    }))
    build()
    await svc.refresh()
    expect(Object.keys(disk().bySeed).sort()).toEqual(['100', '200', '8'])
    entries = [] // no seeds: nothing is pruned
    await advance(DAY)
    await svc.refresh()
    expect(Object.keys(disk().bySeed).sort()).toEqual(['100', '200', '8'])
  })

  it('posters: only shown cards, reused for the same coverUrl, refetched when it changes', async () => {
    await svc.refresh()
    expect(anilist.poster.mock.calls.map((c) => c[0]).sort()).toEqual(['http://img/101.jpg', 'http://img/102.jpg', 'http://img/201.jpg'])
    expect(disk().posters['101']).toEqual({ coverUrl: 'http://img/101.jpg', dataUrl: 'data:http://img/101.jpg' })
    anilist.poster.mockClear()
    await advance(SEED_TTL_MS + MIN)
    await svc.refresh()
    expect(anilist.recommendations).toHaveBeenCalledTimes(2)
    expect(anilist.poster).not.toHaveBeenCalled()
    await advance(SEED_TTL_MS + MIN)
    recs.set(100, [rec(101, 0, { coverUrl: 'http://img/101b.jpg' }), rec(102, 1)])
    await svc.refresh()
    expect(anilist.poster.mock.calls.map((c) => c[0])).toEqual(['http://img/101b.jpg'])
  })

  it('posters kept only for shown cards plus the first 20 hidden ones', async () => {
    const many = Array.from({ length: 30 }, (_, i) => rec(1000 + i, i))
    recs.set(100, many)
    recs.set(200, [])
    await svc.refresh()
    expect(Object.keys(disk().posters)).toHaveLength(20) // rail shows 20
    const shownIds = svc.list().items.map((i) => i.id)
    hidden = [...shownIds] // all 20 hidden: the 10 remaining candidates become shown
    await svc.refresh()
    const keep = Object.keys(disk().posters).map(Number)
    for (const id of shownIds) expect(keep.includes(id)).toBe(true) // still within the first 20 hidden
    hidden = [...shownIds, 5, 6, 7].reverse() // the 20 shown ids now sit beyond the first 20
    await svc.refresh()
    const keep2 = Object.keys(disk().posters).map(Number)
    expect(keep2.length).toBeLessThanOrEqual(20 + 10)
    expect(keep2.filter((id) => hidden.slice(0, 20).includes(id) || svc.list().items.some((i) => i.id === id)).length).toBe(keep2.length)
  })

  it('a failed poster does not fail the refresh and is retried next time', async () => {
    anilist.poster.mockResolvedValueOnce(null)
    await svc.refresh()
    expect(disk().failedAt).toBeNull()
    anilist.poster.mockClear()
    await svc.refresh()
    expect(anilist.poster).toHaveBeenCalledTimes(1)
  })

  it('change event on items change and on a hint-only change, not on a no-op refresh', async () => {
    const cb = vi.fn()
    svc.onChange(cb)
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(1)
    await advance(SEED_TTL_MS + MIN)
    await svc.refresh() // same data again
    expect(cb).toHaveBeenCalledTimes(1)
    // library emptied: personal list -> trending with hint
    entries = []
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(2) // personal -> trending with hint, items changed too
    const items = svc.list().items
    entries = [entry('a5', 500, { rating: 3 })] // no seed weight: still no seeds, same trending items
    anilist.getCached = vi.fn(() => null)
    await svc.refresh()
    expect(svc.list().items).toEqual(items)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('hint-only flip emits even when the items stay identical', async () => {
    trendingItems = []
    entries = [entry('a1', 100, { rating: 3 })] // seedless: rate hint, empty items
    await svc.refresh()
    const cb = vi.fn()
    svc.onChange(cb)
    entries = [entry('a1', 100, { rating: 9 })] // one seed whose answer is empty: trending, no hint, still empty
    recs.set(100, [])
    await svc.refresh()
    expect(svc.list()).toMatchObject({ mode: 'trending', hint: false, items: [] })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('rated/finished series without a sure AniList id: link hint, not the rate hint', async () => {
    entries = [entry('a1', null, { rating: 9 })]
    await svc.refresh()
    expect(svc.list()).toMatchObject({ mode: 'trending', hint: 'link' })
    expect(ids()).toEqual([900, 901])
    entries = [entry('a1', null, { rating: 3, status: 'planned' })] // nothing weighted
    expect(svc.list().hint).toBe('rate')
  })

  it('link -> rate hint flip emits a change', async () => {
    entries = [entry('a1', null, { rating: 9 })]
    await svc.refresh()
    const cb = vi.fn()
    svc.onChange(cb)
    entries = [entry('a1', null, { rating: 3, status: 'planned' })]
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('unreadable library: empty trending without hint, and recovery emits', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ version: 1, rules: RULES_VERSION, bySeed: {}, trending: { at: T0, items: [rec(900, 0, { rating: null })] }, posters: {}, failedAt: null }))
    let broken = true
    build({ library: { list: () => { if (broken) throw new Error('disk'); return [] } } })
    expect(svc.list()).toEqual({ mode: 'trending', hint: false, items: [] })
    await svc.refresh()
    const cb = vi.fn()
    svc.onChange(cb)
    broken = false
    await svc.refresh()
    expect(svc.list().items.map((i) => i.id)).toEqual([900])
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('check() emits at once (no network) when hidden changed behind our back, only after a first load', async () => {
    const cb = vi.fn()
    svc.onChange(cb)
    hidden = [101]
    svc.check()
    expect(cb).not.toHaveBeenCalled() // nothing loaded yet: no spurious emit
    await svc.refresh()
    expect(cb).toHaveBeenCalledTimes(1)
    anilist.recommendations.mockClear()
    hidden = [102] // e.g. a data import
    svc.check()
    expect(cb).toHaveBeenCalledTimes(2)
    expect(anilist.recommendations).not.toHaveBeenCalled()
    expect(ids()).not.toContain(102)
  })

  it('rail poster download that never answers is cut after 8 s each', async () => {
    anilist.poster.mockImplementation(() => new Promise(() => {}))
    let done = false
    const p = svc.refresh().then(() => { done = true })
    await advance(8000 * 3 - 1)
    expect(done).toBe(false)
    await advance(1)
    await p
    expect(done).toBe(true)
    expect(svc.list().items).toHaveLength(3)
    expect(svc.list().items.every((i) => i.poster === null)).toBe(true)
  })

  it('a throwing listener does not break the refresh; unsubscribe works', async () => {
    svc.onChange(() => { throw new Error('boom') })
    const ok = vi.fn()
    const off = svc.onChange(ok)
    await svc.refresh()
    expect(ok).toHaveBeenCalledTimes(1)
    off()
    entries = []
    await svc.refresh()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('hide prepends, emits at once and schedules a check; unhide restores', async () => {
    await svc.refresh()
    anilist.recommendations.mockClear(); anilist.poster.mockClear()
    const cb = vi.fn()
    svc.onChange(cb)
    const first = ids()[0]
    expect(svc.hide(first)).toEqual({ ok: true })
    expect(svc.hide(first + 5000)).toEqual({ ok: true })
    expect(settings.update).toHaveBeenLastCalledWith({ hiddenRecommendations: [first + 5000, first] })
    expect(ids()).not.toContain(first)
    expect(cb).toHaveBeenCalledTimes(2)
    expect(svc.unhide(first)).toEqual({ ok: true })
    expect(settings.update).toHaveBeenLastCalledWith({ hiddenRecommendations: [first + 5000] })
    expect(ids()).toContain(first)
    expect(anilist.recommendations).not.toHaveBeenCalled()
    entries = [...entries, entry('a3', 300)]
    await advance(DEBOUNCE_MS)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1) // check() ran the refresh
  })

  it('hide/unhide reject invalid ids', () => {
    expect(svc.hide(-1)).toEqual({ ok: false })
    expect(svc.hide('x')).toEqual({ ok: false })
    expect(svc.unhide(0)).toEqual({ ok: false })
    expect(settings.update).not.toHaveBeenCalled()
  })

  it('a library entry linked by exact cached id is excluded from the rail', async () => {
    entries = [entry('a1', 100), entry('a2', 200), entry('x1', null, { title: 'Other', aniCliTitle: 'Other', rating: undefined, status: 'planned' })]
    anilist.getCached = vi.fn((title) => (title === 'Other' ? { id: 101, match: 'exact' } : null))
    build()
    await svc.refresh()
    expect(ids()).not.toContain(101)
    anilist.getCached = vi.fn((title) => (title === 'Other' ? { id: 101, match: 'close' } : null))
    build()
    expect(ids()).toContain(101)
  })

  describe('forSeries', () => {
    it('invalid id gives empty', async () => {
      for (const bad of [0, -3, 1.5, '100', null, undefined]) expect(await svc.forSeries(bad)).toEqual({ items: [] })
      expect(anilist.recommendations).not.toHaveBeenCalled()
    })

    it('fresh cache: no request; shape without fromTitle/fromId; max 8; filters', async () => {
      await svc.refresh()
      anilist.recommendations.mockClear()
      const r = await svc.forSeries(100)
      expect(anilist.recommendations).not.toHaveBeenCalled()
      expect(r.items.map((i) => i.id)).toEqual([101, 102])
      expect(r.items[0]).toEqual({
        id: 101, title: 'Rec 101', romaji: 'Rec 101', format: 'TV', status: 'FINISHED', year: 2020, episodes: 12,
        genres: ['Action'], poster: 'data:http://img/101.jpg',
      })
      expect(anilist.poster).toHaveBeenCalledTimes(3) // the 3 rail posters only: forSeries reused the cached ones
    })

    it('a cached poster with a different coverUrl is downloaded again', async () => {
      await svc.refresh()
      anilist.poster.mockClear()
      recs.set(100, [rec(101, 0, { coverUrl: 'http://img/101b.jpg' })])
      await advance(SEED_TTL_MS + MIN)
      anilist.recommendations.mockResolvedValueOnce(new Map([[100, []], [200, []]]))
      anilist.poster.mockClear()
      await svc.refresh() // answers now empty: rail falls back; posters of 101 pruned
      recs.set(555, [rec(101, 0, { coverUrl: 'http://img/101b.jpg' })])
      const r = await svc.forSeries(555)
      expect(anilist.poster.mock.calls.map((c) => c[0])).toContain('http://img/101b.jpg')
      expect(r.items[0].poster).toBe('data:http://img/101b.jpg')
    })

    it('a cached poster for a changed coverUrl is not served; the new cover is fetched', async () => {
      await svc.refresh() // posters cached for 101 with img/101.jpg
      recs.set(555, [rec(101, 0, { coverUrl: 'http://img/101c.jpg' })])
      anilist.poster.mockClear()
      const r = await svc.forSeries(555)
      expect(anilist.poster.mock.calls.map((c) => c[0])).toEqual(['http://img/101c.jpg'])
      expect(r.items[0].poster).toBe('data:http://img/101c.jpg')
    })

    it('a forSeries before the first refresh does not emit a spurious event', async () => {
      const cb = vi.fn()
      svc.onChange(cb)
      recs.set(555, [rec(1)])
      await svc.forSeries(555)
      expect(cb).not.toHaveBeenCalled()
    })

    it('unknown id: one request shared by concurrent calls, stored, persisted, emits when it matters', async () => {
      recs.set(555, Array.from({ length: 12 }, (_, i) => rec(2000 + i, i, i === 3 ? { eligible: false } : i === 4 ? { rating: 0 } : {})))
      let release
      anilist.recommendations.mockImplementationOnce(async (want) => {
        await new Promise((r) => { release = r })
        return new Map(want.map((id) => [id, recs.get(id) ?? []]))
      })
      const a = svc.forSeries(555)
      const b = svc.forSeries(555)
      await flush()
      expect(anilist.recommendations).toHaveBeenCalledTimes(1)
      expect(anilist.recommendations.mock.calls[0][0]).toEqual([555])
      release()
      const [ra, rb] = await Promise.all([a, b])
      expect(ra.items).toHaveLength(8)
      expect(ra.items.map((i) => i.id)).toEqual([2000, 2001, 2002, 2005, 2006, 2007, 2008, 2009])
      expect(rb).toEqual(ra)
      expect(disk().bySeed['555'].recs).toHaveLength(12)
      await svc.forSeries(555)
      expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    })

    it('a series that is also a seed updates the rail and emits', async () => {
      await svc.refresh()
      const cb = vi.fn()
      svc.onChange(cb)
      await advance(SEED_TTL_MS + MIN)
      recs.set(100, [rec(103, 0)])
      await svc.forSeries(100)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(ids()).toContain(103)
    })

    it('failure: empty, failedAt untouched, no pause for the refresh', async () => {
      anilist.recommendations.mockRejectedValueOnce(new Error('offline'))
      expect(await svc.forSeries(555)).toEqual({ items: [] })
      expect(fs.existsSync(file) ? disk().failedAt : null).toBeNull()
      await svc.refresh()
      expect(anilist.recommendations).toHaveBeenCalledTimes(2)
    })

    it('failure with a stale record: serves the stale answer', async () => {
      recs.set(555, [rec(1)])
      await svc.forSeries(555)
      await advance(SEED_TTL_MS + MIN)
      anilist.recommendations.mockRejectedValueOnce(new Error('offline'))
      const r = await svc.forSeries(555)
      expect(r.items.map((i) => i.id)).toEqual([1])
      expect(r.items[0].poster).toBe('data:http://img/1.jpg')
    })

    it('during the pause with a stale record: serves it, no request', async () => {
      recs.set(555, [rec(1)])
      await svc.forSeries(555)
      await advance(SEED_TTL_MS + MIN)
      anilist.recommendations.mockRejectedValueOnce(new Error('offline'))
      await svc.refresh()
      anilist.recommendations.mockClear()
      const r = await svc.forSeries(555)
      expect(r.items.map((i) => i.id)).toEqual([1])
      expect(anilist.recommendations).not.toHaveBeenCalled()
    })

    it('during the pause: no request', async () => {
      anilist.recommendations.mockRejectedValueOnce(new Error('offline'))
      await svc.refresh()
      anilist.recommendations.mockClear()
      expect(await svc.forSeries(555)).toEqual({ items: [] })
      expect(anilist.recommendations).not.toHaveBeenCalled()
    })

    it('excludes library, hidden and exact-cached library entries', async () => {
      recs.set(555, [rec(1), rec(2), rec(3), rec(4)])
      hidden = [2]
      entries = [entry('a1', 1), entry('a3', null, { title: 'Rec 3', aniCliTitle: 'Rec 3' })]
      const r = await svc.forSeries(555)
      expect(r.items.map((i) => i.id)).toEqual([4])
    })

    it('poster download that never answers gives poster null after 8 s', async () => {
      anilist.poster.mockImplementation(() => new Promise(() => {}))
      recs.set(555, [rec(1)])
      let result
      const p = svc.forSeries(555).then((r) => { result = r })
      await advance(7999)
      expect(result).toBeUndefined()
      await advance(1)
      await p
      expect(result.items).toEqual([expect.objectContaining({ id: 1, poster: null })])
    })

    it('stop(): in-flight result ignored, later calls empty', async () => {
      let release
      anilist.recommendations.mockImplementationOnce(async (want) => {
        await new Promise((r) => { release = r })
        return new Map(want.map((id) => [id, [rec(1)]]))
      })
      const p = svc.forSeries(555)
      await flush()
      svc.stop()
      release()
      expect(await p).toEqual({ items: [] })
      expect(fs.existsSync(file)).toBe(false)
      expect(await svc.forSeries(100)).toEqual({ items: [] })
    })
  })

  it('overlapping refresh: one at a time, calls during a run collapse into one more run', async () => {
    let release
    let inFlight = 0, maxInFlight = 0
    anilist.recommendations.mockImplementation(async (want) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => { release = r })
      inFlight--
      return new Map(want.map((id) => [id, recs.get(id) ?? []]))
    })
    const first = svc.refresh()
    await flush()
    entries = [...entries, entry('a3', 300)]
    recs.set(300, [rec(301)])
    const second = svc.refresh()
    const third = svc.refresh()
    await flush()
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    release(); await flush()
    expect(anilist.recommendations).toHaveBeenCalledTimes(2)
    expect(anilist.recommendations.mock.calls[1][0]).toEqual([300])
    release()
    await Promise.all([first, second, third])
    expect(anilist.recommendations).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(1)
  })

  it('stop prevents writes and events from an in-flight refresh', async () => {
    let release
    anilist.recommendations.mockImplementationOnce(async (want) => {
      await new Promise((r) => { release = r })
      return new Map(want.map((id) => [id, recs.get(id) ?? []]))
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

  it('stop clears first-run, daily, debounce and retry timers', async () => {
    svc.start()
    svc.check()
    svc.stop()
    await advance(10 * DAY)
    expect(anilist.recommendations).not.toHaveBeenCalled()
  })

  it('stop clears timers armed by earlier runs (daily and retry)', async () => {
    anilist.recommendations.mockRejectedValueOnce(new Error('offline'))
    svc.start()
    await advance(FIRST_RUN_MS) // fails: daily + retry timers armed
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    svc.stop()
    await advance(10 * DAY)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
  })

  it('a seed whose stored time is in the future is treated as stale', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({
      version: 1, rules: RULES_VERSION, failedAt: null, trending: null, posters: {},
      bySeed: { 100: { at: T0 + DAY, recs: [] }, 200: { at: T0 - DAY, recs: [] } },
    }))
    build()
    await svc.refresh()
    expect(anilist.recommendations.mock.calls[0][0]).toEqual([100])
  })

  it('seeds succeed, trending fails: the list changed, so an event fires', async () => {
    await svc.refresh()
    expect(ids()).toContain(101)
    const cb = vi.fn()
    svc.onChange(cb)
    await advance(SEED_TTL_MS + MIN)
    recs.clear() // new answers are empty: the personal list becomes empty
    anilist.trending.mockRejectedValueOnce(new Error('offline'))
    await svc.refresh()
    expect(disk().failedAt).toBe(Date.now())
    expect(svc.list().items).toEqual([])
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('an unreadable library makes no requests and keeps the posters', async () => {
    await svc.refresh()
    const posterIds = Object.keys(disk().posters).sort()
    anilist.recommendations.mockClear(); anilist.trending.mockClear()
    const broken = createRecommendations({ file, library: { list: () => { throw new Error('library down') } }, anilist, settings })
    await advance(SEED_TTL_MS + MIN)
    await broken.refresh()
    expect(anilist.recommendations).not.toHaveBeenCalled()
    expect(anilist.trending).not.toHaveBeenCalled()
    expect(Object.keys(disk().posters).sort()).toEqual(posterIds)
    broken.stop()
  })

  it('a card whose coverUrl became null loses its poster', async () => {
    await svc.refresh()
    expect(disk().posters['101']).toBeDefined()
    await advance(SEED_TTL_MS + MIN)
    recs.set(100, [rec(101, 0, { coverUrl: null }), rec(102, 1)])
    await svc.refresh()
    expect(disk().posters['101']).toBeUndefined()
    expect(svc.list().items.find((i) => i.id === 101).poster).toBeNull()
  })

  it('list() never serves a poster whose coverUrl differs from the item', async () => {
    await svc.refresh()
    const file2 = JSON.parse(fs.readFileSync(file, 'utf8'))
    file2.posters['101'].coverUrl = 'http://img/old.jpg'
    fs.writeFileSync(file, JSON.stringify(file2))
    build()
    expect(svc.list().items.find((i) => i.id === 101).poster).toBeNull()
  })

  it('a refresh with nothing stale and nothing changed does not rewrite the file', async () => {
    await svc.refresh()
    const spy = vi.spyOn(fs, 'renameSync')
    await svc.refresh()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('retries one hour after a failed first run without any check()', async () => {
    anilist.recommendations.mockRejectedValueOnce(new Error('offline'))
    svc.start()
    await advance(FIRST_RUN_MS)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    await advance(RETRY_AFTER_FAIL_MS - 1)
    expect(anilist.recommendations).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(anilist.recommendations).toHaveBeenCalledTimes(2)
  })
})

describe('recommendations bannerUrlOf', () => {
  it('bannerUrlOf only for listed items', async () => {
    setup()
    entries = [entry('e1', 10)]
    recs.set(10, [rec(100, 0, { bannerUrl: 'https://b/100.jpg' }), rec(101, 1, { bannerUrl: 5 }), rec(102, 2, { eligible: false, bannerUrl: 'https://b/102.jpg' })])
    await svc.refresh()
    const ids = svc.list().items.map((i) => i.id)
    expect(ids).toContain(100)
    expect(svc.bannerUrlOf(100)).toBe('https://b/100.jpg')
    expect(svc.bannerUrlOf(101)).toBeNull() // non-string bannerUrl is cleaned to null
    expect(svc.bannerUrlOf(102)).toBeNull() // cached but not in the list
    expect(svc.bannerUrlOf(999)).toBeNull()
    svc.stop()
  })
})
