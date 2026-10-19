import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createFillerInfo, slimJikanPage, JIKAN_URL, TTL_MS, AIRING_TTL_MS, MISSING_TTL_MS, RETRY_AFTER_MS,
  GAP_MS, RATE_PAUSE_MS, MAX_PAGES, TIMEOUT_MS, NETWORK_PAUSE_MS,
} from '../../src/main/fillerInfo.js'

const res = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
  headers: { get: (k) => new Headers(headers).get(k) },
})
// jikan-edge shape
const page = (items, next = false) => ({
  data: items.map(([n, kind]) => ({
    number: n, title: 'Secret', titleJapanese: 'Himitsu', url: 'https://example.invalid/x', filler: kind === 'filler', recap: kind === 'recap', aired: '2000-01-01', score: 4, forumReplies: 1,
  })),
  meta: { cached: true, pagination: { page: 1, limit: 100, count: items.length, total: 0, hasNextPage: next } },
})
const P1 = page([[1], [2], [3, 'filler']], true)
const P2 = page([[4, 'filler'], [50, 'recap'], [101, 'filler']], false)

let dir, clock, sleeps, sleep, fetchImpl, info
const make = () => createFillerInfo({ cacheDir: dir, fetchImpl, now: () => clock, sleep })
const file = (id) => path.join(dir, `${id}.json`)

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-filler-'))
  clock = 1_000_000
  sleeps = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sleep = vi.fn(async (ms) => { sleeps.push(ms); clock += ms })
  fetchImpl = vi.fn(async (url) => (url.endsWith('page=2') ? res(P2) : res(P1)))
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
})

