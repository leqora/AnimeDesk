import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createFillerInfo, slimJikanPage, mergeSources, SOURCES, TTL_MS, AIRING_TTL_MS, MISSING_TTL_MS, PARTIAL_TTL_MS, RETRY_AFTER_MS,
  GAP_MS, RATE_PAUSE_MS, MAX_PAGES, TIMEOUT_MS, SOURCE_PAUSE_MS,
} from '../../src/main/fillerInfo.js'
import cases from '../fixtures/fillerSources.cases.json'

const res = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
  headers: { get: (k) => new Headers(headers).get(k) },
})
// jikan-edge shape
const edgePage = (items, next = false) => ({
  data: items.map(([n, kind]) => ({
    number: n, title: 'Secret', titleJapanese: 'Himitsu', url: 'https://example.invalid/x', filler: kind === 'filler', recap: kind === 'recap', aired: '2000-01-01', score: 4, forumReplies: 1,
  })),
  meta: { cached: true, pagination: { page: 1, limit: 100, count: items.length, total: 0, hasNextPage: next } },
})
// Tenrai shape (old Jikan shape)
const tenraiPage = (items, next = false) => ({
  data: items.map(([n, kind]) => ({ mal_id: n, title: 'Secret', filler: kind === 'filler', recap: kind === 'recap', aired: '2000-01-01' })),
  pagination: { has_next_page: next },
})
const P1 = [[1], [2], [3, 'filler']]
const P2 = [[4, 'filler'], [50, 'recap'], [101, 'filler']]
// Two-page series served in the given shape.
const twoPages = (mk) => (url) => (url.endsWith('page=2') ? res(mk(P2)) : res(mk(P1, true)))
const onePage = (mk, items) => () => res(mk(items))
const syntaxBody = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token') }, headers: { get: () => null } })

let dir, clock, sleeps, sleep, fetchImpl, info, tenrai, edge
const make = () => createFillerInfo({ cacheDir: dir, fetchImpl, now: () => clock, sleep })
const file = (id) => path.join(dir, `${id}.json`)
const readRec = (id) => JSON.parse(fs.readFileSync(file(id), 'utf8'))
const callsTo = (src) => fetchImpl.mock.calls.map((c) => c[0]).filter((u) => u.startsWith(SOURCES.find((s) => s.id === src).url))
const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve() }
const down = (host) => { host.fn = async () => { throw new Error('offline') } }

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-filler-'))
  clock = 1_000_000
  sleeps = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sleep = vi.fn(async (ms) => { sleeps.push(ms); clock += ms })
  tenrai = { fn: twoPages(tenraiPage) }
  edge = { fn: twoPages(edgePage) }
  fetchImpl = vi.fn(async (url, o) => (url.startsWith(SOURCES[0].url) ? tenrai.fn(url, o) : edge.fn(url, o)))
  info = make()
})

