import { describe, it, expect } from 'vitest'
import { foldText, matchesQuery, filterEntries, statusCounts, genreOptions, sortItems } from '../../src/shared/watchlistFilter.js'

describe('foldText', () => {
  it('strips diacritics, handles đ and case', () => {
    expect(foldText('Đorđe ŠČĆŽ')).toBe('dorde sccz')
  })
  it('collapses whitespace and trims', () => {
    expect(foldText('  Shingeki   no\tKyojin ')).toBe('shingeki no kyojin')
  })
  it('null becomes empty string', () => {
    expect(foldText(null)).toBe('')
  })
})

describe('matchesQuery', () => {
  it('matches on aniCliTitle only', () => {
    expect(matchesQuery({ title: 'X', aniCliTitle: 'Naruto Shippuden' }, undefined, 'shippuden')).toBe(true)
  })
  it('matches on facet romaji only', () => {
    const e = { title: 'Attack on Titan' }
    expect(matchesQuery(e, { romaji: 'Shingeki no Kyojin' }, 'kyojin')).toBe(true)
    expect(matchesQuery(e, undefined, 'kyojin')).toBe(false)
  })
  it('folds accents', () => {
    expect(matchesQuery({ title: 'Pokémon' }, undefined, 'pokemon')).toBe(true)
  })
  it('empty or whitespace query matches', () => {
    expect(matchesQuery({ title: 'A' }, undefined, '')).toBe(true)
    expect(matchesQuery({ title: 'A' }, undefined, '   ')).toBe(true)
  })
})

const entries = [
  { id: 1, title: 'Naruto', status: 'watching' },
  { id: 2, title: 'Naruto Shippuden', status: 'completed' },
  { id: 3, title: 'Bleach', status: 'watching' },
  { id: 4, title: 'Odd', status: 'weird' }
]
const facets = {
  1: { romaji: null, genres: ['Action', 'Comedy'] },
  2: { romaji: null, genres: ['Action'] },
  3: { romaji: null, genres: ['Action', 'Fantasy'] }
}

describe('filterEntries', () => {
  it('combines status, genre and query with AND', () => {
    const r = filterEntries(entries, { query: 'naruto', status: 'watching', genre: 'Action' }, facets)
    expect(r.map((e) => e.id)).toEqual([1])
  })
  it('defaults pass everything', () => {
    expect(filterEntries(entries, {}, facets)).toHaveLength(4)
  })
  it('entry without facet never passes a specific genre', () => {
    expect(filterEntries(entries, { genre: 'Action' }, facets).map((e) => e.id)).toEqual([1, 2, 3])
  })
})

describe('statusCounts', () => {
  it('counts only query matches per status, ignores status filter', () => {
    const c = statusCounts(entries, { query: 'naruto', genre: 'all' }, facets)
    expect(c).toEqual({ all: 2, watching: 1, completed: 1, planned: 0, paused: 0, dropped: 0 })
  })
  it('unknown status counts only toward all', () => {
    const c = statusCounts(entries, {}, facets)
    expect(c.all).toBe(4)
    expect(c.weird).toBeUndefined()
  })
  it('respects genre', () => {
    expect(statusCounts(entries, { genre: 'Fantasy' }, facets).all).toBe(1)
  })
})

describe('genreOptions', () => {
  it('dedups and sorts genres of listed entries', () => {
    expect(genreOptions(facets, entries, 'all')).toEqual(['Action', 'Comedy', 'Fantasy'])
    expect(genreOptions(facets, [entries[1]], 'all')).toEqual(['Action'])
  })
  it('keeps selected genre even when missing', () => {
    expect(genreOptions(facets, entries, 'Mecha')).toEqual(['Action', 'Comedy', 'Fantasy', 'Mecha'])
  })
})

describe('sortItems', () => {
  it('added: newest first, missing addedAt last', () => {
    const items = [
      { title: 'A', addedAt: '2026-01-01' },
      { title: 'B' },
      { title: 'C', addedAt: '2026-03-01' }
    ]
    expect(sortItems(items, 'added').map((i) => i.title)).toEqual(['C', 'A', 'B'])
  })
})