describe('fillerInfo.ensure', () => {
  it('fetches all pages and writes a slim record', async () => {
    expect(await info.ensure(21)).toBe(true)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([`${JIKAN_URL}/21/episodes?page=1`, `${JIKAN_URL}/21/episodes?page=2`])
    expect(JSON.parse(fs.readFileSync(file(21), 'utf8'))).toEqual({ filler: [3, 4, 101], recap: [50], count: 101, fetchedAt: clock })
    for (const w of ['Secret', 'Himitsu', 'example.invalid']) expect(fs.readFileSync(file(21), 'utf8')).not.toContain(w)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://jikan.lucashdo.com/v1/anime/21/episodes?page=1')
    expect(info.cached(21)).toEqual({ filler: [3, 4, 101], recap: [50], count: 101, fetchedAt: clock, expired: false })
  })

  it('fresh cache makes no request', async () => {
    await info.ensure(21)
    expect(await info.ensure(21)).toBe(false)
    clock += TTL_MS - 1
    expect(await info.ensure(21)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    clock += 2
    expect(info.cached(21).expired).toBe(true)
    expect(await info.ensure(21)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
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
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('404 writes missing for 7 days', async () => {
    fetchImpl.mockResolvedValue(res({}, 404))
    expect(await info.ensure(9)).toBe(false)
    expect(info.cached(9)).toMatchObject({ missing: true, expired: false, filler: [], recap: [], count: 0 })
    expect(await info.ensure(9)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock += MISSING_TTL_MS + 1
    expect(info.cached(9).expired).toBe(true)
    await info.ensure(9)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('empty data writes missing when there is no cache', async () => {
    fetchImpl.mockResolvedValue(res({ data: [], pagination: { has_next_page: false } }))
    expect(await info.ensure(9)).toBe(false)
    expect(info.cached(9).missing).toBe(true)
  })

  it('failure in the middle of pages writes nothing and pauses 1 h', async () => {
    await info.ensure(21)
    const before = fs.readFileSync(file(21), 'utf8')
    clock += TTL_MS + 1
    fetchImpl.mockClear()
    fetchImpl.mockImplementation(async (url) => { if (url.endsWith('page=2')) throw new Error('offline'); return res(P1) })
    expect(await info.ensure(21)).toBe(false)
    expect(fs.readFileSync(file(21), 'utf8')).toBe(before)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    clock += RETRY_AFTER_MS - 1
    expect(await info.ensure(21)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    fetchImpl.mockImplementation(async (url) => (url.endsWith('page=2') ? res(P2) : res(P1)))
    clock += 2
    expect(await info.ensure(21)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('a network failure pauses every malId for 10 minutes; a 500 does not', async () => {
    fetchImpl.mockRejectedValue(new Error('offline'))
    expect(await info.ensure(1)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    fetchImpl.mockImplementation(async (url) => (url.endsWith('page=2') ? res(P2) : res(P1)))
    clock += NETWORK_PAUSE_MS - 1
    expect(await info.ensure(2)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock += 2
    expect(await info.ensure(2)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)

    const other = make()
    fetchImpl.mockReset()
    fetchImpl.mockResolvedValue(res({}, 500))
    expect(await other.ensure(3)).toBe(false)
    fetchImpl.mockResolvedValue(res(page([[1, 'filler']], false)))
    expect(await other.ensure(4)).toBe(true)
  })

  it('forget clears the module-wide network pause', async () => {
    fetchImpl.mockRejectedValue(new Error('offline'))
    await info.ensure(1)
    info.forget()
    fetchImpl.mockResolvedValue(res(page([[1, 'filler']], false)))
    expect(await info.ensure(2)).toBe(true)
  })

  it('a non-ok status other than 404 is a failure with a pause', async () => {
    fetchImpl.mockResolvedValue(res({}, 500))
    expect(await info.ensure(7)).toBe(false)
    expect(fs.existsSync(file(7))).toBe(false)
    expect(await info.ensure(7)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('429 pauses the queue 60 s and retries at most twice', async () => {
    fetchImpl
      .mockResolvedValueOnce(res({}, 429))
      .mockResolvedValueOnce(res({}, 429))
      .mockResolvedValueOnce(res(page([[1, 'filler']], false)))
    expect(await info.ensure(3)).toBe(true)
    expect(sleeps.filter((ms) => ms === RATE_PAUSE_MS)).toHaveLength(2)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(Array(3).fill(`${JIKAN_URL}/3/episodes?page=1`))
    expect(info.cached(3).filler).toEqual([1])

    sleeps.length = 0
    fetchImpl.mockReset()
    fetchImpl.mockResolvedValue(res({}, 429))
    expect(await info.ensure(4)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleeps.filter((ms) => ms === RATE_PAUSE_MS)).toHaveLength(2)
    expect(fs.existsSync(file(4))).toBe(false)
    expect(await info.ensure(4)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('429 honours a numeric Retry-After, capped at 5 minutes', async () => {
    fetchImpl
      .mockResolvedValueOnce(res({}, 429, { 'Retry-After': '120' }))
      .mockResolvedValueOnce(res({}, 429, { 'Retry-After': '10' }))
      .mockResolvedValueOnce(res(page([[1, 'filler']], false)))
    expect(await info.ensure(3)).toBe(true)
    expect(sleeps.filter((ms) => ms >= RATE_PAUSE_MS)).toEqual([120000, RATE_PAUSE_MS])
    sleeps.length = 0
    fetchImpl.mockReset()
    fetchImpl.mockResolvedValueOnce(res({}, 429, { 'Retry-After': '99999' })).mockResolvedValueOnce(res(page([[1]], false)))
    await info.ensure(4)
    expect(sleeps.filter((ms) => ms >= RATE_PAUSE_MS)).toEqual([300000])
  })

  it('cancels the body of a non-ok response', async () => {
    const cancel = vi.fn()
    fetchImpl.mockResolvedValue({ ok: false, status: 500, body: { cancel }, headers: { get: () => null } })
    await info.ensure(6)
    expect(cancel).toHaveBeenCalled()
  })

  it('cached() sees a same-size rewrite made right after our own write', async () => {
    await info.ensure(21)
    expect(info.cached(21).filler).toEqual([3, 4, 101])
    clock += TTL_MS + 1
    fetchImpl.mockImplementation(async (url) => (url.endsWith('page=2') ? res(page([[4, 'filler'], [50, 'recap'], [102, 'filler']])) : res(P1)))
    await info.ensure(21)
    expect(info.cached(21).filler).toEqual([3, 4, 102])
  })

  it('empty answer never replaces a good cache', async () => {
    await info.ensure(21)
    const before = fs.readFileSync(file(21), 'utf8')
    clock += TTL_MS + 1
    fetchImpl.mockResolvedValue(res({ data: [], pagination: { has_next_page: false } }))
    expect(await info.ensure(21)).toBe(false)
    expect(fs.readFileSync(file(21), 'utf8')).toBe(before)
    fetchImpl.mockClear()
    fetchImpl.mockResolvedValue(res({}, 404))
    clock += RETRY_AFTER_MS + 1
    expect(await info.ensure(21)).toBe(false)
    expect(fs.readFileSync(file(21), 'utf8')).toBe(before)
  })

  it('concurrent ensure for the same malId shares one fetch', async () => {
    const r = await Promise.all([info.ensure(21), info.ensure(21), info.ensure(21)])
    expect(r).toEqual([true, true, true])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('shared queue: one request at a time, starts at least GAP_MS apart', async () => {
    const starts = []
    let inFlight = 0
    let maxInFlight = 0
    fetchImpl.mockImplementation(async (url) => {
      starts.push(clock)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      await Promise.resolve()
      clock += 50
      inFlight--
      return url.endsWith('page=2') ? res(P2) : res(P1)
    })
    const r = await Promise.all([info.ensure(1), info.ensure(2)])
    expect(r).toEqual([true, true])
    expect(starts).toHaveLength(4)
    expect(maxInFlight).toBe(1)
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(GAP_MS)
  })

  it('stops after MAX_PAGES and writes what was fetched', async () => {
    fetchImpl.mockImplementation(async (url) => {
      const n = Number(url.split('page=')[1])
      return res(page([[n, n === 2 ? 'filler' : undefined]], true))
    })
    expect(await info.ensure(5)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_PAGES)
    expect(info.cached(5)).toMatchObject({ filler: [2], count: MAX_PAGES })
  })

  it('request timeout aborts after TIMEOUT_MS', async () => {
    fetchImpl.mockImplementation((_url, o) => new Promise((_, reject) => o.signal.addEventListener('abort', () => reject(new Error('aborted')))))
    vi.useFakeTimers()
    try {
      const p = info.ensure(5)
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      expect(await p).toBe(false)
      expect(fs.existsSync(file(5))).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('a stalled body read is aborted too', async () => {
    fetchImpl.mockImplementation(async (_url, o) => ({
      ok: true, status: 200,
      json: () => new Promise((_, reject) => o.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    }))
    vi.useFakeTimers()
    try {
      const p = info.ensure(5)
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      expect(await p).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('rejects invalid malId without a request', async () => {
    for (const id of [null, 0, '21', -1, 1.5, undefined]) expect(await info.ensure(id)).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(info.cached('21')).toBeNull()
  })

  it('forget clears the pause', async () => {
    fetchImpl.mockRejectedValue(new Error('offline'))
    expect(await info.ensure(5)).toBe(false)
    expect(await info.ensure(5)).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    info.forget()
    fetchImpl.mockResolvedValue(res(page([[1, 'filler']], false)))
    expect(await info.ensure(5)).toBe(true)
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
  })
})
