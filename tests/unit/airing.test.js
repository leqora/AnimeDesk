import { describe, it, expect } from 'vitest'
import { AIRED_GRACE_MS, ANILIST_STATUSES, airedCount, newEpisodeCount, upcoming, untilParts, untilKey } from '../../src/shared/airing.js'

const T = 1_800_000_000_000
const info = (over = {}) => ({ status: 'RELEASING', nextAiring: { episode: 13, airingAt: T }, ...over })
const entry = (over = {}) => ({ status: 'watching', watchedEpisodes: [1, 2, 3, 4, 5, 6, 7, 8, 9], ...over })
const MIN = 60_000, H = 60 * MIN, D = 24 * H

describe('airedCount', () => {
  it('counts the upcoming episode as aired once its time has passed', () => {
    expect(airedCount(info(), T - 1)).toBe(12)
    expect(airedCount(info(), T)).toBe(13)
    expect(airedCount(info(), T + D)).toBe(13)
  })
  it('is unknown without a schedule', () => {
    expect(airedCount(info({ nextAiring: null }), T)).toBeNull()
    expect(airedCount(null, T)).toBeNull()
    expect(airedCount(undefined, T)).toBeNull()
  })
})

describe('newEpisodeCount', () => {
  it('counts aired episodes after the highest watched one', () => {
    expect(newEpisodeCount(entry(), info(), T - 1)).toBe(3)
    expect(newEpisodeCount(entry(), info(), T)).toBe(4)
    expect(newEpisodeCount(entry({ watchedEpisodes: [] }), info(), T - 1)).toBe(12)
  })
  it('only counts series the user is watching that are still airing', () => {
    expect(newEpisodeCount(entry({ status: 'planned' }), info(), T - 1)).toBe(0)
    expect(newEpisodeCount(entry({ status: 'paused' }), info(), T - 1)).toBe(0)
    expect(newEpisodeCount(entry(), info({ status: 'FINISHED' }), T - 1)).toBe(0)
    expect(newEpisodeCount(entry(), info({ status: 'NOT_YET_RELEASED', nextAiring: { episode: 1, airingAt: T } }), T - 1)).toBe(0)
    expect(newEpisodeCount(entry(), info({ nextAiring: null }), T - 1)).toBe(0)
    expect(newEpisodeCount(entry(), null, T - 1)).toBe(0)
  })
  it('ignores fractional specials and never goes negative', () => {
    expect(newEpisodeCount(entry({ watchedEpisodes: [1, 2, 2.5] }), info(), T - 1)).toBe(10)
    expect(newEpisodeCount(entry({ watchedEpisodes: [20] }), info(), T - 1)).toBe(0)
  })
})

describe('upcoming', () => {
  it('returns the next episode only while it is still in the future', () => {
    expect(upcoming(info(), T - 1)).toEqual({ episode: 13, airingAt: T })
    expect(upcoming(info(), T)).toBeNull()
    expect(upcoming(info({ nextAiring: null }), T - 1)).toBeNull()
    expect(upcoming(undefined, T)).toBeNull()
  })
})

describe('untilParts / untilKey', () => {
  it('splits a duration into days, hours and minutes', () => {
    expect(untilParts(59_999)).toBeNull()
    expect(untilParts(MIN)).toEqual({ d: 0, h: 0, min: 1 })
    expect(untilParts(2 * D + 4 * H + 30 * MIN + 59_000)).toEqual({ d: 2, h: 4, min: 30 })
    expect(untilParts(-5)).toBeNull()
    expect(untilParts(NaN)).toBeNull()
  })
  it('picks the text for the largest unit and leaves out zero minor units', () => {
    expect(untilKey(30_000)).toEqual({ key: 'airing.soon', vars: {} })
    expect(untilKey(15 * MIN)).toEqual({ key: 'airing.in.min', vars: { min: 15 } })
    expect(untilKey(3 * H + 20 * MIN)).toEqual({ key: 'airing.in.h', vars: { h: 3, min: 20 } })
    expect(untilKey(3 * H)).toEqual({ key: 'airing.in.hOnly', vars: { h: 3 } })
    expect(untilKey(2 * D + 4 * H + 10 * MIN)).toEqual({ key: 'airing.in.d', vars: { d: 2, h: 4 } })
    expect(untilKey(2 * D + 10 * MIN)).toEqual({ key: 'airing.in.dOnly', vars: { d: 2 } })
  })
  it('exports the grace period and the AniList statuses', () => {
    expect(AIRED_GRACE_MS).toBe(H)
    expect(ANILIST_STATUSES).toEqual(['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'HIATUS', 'CANCELLED'])
  })
})
