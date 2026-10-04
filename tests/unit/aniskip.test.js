import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniSkip } from '../../src/main/aniskip.js'
import { createSkipLookup, createTotalEpisodes } from '../../src/main/skipLookup.js'

let cacheDir
beforeEach(() => { cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-skip-')) })
const reply = (results) => vi.fn(async () => Response.json({ found: results.length > 0, results }))
const r = (skipType, start, end) => ({ skipType, interval: { startTime: start, endTime: end }, episodeLength: 1420 })

describe('aniskip', () => {
  it('maps op, ed and recap and calls the documented endpoint', async () => {
    const fetchImpl = reply([r('op', 3.2, 93.1), r('ed', 1417, 1507), r('recap', 0, 20)])
    const s = createAniSkip({ cacheDir, fetchImpl })
    expect(await s.getSkipTimes({ malId: 52991, episode: '1', duration: 1419.6 })).toEqual({ op: { start: 3.2, end: 93.1 }, ed: { start: 1417, end: 1507 }, recap: { start: 0, end: 20 } })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.aniskip.com/v2/skip-times/52991/1?types=op&types=ed&types=recap&episodeLength=1420')
  })
  it('treats mixed-op/mixed-ed as op/ed', async () => {
    const s = createAniSkip({ cacheDir, fetchImpl: reply([r('mixed-op', 0, 90), r('mixed-ed', 1300, 1390)]) })
    expect(await s.getSkipTimes({ malId: 1, episode: 2, duration: 0 })).toEqual({ op: { start: 0, end: 90 }, ed: { start: 1300, end: 1390 }, recap: null })
  })
  it('caches answers (also "not found") for 7 days', async () => {
    let t = 0
    const fetchImpl = reply([])
    const s = createAniSkip({ cacheDir, fetchImpl, now: () => t })
    expect(await s.getSkipTimes({ malId: 5, episode: 1, duration: 1400 })).toEqual({ op: null, ed: null, recap: null })
    await s.getSkipTimes({ malId: 5, episode: 1, duration: 1400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    t = 8 * 86400000
    await s.getSkipTimes({ malId: 5, episode: 1, duration: 1400 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('returns nothing and caches nothing on network errors or bad answers', async () => {
    const fail = vi.fn(async () => { throw new Error('offline') })
    const s = createAniSkip({ cacheDir, fetchImpl: fail })
    expect(await s.getSkipTimes({ malId: 5, episode: 1, duration: 1400 })).toEqual({ op: null, ed: null, recap: null })
    const bad = vi.fn(async () => new Response('nope', { status: 500 }))
    expect(await createAniSkip({ cacheDir, fetchImpl: bad }).getSkipTimes({ malId: 5, episode: 1, duration: 1400 })).toEqual({ op: null, ed: null, recap: null })
    expect(fs.readdirSync(cacheDir)).toEqual([])
    expect(await s.getSkipTimes({ malId: null, episode: 1, duration: 1400 })).toEqual({ op: null, ed: null, recap: null })
    expect(await s.getSkipTimes({ malId: 5, episode: 'abc', duration: 1400 })).toEqual({ op: null, ed: null, recap: null })
    expect(fail).toHaveBeenCalledTimes(1)
  })
})

describe('skipLookup', () => {
  it('resolves the MAL id through AniList', async () => {
    const anilist = { getForTitle: vi.fn(async () => ({ malId: 7 })) }
    const aniskip = { getSkipTimes: vi.fn(async () => ({ op: { start: 0, end: 90 }, ed: null, recap: null })) }
    expect(await createSkipLookup({ anilist, aniskip })('Show', '2', 1400)).toEqual({ op: { start: 0, end: 90 }, ed: null, recap: null })
    expect(aniskip.getSkipTimes).toHaveBeenCalledWith({ malId: 7, episode: '2', duration: 1400 })
    anilist.getForTitle.mockResolvedValueOnce(null)
    expect(await createSkipLookup({ anilist, aniskip })('X', '1', 1)).toEqual({ op: null, ed: null, recap: null })
  })
  it("uses the watchlist's AniList id when the series is on the watchlist", async () => {
    const anilist = { getForTitle: vi.fn(async () => ({ malId: 7 })) }
    const aniskip = { getSkipTimes: vi.fn(async () => ({ op: null, ed: null, recap: null })) }
    const findAniListId = vi.fn((t) => (t === 'Show' ? 42 : null))
    await createSkipLookup({ anilist, aniskip, findAniListId })('Show', '2', 1400)
    expect(anilist.getForTitle).toHaveBeenLastCalledWith('Show', { aniListId: 42 })
    await createSkipLookup({ anilist, aniskip, findAniListId })('Other', '2', 1400)
    expect(anilist.getForTitle).toHaveBeenLastCalledWith('Other', { aniListId: null })
  })
  it('looks up the total episode count with the watchlist entry and its AniList id', () => {
    const library = { findByAniCliTitle: vi.fn((t) => (t === 'Show' ? { aniListId: 42, totalEpisodes: null } : t === 'Done' ? { totalEpisodes: 12 } : null)) }
    const anilist = { getCached: vi.fn((t, { aniListId }) => (aniListId === 42 ? { episodes: 24 } : null)) }
    const total = createTotalEpisodes({ library, anilist })
    expect(total('Show')).toBe(24)
    expect(anilist.getCached).toHaveBeenLastCalledWith('Show', { aniListId: 42 })
    expect(total('Done')).toBe(12)
    expect(total('Nope')).toBeNull()
  })
})
