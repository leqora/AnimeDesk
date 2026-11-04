import { describe, it, expect } from 'vitest'
import { xpNeeded, titleFor, levelForXp, xpFor, computeStats, EMPTY_STATS } from '../../src/shared/stats.js'

const e = (over) => ({ id: 'a', title: 'A', status: 'watching', rating: null, watchedEpisodes: [], ...over })
const NOW = '2026-10-02T08:00:00Z'

describe('levels', () => {
  it('uses round(100 × (L−1)^1.5) total XP per level', () => {
    expect(xpNeeded(1)).toBe(0)
    expect(xpNeeded(2)).toBe(100)
    expect(xpNeeded(10)).toBe(2700)
    expect(xpNeeded(50)).toBe(34300)
  })
  it('maps levels to titles at the agreed thresholds', () => {
    expect([1, 4, 5, 9, 10, 19, 20, 34, 35, 49, 50, 80].map(titleFor)).toEqual(
      ['rookie', 'rookie', 'watcher', 'watcher', 'veteran', 'veteran', 'elite', 'elite', 'sensei', 'sensei', 'legend', 'legend'])
  })
  it('finds level and progress inside the level', () => {
    expect(levelForXp(0)).toEqual({ level: 1, title: 'rookie', xpIntoLevel: 0, xpForNext: 100 })
    expect(levelForXp(99).level).toBe(1)
    expect(levelForXp(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: xpNeeded(3) - 100 })
    expect(levelForXp(2750)).toMatchObject({ level: 10, title: 'veteran', xpIntoLevel: 50 })
  })
  it('computes XP from episodes, completed and rated series', () => {
    expect(xpFor([e({ watchedEpisodes: [1, 2, 3] }), e({ status: 'completed', rating: 9, watchedEpisodes: [1] })])).toBe(30 + 10 + 50 + 5)
  })
  it('unwatching an episode lowers XP', () => {
    expect(xpFor([e({ watchedEpisodes: [1, 2] })])).toBeLessThan(xpFor([e({ watchedEpisodes: [1, 2, 3] })]))
  })
})

describe('computeStats', () => {
  it('returns a clean level 1 profile for a new install', () => {
    const s = computeStats({ entries: [], log: [], now: NOW })
    expect(s).toMatchObject({ xp: 0, level: 1, title: 'rookie', episodes: 0, hours: 0, completed: 0, avgRating: null, topGenres: [], streakDays: 0 })
    expect(s.activity).toHaveLength(28)
    expect(s.activity.at(-1)).toEqual({ date: '2026-10-02', count: 0 })
    expect(s.activity[0].date).toBe('2026-09-05')
  })
  it('estimates hours from AniList duration or 24 minutes', () => {
    const entries = [e({ id: 'a', watchedEpisodes: [1, 2] }), e({ id: 'b', watchedEpisodes: [1, 2, 3, 4, 5] })]
    const s = computeStats({ entries, log: [], infoById: { a: { duration: 45, genres: [] } }, now: NOW })
    expect(s.hours).toBe(Math.round((2 * 45 + 5 * 24) / 60))
  })
  it('averages ratings with one decimal, ignoring unrated', () => {
    const s = computeStats({ entries: [e({ rating: 8 }), e({ rating: 7 }), e({ rating: null })], log: [], now: NOW })
    expect(s.avgRating).toBe(7.5)
  })
  it('ranks genres by watched episodes and keeps the top 5', () => {
    const entries = [e({ id: 'a', watchedEpisodes: [1, 2, 3] }), e({ id: 'b', watchedEpisodes: [1] }), e({ id: 'c', watchedEpisodes: [1, 2] })]
    const infoById = {
      a: { genres: ['Action', 'Drama', 'G1', 'G2', 'G3', 'G4'] },
      b: { genres: ['Comedy'] },
      c: { genres: ['Drama'] },
    }
    const s = computeStats({ entries, log: [], infoById, now: NOW })
    expect(s.topGenres[0]).toEqual({ genre: 'Drama', episodes: 5 })
    expect(s.topGenres).toHaveLength(5)
    expect(s.topGenres.map((g) => g.genre)).not.toContain('Comedy')
  })
  it('counts by local day across midnight', () => {
    // 22:30 UTC is 00:30 the next day in CEST (offset -120)
    const log = [{ animeId: 'a', episode: 1, at: '2026-10-01T22:30:00Z' }]
    const s = computeStats({ entries: [], log, now: NOW, tzOffsetMinutes: -120 })
    expect(s.activity.at(-1)).toEqual({ date: '2026-10-02', count: 1 })
    expect(s.streakDays).toBe(1)
  })
  it('keeps a streak alive through yesterday and breaks it after a gap', () => {
    const at = (d) => ({ animeId: 'a', episode: 1, at: `${d}T12:00:00Z` })
    expect(computeStats({ entries: [], log: [at('2026-10-02'), at('2026-10-01'), at('2026-09-29')], now: NOW }).streakDays).toBe(2)
    expect(computeStats({ entries: [], log: [at('2026-10-01'), at('2026-09-30')], now: NOW }).streakDays).toBe(2)
    expect(computeStats({ entries: [], log: [at('2026-09-30')], now: NOW }).streakDays).toBe(0)
  })
  it('skips log entries with an unparsable timestamp', () => {
    const log = [{ animeId: 'a', episode: 1, at: 'garbage' }, { animeId: 'a', episode: 2, at: '2026-10-02T12:00:00Z' }]
    const s = computeStats({ entries: [], log, now: NOW })
    expect(s.activity.at(-1).count).toBe(1)
  })
  it('uses the offset in effect at each entry (DST)', () => {
    // CEST (-120) until 2026-10-25T01:00Z, CET (-60) afterwards
    const tzOffsetAt = (iso) => (Date.parse(iso) < Date.parse('2026-10-25T01:00:00Z') ? -120 : -60)
    // 22:30 UTC on 10-04 is 00:30 on 10-05 in CEST, even though "now" is already on CET
    const log = [{ animeId: 'a', episode: 1, at: '2026-10-04T22:30:00Z' }]
    const s = computeStats({ entries: [], log, now: '2026-10-30T12:00:00Z', tzOffsetAt })
    expect(s.activity.find((d) => d.date === '2026-10-05').count).toBe(1)
    expect(s.activity.find((d) => d.date === '2026-10-04').count).toBe(0)
  })
})

