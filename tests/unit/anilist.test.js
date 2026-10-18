import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createAniList, AniListAuthError, bestMatch, cleanDescription, SEARCH_VERSION, toNextAiring, isFresh } from '../../src/main/anilist.js'

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
  describe('stale entries without malId', () => {
    const makeStale = async () => {
      await api.getForTitle('Attack on Titan')
      const [file] = fs.readdirSync(cacheDir).map((n) => path.join(cacheDir, n))
      const old = JSON.parse(fs.readFileSync(file, 'utf8'))
      delete old.malId
      fs.writeFileSync(file, JSON.stringify(old))
      return { file, old }
    }
    it('keeps returning the cached info when the refresh fails, and does not retry this run', async () => {
      const { file, old } = await makeStale()
      const failing = vi.fn(async () => { throw new Error('offline') })
      const offline = createAniList({ cacheDir, fetchImpl: failing })
      expect(await offline.getForTitle('Attack on Titan')).toEqual({ ...old, malId: null })
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(old)
      const calls = failing.mock.calls.length
      expect(await offline.getForTitle('Attack on Titan')).toEqual({ ...old, malId: null })
      expect(failing.mock.calls.length).toBe(calls)
    })
    it('does not write a notFound marker over a stale entry when the search finds nothing', async () => {
      const { file, old } = await makeStale()
      const empty = createAniList({ cacheDir, fetchImpl: mkFetch([]) })
      expect((await empty.getForTitle('Attack on Titan')).title).toBe(old.title)
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(old)
    })
    it('persists a null MAL id from the refetch so the next call is served from cache', async () => {
      await makeStale()
      const f = mkFetch([media(1, 'Shingeki no Kyojin', 'Attack on Titan', { idMal: null })])
      const fresh = createAniList({ cacheDir, fetchImpl: f })
      expect((await fresh.getForTitle('Attack on Titan')).malId).toBeNull()
      const calls = f.mock.calls.length
      expect((await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Attack on Titan')).malId).toBeNull()
      expect(f.mock.calls.length).toBe(calls)
    })
  })
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

describe('anilist cache freshness', () => {
  const DAY = 24 * 3600 * 1000
  let t
  const clock = () => t
  const make = (list) => {
    const f = mkFetch(list)
    return { f, al: createAniList({ cacheDir, fetchImpl: f, now: clock }) }
  }
  const apiCalls = (f) => f.mock.calls.filter(([url]) => !url.startsWith('https://img/')).length
  const imgCalls = (f) => f.mock.calls.filter(([url]) => url.startsWith('https://img/')).length
  beforeEach(() => { t = 1_000_000_000_000 })

  it('stores the airing status and when it was fetched', async () => {
    const { al } = make([media(1, 'Frieren', 'Frieren', { status: 'RELEASING' })])
    expect(await al.getForTitle('Frieren')).toMatchObject({ status: 'RELEASING', fetchedAt: t })
  })
  it('refreshes an airing series after a day, keeping the poster when the cover did not change', async () => {
    await make([media(1, 'Frieren', 'Frieren', { status: 'RELEASING', episodes: null })]).al.getForTitle('Frieren')
    t += DAY / 2
    const half = make([media(1, 'Frieren', 'Frieren', { status: 'RELEASING', episodes: 28 })])
    expect((await half.al.getForTitle('Frieren')).episodes).toBeNull()
    expect(apiCalls(half.f)).toBe(0)
    t += DAY
    const later = make([media(1, 'Frieren', 'Frieren', { status: 'FINISHED', episodes: 28 })])
    expect(await later.al.getForTitle('Frieren')).toMatchObject({ episodes: 28, status: 'FINISHED', fetchedAt: t })
    expect(imgCalls(later.f)).toBe(0)
  })
  it('never refreshes a finished series', async () => {
    await make([media(1, 'Frieren', 'Frieren', { status: 'FINISHED' })]).al.getForTitle('Frieren')
    t += 365 * DAY
    const { f, al } = make([media(1, 'Frieren', 'Frieren', { status: 'FINISHED' })])
    await al.getForTitle('Frieren')
    expect(apiCalls(f)).toBe(0)
  })
  it('keeps the cached entry unchanged when the refresh fails', async () => {
    const first = await make([media(1, 'Frieren', 'Frieren', { status: 'RELEASING' })]).al.getForTitle('Frieren')
    t += 2 * DAY
    const offline = createAniList({ cacheDir, fetchImpl: vi.fn(async () => { throw new Error('offline') }), now: clock })
    expect(await offline.getForTitle('Frieren')).toEqual(first)
  })
  it('refreshes entries cached before the status was stored', async () => {
    await make([media(1, 'Frieren', 'Frieren')]).al.getForTitle('Frieren')
    const [file] = fs.readdirSync(cacheDir).map((n) => path.join(cacheDir, n))
    const old = JSON.parse(fs.readFileSync(file, 'utf8'))
    delete old.fetchedAt
    delete old.status
    fs.writeFileSync(file, JSON.stringify(old))
    const { f, al } = make([media(1, 'Frieren', 'Frieren', { status: 'FINISHED' })])
    expect((await al.getForTitle('Frieren')).status).toBe('FINISHED')
    expect(apiCalls(f)).toBe(1)
  })
})

describe('airing schedule (nextAiring)', () => {
  const HOUR = 3600 * 1000
  const T = 1_800_000_000_000 // ms
  const airing = (episode, atMs) => ({ status: 'RELEASING', nextAiringEpisode: { episode, airingAt: atMs / 1000 } })

  it('converts AniList nextAiringEpisode to ms and rejects malformed values', () => {
    expect(toNextAiring({ episode: 13, airingAt: T / 1000 })).toEqual({ episode: 13, airingAt: T })
    expect(toNextAiring(null)).toBeNull()
    expect(toNextAiring(undefined)).toBeNull()
    expect(toNextAiring({ episode: 0, airingAt: 1 })).toBeNull()
    expect(toNextAiring({ episode: 1.5, airingAt: 1 })).toBeNull()
    expect(toNextAiring({ episode: '3', airingAt: 1 })).toBeNull()
    expect(toNextAiring({ episode: 3, airingAt: null })).toBeNull()
    expect(toNextAiring({ episode: 3, airingAt: 'soon' })).toBeNull()
  })

  it('returns nextAiring with the info and only the number and time', async () => {
    const f = mkFetch([media(7, 'Airing Show', 'Airing Show', airing(5, T))])
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => T - HOUR })
    const info = await al.getForTitle('Airing Show')
    expect(info.nextAiring).toEqual({ episode: 5, airingAt: T })
    expect(Object.keys(info.nextAiring).sort()).toEqual(['airingAt', 'episode'])
    expect(info.status).toBe('RELEASING')
  })

  it('has nextAiring null for a finished show', async () => {
    const f = mkFetch([media(8, 'Done Show', 'Done Show', { status: 'FINISHED' })])
    const info = await createAniList({ cacheDir, fetchImpl: f }).getForTitle('Done Show')
    expect(info.nextAiring).toBeNull()
  })

  it('decides freshness for airing shows by schedule, age and missing key', () => {
    const base = { malId: 1, fetchedAt: T - HOUR, status: 'RELEASING', nextAiring: { episode: 5, airingAt: T } }
    expect(isFresh(base, T - 1)).toBe(true)
    expect(isFresh(base, T + HOUR - 1)).toBe(true) // inside the grace hour
    expect(isFresh(base, T + HOUR)).toBe(false) // AniList has moved on by now
    const old = { ...base } // cache written by 0.7.1
    delete old.nextAiring
    expect(isFresh(old, T - 1)).toBe(false)
    expect(isFresh({ ...base, nextAiring: null }, T)).toBe(true)
    expect(isFresh({ ...base, nextAiring: null }, base.fetchedAt + 24 * HOUR)).toBe(false)
  })

  it('does not expire an entry fetched after its episode already aired (lagging schedule)', () => {
    const lagging = { malId: 1, fetchedAt: T + 2 * HOUR, status: 'RELEASING', nextAiring: { episode: 5, airingAt: T } }
    expect(isFresh(lagging, T + 2 * HOUR + 1000)).toBe(true)
    expect(isFresh(lagging, lagging.fetchedAt + 24 * HOUR)).toBe(false) // the TTL still applies
  })

  it('does not refetch every call when AniList returns an already-past airingAt', async () => {
    const f = mkFetch([media(11, 'Lagging Show', 'Lagging Show', airing(5, T))])
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => T + 5 * HOUR })
    const queries = () => f.mock.calls.filter(([url]) => !url.startsWith('https://img/')).length
    await al.getForTitle('Lagging Show')
    const first = queries()
    await al.getForTitle('Lagging Show')
    await al.getForTitle('Lagging Show')
    expect(queries()).toBe(first)
  })

  it('keeps finished shows fresh forever, even without the new key', () => {
    expect(isFresh({ malId: 1, fetchedAt: 0, status: 'FINISHED' }, T)).toBe(true)
    expect(isFresh({ fetchedAt: 0, status: 'FINISHED' }, T)).toBe(false) // malId rule unchanged
  })

  it('refreshes again in the same run after a successful refresh', async () => {
    let clock = T - HOUR
    let list = [media(9, 'Weekly Show', 'Weekly Show', airing(5, T))]
    const f = vi.fn(async (url, init) => mkFetch(list)(url, init))
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => clock })
    const queries = () => f.mock.calls.filter(([url]) => !url.startsWith('https://img/')).length

    expect((await al.getForTitle('Weekly Show')).nextAiring.episode).toBe(5)
    const first = queries()

    clock = T + HOUR // episode 5 aired an hour ago
    list = [media(9, 'Weekly Show', 'Weekly Show', airing(6, T + 7 * 24 * HOUR))]
    expect((await al.getForTitle('Weekly Show')).nextAiring.episode).toBe(6)
    const second = queries()
    expect(second).toBeGreaterThan(first)

    clock = T + 7 * 24 * HOUR + HOUR // episode 6 aired too, same app run
    list = [media(9, 'Weekly Show', 'Weekly Show', airing(7, T + 14 * 24 * HOUR))]
    expect((await al.getForTitle('Weekly Show')).nextAiring.episode).toBe(7)
    expect(queries()).toBeGreaterThan(second)
  })

  it('still does not retry a failed refresh in the same run', async () => {
    let clock = T - HOUR
    const ok = mkFetch([media(10, 'Flaky Show', 'Flaky Show', airing(5, T))])
    let failing = false
    const f = vi.fn(async (url, init) => { if (failing) throw new Error('offline'); return ok(url, init) })
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => clock })
    await al.getForTitle('Flaky Show')
    clock = T + HOUR
    failing = true
    expect((await al.getForTitle('Flaky Show')).nextAiring.episode).toBe(5) // stale but kept
    const calls = f.mock.calls.length
    expect((await al.getForTitle('Flaky Show')).nextAiring.episode).toBe(5)
    expect(f.mock.calls.length).toBe(calls)
  })
  it('retries a failed refresh after an hour', async () => {
    let clock = T - HOUR
    const ok = mkFetch([media(11, 'Retry Show', 'Retry Show', airing(5, T))])
    let failing = false
    const f = vi.fn(async (url, init) => { if (failing) throw new Error('offline'); return ok(url, init) })
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => clock })
    await al.getForTitle('Retry Show')
    clock = T + HOUR
    failing = true
    await al.getForTitle('Retry Show')
    const calls = f.mock.calls.length
    await al.getForTitle('Retry Show')
    expect(f.mock.calls.length).toBe(calls) // still inside the retry window

    clock += HOUR // exactly one hour after the failure
    await al.getForTitle('Retry Show')
    expect(f.mock.calls.length).toBeGreaterThan(calls)

    failing = false
    clock += HOUR
    expect((await al.getForTitle('Retry Show')).nextAiring.episode).toBe(5)
    expect(f.mock.calls.length).toBeGreaterThan(calls + 1)
  })
})