describe('slimJikanPage', () => {
  it('keeps only numbers and kinds', () => {
    const raw = {
      pagination: { has_next_page: true },
      data: [
        { mal_id: 3, title: 'Secret', filler: true, recap: false, aired: 'x', score: 4 },
        { mal_id: 0, filler: true }, { mal_id: '4', filler: true }, { mal_id: 2.5, filler: true },
        { mal_id: 5, filler: true, recap: true },
        { mal_id: 6, filler: false, recap: false },
        null,
      ],
    }
    expect(slimJikanPage(raw)).toEqual({
      episodes: [{ n: 3, kind: 'filler' }, { n: 5, kind: 'recap' }, { n: 6, kind: null }],
      hasNext: true,
    })
  })
  it('still parses the old Jikan shape and prefers number over mal_id', () => {
    expect(slimJikanPage({ pagination: { has_next_page: true }, data: [{ mal_id: 7, filler: true }, { number: 8, mal_id: 2, recap: true }] })).toEqual({
      episodes: [{ n: 7, kind: 'filler' }, { n: 8, kind: 'recap' }],
      hasNext: true,
    })
    expect(slimJikanPage({ data: [{ number: 0 }, { number: '3' }], meta: { pagination: { hasNextPage: false } } })).toEqual({ episodes: [], hasNext: false })
  })
  it('drops absurd episode numbers and keeps at most 200 items', () => {
    expect(slimJikanPage({ data: [{ number: 1e9, filler: true }, { number: 5001 }, { number: 5000, filler: true }] }).episodes).toEqual([{ n: 5000, kind: 'filler' }])
    const many = { data: Array.from({ length: 250 }, (_, i) => ({ number: i + 1 })) }
    const out = slimJikanPage(many).episodes
    expect(out).toHaveLength(200)
    expect(out[199].n).toBe(200)
  })
  it('survives a bad body', () => {
    expect(slimJikanPage(null)).toEqual({ episodes: [], hasNext: false })
    expect(slimJikanPage({ data: 'x', pagination: { has_next_page: 'yes' } })).toEqual({ episodes: [], hasNext: false })
  })
  it('jikan-edge and Tenrai pages of the same series slim to the same thing', () => {
    expect(cases.cases.length).toBeGreaterThan(0)
    for (const c of cases.cases) expect(slimJikanPage(c.edge)).toEqual(slimJikanPage(c.tenrai))
  })
})

describe('SOURCES', () => {
  it('lists Tenrai then jikan-edge', () => {
    expect(SOURCES).toEqual([
      { id: 'tenrai', url: 'https://api.tenrai.org/v1/anime' },
      { id: 'edge', url: 'https://jikan.lucashdo.com/v1/anime' },
    ])
    expect(SOURCE_PAUSE_MS).toBe(10 * 60 * 1000)
    expect(PARTIAL_TTL_MS).toBe(24 * 3600 * 1000)
  })
})

describe('mergeSources', () => {
  const data = (id, filler, recap, count) => ({ id, outcome: 'data', filler, recap, count })
  const out = (id, outcome) => ({ id, outcome })

  it('unions both sources; an episode that is recap in one and filler in the other is recap only', () => {
    expect(mergeSources([data('tenrai', [50, 7], [], 60), data('edge', [9], [50], 80)])).toEqual({
      kind: 'data', filler: [7, 9], recap: [50], count: 80, sources: ['tenrai', 'edge'], partial: false,
    })
  })
  it('Pokemon shape: the fresher source adds the missing filler episodes', () => {
    expect(mergeSources([data('tenrai', [201, 202], [], 250), data('edge', [201, 202, 203, 206], [], 250)])).toMatchObject({
      filler: [201, 202, 203, 206], partial: false,
    })
  })
  it('data + missing is whole; data + failed or skipped is partial', () => {
    expect(mergeSources([data('tenrai', [1], [], 5), out('edge', 'missing')])).toMatchObject({ kind: 'data', sources: ['tenrai'], partial: false })
    expect(mergeSources([out('tenrai', 'failed'), data('edge', [1], [], 5)])).toMatchObject({ sources: ['edge'], partial: true })
    expect(mergeSources([out('tenrai', 'skipped'), data('edge', [1], [], 5)])).toMatchObject({ sources: ['edge'], partial: true })
  })
  it('without data: all missing is missing; failures mark the series failed unless a source was skipped', () => {
    expect(mergeSources([out('tenrai', 'missing'), out('edge', 'missing')])).toEqual({ kind: 'missing' })
    expect(mergeSources([out('tenrai', 'missing'), out('edge', 'failed')])).toEqual({ kind: 'none', markFailed: true })
    expect(mergeSources([out('tenrai', 'failed'), out('edge', 'failed')])).toEqual({ kind: 'none', markFailed: true })
    expect(mergeSources([out('tenrai', 'skipped'), out('edge', 'failed')])).toEqual({ kind: 'none', markFailed: false })
    expect(mergeSources([out('tenrai', 'skipped'), out('edge', 'missing')])).toEqual({ kind: 'none', markFailed: false })
    expect(mergeSources([out('tenrai', 'skipped'), out('edge', 'skipped')])).toEqual({ kind: 'none', markFailed: false })
  })
  it('a partial result takes the existing record in; recap still wins', () => {
    const existing = { filler: [50], recap: [], count: 60, sources: ['edge'] }
    expect(mergeSources([data('tenrai', [], [50], 10), out('edge', 'failed')], existing)).toEqual({
      kind: 'data', filler: [], recap: [50], count: 60, sources: ['tenrai', 'edge'], partial: true,
    })
  })
  it('a whole result replaces the existing record', () => {
    const existing = { filler: [50, 51], recap: [], count: 60, sources: ['edge'] }
    expect(mergeSources([data('tenrai', [7], [], 10), data('edge', [8], [], 10)], existing)).toMatchObject({ filler: [7, 8], count: 10, partial: false })
  })
  it('with an existing record a missing source counts as failed', () => {
    const existing = { filler: [50], recap: [], count: 60, sources: ['tenrai', 'edge'] }
    expect(mergeSources([data('tenrai', [7], [], 10), out('edge', 'missing')], existing)).toEqual({
      kind: 'data', filler: [7, 50], recap: [], count: 60, sources: ['tenrai', 'edge'], partial: true,
    })
    expect(mergeSources([out('tenrai', 'missing'), out('edge', 'missing')], existing)).toEqual({ kind: 'none', markFailed: true })
  })
  it('keeps extra source ids of the existing record after the known ones', () => {
    const existing = { filler: [], recap: [], count: 1, sources: ['other', 'edge'] }
    expect(mergeSources([data('tenrai', [1], [], 1), out('edge', 'failed')], existing).sources).toEqual(['tenrai', 'edge', 'other'])
  })
})

