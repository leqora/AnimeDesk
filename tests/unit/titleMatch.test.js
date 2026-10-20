import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MATCH_VERSION, cleanTitle, searchQueries, searchCandidates, pickMatch, isExactName } from '../../src/shared/titleMatch.js'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/titleMatch.cases.json', import.meta.url), 'utf8'))

// Minimal AniList media for the unit cases (the fixture carries the real ones).
const media = (id, romaji, over = {}) => ({ id, format: 'TV', title: { romaji, english: over.english ?? null, native: over.native ?? null }, synonyms: over.synonyms ?? [], ...(over.format ? { format: over.format } : {}) })
const pick = (title, results) => {
  const r = pickMatch(title, results)
  return r ? { id: r.media.id, match: r.match } : null
}

describe('fixture cases (real AniList answers)', () => {
  it('has the 68 recorded cases', () => {
    expect(fixture.cases).toHaveLength(68)
  })
  for (const c of fixture.cases) {
    it(c.title, () => {
      const queries = searchQueries(c.title)
      expect(queries).toEqual(c.queries)
      let r = null
      for (const q of queries) {
        r = pickMatch(c.title, c.answers[q] ?? [])
        if (r) break
      }
      expect(r ? { id: r.media.id, match: r.match } : null).toEqual(c.expect)
    })
  }
})

describe('MATCH_VERSION', () => {
  it('is 3', () => expect(MATCH_VERSION).toBe(3))
})

describe('cleanTitle', () => {
  it('removes parenthesised and bracketed parts', () => {
    expect(cleanTitle('JoJo no Kimyou na Bouken (Uncensored)')).toBe('JoJo no Kimyou na Bouken')
    expect(cleanTitle('Some Show [RAW] Special')).toBe('Some Show Special')
    expect(cleanTitle('Saint Seiya: The Lost Canvas (season 1+season 2)')).toBe('Saint Seiya: The Lost Canvas')
  })
  it('removes a trailing "Arc" and trailing semicolons, collapses spaces', () => {
    expect(cleanTitle('Bleach: Thousand-Year Blood War Arc')).toBe('Bleach: Thousand-Year Blood War')
    expect(cleanTitle('Some   Show;;')).toBe('Some Show')
    expect(cleanTitle('  Arc Rising  ')).toBe('Arc Rising')
  })
  it('tolerates null', () => {
    expect(cleanTitle(undefined)).toBe('')
  })
})

describe('searchCandidates (moved from anilist.js)', () => {
  it('adds subtitle, the part before the separator, and the title without Movie/OVA', () => {
    expect(searchCandidates('Naruto: Shippuuden Movie 6: Road to Ninja')).toEqual([
      'Naruto: Shippuuden Movie 6: Road to Ninja',
      'Road to Ninja',
      'Naruto: Shippuuden Movie 6',
      'Naruto Shippuuden Road to Ninja'
    ])
  })
  it('never offers a single word', () => {
    const out = searchCandidates('Bleach: Hell')
    expect(out).not.toContain('Hell')
    expect(out).not.toContain('Bleach')
  })
})

describe('searchQueries', () => {
  it('starts with the full title, then the cleaned one, then the fallbacks of the cleaned title', () => {
    expect(searchQueries('Bleach: Thousand-Year Blood War Arc')).toEqual([
      'Bleach: Thousand-Year Blood War Arc',
      'Bleach: Thousand-Year Blood War',
      'Thousand-Year Blood War',
      'Bleach Thousand Year Blood War'
    ])
  })
  it('has no duplicates and no empty entries', () => {
    expect(searchQueries('One Piece')).toEqual(['One Piece'])
    expect(searchQueries('  ')).toEqual([])
    expect(searchQueries(null)).toEqual([])
  })
})

describe('isExactName', () => {
  it('compares the normalised title, the cleaned title and the token sequence', () => {
    expect(isExactName('Attack on Titan', 'attack on titan')).toBe(true)
    expect(isExactName('Foo Bar (Uncensored)', 'Foo Bar')).toBe(true)
    expect(isExactName('Foo Bar', 'Foo Baz')).toBe(false)
    expect(isExactName('Foo Bar', '')).toBe(false)
  })
  it('uses tokens when only diacritics differ', () => {
    expect(isExactName('Pokémon', 'Pokemon')).toBe(true)
  })
})

