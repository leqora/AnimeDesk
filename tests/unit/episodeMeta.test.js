import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createEpisodeMeta, slimAniZip, AIRING_TTL_MS, TTL_MS, TIMEOUT_MS } from '../../src/main/episodeMeta.js'

const RAW = {
  titles: { en: 'Serija' },
  episodeCount: 2,
  specialCount: 1,
  images: [],
  mappings: { anilist_id: 1 },
  episodes: {
    1: { title: { en: 'Naslov 1', ja: 'J1' }, image: 'https://img.example/1.jpg', overview: 'Opis 1', runtime: 24, airdate: '2030-01-01', rating: '9' },
    2: { title: { en: 'Naslov 2' }, image: 'http://insecure.example/2.jpg', summary: 'Sažetak 2', length: 23 },
    S1: { title: { en: 'Specijal' } },
  },
}
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: new Headers() })

let dir, clock, fetchImpl, meta
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-anizip-'))
  clock = 1_000_000
  fetchImpl = vi.fn(async () => json(RAW))
  meta = createEpisodeMeta({ cacheDir: dir, fetchImpl, now: () => clock })
})

describe('slimAniZip', () => {
  it('keeps only main episodes and the fields the app shows', () => {
    expect(slimAniZip(RAW)).toEqual({
      episodeCount: 2,
      episodes: {
        1: { titles: { en: 'Naslov 1', ja: 'J1' }, image: 'https://img.example/1.jpg', overview: 'Opis 1', runtime: 24 },
        2: { titles: { en: 'Naslov 2' }, image: null, overview: 'Sažetak 2', runtime: 23 },
      },
    })
  })
  it('survives a bad body', () => {
    expect(slimAniZip(null)).toEqual({ episodeCount: 0, episodes: {} })
    expect(slimAniZip({ episodes: 'x' })).toEqual({ episodeCount: 0, episodes: {} })
    expect(slimAniZip({ episodes: { 1: null, 2: 'x' } })).toEqual({ episodeCount: 0, episodes: {} })
  })
})

describe('episodeMeta.get', () => {
  it('fetches by AniList id once and serves the cache afterwards', async () => {
    const a = await meta.get(154587)
    expect(fetchImpl).toHaveBeenCalledWith('https://api.ani.zip/mappings?anilist_id=154587', expect.objectContaining({ signal: expect.anything() }))
    expect(a.episodes['1'].titles.en).toBe('Naslov 1')
    expect(a.fetchedAt).toBe(clock)
    const b = await createEpisodeMeta({ cacheDir: dir, fetchImpl, now: () => clock }).get(154587)
    expect(b).toEqual(a)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('shares one request between parallel calls', async () => {
    await Promise.all([meta.get(5), meta.get(5), meta.get(5)])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('refreshes after 12 h for an airing series and after 7 days otherwise', async () => {
    await meta.get(5, { airing: true })
    clock += AIRING_TTL_MS - 1
    await meta.get(5, { airing: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock += 2
    await meta.get(5, { airing: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    clock += TTL_MS - 1
    await meta.get(5)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    clock += 2
    await meta.get(5)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
  it('remembers a 404 for 7 days', async () => {
    fetchImpl.mockResolvedValue(json({}, 404))
    expect(await meta.get(9)).toBeNull()
    expect(await meta.get(9)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock += TTL_MS + 1
    await meta.get(9)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('falls back to the stale cache when the network fails, and to null without one', async () => {
    await meta.get(5)
    clock += TTL_MS + 1
    fetchImpl.mockRejectedValue(new Error('offline'))
    expect((await meta.get(5)).episodes['2'].titles.en).toBe('Naslov 2')
    expect(await meta.get(6)).toBeNull()
    fetchImpl.mockResolvedValue(json({}, 500))
    expect(await meta.get(7)).toBeNull()
  })
  it('a bad body does not break the existing cache', async () => {
    await meta.get(5)
    clock += TTL_MS + 1
    fetchImpl.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('html') }, headers: new Headers() })
    expect((await meta.get(5)).episodes['1'].titles.en).toBe('Naslov 1')
  })
  it('an empty but parseable body does not overwrite a good cache', async () => {
    await meta.get(5)
    for (const body of [{}, { episodes: null }]) {
      clock += TTL_MS + 1
      fetchImpl.mockResolvedValue(json(body))
      expect((await meta.get(5)).episodes['1'].titles.en).toBe('Naslov 1')
      expect(meta.readCache(5).episodes['1'].titles.en).toBe('Naslov 1')
    }
  })
  it('times out a stalled body and falls back to the stale cache or null', async () => {
    await meta.get(5)
    clock += TTL_MS + 1
    const stalled = () => ({
      ok: true,
      status: 200,
      json: () => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    })
    let opts
    fetchImpl.mockImplementation(async (_url, o) => { opts = o; return stalled() })
    vi.useFakeTimers()
    try {
      const p1 = meta.get(5)
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      expect((await p1).episodes['1'].titles.en).toBe('Naslov 1')
      const p2 = meta.get(6)
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
      expect(await p2).toBeNull()
    } finally { vi.useRealTimers() }
  })
  it('rejects ids that are not positive integers without a request', async () => {
    for (const id of [null, 0, -1, 1.5, '12', '../x']) expect(await meta.get(id)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
