import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniList, bestMatch, cleanDescription, SEARCH_VERSION } from '../../src/main/anilist.js'

const media = (id, romaji, english, extra = {}) => ({
  id, idMal: 900 + id, title: { romaji, english, native: null }, coverImage: { large: `https://img/${id}.jpg` },
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

// AniList answers only the queries in `hits`; everything else returns no results.
function mkSearchFetch(hits, { failOn = [] } = {}) {
  return vi.fn(async (url, init) => {
    if (url.startsWith('https://img/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    const { search } = JSON.parse(init.body).variables
    if (failOn.includes(search)) return new Response('busy', { status: 500 })
    return Response.json({ data: { Page: { media: hits[search] ? [hits[search]] : [] } } })
  })
}
const searches = (f) => f.mock.calls.filter(([url]) => !url.startsWith('https://img/')).map(([, init]) => JSON.parse(init.body).variables.search)

describe('anilist fallback searches', () => {
  it('exposes the MAL id and refreshes cached entries saved before it existed', async () => {
    const info = await api.getForTitle('Attack on Titan')
    expect(info.malId).toBe(901)
    const [file] = fs.readdirSync(cacheDir).map((n) => path.join(cacheDir, n))
    const old = JSON.parse(fs.readFileSync(file, 'utf8'))
    delete old.malId
    fs.writeFileSync(file, JSON.stringify(old))
    const calls = fetchImpl.mock.calls.length
    expect((await api.getForTitle('Attack on Titan')).malId).toBe(901)
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(calls)
  })
  it('falls back to the subtitle after the last colon', async () => {
    const f = mkSearchFetch({ 'Road to Ninja': media(13667, 'ROAD TO NINJA: NARUTO THE MOVIE', 'Road to Ninja: Naruto the Movie') })
    const info = await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto: Shippuuden Movie 6: Road to Ninja')
    expect(info.id).toBe(13667)
    expect(info.poster).toMatch(/^data:image\/jpeg;base64,/)
    expect(searches(f)).toEqual(['Naruto: Shippuuden Movie 6: Road to Ninja', 'Road to Ninja'])
  })
  it('finds a movie by its subtitle', async () => {
    const f = mkSearchFetch({ 'Guardians of the Crescent Moon': media(2144, 'NARUTO: Dai Koufun!', 'Naruto the Movie: Guardians of the Crescent Moon Kingdom') })
    expect((await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto the Movie 3: Guardians of the Crescent Moon')).id).toBe(2144)
  })
  it('falls back to the part before the last colon', async () => {
    const f = mkSearchFetch({ 'Naruto Narutimate Hero 3': media(1074, 'NARUTO: Narutimate Hero 3', null) })
    const info = await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto Narutimate Hero 3: Tsuini Gekitotsu! Jounin vs. Genin!!')
    expect(info.id).toBe(1074)
    expect(searches(f)).toEqual(['Naruto Narutimate Hero 3: Tsuini Gekitotsu! Jounin vs. Genin!!', 'Tsuini Gekitotsu! Jounin vs. Genin!!', 'Naruto Narutimate Hero 3'])
  })
  it('finally tries the title without "Movie N" / "OVA N" and punctuation', async () => {
    const f = mkSearchFetch({ 'Naruto Shippuden Bonds': media(4437, 'NARUTO: Shippuuden - Kizuna', 'Naruto Shippuden the Movie: Bonds') })
    expect((await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto: Shippuden the Movie 2 -Bonds-')).id).toBe(4437)
    expect(searches(f)).toEqual(['Naruto: Shippuden the Movie 2 -Bonds-', 'Shippuden the Movie 2 -Bonds-', 'Naruto Shippuden Bonds'])
  })
  it('skips the cleaned title when it is a single word or unchanged', async () => {
    const f = mkSearchFetch({})
    await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto Movie 3')
    expect(searches(f)).toEqual(['Naruto Movie 3'])
  })
  it('also treats " - " as a subtitle separator', async () => {
    const f = mkSearchFetch({ 'The Lost Tower': media(8246, 'NARUTO: Shippuuden - The Lost Tower', 'Naruto Shippuden the Movie: The Lost Tower') })
    expect((await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto: Shippuuden Movie 4 - The Lost Tower')).id).toBe(8246)
    expect(searches(f)).toEqual(['Naruto: Shippuuden Movie 4 - The Lost Tower', 'The Lost Tower'])
  })
  it('never searches a single word, so a long title cannot get the wrong poster', async () => {
    const f = mkSearchFetch({ Naruto: media(20, 'NARUTO', 'Naruto') })
    expect(await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto: Shippuuden Movie 6: Ninja')).toBeNull()
    expect(searches(f)).toEqual(['Naruto: Shippuuden Movie 6: Ninja', 'Naruto: Shippuuden Movie 6', 'Naruto Shippuuden Ninja'])
    expect(searches(f)).not.toContain('Naruto')
  })
  it('does not fall back when the full title matches', async () => {
    const f = mkSearchFetch({ 'Frieren: Beyond Journey’s End': media(2, 'Frieren', 'Frieren: Beyond Journey’s End') })
    await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Frieren: Beyond Journey’s End')
    expect(searches(f)).toEqual(['Frieren: Beyond Journey’s End'])
  })
  it('keeps trying after one failing query', async () => {
    const f = mkSearchFetch({ 'Road to Ninja': media(13667, 'ROAD TO NINJA', null) }, { failOn: ['Naruto: Shippuuden Movie 6: Road to Ninja'] })
    expect((await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Naruto: Shippuuden Movie 6: Road to Ninja')).id).toBe(13667)
  })
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

describe('anilist rate limiting', () => {
  const hit = media(5, 'Show Five', 'Show Five')
  const json = (body, headers = {}) => Response.json(body, { headers })
  const page = (list) => ({ data: { Page: { media: list } } })
  const isImg = (url) => url.startsWith('https://img/')
  const img = () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } })

  it('sends AniList requests one at a time', async () => {
    let inFlight = 0, maxInFlight = 0
    const f = vi.fn(async (url) => {
      if (isImg(url)) return img()
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return json(page([hit]))
    })
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} })
    const res = await Promise.all(['A b', 'C d', 'E f'].map((t) => al.getForTitle(t)))
    expect(res.every((r) => r?.id === 5)).toBe(true)
    expect(maxInFlight).toBe(1)
  })
  it('waits Retry-After on 429 and retries the same request', async () => {
    let n = 0
    const f = vi.fn(async (url) => (isImg(url) ? img() : ++n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '7' } }) : json(page([hit]))))
    const sleep = vi.fn(async () => {})
    const info = await createAniList({ cacheDir, fetchImpl: f, sleep }).getForTitle('Show Five')
    expect(info.id).toBe(5)
    expect(sleep).toHaveBeenCalledWith(7000)
  })
  it('pauses the queue until the reset when no requests remain', async () => {
    const now = () => 1_000_000
    const f = vi.fn(async (url) => (isImg(url) ? img() : json(page([hit]), { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(1_000_000 / 1000 + 5) })))
    const sleep = vi.fn(async () => {})
    await createAniList({ cacheDir, fetchImpl: f, sleep, now }).getForTitle('Show Five')
    expect(sleep).toHaveBeenCalledWith(5000)
  })
  it('gives up after repeated 429s without remembering the miss', async () => {
    const f = vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} })
    expect(await al.getForTitle('Show Five')).toBeNull()
    const calls = f.mock.calls.length
    expect(calls).toBe(3)
    await al.getForTitle('Show Five')
    expect(f.mock.calls.length).toBeGreaterThan(calls)
  })
  it('remembers "not found" for 7 days so the same search costs no requests', async () => {
    let t = 0
    const f = vi.fn(async () => json(page([])))
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {}, now: () => t })
    expect(await al.getForTitle('Nothing: Here At All')).toBeNull()
    const calls = f.mock.calls.length
    expect(await al.getForTitle('Nothing: Here At All')).toBeNull()
    expect(f.mock.calls.length).toBe(calls)
    expect(al.getCached('Nothing: Here At All')).toBeNull()
    t = 8 * 24 * 3600 * 1000
    await al.getForTitle('Nothing: Here At All')
    expect(f.mock.calls.length).toBeGreaterThan(calls)
  })
  it('forgets a "not found" written by older search logic', async () => {
    const f = vi.fn(async () => json(page([])))
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {}, now: () => 0 })
    await al.getForTitle('Nothing: Here At All')
    const [file] = fs.readdirSync(cacheDir).map((n) => path.join(cacheDir, n))
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).searchVersion).toBe(SEARCH_VERSION)
    for (const stale of [{ notFound: true, at: 0 }, { notFound: true, at: 0, searchVersion: SEARCH_VERSION - 1 }]) {
      fs.writeFileSync(file, JSON.stringify(stale))
      const calls = f.mock.calls.length
      await al.getForTitle('Nothing: Here At All')
      expect(f.mock.calls.length).toBeGreaterThan(calls)
    }
  })
})