describe('pickMatch: exact', () => {
  it('prefers a main title of any result over a synonym of an earlier one', () => {
    const results = [
      media(13203, 'Lupin III: Part Something', { synonyms: ['Lupin III'] }),
      media(1412, 'Lupin III')
    ]
    expect(pick('Lupin III', results)).toEqual({ id: 1412, match: 'exact' })
  })
  it('still accepts a synonym when no main title is exact', () => {
    const results = [media(5, 'Something Different'), media(6, 'Other Thing', { synonyms: ['Kono Subarashii'] })]
    expect(pick('Kono Subarashii', results)).toEqual({ id: 6, match: 'exact' })
  })
  it('matches the cleaned title', () => {
    expect(pick('Foo Bar (Uncensored)', [media(1, 'Foo Bar')])).toEqual({ id: 1, match: 'exact' })
  })
  it('exactTok decides: names that differ only in diacritics are exact (one-word titles cannot be close)', () => {
    expect(pick('Pokémon', [media(7, 'Pokemon')])).toEqual({ id: 7, match: 'exact' })
  })
  it('exactTok on the cleaned title decides too', () => {
    expect(pick('Pokémon (2019)', [media(8, 'Pokemon')])).toEqual({ id: 8, match: 'exact' })
  })
  it('compares the English and native titles as well', () => {
    expect(pick('Attack on Titan', [media(9, 'Shingeki no Kyojin', { english: 'Attack on Titan' })])).toEqual({ id: 9, match: 'exact' })
  })
})

describe('pickMatch: close and null', () => {
  it('returns null for empty results and tolerates media without synonyms / other titles', () => {
    expect(pickMatch('Foo Bar', [])).toBeNull()
    expect(pickMatch('Foo Bar', [{ id: 1, title: { romaji: 'Foo Bar Baz' } }])).toMatchObject({ match: 'close' })
  })
  it('score gets the CLEANED title: a number inside parentheses does not enter the number check', () => {
    // Raw title would require a "2" and accept "... 2"; the cleaned title has no number, so "... 2" is rejected.
    expect(pick('Foo Bar Baz (season 2)', [media(1, 'Foo Bar Baz 2')])).toBeNull()
    expect(pick('Foo Bar Baz (season 2)', [media(1, 'Foo Bar Baz 2'), media(2, 'Foo Bar Baz Story')])).toEqual({ id: 2, match: 'close' })
  })
  it('equal scores keep the first result', () => {
    const a = media(1, 'Alpha Beta Gamma Delta Epsilon')
    const b = media(2, 'Alpha Beta Gamma Delta Epsilon')
    expect(pick('Alpha Beta Gamma Delta Zeta', [a, b])).toEqual({ id: 1, match: 'close' })
    expect(pick('Alpha Beta Gamma Delta Zeta', [b, a])).toEqual({ id: 2, match: 'close' })
  })
  it('a one-word title accepts only an exact name', () => {
    expect(pick('Naruto', [media(1, 'Naruto Movie')])).toBeNull()
    expect(pick('Naruto', [media(1, 'Naruto')])).toEqual({ id: 1, match: 'exact' })
  })
  it('a two-word title can be close', () => {
    expect(pick('Foo Bar', [media(1, 'Foo Bar Baz')])).toEqual({ id: 1, match: 'close' })
  })
  it('rejects a result below the 0.6 similarity threshold', () => {
    expect(pick('Foo Bar Baz', [media(1, 'Foo Quux Wibble Zork Frob')])).toBeNull()
  })
})

