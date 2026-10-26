import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDiscover, TTL_MS, RETRY_AFTER_FAIL_MS, FORCE_MIN_MS, MAX_POSTER_IDS, POSTER_CONCURRENCY } from '../../src/main/discover.js'
import { RULES_VERSION } from '../../src/shared/recommendations.js'
import { seasonOf, nextSeason, buildRails } from '../../src/shared/discover.js'

const MIN = 60_000
const H = 60 * MIN
const T0 = new Date(2026, 10, 10, 12, 0, 0).getTime() // FALL 2026

const it_ = (id, over = {}) => ({
  id, title: `Show ${id}`, romaji: `Show ${id}`, english: null, format: 'TV', status: 'RELEASING', year: 2026, episodes: 12,
  genres: ['Action'], start: { year: 2026, month: 10 }, coverUrl: `http://img/${id}.jpg`, shown: true, ...over,
})
const raw = () => ({ season: [it_(1), it_(2)], upcoming: [it_(3, { status: 'NOT_YET_RELEASED' })], movies: [it_(4, { format: 'MOVIE' })], trending: [it_(5), it_(6, { shown: false })] })

let dir, file, clock, entries, fetched, anilist, cache, settings, svc

function build(extra = {}) {
  svc = createDiscover({ file, library: { list: () => entries }, anilist, settings, now: () => clock, ...extra })
}
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve() }
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'))
const refreshed = async (opts) => { const r = svc.list(opts); await flush(); return r }
const ids = (r, key) => r.rails[key].map((i) => i.id)

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'))
  file = path.join(dir, 'cache', 'discover.json')
  clock = T0
  entries = []
  cache = {}
  fetched = raw()
  settings = { get: () => ({ hiddenRecommendations: [9] }) }
  anilist = {
    discover: vi.fn(async () => fetched),
    getCached: vi.fn((title, { aniListId } = {}) => cache[aniListId ? `id:${aniListId}` : title] ?? null),
    poster: vi.fn(async (url) => `data:${url}`),
  }
  build()
})
afterEach(() => {
  svc.stop()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('createDiscover refresh', () => {
  it('exports the agreed constants', () => {
    expect([TTL_MS, RETRY_AFTER_FAIL_MS, FORCE_MIN_MS, MAX_POSTER_IDS, POSTER_CONCURRENCY]).toEqual([43_200_000, 3_600_000, 60_000, 40, 4])
  })

  it('does nothing until list() is called', async () => {
    await flush()
    expect(anilist.discover).not.toHaveBeenCalled()
  })

  it('first list() is loading, one call with the season variables, emits once, then ok with rails', async () => {
    const onChange = vi.fn()
    svc.onChange(onChange)
    const r = svc.list()
    const cur = seasonOf(T0)
    const nx = nextSeason(cur)
    expect(r).toMatchObject({ state: 'loading', refreshing: true, fetchedAt: null, season: cur, next: nx, hiddenIds: [9] })
    expect(anilist.discover).toHaveBeenCalledTimes(1)
    expect(anilist.discover).toHaveBeenCalledWith({ season: cur.season, year: cur.year, nextSeason: nx.season, nextYear: nx.year })
    await flush()
    expect(onChange).toHaveBeenCalledTimes(1)
    const r2 = svc.list()
    expect(r2).toMatchObject({ state: 'ok', refreshing: false, fetchedAt: T0, retryAt: null })
    const expected = buildRails(raw())
    for (const k of Object.keys(expected)) expect(ids(r2, k)).toEqual(expected[k].map((i) => i.id))
    expect(r2.rails.season[0]).toEqual({ id: 1, title: 'Show 1', romaji: 'Show 1', format: 'TV', status: 'RELEASING', year: 2026, episodes: 12, genres: ['Action'], start: { year: 2026, month: 10 }, entryId: null })
  })

  it('no second call within 12 h; one at 12 h; future fetchedAt refreshes', async () => {
    await refreshed()
    clock = T0 + 12 * H - 1
    svc.list(); await flush()
    expect(anilist.discover).toHaveBeenCalledTimes(1)
    clock = T0 + 12 * H
    svc.list(); await flush()
    expect(anilist.discover).toHaveBeenCalledTimes(2)
    clock = T0 - H
    svc.list(); await flush()
    expect(anilist.discover).toHaveBeenCalledTimes(3)
  })

  it('a new season triggers a call and the response keeps the record season until it lands', async () => {
    await refreshed()
    const old = seasonOf(T0)
    clock = new Date(2027, 0, 5, 12).getTime()
    const r = svc.list()
    expect(anilist.discover).toHaveBeenCalledTimes(2)
    expect(r.season).toEqual(old)
    expect(r.refreshing).toBe(true)
    await flush()
    expect(svc.list().season).toEqual(seasonOf(clock))
  })

  it('concurrent list() calls share one refresh', async () => {
    svc.list(); svc.list(); svc.list()
    expect(anilist.discover).toHaveBeenCalledTimes(1)
    await flush()
  })

  it('failure keeps the record, is stale, pauses for 1 h', async () => {
    await refreshed()
    clock = T0 + 12 * H
    anilist.discover.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    expect(anilist.discover).toHaveBeenCalledTimes(2)
    const r = svc.list()
    expect(r.state).toBe('stale')
    expect(ids(r, 'season')).toEqual([1, 2])
    clock += RETRY_AFTER_FAIL_MS - 1
    svc.list(); await flush()
    expect(anilist.discover).toHaveBeenCalledTimes(2)
    clock += 1
    svc.list(); await flush()
    expect(anilist.discover).toHaveBeenCalledTimes(3)
  })

  it('force skips the pause once, a second force within 60 s waits and reports retryAt', async () => {
    anilist.discover.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    expect(svc.list().state).toBe('error')
    anilist.discover.mockRejectedValueOnce(new Error('down'))
    await refreshed({ force: true })
    expect(anilist.discover).toHaveBeenCalledTimes(2)
    clock += 30_000
    const r = await refreshed({ force: true })
    expect(anilist.discover).toHaveBeenCalledTimes(2)
    expect(r.retryAt).toBe(T0 + FORCE_MIN_MS)
    clock = T0 + FORCE_MIN_MS
    await refreshed({ force: true })
    expect(anilist.discover).toHaveBeenCalledTimes(3)
  })

  it('no record + failure is error', async () => {
    anilist.discover.mockRejectedValueOnce(new Error('down'))
    await refreshed()
    expect(svc.list()).toMatchObject({ state: 'error', fetchedAt: null })
  })
})

describe('createDiscover file', () => {
  it('persists and a fresh instance reloads without a call within the TTL', async () => {
    await refreshed()
    expect(disk()).toMatchObject({ version: 1, rules: RULES_VERSION, fetchedAt: T0, season: seasonOf(T0) })
    expect(disk().raw.season[0].coverUrl).toBe('http://img/1.jpg')
    svc.stop()
    build()
    const r = svc.list(); await flush()
    expect(anilist.discover).toHaveBeenCalledTimes(1)
    expect(r.state).toBe('ok')
    expect(ids(r, 'season')).toEqual([1, 2])
  })

  it('wrong rules drops raw, keeps posters', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ version: 1, rules: 'old', fetchedAt: T0, season: seasonOf(T0), raw: raw(), posters: { 1: { coverUrl: 'http://img/1.jpg', dataUrl: 'data:x' } }, failedAt: null }))
    const r = svc.list()
    expect(r.state).toBe('loading')
    expect(anilist.discover).toHaveBeenCalledTimes(1)
    await flush()
    expect(await svc.posters([1])).toEqual({ 1: 'data:x' })
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('garbage file gives empty state without throwing; malformed items are dropped', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{not json')
    expect(svc.list().state).toBe('loading')
    await flush()
    svc.stop()
    fs.writeFileSync(file, JSON.stringify({ version: 1, rules: RULES_VERSION, fetchedAt: T0, season: seasonOf(T0), raw: { season: [it_(1), { id: 'x' }, null, it_(2, { shown: 'yes' })], upcoming: 'bad' }, posters: {}, failedAt: null }))
    build()
    const r = svc.list()
    expect(ids(r, 'season')).toEqual([1])
    expect(r.rails.upcoming).toEqual([])
  })
})

