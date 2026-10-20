import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniList } from '../../src/main/anilist.js'
import { RECS_BATCH, TRENDING } from '../../src/main/anilistQueries.js'

const media = (id, extra = {}) => ({
  id, isAdult: false, format: 'TV', status: 'FINISHED', seasonYear: 2020, episodes: 12,
  genres: ['A', 'B', 'C', 'D'], title: { romaji: `R${id}`, english: `E${id}` }, coverImage: { large: `https://img/${id}.jpg` },
  relations: { edges: [] }, description: 'secret', ...extra,
})
const apiCalls = (f) => f.mock.calls.filter(([url]) => !url.startsWith('https://img/'))
let cacheDir
beforeEach(() => { cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-recs-')) })
const mk = (handler) => createAniList({ cacheDir, fetchImpl: vi.fn(handler), sleep: async () => {} })

describe('anilist recommendations', () => {
  it('sends one RECS_BATCH with the ids', async () => {
    const f = vi.fn(async () => Response.json({ data: { Page: { media: [] } } }))
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} })
    await al.recommendations([1, 2])
    expect(apiCalls(f)).toHaveLength(1)
    const body = JSON.parse(apiCalls(f)[0][1].body)
    expect(body.query).toBe(RECS_BATCH)
    expect(body.variables).toEqual({ ids: [1, 2] })
  })

  it('chunks 51 unique ids into 2 requests and never touches the cache dir', async () => {
    const f = vi.fn(async (url, init) => {
      const { ids } = JSON.parse(init.body).variables
      return Response.json({ data: { Page: { media: ids.map((id) => ({ id, recommendations: { nodes: [] } })) } } })
    })
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} })
    const ids = Array.from({ length: 51 }, (_, i) => i + 1)
    const map = await al.recommendations([...ids, 1])
    expect(apiCalls(f)).toHaveLength(2)
    expect(map.size).toBe(51)
    expect(map.get(7)).toEqual([])
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })

  it('reduces items, keeps AniList rank across skipped nulls, computes eligible', async () => {
    const al = mk(async () => Response.json({ data: { Page: { media: [
      { id: 1, recommendations: { nodes: [
        { rating: 90, mediaRecommendation: media(10) },
        { rating: 80, mediaRecommendation: null },
        { rating: 70, mediaRecommendation: media(12, {
          title: { romaji: 'Only Romaji', english: null }, seasonYear: null, episodes: null, coverImage: null, genres: null,
          relations: { edges: [{ relationType: 'PREQUEL', node: { id: 99, type: 'ANIME', format: 'TV', seasonYear: 2019 } }] },
          
        }) },
      ] } },
      { id: 2, recommendations: null },
      { id: 3 },
    ] } } }))
    const map = await al.recommendations([1, 2, 3])
    expect([...map.keys()]).toEqual([1, 2, 3])
    expect(map.get(2)).toEqual([])
    expect(map.get(3)).toEqual([])
    const [a, b] = map.get(1)
    expect(map.get(1)).toHaveLength(2)
    expect(Object.keys(a).sort()).toEqual(['coverUrl', 'eligible', 'english', 'episodes', 'format', 'genres', 'id', 'rank', 'rating', 'romaji', 'status', 'title', 'year'])
    expect(a).toEqual({
      id: 10, title: 'E10', romaji: 'R10', english: 'E10', format: 'TV', status: 'FINISHED', year: 2020, episodes: 12,
      genres: ['A', 'B', 'C'], coverUrl: 'https://img/10.jpg', rank: 0, rating: 90, eligible: true,
    })
    expect(b).toMatchObject({ id: 12, title: 'Only Romaji', english: null, year: null, episodes: null, coverUrl: null, genres: [], rank: 2, rating: 70 })
    expect(typeof b.eligible).toBe('boolean')
  })

  it('a failing chunk rejects', async () => {
    let n = 0
    const al = mk(async () => (++n === 2 ? new Response('busy', { status: 500 }) : Response.json({ data: { Page: { media: [] } } })))
    await expect(al.recommendations(Array.from({ length: 60 }, (_, i) => i + 1))).rejects.toThrow(/HTTP 500/)
  })
})

describe('anilist trending', () => {
  it('one request, rating null, rank is the position', async () => {
    const f = vi.fn(async () => Response.json({ data: { Page: { media: [media(5), media(6, { status: 'RELEASING' })] } } }))
    const al = createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} })
    const items = await al.trending()
    expect(apiCalls(f)).toHaveLength(1)
    expect(JSON.parse(apiCalls(f)[0][1].body).query).toBe(TRENDING)
    expect(items.map((i) => [i.id, i.rank, i.rating])).toEqual([[5, 0, null], [6, 1, null]])
    expect(items[1].status).toBe('RELEASING')
    expect(items[0].genres).toEqual(['A', 'B', 'C'])
    expect('relations' in items[0]).toBe(false)
    expect('description' in items[0]).toBe(false)
  })

  it('tolerates an empty answer', async () => {
    const al = mk(async () => Response.json({ data: { Page: { media: null } } }))
    expect(await al.trending()).toEqual([])
  })
})