describe('anilist request dedup and retry timing', () => {
  const HOUR = 3600 * 1000
  const T = 1_800_000_000_000
  const queries = (f) => f.mock.calls.filter(([url]) => !url.startsWith('https://img/')).length

  it('concurrent calls for the same title make one request', async () => {
    const f = mkFetch([media(21, 'Same Show', 'Same Show', { status: 'FINISHED' })])
    const al = createAniList({ cacheDir, fetchImpl: f })
    const [a, b] = await Promise.all([al.getForTitle('Same Show'), al.getForTitle('Same Show')])
    expect(queries(f)).toBe(1)
    expect(a).toEqual(b)
    expect(a.malId).toBe(921)
  })

  it('concurrent calls with the same aniListId make one BY_ID request', async () => {
    const f = mkFetch([media(22, 'Id Show', 'Id Show', { status: 'FINISHED' })])
    const al = createAniList({ cacheDir, fetchImpl: f })
    const [a, b] = await Promise.all([al.getForTitle('Id Show', { aniListId: 22 }), al.getForTitle('Id Show', { aniListId: 22 })])
    expect(queries(f)).toBe(1)
    expect(a).toEqual(b)
  })

  it('does not merge different titles', async () => {
    const f = mkFetch([media(23, 'Alpha Show', 'Alpha Show'), media(24, 'Beta Show', 'Beta Show')])
    const al = createAniList({ cacheDir, fetchImpl: f })
    const [a, b] = await Promise.all([al.getForTitle('Alpha Show'), al.getForTitle('Beta Show')])
    expect(queries(f)).toBe(2)
    expect(a.title ?? a.malId).not.toEqual(b.title ?? b.malId)
  })

  it('after a slow failed refresh the retry pause starts at the failure', async () => {
    let clock = T - HOUR
    const ok = mkFetch([media(25, 'Slow Show', 'Slow Show', { status: 'RELEASING', nextAiring: undefined, nextAiringEpisode: { episode: 5, airingAt: T / 1000 } })])
    let mode = 'ok'
    const f = vi.fn(async (url, init) => {
      if (mode === 'slow-fail') { clock += 50 * 60 * 1000; throw new Error('offline') }
      return ok(url, init)
    })
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => clock })
    await al.getForTitle('Slow Show')
    clock = T + HOUR
    const start = clock
    mode = 'slow-fail'
    expect((await al.getForTitle('Slow Show')).nextAiring.episode).toBe(5) // stale kept
    const calls = f.mock.calls.length

    clock = start + 70 * 60 * 1000 // 20 min after the failure, 70 min after the attempt began
    await al.getForTitle('Slow Show')
    expect(f.mock.calls.length).toBe(calls)

    clock = start + 50 * 60 * 1000 + HOUR + 1
    await al.getForTitle('Slow Show')
    expect(f.mock.calls.length).toBeGreaterThan(calls)
  })
})