describe('pickMatch: numbers', () => {
  it('"OVA2" is split into "ova 2": the number 2 is required of the candidate', () => {
    expect(pick('Zeta Omega Kappa OVA2', [media(1, 'Zeta Omega Kappa 2')])).toEqual({ id: 1, match: 'close' })
    expect(pick('Zeta Omega Kappa OVA2', [media(1, 'Zeta Omega Kappa 3')])).toBeNull()
  })
  it('II, 2nd and "second" all mean 2', () => {
    const results = [media(3, 'Foo Bar Baz 3rd Season'), media(2, 'Foo Bar Baz 2nd Season')]
    expect(pick('Foo Bar Baz II', results)).toEqual({ id: 2, match: 'close' })
    expect(pick('Foo Bar Baz Second', results)).toEqual({ id: 2, match: 'close' })
  })
  it('a candidate with a number the title lacks is rejected', () => {
    expect(pick('Foo Bar Baz', [media(1, 'Foo Bar Baz 4')])).toBeNull()
  })
  it('the number 1 is neutral', () => {
    expect(pick('Foo Bar Baz', [media(1, 'Foo Bar Baz 1')])).toEqual({ id: 1, match: 'close' })
    expect(pick('Foo Bar Baz 1', [media(1, 'Foo Bar Baz Story')])).toEqual({ id: 1, match: 'close' })
  })
  it('a number in the romaji title does not reject the media when the English title has none', () => {
    expect(pick('Foo Bar Baz Quux', [media(1, 'Foo Bar Baz Quux 2', { english: 'Foo Bar Baz Quux Story' })])).toEqual({ id: 1, match: 'close' })
  })
})

describe('pickMatch: distinctive words', () => {
  it('a word from the subtitle is required even when few words are missing overall', () => {
    // 1 of 5 distinctive words missing (0.2 <= 0.25) but it sits in the subtitle
    expect(pick('Alpha Beta Gamma Delta: Epsilon', [media(1, 'Alpha Beta Gamma Delta')])).toBeNull()
    // same missing word without a subtitle separator is tolerated
    expect(pick('Alpha Beta Gamma Delta Epsilon', [media(1, 'Alpha Beta Gamma Delta')])).toEqual({ id: 1, match: 'close' })
  })
  it('tolerates exactly 25 % missing words, but not more', () => {
    expect(pick('Alpha Beta Gamma Epsilon', [media(1, 'Alpha Beta Gamma')])).toEqual({ id: 1, match: 'close' })
    expect(pick('Alpha Beta Gamma Delta Epsilon', [media(1, 'Alpha Beta Gamma')])).toBeNull()
  })
  it('generic words do not count as distinctive', () => {
    // "Movie" and "Season" are generic: only "Foo" is distinctive, so a close match is impossible
    expect(pick('Foo Movie Season', [media(1, 'Foo Movie Season Story')])).toBeNull()
  })
})

describe('pickMatch: similarity details', () => {
  it('Dice runs over the spaced strings: split vs merged words fall under the threshold', () => {
    // with spaces the score is 0.571 (< 0.6); over strings with the spaces removed it would be 0.614 and match
    expect(pick('Star Light Chronicle', [media(1, 'Starlight Chronicle Tale')])).toBeNull()
  })
  it('Dice counts a repeated pair as often as it occurs (multiset, not set)', () => {
    // multiset: 0.558 (< 0.6); over the set of distinct pairs it would be 0.75 and match
    expect(pick('Kiro Nana', [media(1, 'Kiro Nanananananana')])).toBeNull()
  })
  it('a movie title gets a bonus for a MOVIE format that lifts it over the threshold', () => {
    // base score is below 0.6; +0.1 only for MOVIE
    expect(pick('Alpha Beta Movie', [media(1, 'Alpha Beta Gamma Delta', { format: 'MOVIE' })])).toEqual({ id: 1, match: 'close' })
    expect(pick('Alpha Beta Movie', [media(1, 'Alpha Beta Gamma Delta', { format: 'OVA' })])).toBeNull()
  })
  it('a movie title gets a penalty for TV / TV_SHORT formats that drops it under the threshold', () => {
    const title = 'Alpha Beta Gamma Movie'
    const name = 'Alpha Beta Gamma Delta Epsilon'
    expect(pick(title, [media(1, name, { format: 'OVA' })])).toEqual({ id: 1, match: 'close' })
    expect(pick(title, [media(1, name, { format: 'TV' })])).toBeNull()
    expect(pick(title, [media(1, name, { format: 'TV_SHORT' })])).toBeNull()
  })
  it('the movie rule applies to "Film" and is case-insensitive', () => {
    expect(pick('Alpha Beta FILM', [media(1, 'Alpha Beta Gamma Delta', { format: 'MOVIE' })])).toEqual({ id: 1, match: 'close' })
  })
})