describe('computeStats v0.22 fields', () => {
  const N = '2026-11-04T12:00:00Z'
  const base = { now: N, tzOffsetMinutes: -60 }
  const li = (at, over = {}) => ({ animeId: 'a', episode: 1, at, source: 'auto', ...over })
  const infoById = { a: { duration: 24 } }

  it('EMPTY_STATS has the new fields', () => {
    expect(EMPTY_STATS.weeklyHours).toHaveLength(12)
    expect(EMPTY_STATS.weeklyHours.every((w) => w.hours === 0)).toBe(true)
    EMPTY_STATS.weeklyHours.forEach((w, i, arr) => {
      expect(new Date(`${w.start}T00:00:00Z`).getUTCDay()).toBe(1)
      if (i) expect(Date.parse(`${w.start}T00:00:00Z`) - Date.parse(`${arr[i - 1].start}T00:00:00Z`)).toBe(7 * 86400000)
    })
    expect(EMPTY_STATS.achievements).toEqual([])
    expect(EMPTY_STATS.timeOfDay.total).toBe(0)
    expect(EMPTY_STATS.topThisMonth).toEqual([])
    expect(EMPTY_STATS.longestStreak).toBe(0)
  })

  it('weekly hours bucket by Monday week, ignore older than 12 weeks', () => {
    const log = [1, 2, 3, 4, 5].map((n) => li('2026-11-03T10:00:00Z', { episode: n }))
    log.push(li('2026-10-26T10:00:00Z'), li('2026-08-01T10:00:00Z'))
    const s = computeStats({ ...base, entries: [e({ id: 'a' })], log, infoById })
    expect(s.weeklyHours[11]).toEqual({ start: '2026-11-02', hours: 2 })
    expect(s.weeklyHours[10].start).toBe('2026-10-26')
    expect(s.weeklyHours[10].hours).toBe(0.4)
    expect(s.weeklyHours.reduce((t, w) => t + w.hours, 0)).toBeCloseTo(2.4)
  })

  it('weekly hours respect DST via tzOffsetAt', () => {
    const tzOffsetAt = (iso) => (Date.parse(iso) < Date.parse('2026-10-25T01:00:00Z') ? -120 : -60)
    const s = computeStats({ entries: [], log: [li('2026-10-25T23:30:00Z')], now: N, tzOffsetAt, infoById })
    expect(s.weeklyHours.find((w) => w.start === '2026-10-26').hours).toBe(0.4)
    expect(s.weeklyHours.find((w) => w.start === '2026-10-19').hours).toBe(0)
  })

  it('time of day buckets auto items in last 90 days only', () => {
    // tz -60 => local = UTC + 1h
    const at = (h, m = 0) => `2026-11-01T${String((h + 23) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
    const log = [at(5), at(11, 59), at(12), at(21, 59), at(22), at(4, 59),
      li(at(8), { source: 'manual' }), li('2026-08-01T08:00:00Z')].map((x) => (typeof x === 'string' ? li(x) : x))
    const s = computeStats({ ...base, entries: [], log })
    expect(s.timeOfDay).toEqual({ morning: 2, afternoon: 1, evening: 1, night: 2, total: 6 })
  })

  it('longestStreak counts auto only; streakDays unchanged', () => {
    const log = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-11-04'].map((d) => li(`${d}T10:00:00Z`))
    const s = computeStats({ ...base, entries: [], log })
    expect(s.longestStreak).toBe(3)
    expect(s.streakDays).toBe(1)
  })

  it('topThisMonth: top 3 by episodes then title, only known series in this month', () => {
    const entries = [e({ id: 'a', title: 'Zeta', aniListId: 77 }), e({ id: 'b', title: 'Alpha' }), e({ id: 'c', title: 'C' }), e({ id: 'd', title: 'D' })]
    const mk = (id, n, at = '2026-11-02T10:00:00Z') => Array.from({ length: n }, (_, i) => li(at, { animeId: id, episode: i + 1 }))
    const log = [...mk('a', 5), ...mk('b', 5), ...mk('c', 1), ...mk('d', 1), ...mk('c', 9, '2026-10-30T10:00:00Z'), ...mk('zz', 9)]
    const s = computeStats({ ...base, entries, log })
    expect(s.topThisMonth).toEqual([
      { animeId: 'b', title: 'Alpha', aniListId: null, episodes: 5 },
      { animeId: 'a', title: 'Zeta', aniListId: 77, episodes: 5 },
      { animeId: 'c', title: 'C', aniListId: null, episodes: 1 }])
  })
})
