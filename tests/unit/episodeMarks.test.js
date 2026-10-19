import { describe, it, expect } from 'vitest'
import { markEpisodes, AIRING_TOLERANCE } from '../../src/shared/episodeMarks.js'

const list = (n) => Array.from({ length: n }, (_, i) => String(i + 1))

describe('markEpisodes', () => {
  it('ok with kinds and counts', () => {
    const r = markEpisodes(list(5), { filler: [2, 3], recap: [5], count: 5 })
    expect(r.marks).toBe('ok')
    expect(r.kinds).toEqual({ 2: 'filler', 3: 'filler', 5: 'recap' })
    expect(r.counts).toEqual({ filler: 2, recap: 1 })
  })
  it('labels 0, 12.5 and SP are never marked', () => {
    const r = markEpisodes(['0', '12.5', 'SP', '12'], { filler: [0, 12], recap: [], count: 12 })
    expect(r.kinds).toEqual({ 12: 'filler' })
    expect(r.counts).toEqual({ filler: 1, recap: 0 })
  })
  it('finished: one more whole episode than count is unreliable', () => {
    expect(markEpisodes(list(5), { filler: [2], recap: [], count: 5 }).marks).toBe('ok')
    const r = markEpisodes(list(6), { filler: [2], recap: [], count: 5 })
    expect(r).toEqual({ marks: 'unreliable', kinds: {}, counts: { filler: 0, recap: 0 } })
  })
  it('airing: +5 ok, +6 unreliable', () => {
    expect(AIRING_TOLERANCE).toBe(5)
    const data = { filler: [2], recap: [], count: 5 }
    expect(markEpisodes(list(10), data, { airing: true }).marks).toBe('ok')
    expect(markEpisodes(list(11), data, { airing: true }).marks).toBe('unreliable')
  })
  it('missing means none', () => {
    expect(markEpisodes(list(3), { missing: true, filler: [], recap: [], count: 0 }).marks).toBe('none')
  })
  it('null means none', () => {
    expect(markEpisodes(list(3), null)).toEqual({ marks: 'none', kinds: {}, counts: { filler: 0, recap: 0 } })
  })
})