describe('createDiscover library and settings', () => {
  it('library match by aniListId sets entryId and lets a shown:false item in; dropped ignored', async () => {
    entries = [{ id: 'e6', title: 'Whatever', aniListId: 6, status: 'watching' }, { id: 'e5', title: 'Z', aniListId: 5, status: 'dropped' }]
    await refreshed()
    const r = svc.list()
    expect(ids(r, 'trending')).toEqual([5, 6])
    expect(r.rails.trending.find((i) => i.id === 6).entryId).toBe('e6')
    expect(r.rails.trending.find((i) => i.id === 5).entryId).toBeNull()
  })

  it('exact title-cache id matches, non-exact does not', async () => {
    entries = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }]
    cache = { Alpha: { id: 1, match: 'exact' }, Beta: { id: 2, match: 'fuzzy' } }
    await refreshed()
    const r = svc.list()
    expect(r.rails.season.map((i) => i.entryId)).toEqual(['a', null])
  })

  it('library.list throwing is treated as empty', async () => {
    svc.stop()
    build({ library: { list: () => { throw new Error('x') } } })
    await refreshed()
    expect(ids(svc.list(), 'season')).toEqual([1, 2])
  })

  it('hiddenIds default to []', async () => {
    svc.stop()
    build({ settings: { get: () => ({}) } })
    expect(svc.list().hiddenIds).toEqual([])
    await flush()
  })
})

