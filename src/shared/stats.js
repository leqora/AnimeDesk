import { localDay, localHour, shiftDay, mondayOf, longestStreak } from './localTime.js'

const TITLES = [[50, 'legend'], [35, 'sensei'], [20, 'elite'], [10, 'veteran'], [5, 'watcher'], [1, 'rookie']]
const DEFAULT_EPISODE_MINUTES = 24

export const xpNeeded = (level) => (level <= 1 ? 0 : Math.round(100 * (level - 1) ** 1.5))
export const titleFor = (level) => TITLES.find(([min]) => level >= min)[1]

export function levelForXp(xp) {
  let level = 1
  while (xpNeeded(level + 1) <= xp) level++
  const base = xpNeeded(level)
  return { level, title: titleFor(level), xpIntoLevel: xp - base, xpForNext: xpNeeded(level + 1) - base }
}

export function xpFor(entries) {
  return entries.reduce((sum, e) => sum
    + 10 * e.watchedEpisodes.length
    + (e.status === 'completed' ? 50 : 0)
    + (e.rating != null ? 5 : 0), 0)
}

export function computeStats({ entries, log, infoById = {}, now, tzOffsetMinutes, tzOffsetAt = () => tzOffsetMinutes ?? 0 }) {
  const xp = xpFor(entries)
  const episodes = entries.reduce((s, e) => s + e.watchedEpisodes.length, 0)
  const minutes = entries.reduce((s, e) => s + e.watchedEpisodes.length * (infoById[e.id]?.duration || DEFAULT_EPISODE_MINUTES), 0)
  const rated = entries.filter((e) => e.rating != null)

  const genreCount = new Map()
  for (const e of entries) {
    for (const g of infoById[e.id]?.genres ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + e.watchedEpisodes.length)
  }
  const topGenres = [...genreCount]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([genre, n]) => ({ genre, episodes: n }))

  const today = localDay(now, tzOffsetAt(now))
  const thisWeek = mondayOf(today)
  const weekMinutes = new Map(Array.from({ length: 12 }, (_, i) => [shiftDay(thisWeek, (i - 11) * 7), 0]))
  const monthPrefix = today.slice(0, 7)
  const since90 = shiftDay(today, -89)
  const titleById = new Map(entries.map((e) => [e.id, e.title]))
  const aniListById = new Map(entries.map((e) => [e.id, e.aniListId ?? null]))
  const monthCount = new Map()
  const timeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0, total: 0 }
  const autoDays = new Set()

  const perDay = new Map()
  for (const item of log) {
    const tz = tzOffsetAt(item.at)
    const day = localDay(item.at, tz)
    if (day === null) continue
    perDay.set(day, (perDay.get(day) ?? 0) + 1)

    const week = mondayOf(day)
    if (weekMinutes.has(week)) weekMinutes.set(week, weekMinutes.get(week) + (infoById[item.animeId]?.duration || DEFAULT_EPISODE_MINUTES))
    if (day.startsWith(monthPrefix) && titleById.has(item.animeId)) monthCount.set(item.animeId, (monthCount.get(item.animeId) ?? 0) + 1)
    if (item.source === 'auto') {
      autoDays.add(day)
      if (day >= since90 && day <= today) {
        const h = localHour(item.at, tz)
        timeOfDay[h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night']++
        timeOfDay.total++
      }
    }
  }
  const weeklyHours = [...weekMinutes].map(([start, m]) => ({ start, hours: Math.round(m / 6) / 10 }))
  const topThisMonth = [...monthCount]
    .map(([animeId, n]) => ({ animeId, title: titleById.get(animeId), aniListId: aniListById.get(animeId), episodes: n }))
    .sort((a, b) => b.episodes - a.episodes || a.title.localeCompare(b.title))
    .slice(0, 3)
  const activity = Array.from({ length: 28 }, (_, i) => {
    const date = shiftDay(today, i - 27)
    return { date, count: perDay.get(date) ?? 0 }
  })
  let day = perDay.has(today) ? today : perDay.has(shiftDay(today, -1)) ? shiftDay(today, -1) : null
  let streakDays = 0
  while (day && perDay.has(day)) { streakDays++; day = shiftDay(day, -1) }

  return {
    xp,
    ...levelForXp(xp),
    episodes,
    hours: Math.round(minutes / 60),
    completed: entries.filter((e) => e.status === 'completed').length,
    avgRating: rated.length ? Math.round((rated.reduce((s, e) => s + e.rating, 0) / rated.length) * 10) / 10 : null,
    topGenres,
    streakDays,
    activity,
    longestStreak: longestStreak(autoDays),
    weeklyHours,
    timeOfDay,
    topThisMonth,
    achievements: [],
  }
}

export const EMPTY_STATS = computeStats({ entries: [], log: [], now: '2000-01-01T00:00:00Z' })