describe('refreshAiring (batched airing schedule)', () => {
  const NOW = 1_800_000_000_000
  const pageFetch = (rows) => vi.fn(async (url, init) => {
    const { ids } = JSON.parse(init.body).variables
    return Response.json({ data: { Page: { media: rows.filter((r) => ids.includes(r.id)) } } })
  })
  const row = (id, extra = {}) => ({ id, status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7, airingAt: 1_800_100_000 }, ...extra })

  it('sends one request for up to 50 ids and two for 51', async () => {
    const f = pageFetch([])
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => NOW })
    await al.refreshAiring(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(f).toHaveBeenCalledTimes(1)
    await al.refreshAiring(Array.from({ length: 51 }, (_, i) => i + 1))
    expect(f).toHaveBeenCalledTimes(3)
    const body = JSON.parse(f.mock.calls[0][1].body)
    expect(body.query).toContain('id_in: $ids')
    expect(body.variables.page).toBe(1)
  })

  it('merges into the cache entry keeping poster/title and stays fresh', async () => {
    const first = createAniList({ cacheDir, fetchImpl: mkFetch([media(5, 'Show', 'Show', { status: 'RELEASING' })]), now: () => NOW - 1000 })
    await first.getForTitle('Show', { aniListId: 5 })
    const before = first.getCached(null, { aniListId: 5 })
    const al = createAniList({ cacheDir, fetchImpl: pageFetch([row(5, { episodes: 24 })]), now: () => NOW })
    const result = await al.refreshAiring([5])
    expect(result.get(5)).toEqual({ status: 'RELEASING', episodes: 24, nextAiring: { episode: 7, airingAt: 1_800_100_000_000 } })
    const merged = al.getCached(null, { aniListId: 5 })
    expect(merged).toEqual({ ...before, status: 'RELEASING', episodes: 24, nextAiring: { episode: 7, airingAt: 1_800_100_000_000 }, fetchedAt: NOW })
    expect(merged.poster).toBe(before.poster)
    expect(merged.title).toBe('Show')
    expect(isFresh(merged, NOW)).toBe(true)
  })

  it('keeps a known episode count when AniList now reports null', async () => {
    const first = createAniList({ cacheDir, fetchImpl: mkFetch([media(5, 'Show', 'Show', { status: 'RELEASING', episodes: 12 })]), now: () => NOW - 1000 })
    await first.getForTitle('Show', { aniListId: 5 })
    const al = createAniList({ cacheDir, fetchImpl: pageFetch([row(5, { episodes: null })]), now: () => NOW })
    await al.refreshAiring([5])
    expect(al.getCached(null, { aniListId: 5 }).episodes).toBe(12)
  })

  it('does not create a cache file for ids without one, but returns them', async () => {
    const al = createAniList({ cacheDir, fetchImpl: pageFetch([row(9)]), now: () => NOW })
    const result = await al.refreshAiring([9])
    expect(result.get(9).nextAiring.episode).toBe(7)
    expect(fs.readdirSync(cacheDir)).toEqual([])
    expect(al.getCached(null, { aniListId: 9 })).toBeNull()
  })

  it('leaves notFound markers alone', async () => {
    const file = path.join(cacheDir, `${crypto.createHash('sha1').update('id:3').digest('hex')}.json`)
    const marker = { notFound: true, at: NOW, searchVersion: SEARCH_VERSION }
    fs.writeFileSync(file, JSON.stringify(marker))
    const al = createAniList({ cacheDir, fetchImpl: pageFetch([row(3)]), now: () => NOW })
    expect((await al.refreshAiring([3])).has(3)).toBe(true)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(marker)
  })

  it('rejects when a chunk fails with an HTTP error', async () => {
    const f = vi.fn(async () => new Response('boom', { status: 500 }))
    const al = createAniList({ cacheDir, fetchImpl: f, now: () => NOW })
    await expect(al.refreshAiring([1])).rejects.toThrow('AniList HTTP 500')
  })
})

