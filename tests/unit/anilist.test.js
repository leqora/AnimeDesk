import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniList, bestMatch, cleanDescription } from '../../src/main/anilist.js'

const media = (id, romaji, english, extra = {}) => ({
  id, title: { romaji, english, native: null }, coverImage: { large: `https://img/${id}.jpg` },
  genres: ['Action'], seasonYear: 2020, episodes: 12, description: 'Line one<br><br>Line <i>two</i>', ...extra,
})

let cacheDir, fetchImpl, api
function mkFetch(list) {
  return vi.fn(async (url, init) => {
    if (url.startsWith('https://img/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    const body = JSON.parse(init.body)
    if (body.variables.id) return Response.json({ data: { Media: list.find((m) => m.id === body.variables.id) ?? null } })
    return Response.json({ data: { Page: { media: list } } })
  })
}
beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-al-'))
  fetchImpl = mkFetch([media(1, 'Shingeki no Kyojin', 'Attack on Titan'), media(2, 'Frieren', 'Frieren: Beyond Journey’s End')])
  api = createAniList({ cacheDir, fetchImpl })
})

describe('anilist', () => {
  it('cleans HTML out of descriptions', () => {
    expect(cleanDescription('Line one<br><br>Line <i>two</i>')).toBe('Line one\n\nLine two')
    expect(cleanDescription(null)).toBe('')
  })
  it('prefers an exact title match on any title, else the first result', () => {
    const list = [media(1, 'A', 'B'), media(2, 'Shingeki no Kyojin', 'Attack on Titan')]
    expect(bestMatch('attack on titan', list).id).toBe(2)
    expect(bestMatch('Something else', list).id).toBe(1)
    expect(bestMatch('x', [])).toBeNull()
  })
  it('returns info with an embedded poster and caches it', async () => {
    const info = await api.getForTitle('Attack on Titan')
    expect(info).toMatchObject({ id: 1, title: 'Attack on Titan', romaji: 'Shingeki no Kyojin', genres: ['Action'], year: 2020, episodes: 12, description: 'Line one\n\nLine two' })
    expect(info.poster).toBe('data:image/jpeg;base64,AQID')
    const calls = fetchImpl.mock.calls.length
    const again = createAniList({ cacheDir, fetchImpl })
    expect(await again.getForTitle('attack on titan')).toEqual(info)
    expect(fetchImpl.mock.calls.length).toBe(calls)
  })
  it('fetches by id when the user linked a specific entry', async () => {
    expect((await api.getForTitle('whatever', { aniListId: 2 })).id).toBe(2)
  })
  it('returns null instead of throwing when offline and nothing is cached', async () => {
    const offline = createAniList({ cacheDir, fetchImpl: async () => { throw new Error('offline') } })
    expect(await offline.getForTitle('X')).toBeNull()
  })
  it('search returns info objects without posters', async () => {
    const r = await api.search('fri')
    expect(r.map((i) => i.id)).toEqual([1, 2])
    expect(r[0].poster).toBeNull()
  })
  it('includes the episode duration', async () => {
    const withDuration = createAniList({ cacheDir, fetchImpl: mkFetch([media(7, 'Show', 'Show', { duration: 23 })]) })
    expect((await withDuration.getForTitle('Show')).duration).toBe(23)
    expect((await api.getForTitle('Frieren')).duration).toBeNull()
  })
  it('getCached reads only the cache and never fetches', async () => {
    const calls = fetchImpl.mock.calls.length
    expect(api.getCached('Attack on Titan')).toBeNull()
    expect(fetchImpl.mock.calls.length).toBe(calls)
    const info = await api.getForTitle('Attack on Titan')
    const before = fetchImpl.mock.calls.length
    expect(api.getCached('attack on titan')).toEqual(info)
    expect(api.getCached('whatever', { aniListId: 99 })).toBeNull()
    expect(fetchImpl.mock.calls.length).toBe(before)
  })
  it('getCached returns null when the cache file cannot be read', () => {
    const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }) })
    try {
      expect(api.getCached('Attack on Titan')).toBeNull()
    } finally { spy.mockRestore() }
  })
})
