import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniList } from '../../src/main/anilist.js'
import { DISCOVER, DISCOVER_FIELDS, REC_MEDIA_FIELDS } from '../../src/main/anilistQueries.js'

let cacheDir
beforeEach(() => { cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-disc-')) })
const media = (id, extra = {}) => ({
  id, isAdult: false, format: 'TV', status: 'RELEASING', seasonYear: 2026, episodes: 12, genres: ['Action'],
  title: { romaji: `R${id}`, english: `E${id}` }, coverImage: { large: `https://img/${id}.jpg` },
  startDate: { year: 2026, month: 10 }, relations: { edges: [] }, ...extra,
})
const data = (parts) => ({ data: Object.fromEntries(['season', 'upcoming', 'movies', 'trending'].map((k) => [k, { media: parts[k] ?? [] }])) })
const vars = { season: 'FALL', year: 2026, nextSeason: 'WINTER', nextYear: 2027 }
const mk = (handler) => {
  const f = vi.fn(async (url, init) => handler(JSON.parse(init.body)))
  return { f, al: createAniList({ cacheDir, fetchImpl: f, sleep: async () => {} }) }
}

describe('anilist.discover', () => {
  it('sends one request with four aliases and only variables', async () => {
    const { f, al } = mk(() => Response.json(data({})))
    await al.discover(vars)
    expect(f).toHaveBeenCalledTimes(1)
    const body = JSON.parse(f.mock.calls[0][1].body)
    expect(body.query).toBe(DISCOVER)
    expect(DISCOVER_FIELDS).toBe(`${REC_MEDIA_FIELDS} startDate { year month }`)
    for (const a of ['season:', 'upcoming:', 'movies:', 'trending:', 'isAdult: false', 'startDate { year month }']) expect(body.query).toContain(a)
    expect(body.variables).toEqual(vars)
  })

  it('maps items', async () => {
    const { al } = mk(() => Response.json(data({
      upcoming: [
        media(1, { bannerImage: 'https://s4.anilist.co/b/1.jpg', genres: ['A', 'B', 'C', 'D', 'E'], startDate: { year: 2027, month: 1 } }),
        media(2, { startDate: { year: null, month: null }, title: { romaji: 'Only', english: null }, coverImage: null }),
        media(3, { title: { romaji: 'X Season 2', english: null }, relations: { edges: [{ relationType: 'PREQUEL', node: { id: 9, type: 'ANIME', format: 'TV', seasonYear: 2025 } }] } }),
      ],
    })))
    const r = await al.discover(vars)
    expect(r.season).toEqual([])
    expect(r.upcoming[0]).toEqual({
      id: 1, title: 'E1', romaji: 'R1', english: 'E1', format: 'TV', status: 'RELEASING', year: 2026, episodes: 12,
      genres: ['A', 'B', 'C', 'D', 'E'], start: { year: 2027, month: 1 }, coverUrl: 'https://img/1.jpg', bannerUrl: 'https://s4.anilist.co/b/1.jpg', shown: true,
    })
    expect(r.upcoming[1]).toMatchObject({ title: 'Only', english: null, start: null, coverUrl: null, bannerUrl: null })
    expect(r.upcoming[2].shown).toBe(false)
  })

  it('drops items without an integer id > 0', async () => {
    const { al } = mk(() => Response.json(data({ trending: [media(0), media(1.5), { ...media(2), id: undefined }, null, media(5)] })))
    expect((await al.discover(vars)).trending.map((i) => i.id)).toEqual([5])
  })

  it('rejects on a graphql error', async () => {
    const { al } = mk(() => Response.json({ errors: [{ message: 'boom' }] }))
    await expect(al.discover(vars)).rejects.toThrow()
  })

  it('never touches the cache dir', async () => {
    const { al } = mk(() => Response.json(data({ season: [media(1)] })))
    await al.discover(vars)
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })
})
