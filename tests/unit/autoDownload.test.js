import { describe, it, expect } from 'vitest'
import {
  SOURCE_LAG_MS, MAX_PER_CHECK, GIVE_UP_MS, RETRYABLE_ERRORS,
  maxWatched, initialAfter, autoDownloadCandidates, nextCheckAt, retryDelayMs, shouldGiveUp
} from '../../src/shared/autoDownload.js'

const now = Date.UTC(2026, 9, 17, 12)
const H = 3600e3, MIN = 60e3
const entry = (over = {}) => ({ id: 'a1', status: 'watching', aniListId: 21, aniCliTitle: 'Show', watchedEpisodes: [1, 2, 3], ...over })
const info = (over = {}) => ({ nextAiring: { episode: 6, airingAt: now + H }, ...over })
const run = (o = {}) => {
  const { after = 3, prefs, e = entry(), i = info(), ...rest } = o
  return autoDownloadCandidates({
    entries: [e],
    prefsFor: () => (prefs === undefined ? { after } : prefs),
    infoById: i === null ? {} : { [e.aniListId ?? 21]: i },
    now,
    ...rest
  })
}

describe('constants', () => {
  it('match the spec', () => {
    expect(SOURCE_LAG_MS).toBe(20 * MIN)
    expect(MAX_PER_CHECK).toBe(3)
    expect(GIVE_UP_MS).toBe(3 * 24 * H)
    expect(RETRYABLE_ERRORS).toEqual(['episode-not-released', 'no-sources', 'blocked', 'unknown'])
  })
})

describe('maxWatched / initialAfter', () => {
  it('maxWatched ignores fractions and is 0 when empty', () => {
    expect(maxWatched(entry())).toBe(3)
    expect(maxWatched(entry({ watchedEpisodes: [1, 2.5] }))).toBe(1)
    expect(maxWatched(entry({ watchedEpisodes: [] }))).toBe(0)
    expect(maxWatched({})).toBe(0)
  })
  it('initialAfter is the larger of aired and watched', () => {
    expect(initialAfter({ entry: entry(), info: info(), now })).toBe(5)
    expect(initialAfter({ entry: entry({ watchedEpisodes: [1, 2, 3, 4, 5, 6, 7] }), info: info(), now })).toBe(7)
    expect(initialAfter({ entry: entry(), info: {}, now })).toBe(3)
  })
})

describe('autoDownloadCandidates', () => {
  it('returns aired episodes after the boundary', () => {
    expect(run({ after: 3 })).toEqual([{ animeId: 'a1', aniCliTitle: 'Show', episodes: [4, 5] }])
    expect(run({ after: 5 })).toEqual([])
  })
  it('skips watched episodes', () => {
    expect(run({ after: 0 })).toEqual([{ animeId: 'a1', aniCliTitle: 'Show', episodes: [4, 5] }])
  })
  it('skips every episode up to the highest watched one', () => {
    expect(run({ after: 0, e: entry({ watchedEpisodes: [1, 3] }) })[0].episodes).toEqual([4, 5])
  })
  it('holds episode 6 back at exactly airingAt', () => {
    expect(run({ after: 5, i: info({ nextAiring: { episode: 6, airingAt: now } }) })).toEqual([])
  })
  it('ignores a prefs record without a valid after', () => {
    expect(run({ prefs: {} })).toEqual([])
    expect(run({ prefs: { after: -1 } })).toEqual([])
    expect(run({ prefs: { after: 1.5 } })).toEqual([])
  })
  it('caps at max, oldest first', () => {
    expect(run({ after: 0, e: entry({ watchedEpisodes: [] }) })[0].episodes).toEqual([1, 2, 3])
    expect(run({ after: 0, e: entry({ watchedEpisodes: [] }), max: 1 })[0].episodes).toEqual([1])
  })
  it('holds back a just-aired episode until the source lag has passed', () => {
    const at = (ms) => info({ nextAiring: { episode: 6, airingAt: now - ms } })
    expect(run({ after: 5, i: at(10 * MIN) })).toEqual([])
    expect(run({ after: 5, i: at(20 * MIN) })[0].episodes).toEqual([6])
  })
  it('excludes ineligible series', () => {
    expect(run({ e: entry({ status: 'planned' }) })).toEqual([])
    expect(run({ e: entry({ aniListId: undefined }) })).toEqual([])
    expect(run({ e: entry({ aniCliTitle: undefined }) })).toEqual([])
    expect(run({ prefs: null })).toEqual([])
    expect(run({ i: null })).toEqual([])
    expect(run({ i: {} })).toEqual([])
  })
})

describe('nextCheckAt', () => {
  const next = (o = {}) => {
    const { prefs, e = entry(), i = info() } = o
    return nextCheckAt({ entries: [e], prefsFor: () => (prefs === undefined ? { after: 5 } : prefs), infoById: { 21: i }, now })
  }
  it('is the airing time plus the source lag', () => {
    expect(next()).toBe(now + H + 20 * MIN)
  })
  it('is null when off, ineligible or already past', () => {
    expect(next({ prefs: null })).toBeNull()
    expect(next({ e: entry({ status: 'planned' }) })).toBeNull()
    expect(next({ i: info({ nextAiring: { episode: 6, airingAt: now - 20 * MIN } }) })).toBeNull()
  })
  it('wakes inside the lag window', () => {
    expect(next({ i: info({ nextAiring: { episode: 6, airingAt: now - 10 * MIN } }) })).toBe(now + 10 * MIN)
  })
  it('does not wake for an episode already handed or watched', () => {
    expect(next({ prefs: { after: 6 } })).toBeNull()
    expect(next({ e: entry({ watchedEpisodes: [1, 6] }) })).toBeNull()
  })
  it('ignores a prefs record without a valid after', () => {
    expect(next({ prefs: {} })).toBeNull()
  })
  it('picks the earliest across series', () => {
    const r = nextCheckAt({
      entries: [entry(), entry({ id: 'a2', aniListId: 22 })],
      prefsFor: () => ({ after: 0 }),
      infoById: { 21: info(), 22: info({ nextAiring: { episode: 5, airingAt: now + 30 * MIN } }) },
      now
    })
    expect(r).toBe(now + 50 * MIN)
  })
})

describe('retry', () => {
  it('backs off then settles at 6 h', () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelayMs)).toEqual([30, 60, 120, 240, 360, 360].map((m) => m * MIN))
  })
  it('gives up after exactly 3 days', () => {
    expect(shouldGiveUp({ firstTriedAt: now - GIVE_UP_MS, now })).toBe(true)
    expect(shouldGiveUp({ firstTriedAt: now - GIVE_UP_MS + 1, now })).toBe(false)
  })
  it('fails closed on a non-finite firstTriedAt', () => {
    for (const v of [undefined, null, NaN, Infinity, 'x']) expect(shouldGiveUp({ firstTriedAt: v, now })).toBe(true)
  })
})