describe('fillerInfo.ensure', () => {
  it('asks both sources for every page and writes one merged record of numbers', async () => {
    expect(await info.ensure(21)).toBe(true)
    for (const src of SOURCES) expect(callsTo(src.id)).toEqual([`${src.url}/21/episodes?page=1`, `${src.url}/21/episodes?page=2`])
    expect(readRec(21)).toEqual({ filler: [3, 4, 101], recap: [50], count: 101, fetchedAt: clock, sources: ['tenrai', 'edge'] })
    for (const w of ['Secret', 'Himitsu', 'example.invalid', 'title']) expect(fs.readFileSync(file(21), 'utf8')).not.toContain(w)
    expect(info.cached(21)).toEqual({ filler: [3, 4, 101], recap: [50], count: 101, fetchedAt: clock, expired: false })
  })

  it('merges what only one source knows (the fresher mirror adds episodes)', async () => {
    tenrai.fn = onePage(tenraiPage, [[201, 'filler'], [202, 'filler']])
    edge.fn = onePage(edgePage, [[201, 'filler'], [202, 'filler'], [203, 'filler'], [206, 'filler']])
    await info.ensure(527)
    expect(info.cached(527).filler).toEqual([201, 202, 203, 206])
  })

  it('fresh cache makes no request', async () => {
    await info.ensure(21)
    expect(await info.ensure(21)).toBe(false)
    clock += TTL_MS - 1
    expect(await info.ensure(21)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    clock += 2
    expect(info.cached(21).expired).toBe(true)
    expect(await info.ensure(21)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(8)
  })

  it('refreshes an airing series after 7 days', async () => {
    await info.ensure(21, { airing: true })
    clock += AIRING_TTL_MS - 1
    expect(await info.ensure(21, { airing: true })).toBe(false)
    expect(info.cached(21, { airing: true }).expired).toBe(false)
    clock += 2
    expect(info.cached(21, { airing: true }).expired).toBe(true)
    expect(info.cached(21).expired).toBe(false)
    expect(await info.ensure(21, { airing: true })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(8)
  })

  it('404 from both writes missing for 7 days', async () => {
    tenrai.fn = () => res({}, 404)
    edge.fn = () => res({}, 404)
    expect(await info.ensure(9)).toBe(false)
    expect(info.cached(9)).toMatchObject({ missing: true, expired: false, filler: [], recap: [], count: 0 })
    expect(await info.ensure(9)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    clock += MISSING_TTL_MS + 1
    expect(info.cached(9).expired).toBe(true)
    await info.ensure(9)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('404 from one source and data from the other is a whole record', async () => {
    tenrai.fn = () => res({}, 404)
    edge.fn = onePage(edgePage, [[1, 'filler']])
    expect(await info.ensure(9)).toBe(true)
    expect(readRec(9)).toMatchObject({ filler: [1], sources: ['edge'] })
    expect(readRec(9).partial).toBeUndefined()
  })

  it('empty data from both writes missing when there is no cache', async () => {
    tenrai.fn = onePage(tenraiPage, [])
    edge.fn = onePage(edgePage, [])
    expect(await info.ensure(9)).toBe(false)
    expect(info.cached(9).missing).toBe(true)
  })

  it('missing never replaces a record that holds data', async () => {
    await info.ensure(21)
    const before = fs.readFileSync(file(21), 'utf8')
    clock += TTL_MS + 1
    tenrai.fn = onePage(tenraiPage, [])
    edge.fn = () => res({}, 404)
    expect(await info.ensure(21)).toBe(false)
    expect(fs.readFileSync(file(21), 'utf8')).toBe(before)
    clock += RETRY_AFTER_MS + 1
    expect(await info.ensure(21)).toBe(false)
    expect(fs.readFileSync(file(21), 'utf8')).toBe(before)
  })

  describe('one source failing', () => {
    const failures = {
      'network error': () => { throw new Error('offline') },
      'HTTP 403': () => res({}, 403),
      'HTTP 503': () => res({}, 503),
      'HTTP 429 three times': () => res({}, 429),
    }
    for (const [name, fail] of Object.entries(failures)) {
      it(`${name}: record from the other source, partial, and the source rests 10 minutes`, async () => {
        tenrai.fn = fail
        expect(await info.ensure(21)).toBe(true)
        expect(readRec(21)).toMatchObject({ filler: [3, 4, 101], recap: [50], sources: ['edge'], partial: true })
        const asked = callsTo('tenrai').length
        clock += SOURCE_PAUSE_MS / 2
        tenrai.fn = twoPages(tenraiPage)
        await info.ensure(22)
        expect(callsTo('tenrai')).toHaveLength(asked)
        expect(readRec(22)).toMatchObject({ sources: ['edge'], partial: true })
        clock += SOURCE_PAUSE_MS
        await info.ensure(23)
        expect(callsTo('tenrai').length).toBeGreaterThan(asked)
        expect(readRec(23).sources).toEqual(['tenrai', 'edge'])
      })
    }
  })

  it('a source failing on page 2 gives none of its page-1 marks', async () => {
    tenrai.fn = (url) => (url.endsWith('page=2') ? res({}, 503) : res(tenraiPage([[1], [9, 'filler']], true)))
    await info.ensure(21)
    expect(readRec(21)).toMatchObject({ filler: [3, 4, 101], sources: ['edge'], partial: true })
  })

  describe('failure of this series only', () => {
    const failures = {
      '404 on page 2': (url) => (url.endsWith('page=2') ? res({}, 404) : res(tenraiPage(P1, true))),
      'invalid JSON': (url) => (url.endsWith('page=2') ? syntaxBody() : res(tenraiPage(P1, true))),
      'status 204': (url) => (url.endsWith('page=2') ? res(null, 204) : res(tenraiPage(P1, true))),
      'invalid JSON on page 1': () => syntaxBody(),
      'status 400': () => res({}, 400),
    }
    for (const [name, fail] of Object.entries(failures)) {
      it(`${name}: partial record from the other source, source not paused`, async () => {
        tenrai.fn = fail
        await info.ensure(21)
        expect(readRec(21)).toMatchObject({ sources: ['edge'], partial: true })
        const asked = callsTo('tenrai').length
        tenrai.fn = twoPages(tenraiPage)
        await info.ensure(22)
        expect(callsTo('tenrai').length).toBeGreaterThan(asked)
        expect(readRec(22).sources).toEqual(['tenrai', 'edge'])
      })
    }
  })

  it('a body that never arrives is aborted after TIMEOUT_MS and the source rests', async () => {
    tenrai.fn = async (_url, o) => ({
      ok: true, status: 200, headers: { get: () => null },
      json: () => new Promise((_, reject) => o.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    })
    vi.useFakeTimers()
    try {
      const p = info.ensure(5)
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      await p
    } finally { vi.useRealTimers() }
    expect(readRec(5)).toMatchObject({ sources: ['edge'], partial: true })
    const asked = callsTo('tenrai').length
    tenrai.fn = twoPages(tenraiPage)
    await info.ensure(6)
    expect(callsTo('tenrai')).toHaveLength(asked)
  })

  it('request timeout on the headers aborts after TIMEOUT_MS', async () => {
    tenrai.fn = (_url, o) => new Promise((_, reject) => o.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    edge.fn = tenrai.fn
    vi.useFakeTimers()
    try {
      const p = info.ensure(5)
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      expect(await p).toBe(false)
      expect(fs.existsSync(file(5))).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('a pause set while series A loads stops series B at that source', async () => {
    let n = 0
    tenrai.fn = (url) => {
      n++
      if (n === 3) throw new Error('offline') // A's page 2
      return res(tenraiPage(P1, true))
    }
    const [a, b] = await Promise.all([info.ensure(21), info.ensure(22)])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(callsTo('tenrai')).toHaveLength(3) // A p1, B p1, A p2 (fails); B p2 is never sent
    expect(readRec(21)).toMatchObject({ sources: ['edge'], partial: true })
    expect(readRec(22)).toMatchObject({ sources: ['edge'], partial: true })
  })

  it('a source paused before the series starts is not asked at all', async () => {
    down(tenrai)
    await info.ensure(21)
    const asked = callsTo('tenrai').length
    tenrai.fn = twoPages(tenraiPage)
    await info.ensure(22)
    expect(callsTo('tenrai')).toHaveLength(asked)
    expect(readRec(22).partial).toBe(true)
  })

  it('all sources paused: false, no request, no failedAt', async () => {
    down(tenrai)
    down(edge)
    expect(await info.ensure(21)).toBe(false)
    const asked = fetchImpl.mock.calls.length
    tenrai.fn = twoPages(tenraiPage)
    edge.fn = twoPages(edgePage)
    expect(await info.ensure(22)).toBe(false)
    expect(await info.ensure(21)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(asked)
    clock += SOURCE_PAUSE_MS
    expect(await info.ensure(22)).toBe(true)
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(asked)
    // series 21 failed with real requests (a 1 h block) - but series 22 never got one
    expect(readRec(22).sources).toEqual(['tenrai', 'edge'])
  })

  it('a source paused before its first page is skipped: no failedAt for the series', async () => {
    down(tenrai)
    await info.ensure(30) // pauses tenrai, record from edge
    down(edge)
    clock += 1
    await info.ensure(31) // edge fails, tenrai skipped: pause only, no failedAt
    tenrai.fn = twoPages(tenraiPage)
    edge.fn = twoPages(edgePage)
    clock += SOURCE_PAUSE_MS
    expect(await info.ensure(31)).toBe(true)
  })

  it('both sources failing for the series: false, nothing written, retry only after RETRY_AFTER_MS', async () => {
    tenrai.fn = () => res({}, 400)
    edge.fn = () => res({}, 400)
    expect(await info.ensure(7)).toBe(false)
    expect(fs.existsSync(file(7))).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    clock += RETRY_AFTER_MS - 1
    expect(await info.ensure(7)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    tenrai.fn = twoPages(tenraiPage)
    edge.fn = twoPages(edgePage)
    clock += 2
    expect(await info.ensure(7)).toBe(true)
  })

  it('failure in the middle of pages keeps the existing record', async () => {
    await info.ensure(21)
    const before = fs.readFileSync(file(21), 'utf8')
    clock += TTL_MS + 1
    fetchImpl.mockClear()
    tenrai.fn = (url) => (url.endsWith('page=2') ? res({}, 400) : res(tenraiPage(P1, true)))
    edge.fn = tenrai.fn
    expect(await info.ensure(21)).toBe(false)
    expect(fs.readFileSync(file(21), 'utf8')).toBe(before)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('a partial record expires after PARTIAL_TTL_MS; a whole one keeps its own rule', async () => {
    tenrai.fn = () => res({}, 403)
    await info.ensure(21)
    clock += PARTIAL_TTL_MS - 1
    expect(info.cached(21).expired).toBe(false)
    clock += 1
    expect(info.cached(21).expired).toBe(true)
    await info.ensure(22, { airing: true })
    tenrai.fn = twoPages(tenraiPage)
    clock += SOURCE_PAUSE_MS
    await info.ensure(23)
    clock += PARTIAL_TTL_MS + 1
    expect(info.cached(23).expired).toBe(false)
  })

  it('an expired partial record refreshes into a whole one when both sources answer', async () => {
    tenrai.fn = () => res({}, 403)
    await info.ensure(21)
    tenrai.fn = twoPages(tenraiPage)
    clock += PARTIAL_TTL_MS + SOURCE_PAUSE_MS
    expect(await info.ensure(21)).toBe(true)
    expect(readRec(21).partial).toBeUndefined()
    expect(readRec(21).sources).toEqual(['tenrai', 'edge'])
  })

  it('existing good record + edge missing: marks kept, record partial', async () => {
    await info.ensure(21)
    clock += TTL_MS + 1
    tenrai.fn = onePage(tenraiPage, [[3, 'filler']])
    edge.fn = () => res({}, 404)
    await info.ensure(21)
    expect(readRec(21)).toMatchObject({ filler: [3, 4, 101], recap: [50], count: 101, partial: true })
    expect(readRec(21).sources).toEqual(['tenrai', 'edge'])
  })

  it('existing filler 50 + a source saying recap 50 gives recap only', async () => {
    tenrai.fn = onePage(tenraiPage, [[50, 'filler'], [60]])
    edge.fn = onePage(edgePage, [[50, 'filler'], [60]])
    await info.ensure(21)
    clock += TTL_MS + 1
    tenrai.fn = onePage(tenraiPage, [[50, 'recap']])
    edge.fn = () => res({}, 503)
    await info.ensure(21)
    expect(readRec(21)).toMatchObject({ filler: [], recap: [50], count: 60, partial: true })
  })

  describe('fast first write', () => {
    // Tenrai is done after one request, jikan-edge needs the same - tenrai is first in line.
    const setup = (edgeExtra) => {
      tenrai.fn = onePage(tenraiPage, [[1], [3, 'filler']])
      edge.fn = onePage(edgePage, [[1], [3, 'filler'], ...edgeExtra])
    }
    it('no cache: onPartial after the faster source, then the merged write; true when the merge adds something', async () => {
      setup([[203, 'filler']])
      const seen = []
      const onPartial = vi.fn(() => seen.push(readRec(21)))
      expect(await info.ensure(21, { onPartial })).toBe(true)
      expect(onPartial).toHaveBeenCalledTimes(1)
      expect(seen[0]).toMatchObject({ filler: [3], sources: ['tenrai'], partial: true })
      expect(readRec(21)).toMatchObject({ filler: [3, 203], sources: ['tenrai', 'edge'] })
      expect(readRec(21).partial).toBeUndefined()
    })
    it('false when the merge changes nothing the user already saw', async () => {
      setup([])
      const onPartial = vi.fn()
      expect(await info.ensure(21, { onPartial })).toBe(false)
      expect(onPartial).toHaveBeenCalledTimes(1)
      expect(readRec(21).sources).toEqual(['tenrai', 'edge'])
    })
    it('with an existing expired record: no onPartial, one write, true', async () => {
      setup([])
      await info.ensure(21)
      clock += TTL_MS + 1
      const onPartial = vi.fn()
      expect(await info.ensure(21, { onPartial })).toBe(true)
      expect(onPartial).not.toHaveBeenCalled()
    })
    it('a missing record counts as no cache', async () => {
      tenrai.fn = () => res({}, 404)
      edge.fn = () => res({}, 404)
      await info.ensure(21)
      clock += MISSING_TTL_MS + 1
      setup([])
      const onPartial = vi.fn()
      await info.ensure(21, { onPartial })
      expect(onPartial).toHaveBeenCalledTimes(1)
    })
    it('a throwing onPartial does not break the load', async () => {
      setup([[203, 'filler']])
      expect(await info.ensure(21, { onPartial: () => { throw new Error('boom') } })).toBe(true)
      expect(readRec(21).filler).toEqual([3, 203])
    })
  })

  it('concurrent ensure for the same malId shares one load; the first caller options win', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const r = await Promise.all([info.ensure(21, { onPartial: first }), info.ensure(21, { onPartial: second }), info.ensure(21)])
    expect(r).toEqual([false, false, false]) // same marks from both sources: the fast write already showed everything
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('each source has its own queue: one in flight per host, starts GAP_MS apart, two hosts may overlap', async () => {
    const starts = { tenrai: [], edge: [] }
    const inFlight = { tenrai: 0, edge: 0 }
    let maxPerHost = 0
    let maxTotal = 0
    const slow = (host, mk) => async (url) => {
      starts[host].push(clock)
      inFlight[host]++
      maxPerHost = Math.max(maxPerHost, inFlight[host])
      maxTotal = Math.max(maxTotal, inFlight.tenrai + inFlight.edge)
      await Promise.resolve()
      await Promise.resolve()
      clock += 50
      inFlight[host]--
      return twoPages(mk)(url)
    }
    tenrai.fn = slow('tenrai', tenraiPage)
    edge.fn = slow('edge', edgePage)
    const r = await Promise.all([info.ensure(1), info.ensure(2)])
    expect(r).toEqual([true, true])
    for (const host of ['tenrai', 'edge']) {
      expect(starts[host]).toHaveLength(4)
      for (let i = 1; i < 4; i++) expect(starts[host][i] - starts[host][i - 1]).toBeGreaterThanOrEqual(GAP_MS)
    }
    expect(maxPerHost).toBe(1)
    expect(maxTotal).toBeLessThanOrEqual(2)
  })

  it('a 429 pause of one source does not delay the other', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    sleep.mockImplementation(async (ms) => { sleeps.push(ms); if (ms >= RATE_PAUSE_MS) await gate; else clock += ms })
    let limited = true
    tenrai.fn = (url) => { if (limited) { limited = false; return res({}, 429) } return twoPages(tenraiPage)(url) }
    const onPartial = vi.fn()
    const p = info.ensure(21, { onPartial })
    await flush()
    expect(onPartial).toHaveBeenCalledTimes(1) // jikan-edge finished while Tenrai still waits
    expect(readRec(21)).toMatchObject({ sources: ['edge'], partial: true })
    expect(callsTo('edge')).toHaveLength(2)
    release()
    await p
    expect(sleeps.filter((ms) => ms === RATE_PAUSE_MS)).toHaveLength(1)
    expect(readRec(21).sources).toEqual(['tenrai', 'edge'])
  })

  it('429 retries at most twice, then the source rests', async () => {
    tenrai.fn = () => res({}, 429)
    await info.ensure(4)
    expect(callsTo('tenrai')).toHaveLength(3)
    expect(sleeps.filter((ms) => ms === RATE_PAUSE_MS)).toHaveLength(2)
    expect(readRec(4)).toMatchObject({ sources: ['edge'], partial: true })
  })

  it('429 honours a numeric Retry-After, capped at 5 minutes', async () => {
    const seq = [res({}, 429, { 'Retry-After': '120' }), res({}, 429, { 'Retry-After': '10' })]
    tenrai.fn = (url) => seq.shift() ?? twoPages(tenraiPage)(url)
    await info.ensure(3)
    expect(sleeps.filter((ms) => ms >= RATE_PAUSE_MS)).toEqual([120000, RATE_PAUSE_MS])
    sleeps.length = 0
    const huge = [res({}, 429, { 'Retry-After': '99999' })]
    tenrai.fn = (url) => huge.shift() ?? twoPages(tenraiPage)(url)
    clock += SOURCE_PAUSE_MS
    await info.ensure(4)
    expect(sleeps.filter((ms) => ms >= RATE_PAUSE_MS)).toEqual([300000])
  })

  it('cancels the body of a non-ok response', async () => {
    const cancel = vi.fn()
    tenrai.fn = async () => ({ ok: false, status: 500, body: { cancel }, headers: { get: () => null } })
    await info.ensure(6)
    expect(cancel).toHaveBeenCalled()
  })

  it('cached() sees a same-size rewrite made right after our own write', async () => {
    await info.ensure(21)
    expect(info.cached(21).filler).toEqual([3, 4, 101])
    clock += TTL_MS + 1
    const changed = (mk) => (url) => (url.endsWith('page=2') ? res(mk([[4, 'filler'], [50, 'recap'], [102, 'filler']])) : res(mk(P1, true)))
    tenrai.fn = changed(tenraiPage)
    edge.fn = changed(edgePage)
    await info.ensure(21)
    expect(info.cached(21).filler).toEqual([3, 4, 102])
  })

  it('stops after MAX_PAGES per source and writes what was fetched', async () => {
    const endless = (mk) => (url) => {
      const n = Number(url.split('page=')[1])
      return res(mk([[n, n === 2 ? 'filler' : undefined]], true))
    }
    tenrai.fn = endless(tenraiPage)
    edge.fn = endless(edgePage)
    expect(await info.ensure(5)).toBe(true)
    expect(callsTo('tenrai')).toHaveLength(MAX_PAGES)
    expect(callsTo('edge')).toHaveLength(MAX_PAGES)
    expect(info.cached(5)).toMatchObject({ filler: [2], count: MAX_PAGES })
  })

  it('rejects invalid malId without a request', async () => {
    for (const id of [null, 0, '21', -1, 1.5, undefined]) expect(await info.ensure(id)).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(info.cached('21')).toBeNull()
  })

  it('forget clears the failure pause and the source pauses', async () => {
    tenrai.fn = () => res({}, 400)
    edge.fn = () => res({}, 400)
    expect(await info.ensure(5)).toBe(false)
    expect(await info.ensure(5)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    info.forget()
    tenrai.fn = twoPages(tenraiPage)
    edge.fn = twoPages(edgePage)
    expect(await info.ensure(5)).toBe(true)

    down(tenrai)
    await info.ensure(6)
    info.forget()
    tenrai.fn = twoPages(tenraiPage)
    await info.ensure(7)
    expect(readRec(7).sources).toEqual(['tenrai', 'edge'])
  })

  it('forget drops the parsed-file memo after the folder was deleted', async () => {
    await info.ensure(21)
    expect(info.cached(21)).not.toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
    info.forget()
    expect(info.cached(21)).toBeNull()
  })

  it('cached returns null without a file or with a corrupt record', () => {
    expect(info.cached(77)).toBeNull()
    fs.writeFileSync(file(78), JSON.stringify({ filler: [1] }))
    expect(info.cached(78)).toBeNull()
    fs.writeFileSync(file(79), '{not json')
    expect(info.cached(79)).toBeNull()
  })

  it('old records without sources still count as whole', async () => {
    fs.writeFileSync(file(80), JSON.stringify({ filler: [1], recap: [], count: 5, fetchedAt: clock }))
    expect(info.cached(80).expired).toBe(false)
    expect(await info.ensure(80)).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
