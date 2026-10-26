import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { toCase } from '../../src/shared/recommendations.js'
import {
  seasonOf, nextSeason, shownInDiscover, RAIL_KEYS, buildRails, genreOptions, filterRails, surprisePool, pickSurprise,
} from '../../src/shared/discover.js'

const at = (y, m, d, h = 0, min = 0) => new Date(y, m, d, h, min).getTime()

describe('seasonOf', () => {
  it.each([
    [at(2026, 0, 1), 'WINTER', 2026],
    [at(2026, 2, 31, 23, 59), 'WINTER', 2026],
    [at(2026, 3, 1), 'SPRING', 2026],
    [at(2026, 6, 1), 'SUMMER', 2026],
    [at(2026, 9, 27), 'FALL', 2026],
    [at(2026, 11, 31), 'FALL', 2026],
  ])('%s', (ms, season, year) => {
    expect(seasonOf(ms)).toEqual({ season, year })
  })
})

describe('nextSeason', () => {
  it('walks the year and wraps FALL to WINTER of next year', () => {
    expect(nextSeason({ season: 'WINTER', year: 2026 })).toEqual({ season: 'SPRING', year: 2026 })
    expect(nextSeason({ season: 'SPRING', year: 2026 })).toEqual({ season: 'SUMMER', year: 2026 })
    expect(nextSeason({ season: 'SUMMER', year: 2026 })).toEqual({ season: 'FALL', year: 2026 })
    expect(nextSeason({ season: 'FALL', year: 2026 })).toEqual({ season: 'WINTER', year: 2027 })
  })
})

describe('shownInDiscover', () => {
  const { cases } = JSON.parse(readFileSync(new URL('../fixtures/discover.cases.json', import.meta.url), 'utf8'))
  it('matches every fixture case', () => {
    expect(cases).toHaveLength(200)
    expect(cases.filter((c) => c.shown)).toHaveLength(105)
    const wrong = cases.filter((c) => shownInDiscover(toCase(c.media)) !== c.shown).map((c) => c.id)
    expect(wrong).toEqual([])
  })
  it('rejects cancelled, adult and bad formats', () => {
    const ok = { title: 'A', romaji: 'A', format: 'TV', status: 'RELEASING', year: 2026, isAdult: false, prequels: [], parent: false }
    expect(shownInDiscover(ok)).toBe(true)
    expect(shownInDiscover({ ...ok, status: 'CANCELLED' })).toBe(false)
    expect(shownInDiscover({ ...ok, isAdult: true })).toBe(false)
    expect(shownInDiscover({ ...ok, format: 'SPECIAL' })).toBe(false)
    expect(shownInDiscover({ ...ok, status: 'NOT_YET_RELEASED' })).toBe(true)
  })
})

const it_ = (id, extra = {}) => ({ id, title: `T${id}`, genres: [], status: 'FINISHED', shown: true, ...extra })

describe('buildRails', () => {
  it('has the four rail keys', () => {
    expect(RAIL_KEYS).toEqual(['season', 'upcoming', 'movies', 'trending'])
  })
  it('drops hidden items unless in library, missing rails become []', () => {
    const raw = { season: [it_(1), it_(2, { shown: false }), it_(3, { shown: false })] }
    const r = buildRails(raw, { isInLibrary: (i) => i.id === 3 })
    expect(r.season.map((i) => i.id)).toEqual([1, 3])
    expect(r.upcoming).toEqual([])
    expect(r.movies).toEqual([])
    expect(r.trending).toEqual([])
  })
  it('dedupes across rails in order season, upcoming, movies, trending and inside a rail', () => {
    const r = buildRails({
      season: [it_(1), it_(1), it_(2)],
      upcoming: [it_(3), it_(2)],
      movies: [it_(3), it_(4)],
      trending: [it_(1), it_(4), it_(5)],
    })
    expect(r.season.map((i) => i.id)).toEqual([1, 2])
    expect(r.upcoming.map((i) => i.id)).toEqual([3])
    expect(r.movies.map((i) => i.id)).toEqual([4])
    expect(r.trending.map((i) => i.id)).toEqual([5])
  })
  it('cuts to max after dedupe', () => {
    const r = buildRails({ season: [it_(1), it_(2), it_(3)], trending: [it_(1), it_(4), it_(5), it_(6)] }, { max: 2 })
    expect(r.season.map((i) => i.id)).toEqual([1, 2])
    expect(r.trending.map((i) => i.id)).toEqual([4, 5])
  })
})

describe('genres', () => {
  const rails = {
    season: [it_(1, { genres: ['Drama', 'Action'] })],
    upcoming: [it_(2, { genres: ['Comedy', 'Drama'] })],
    movies: [it_(3, { genres: ['Action'] })],
    trending: [],
  }
  it('genreOptions is sorted and unique', () => {
    expect(genreOptions(rails)).toEqual(['Action', 'Comedy', 'Drama'])
  })
  it('filterRails null keeps items, genre filters every rail', () => {
    expect(filterRails(rails, null)).toEqual(rails)
    const f = filterRails(rails, 'Drama')
    expect(f.season.map((i) => i.id)).toEqual([1])
    expect(f.upcoming.map((i) => i.id)).toEqual([2])
    expect(f.movies).toEqual([])
    expect(f.trending).toEqual([])
  })
})

describe('surprise', () => {
  const rails = {
    season: [it_(1), it_(2, { status: 'NOT_YET_RELEASED' }), it_(3, { status: 'HIATUS' }), it_(4, { status: 'RELEASING' })],
    upcoming: [it_(5)],
    movies: [it_(6), it_(7)],
    trending: [it_(8)],
  }
  it('pool excludes upcoming, unreleased/hiatus, library and hidden', () => {
    const pool = surprisePool(rails, (i) => i.id === 6, [8])
    expect(pool.map((i) => i.id)).toEqual([1, 4, 7])
  })
  it('pickSurprise', () => {
    const a = it_(1)
    const b = it_(2)
    expect(pickSurprise([a, b], null, () => 0)).toBe(a)
    expect(pickSurprise([a, b], a.id, () => 0)).toBe(b)
    expect(pickSurprise([a], a.id, () => 0)).toBe(a)
    expect(pickSurprise([], null)).toBeNull()
  })
})