describe('createDiscover posters', () => {
  beforeEach(async () => { await refreshed() })

  it('ids not in rails give null without download', async () => {
    expect(await svc.posters([999])).toEqual({ 999: null })
    expect(anilist.poster).not.toHaveBeenCalled()
  })

  it('downloads, caches by coverUrl, one persist per call', async () => {
    expect(await svc.posters([1, 2])).toEqual({ 1: 'data:http://img/1.jpg', 2: 'data:http://img/2.jpg' })
    expect(anilist.poster).toHaveBeenCalledTimes(2)
    expect(anilist.poster).toHaveBeenCalledWith('http://img/1.jpg', { timeoutMs: 8000 })
    expect(disk().posters[1]).toEqual({ coverUrl: 'http://img/1.jpg', dataUrl: 'data:http://img/1.jpg' })
    await svc.posters([1, 2])
    expect(anilist.poster).toHaveBeenCalledTimes(2)
  })

  it('answers only the first 40 ids', async () => {
    const many = Array.from({ length: 60 }, (_, i) => i + 1)
    const r = await svc.posters(many)
    expect(Object.keys(r)).toHaveLength(40)
  })

  it('at most 4 downloads in flight across two concurrent calls', async () => {
    fetched = { season: Array.from({ length: 12 }, (_, i) => it_(i + 100)), upcoming: [], movies: [], trending: [] }
    clock += 12 * H
    await refreshed()
    let active = 0
    let peak = 0
    const gates = []
    anilist.poster.mockImplementation((url) => new Promise((resolve) => {
      active++; peak = Math.max(peak, active)
      gates.push(() => { active--; resolve(`data:${url}`) })
    }))
    const a = svc.posters(Array.from({ length: 6 }, (_, i) => i + 100))
    const b = svc.posters(Array.from({ length: 6 }, (_, i) => i + 106))
    for (let n = 0; n < 40; n++) { await flush(); while (gates.length) gates.shift()() }
    await Promise.all([a, b])
    expect(peak).toBe(POSTER_CONCURRENCY)
    expect(anilist.poster).toHaveBeenCalledTimes(12)
  })

  it('a successful refresh drops posters of ids no longer in rails', async () => {
    await svc.posters([1, 2])
    fetched = { season: [it_(2)], upcoming: [], movies: [], trending: [] }
    clock += 12 * H
    await refreshed()
    expect(Object.keys(disk().posters)).toEqual(['2'])
  })
})

describe('createDiscover forget and stop', () => {
  it('forget removes the file, emits, starts from zero, no network', async () => {
    await refreshed()
    const onChange = vi.fn()
    svc.onChange(onChange)
    svc.forget()
    expect(fs.existsSync(file)).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(anilist.discover).toHaveBeenCalledTimes(1)
    expect(svc.list().state).toBe('loading')
    await flush()
  })

  it('results of a refresh started before forget() are discarded', async () => {
    let release
    anilist.discover.mockImplementationOnce(() => new Promise((r) => { release = () => r(raw()) }))
    svc.list()
    svc.forget()
    const onChange = vi.fn()
    svc.onChange(onChange)
    release(); await flush()
    expect(onChange).not.toHaveBeenCalled()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('stop() makes an in-flight result a no-op', async () => {
    let release
    anilist.discover.mockImplementationOnce(() => new Promise((r) => { release = () => r(raw()) }))
    const onChange = vi.fn()
    svc.onChange(onChange)
    svc.list()
    svc.stop()
    release(); await flush()
    expect(onChange).not.toHaveBeenCalled()
    expect(fs.existsSync(file)).toBe(false)
  })
})
