import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { looseText, compactText, matchLevel, isBlankQuery, rankSeries, continueSeries, filterByLabel } from '../../src/shared/palette.js'

const corpus = JSON.parse(readFileSync(new URL('../fixtures/palette.cases.json', import.meta.url), 'utf8'))

describe('looseText / compactText', () => {
  it('normalizes punctuation, apostrophes and scripts', () => {
    expect(looseText("JoJo's Bizarre")).toBe('jojos bizarre')
    expect(looseText('Magical★Explorer: Eroge')).toBe('magical explorer eroge')
    expect(looseText('Fate/stay')).toBe('fate stay')
    expect(looseText('Bleach: Тысяча')).toBe('bleach тысяча')
    expect(compactText('Re:Zero')).toBe('rezero')
  })
})

describe('matchLevel', () => {
  it('returns levels 1-6', () => {
    expect(matchLevel('re zero', 'Re:Zero')).toBe(1)
    expect(matchLevel('re', 'Re:Zero')).toBe(2)
    expect(matchLevel('zero', 're zero')).toBe(3)
    expect(matchLevel('ero', 'Re:Zero')).toBe(4)
    expect(matchLevel('rezer', 'Re:Zero kara')).toBe(5)
    expect(matchLevel('ezer', 'Re:Zero')).toBe(6)
    expect(matchLevel('xyz', 'Re:Zero')).toBeNull()
  })
  it('blank query gives null', () => {
    expect(matchLevel('★!!', 'abc')).toBeNull()
    expect(isBlankQuery('★!!')).toBe(true)
    expect(isBlankQuery('  -  ')).toBe(true)
    expect(isBlankQuery('a')).toBe(false)
  })
})

describe('rankSeries', () => {
  it('breaks ties by lastWatchedAt, length, alphabet', () => {
    const e = [
      { id: '1', title: 'Naruto B', aniCliTitle: 'x' },
      { id: '2', title: 'Naruto A', aniCliTitle: 'x', lastWatchedAt: '2026-01-10T10:00:00.000Z' },
      { id: '3', title: 'Naruto C', aniCliTitle: 'x', lastWatchedAt: '2026-01-20T10:00:00.000Z' },
      { id: '4', title: 'Naruto', aniCliTitle: 'x' },
      { id: '5', title: 'Naruto A', aniCliTitle: 'x' }
    ]
    expect(rankSeries(e, {}, 'naruto').map(x => x.id)).toEqual(['4', '3', '2', '5', '1'])
  })
  it('uses romaji facet', () => {
    const e = [{ id: 'a', title: 'Zzz', aniCliTitle: 'Zzz' }]
    expect(rankSeries(e, { a: { romaji: 'Shingeki' } }, 'shin')).toHaveLength(1)
  })
  it('limits and blank gives []', () => {
    const e = Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: `Bleach ${i}`, aniCliTitle: '' }))
    expect(rankSeries(e, {}, 'bleach')).toHaveLength(8)
    expect(rankSeries(e, {}, '★')).toEqual([])
  })
})

describe('continueSeries', () => {
  it('keeps watching only, sorted, capped at 5', () => {
    const e = Array.from({ length: 7 }, (_, i) => ({ id: String(i), title: `T${i}`, status: 'watching', lastWatchedAt: `2026-01-0${i + 1}T10:00:00.000Z` }))
    e.push({ id: 'x', title: 'X', status: 'completed', lastWatchedAt: '2026-02-01T10:00:00.000Z' })
    const r = continueSeries(e)
    expect(r).toHaveLength(5)
    expect(r[0].id).toBe('6')
    expect(r.some(x => x.id === 'x')).toBe(false)
  })
})

describe('filterByLabel', () => {
  const items = [{ label: 'Home' }, { label: 'Schedule' }, { label: 'Settings' }, { label: 'Scores' }]
  it('keeps order and filters', () => {
    expect(filterByLabel(items, 'sc').map(i => i.label)).toEqual(['Schedule', 'Scores'])
  })
  it('blank returns all', () => {
    expect(filterByLabel(items, '!')).toEqual(items)
  })
})

describe('real-title corpus', () => {
  it('has all 15 cases', () => { expect(corpus.cases).toHaveLength(15) })
  const entries = corpus.titles.map((title, i) => ({ id: String(i), title, aniCliTitle: title }))
  for (const c of corpus.cases) {
    it(`query ${JSON.stringify(c.query)}`, () => {
      const r = rankSeries(entries, {}, c.query)
      if (c.blank) {
        expect(isBlankQuery(c.query)).toBe(true)
        expect(r).toEqual([])
      } else if (c.none) {
        expect(r).toEqual([])
      } else {
        expect(r[0].title).toBe(c.first)
        if (c.notFirst) expect(r[0].title).not.toBe(c.notFirst)
      }
    })
  }
})