describe('anilist authenticated calls', () => {
  const TOKEN = 'tok'
  const bodyOf = (f, i = 0) => JSON.parse(f.mock.calls[i][1].body)
  const make = (handler) => {
    const f = vi.fn(async (url, init) => handler(url, init))
    return { f, al: createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} }) }
  }

  it('viewer sends the bearer token and resolves { id, name }', async () => {
    const { f, al } = make(() => Response.json({ data: { Viewer: { id: 42, name: 'Nikola', extra: 1 } } }))
    expect(await al.viewer(TOKEN)).toEqual({ id: 42, name: 'Nikola' })
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('sends no Authorization header without a token', async () => {
    const { f, al } = make(() => Response.json({ data: { Page: { media: [] } } }))
    await al.search('x')
    expect('Authorization' in f.mock.calls[0][1].headers).toBe(false)
  })

  describe('error classification', () => {
    const cases = [
      ['HTTP 401', () => new Response('nope', { status: 401 }), true],
      ['HTTP 400 with errors[].status 401', () => Response.json({ errors: [{ message: 'x', status: 401 }], data: null }, { status: 400 }), true],
      ['HTTP 400 with "Invalid token" message', () => Response.json({ errors: [{ message: 'Invalid token' }], data: null }, { status: 400 }), true],
      ['HTTP 200 with 401 error and null data', () => Response.json({ errors: [{ message: 'x', status: 401 }], data: null }), true],
      ['HTTP 500', () => new Response('boom', { status: 500 }), false],
      ['HTTP 200 with errors and null data', () => Response.json({ errors: [{ message: 'Validation', status: 400 }], data: null }), false],
    ]
    for (const [name, reply, isAuth] of cases) {
      it(`${name} -> ${isAuth ? 'AniListAuthError' : 'plain Error'} without the token`, async () => {
        const { al } = make(reply)
        const err = await al.viewer(TOKEN).then(() => null, (e) => e)
        expect(err).toBeInstanceOf(Error)
        expect(err instanceof AniListAuthError).toBe(isAuth)
        expect(String(err.message)).not.toContain('tok')
      })
    }
    it('does not put the request body in the message', async () => {
      const { al } = make(() => Response.json({ errors: [{ message: 'bad' }], data: null }))
      const err = await al.saveProgress(5, { progress: 3 }, TOKEN).then(() => null, (e) => e)
      expect(err.message).not.toContain('SaveMediaListEntry')
    })
  })

  it('listEntry returns episodes and the entry (or null)', async () => {
    const { f, al } = make(() => Response.json({ data: { Media: { episodes: 12, mediaListEntry: { progress: 4, status: 'CURRENT', id: 9 } } } }))
    expect(await al.listEntry(5, TOKEN)).toEqual({ episodes: 12, entry: { progress: 4, status: 'CURRENT' } })
    expect(bodyOf(f).variables).toEqual({ id: 5 })
    expect(bodyOf(f).query).toContain('mediaListEntry { progress status }')
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    const none = make(() => Response.json({ data: { Media: { episodes: null, mediaListEntry: null } } }))
    expect(await none.al.listEntry(5, TOKEN)).toEqual({ episodes: null, entry: null })
  })

  it('saveProgress omits status when undefined and passes it when given', async () => {
    const { f, al } = make(() => Response.json({ data: { SaveMediaListEntry: { progress: 3, status: 'CURRENT' } } }))
    expect(await al.saveProgress(5, { progress: 3 }, TOKEN)).toEqual({ progress: 3, status: 'CURRENT' })
    expect(bodyOf(f).variables).toEqual({ id: 5, progress: 3 })
    expect('status' in bodyOf(f).variables).toBe(false)
    expect(bodyOf(f).query).toContain('SaveMediaListEntry(mediaId: $id')
    await al.saveProgress(5, { progress: 12, status: 'COMPLETED' }, TOKEN)
    expect(bodyOf(f, 1).variables).toEqual({ id: 5, progress: 12, status: 'COMPLETED' })
  })

  describe('candidates', () => {
    const many = Array.from({ length: 10 }, (_, i) => media(i + 1, `Romaji ${i + 1}`, i % 2 ? null : `English ${i + 1}`, { format: 'TV' }))
    it('returns up to 8 items with format and poster, without description', async () => {
      const { f, al } = make((url) => (url.startsWith('https://img/')
        ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
        : Response.json({ data: { Page: { media: many } } })))
      const r = await al.candidates('x')
      expect(r).toHaveLength(8)
      expect(r[0]).toEqual({ id: 1, title: 'English 1', romaji: 'Romaji 1', year: 2020, format: 'TV', episodes: 12, poster: 'data:image/jpeg;base64,AQID' })
      expect(r[1].title).toBe('Romaji 2')
      expect(r.every((c) => !('description' in c))).toBe(true)
      expect(bodyOf(f).query).toContain('format')
      expect(bodyOf(f).query).not.toContain('description')
    })
    it('gives a null poster when the image fetch fails', async () => {
      const { al } = make((url) => {
        if (url === 'https://img/1.jpg') throw new Error('offline')
        if (url.startsWith('https://img/')) return new Response('', { status: 404 })
        return Response.json({ data: { Page: { media: many.slice(0, 2) } } })
      })
      expect((await al.candidates('x')).map((c) => c.poster)).toEqual([null, null])
    })
  })

  it('authenticated calls share the single queue with search', async () => {
    let inFlight = 0, maxInFlight = 0
    const releases = []
    const f = vi.fn((url, init) => new Promise((resolve) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      const isViewer = JSON.parse(init.body).query.includes('Viewer')
      releases.push(() => { inFlight--; resolve(Response.json({ data: isViewer ? { Viewer: { id: 1, name: 'n' } } : { Page: { media: [] } } })) })
    }))
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} })
    const both = Promise.all([al.viewer(TOKEN), al.search('x')])
    await new Promise((r) => setTimeout(r, 10))
    expect(f).toHaveBeenCalledTimes(1)
    releases[0]()
    await new Promise((r) => setTimeout(r, 10))
    expect(f).toHaveBeenCalledTimes(2)
    releases[1]()
    await both
    expect(maxInFlight).toBe(1)
  })
})

