import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS, achievementFacts, evaluate, newlyUnlocked } from '../../src/shared/achievements.js'

const tz = () => -60 // local = UTC + 1
let n = 0
const mk = (over = {}) => ({
  id: `a${++n}`, title: 'A', status: 'watching', rating: null, pinnedAt: null, watchedEpisodes: [], ...over,
})
const eps = (k) => Array.from({ length: k }, (_, i) => i + 1)
const item = (at, source = 'auto', animeId = 'x') => ({ id: `l${++n}`, animeId, episode: 1, at, source })
const facts = (args) => achievementFacts({ entries: [], log: [], tzOffsetAt: tz, ...args })
const byId = (ev, id) => ev.find((a) => a.id === id)

describe('ACHIEVEMENTS', () => {
  it('lists the 21 spec rows in order', () => {
    expect(ACHIEVEMENTS).toHaveLength(21)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(21)
    expect(ACHIEVEMENTS.map((a) => [a.id, a.goal])).toEqual([
      ['first-episode', 1], ['episodes-50', 50], ['episodes-250', 250], ['episodes-1000', 1000],
      ['first-completed', 1], ['completed-10', 10], ['completed-50', 50],
      ['day-of-anime', 24], ['hours-250', 250], ['streak-7', 7], ['streak-30', 30],
      ['marathon', 12], ['night-owl', 10], ['early-bird', 10], ['genre-explorer', 10],
      ['movie-night', 3], ['long-haul', 1], ['classic', 1], ['critic', 10], ['favorites-5', 5], ['collector', 25],
    ])
    expect(ACHIEVEMENTS.map((a) => a.icon)).toEqual([
      'play', 'play', 'play', 'play', 'check', 'check', 'check', 'clock', 'clock', 'flame', 'flame',
      'zap', 'moon', 'sunrise', 'compass', 'film', 'mountain', 'landmark', 'star', 'heart', 'library'])
  })
})

describe('achievementFacts + evaluate', () => {
  it('counts episodes and evaluates progress', () => {
    const f = facts({ entries: [mk({ watchedEpisodes: eps(30) }), mk({ watchedEpisodes: eps(20) })] })
    expect(f.episodes).toBe(50)
    const ev = evaluate(f)
    expect(byId(ev, 'episodes-50').met).toBe(true)
    expect(byId(ev, 'episodes-250')).toMatchObject({ value: 50, met: false, goal: 250, icon: 'play' })
    expect(ev.map((a) => a.id)).toEqual(ACHIEVEMENTS.map((a) => a.id))
  })

  it('computes unrounded hours from duration, defaulting to 24 minutes', () => {
    const a = mk({ watchedEpisodes: eps(60) })
    const f = facts({ entries: [a], infoById: { [a.id]: { duration: 24 } } })
    expect(f.hours).toBe(24)
    expect(byId(evaluate(f), 'day-of-anime').met).toBe(true)
    expect(facts({ entries: [a] }).hours).toBe(24)
    const b = mk({ watchedEpisodes: eps(1) })
    expect(facts({ entries: [b], infoById: { [b.id]: { duration: 25 } } }).hours).toBeCloseTo(25 / 60, 10)
  })

  it('ignores manual log items for time-based measures', () => {
    const at = '2026-11-04T01:00:00Z' // 02:00 local
    const manual = facts({ log: Array.from({ length: 15 }, () => item(at, 'manual')) })
    expect(manual).toMatchObject({ maxPerDay: 0, night: 0, longestStreak: 0 })
    const auto = facts({ log: Array.from({ length: 15 }, () => item(at, 'auto')) })
    expect(auto).toMatchObject({ maxPerDay: 15, night: 15, longestStreak: 1 })
  })

  it('splits night and early at local hours', () => {
    const f = facts({
      log: [
        item('2026-11-03T23:00:00Z'), // 00:00
        item('2026-11-04T03:59:00Z'), // 04:59
        item('2026-11-04T04:00:00Z'), // 05:00
        item('2026-11-04T07:59:00Z'), // 08:59
        item('2026-11-04T08:00:00Z'), // 09:00
      ],
    })
    expect(f.night).toBe(2)
    expect(f.early).toBe(2)
  })

  it('skips invalid timestamps and counts log items without a library entry', () => {
    const f = facts({ log: [item('garbage'), item('2026-11-04T01:00:00Z', 'auto', 'gone')] })
    expect(f).toMatchObject({ maxPerDay: 1, night: 1, longestStreak: 1 })
  })

  it('keeps a streak across a DST change', () => {
    const dst = (iso) => (Date.parse(iso) < Date.parse('2026-10-25T01:00:00Z') ? -120 : -60)
    const f = achievementFacts({
      entries: [],
      tzOffsetAt: dst,
      log: [
        item('2026-10-24T21:30:00Z'), // 23:30 local (UTC+2)
        item('2026-10-25T22:30:00Z'), // 23:30 local (UTC+1)
        item('2026-10-26T22:30:00Z'),
      ],
    })
    expect(f.longestStreak).toBe(3)
  })

  it('counts distinct genres only from series with watched episodes', () => {
    const a = mk({ watchedEpisodes: [1] })
    const b = mk({ watchedEpisodes: [1] })
    const c = mk({ watchedEpisodes: [] })
    const f = facts({
      entries: [a, b, c],
      infoById: {
        [a.id]: { genres: ['Action', 'Drama'] },
        [b.id]: { genres: ['Drama', 'Comedy'] },
        [c.id]: { genres: ['Horror'] },
      },
    })
    expect(f.genres).toBe(3)
  })

  it('counts movies, long-haul and classic completed', () => {
    const m = mk({ watchedEpisodes: [1] })
    const m0 = mk({ watchedEpisodes: [] })
    const long = mk({ status: 'completed', watchedEpisodes: eps(12) })
    const longNoInfo = mk({ status: 'completed', watchedEpisodes: eps(100) })
    const classic = mk({ status: 'completed', watchedEpisodes: [1] })
    const noYear = mk({ status: 'completed', watchedEpisodes: [1] })
    const f = facts({
      entries: [m, m0, long, longNoInfo, classic, noYear],
      infoById: {
        [m.id]: { format: 'MOVIE' },
        [m0.id]: { format: 'MOVIE' },
        [long.id]: { episodes: 120 },
        [classic.id]: { year: 1998 },
        [noYear.id]: { year: null },
      },
    })
    expect(f.movies).toBe(1)
    expect(f.longCompleted).toBe(2)
    expect(f.classicCompleted).toBe(1)
    expect(f.completed).toBe(4)
  })

  it('counts rated, favorites and series', () => {
    const f = facts({
      entries: [mk({ rating: 8, pinnedAt: '2026-01-01T00:00:00Z' }), mk({ rating: 0 }), mk(), mk({ pinnedAt: '2026-01-02T00:00:00Z' })],
    })
    expect(f).toMatchObject({ rated: 2, favorites: 2, series: 4 })
  })
})

describe('newlyUnlocked', () => {
  it('returns met ids that are not already unlocked, ignoring unknown ids', () => {
    const ev = evaluate(facts({ entries: [mk({ watchedEpisodes: [1] })] }))
    expect(newlyUnlocked(ev, {})).toEqual(['first-episode'])
    expect(newlyUnlocked(ev, { 'first-episode': '2026-01-01T00:00:00Z', bogus: 'x' })).toEqual([])
  })
})
