import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniList } from '../../src/main/anilist.js'
import { SCHEDULE } from '../../src/main/anilistQueries.js'

let cacheDir
beforeEach(() => { cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-sched-')) })
const tick = () => new Promise((r) => setTimeout(r, 15))
const media = (id, extra = {}) => ({
  id, isAdult: false, format: 'TV', status: 'RELEASING', seasonYear: 2026,
  title: { romaji: `R${id}`, english: `E${id}` }, coverImage: { medium: `https://img/${id}.jpg` },
  relations: { edges: [] }, ...extra,
})
const row = (id, episode, airingAt, extra) => ({ airingAt, episode, media: media(id, extra) })
const pageOf = (rows, hasNextPage = false) => ({ data: { Page: { pageInfo: { hasNextPage }, airingSchedules: rows } } })
const mk = (handler, extra = {}) => {
  const f = vi.fn(async (url, init) => handler(JSON.parse(init.body), f.mock.calls.length))
  return { f, al: createAniList({ cacheDir, fetchImpl: f, sleep: async () => {}, ...extra }) }
}

describe('anilist.schedule', () => {
  it('sends only variables with floor(from)-1 and ceil(to) in seconds', async () => {
    const { f, al } = mk(() => Response.json(pageOf([])))
    await al.schedule(1_000_500, 2_000_100)
    const body = JSON.parse(f.mock.calls[0][1].body)
    expect(body.query).toBe(SCHEDULE)
    expect(body.variables).toEqual({ page: 1, from: 1000 - 1, to: 2001 })
    expect(body.query).not.toMatch(/Show|E1|R1/)
  })

  it('fetches pages while hasNextPage and converts seconds to ms', async () => {
    const { f, al } = mk((body) => Response.json(body.variables.page === 1
      ? pageOf([row(1, 3, 100)], true) : pageOf([row(2, 1, 200)])))
    const items = await al.schedule(0, 1000)
    expect(f).toHaveBeenCalledTimes(2)
    expect(items.map((i) => [i.mediaId, i.episode, i.airingAt])).toEqual([[1, 3, 100_000], [2, 1, 200_000]])
    expect(items[0]).toEqual({
      mediaId: 1, episode: 3, airingAt: 100_000, title: 'E1', romaji: 'R1', english: 'E1',
      format: 'TV', isAdult: false, coverUrl: 'https://img/1.jpg', poster: true,
    })
  })

  it('stops at 8 pages even if AniList keeps saying hasNextPage', async () => {
    const { f, al } = mk((body) => Response.json(pageOf([row(body.variables.page, 1, 10)], true)))
    const items = await al.schedule(0, 1000)
    expect(f).toHaveBeenCalledTimes(8)
    expect(items).toHaveLength(8)
  })

  it('skips invalid rows', async () => {
    const { al } = mk(() => Response.json(pageOf([
      row(1, 0, 10), row(2, 1, undefined), { airingAt: 10, episode: 1, media: { ...media(3), id: undefined } },
      { airingAt: 10, episode: 1, media: null }, row(4, 1.5, 10), row(5, 2, 10),
    ])))
    expect((await al.schedule(0, 1000)).map((i) => i.mediaId)).toEqual([5])
  })

  it('title falls back to romaji and cover to null', async () => {
    const { al } = mk(() => Response.json(pageOf([row(1, 1, 10, { title: { romaji: 'Only', english: null }, coverImage: null })])))
    const [i] = await al.schedule(0, 1000)
    expect([i.title, i.english, i.coverUrl]).toEqual(['Only', null, null])
  })

  it('poster is false for a later part, true for a first season, false for adult', async () => {
    const later = { relations: { edges: [{ relationType: 'PREQUEL', node: { id: 99, type: 'ANIME', format: 'TV', seasonYear: 2019 } }] } }
    const { al } = mk(() => Response.json(pageOf([row(1, 1, 10, later), row(2, 1, 10), row(3, 1, 10, { isAdult: true })])))
    expect((await al.schedule(0, 1000)).map((i) => i.poster)).toEqual([false, true, false])
  })

  it('rejects when the second page fails', async () => {
    const { al } = mk((body) => (body.variables.page === 1
      ? Response.json(pageOf([row(1, 1, 10)], true)) : new Response('', { status: 500 })))
    await expect(al.schedule(0, 1000)).rejects.toThrow(/500/)
  })

  it('goes through the queue: an exhausted budget on page 1 delays page 2', async () => {
    const now = () => 1_000_000
    let release
    const gate = new Promise((r) => { release = r })
    const sleep = vi.fn(() => gate)
    const { f, al } = mk((body) => Response.json(
      body.variables.page === 1 ? pageOf([row(1, 1, 10)], true) : pageOf([row(2, 1, 10)]),
      body.variables.page === 1 ? { headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(1_000_000 / 1000 + 5) } } : {},
    ), { sleep, now })
    const p = al.schedule(0, 1000)
    await tick()
    expect(f).toHaveBeenCalledTimes(1)
    release()
    expect(await p).toHaveLength(2)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('never touches the cache dir', async () => {
    const { al } = mk(() => Response.json(pageOf([row(1, 1, 10)])))
    await al.schedule(0, 1000)
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })
})