describe('anilist relations and poster', () => {
  const node = (id, extra = {}) => ({
    id, type: 'ANIME', format: 'TV', status: 'FINISHED', seasonYear: 2021, episodes: 12,
    title: { romaji: `R${id}`, english: `E${id}` }, coverImage: { large: `https://img/${id}.jpg` }, ...extra,
  })
  const mk = (handler) => createAniList({ cacheDir, fetchImpl: vi.fn(handler), sleep: async () => {} })
  const apiCalls = (f) => f.mock.calls.filter(([url]) => !url.startsWith('https://img/'))

  it('relations batches by 50 and maps sequels', async () => {
    const f = vi.fn(async (url, init) => {
      const { ids } = JSON.parse(init.body).variables
      return Response.json({ data: { Page: { media: ids.map((id) => ({
        id, relations: { edges: [{ relationType: 'SEQUEL', node: node(id + 1000) }, { relationType: 'PREQUEL', node: node(id + 2000) }] },
      })) } } })
    })
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} })
    const ids = Array.from({ length: 120 }, (_, i) => i + 1)
    const map = await al.relations([...ids, 1, 2])
    expect(apiCalls(f)).toHaveLength(3)
    expect(JSON.parse(apiCalls(f)[0][1].body).query).toContain('relations')
    expect(map.size).toBe(120)
    expect(map.get(5).map((s) => s.id)).toEqual([1005])
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })

  it('tolerates missing relations and null nodes', async () => {
    const al = mk(async () => Response.json({ data: { Page: { media: [
      { id: 1 },
      { id: 2, relations: { edges: [{ relationType: 'SEQUEL', node: null }] } },
      { id: 3, relations: { edges: [{ relationType: 'SEQUEL', node: node(30) }] } },
      { id: 4, relations: null },
    ] } } }))
    const map = await al.relations([1, 2, 3, 4])
    expect([...map.keys()]).toEqual([1, 2, 3, 4])
    expect(map.get(1)).toEqual([])
    expect(map.get(2)).toEqual([])
    expect(map.get(4)).toEqual([])
    expect(map.get(3).map((s) => s.id)).toEqual([30])
  })

  it('a failing chunk rejects', async () => {
    let n = 0
    const al = mk(async () => (++n === 2 ? new Response('busy', { status: 500 }) : Response.json({ data: { Page: { media: [] } } })))
    await expect(al.relations(Array.from({ length: 60 }, (_, i) => i + 1))).rejects.toThrow(/HTTP 500/)
  })

  it('poster returns null on HTTP error and on a thrown fetch', async () => {
    const al = mk(async (url) => {
      if (url === 'https://img/boom.jpg') throw new Error('offline')
      return new Response('', { status: 404 })
    })
    expect(await al.poster('https://img/x.jpg')).toBeNull()
    expect(await al.poster('https://img/boom.jpg')).toBeNull()
    expect(await al.poster(null)).toBeNull()
  })
})
