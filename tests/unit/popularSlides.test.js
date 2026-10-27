import { describe, it, expect } from 'vitest'
import { popularSlides } from '../../src/renderer/home/popularSlides.js'

const NOW = new Date(2026, 9, 27).getTime() // FALL 2026
const item = (id, over = {}) => ({ id, title: `T${id}`, romaji: `R${id}`, format: 'TV', status: 'RELEASING', year: 2026, episodes: 12, genres: ['Action', 'Fantasy'], poster: `p${id}`, entryId: null, ...over })
const peek = (ids, over = {}) => ({ season: { season: 'FALL', year: 2026 }, items: ids.map((i) => item(i)), ...over })
const recs = (mode, ids) => ({ mode, hint: false, items: ids.map((i) => item(i, { entryId: undefined })) })

describe('popularSlides', () => {
  it('prefers the current season rail, then trending, then personal', () => {
    const s = popularSlides({ peek: peek([1, 2]), recs: recs('trending', [3]), now: NOW })
    expect(s.map((x) => [x.id, x.kind, x.labelKey, x.rank])).toEqual([[1, 'discover', 'hero.popularSeason', 1], [2, 'discover', 'hero.popularSeason', 2]])
    const t = popularSlides({ peek: { season: null, items: [] }, recs: recs('trending', [3, 4]), now: NOW })
    expect(t.map((x) => [x.id, x.kind, x.labelKey, x.rank])).toEqual([[3, 'rec', 'hero.popularNow', 1], [4, 'rec', 'hero.popularNow', 2]])
    const p = popularSlides({ peek: null, recs: recs('personal', [5]), now: NOW })
    expect(p.map((x) => [x.id, x.kind, x.labelKey])).toEqual([[5, 'rec', 'hero.personal']])
  })
  it('ignores a peek from another season (a stale rail is not "this season")', () => {
    const old = peek([1, 2], { season: { season: 'SUMMER', year: 2026 } })
    expect(popularSlides({ peek: old, recs: recs('trending', [3]), now: NOW }).map((x) => x.id)).toEqual([3])
    expect(popularSlides({ peek: peek([1], { season: { season: 'FALL', year: 2025 } }), recs: recs('personal', [9]), now: NOW }).map((x) => x.id)).toEqual([9])
  })
  it('skips series already in the library and ranks what is left', () => {
    const p = { season: { season: 'FALL', year: 2026 }, items: [item(1, { entryId: 'e1' }), item(2), item(3)] }
    expect(popularSlides({ peek: p, recs: null, now: NOW }).map((x) => [x.id, x.rank])).toEqual([[2, 1], [3, 2]])
  })
  it('falls through when every item of a source is in the library', () => {
    const p = { season: { season: 'FALL', year: 2026 }, items: [item(1, { entryId: 'e1' })] }
    expect(popularSlides({ peek: p, recs: recs('trending', [7]), now: NOW }).map((x) => x.id)).toEqual([7])
  })
  it('keeps at most 5 and only card facts', () => {
    const s = popularSlides({ peek: peek([1, 2, 3, 4, 5, 6, 7]), recs: null, now: NOW })
    expect(s).toHaveLength(5)
    expect(Object.keys(s[0]).sort()).toEqual(['format', 'genres', 'id', 'kind', 'labelKey', 'poster', 'rank', 'romaji', 'title', 'year'])
    expect(popularSlides({ peek: peek([1, 2, 3, 4, 5, 6]), recs: null, now: NOW }, 2)).toHaveLength(2)
  })
  it('returns [] when there is nothing', () => {
    expect(popularSlides({ peek: null, recs: null, now: NOW })).toEqual([])
    expect(popularSlides({ peek: { season: null, items: [] }, recs: { mode: 'trending', items: [] }, now: NOW })).toEqual([])
    expect(popularSlides({})).toEqual([])
  })
})
