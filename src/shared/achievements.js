import { localDay, localHour, longestStreak } from './localTime.js'

const DEFAULT_EPISODE_MINUTES = 24

// Order = order on the Profile. `measure` is a key of the facts object.
export const ACHIEVEMENTS = [
  { id: 'first-episode', icon: 'play', goal: 1, measure: 'episodes' },
  { id: 'episodes-50', icon: 'play', goal: 50, measure: 'episodes' },
  { id: 'episodes-250', icon: 'play', goal: 250, measure: 'episodes' },
  { id: 'episodes-1000', icon: 'play', goal: 1000, measure: 'episodes' },
  { id: 'first-completed', icon: 'check', goal: 1, measure: 'completed' },
  { id: 'completed-10', icon: 'check', goal: 10, measure: 'completed' },
  { id: 'completed-50', icon: 'check', goal: 50, measure: 'completed' },
  { id: 'day-of-anime', icon: 'clock', goal: 24, measure: 'hours' },
  { id: 'hours-250', icon: 'clock', goal: 250, measure: 'hours' },
  { id: 'streak-7', icon: 'flame', goal: 7, measure: 'longestStreak' },
  { id: 'streak-30', icon: 'flame', goal: 30, measure: 'longestStreak' },
  { id: 'marathon', icon: 'zap', goal: 12, measure: 'maxPerDay' },
  { id: 'night-owl', icon: 'moon', goal: 10, measure: 'night' },
  { id: 'early-bird', icon: 'sunrise', goal: 10, measure: 'early' },
  { id: 'genre-explorer', icon: 'compass', goal: 10, measure: 'genres' },
  { id: 'movie-night', icon: 'film', goal: 3, measure: 'movies' },
  { id: 'long-haul', icon: 'mountain', goal: 1, measure: 'longCompleted' },
  { id: 'classic', icon: 'landmark', goal: 1, measure: 'classicCompleted' },
  { id: 'critic', icon: 'star', goal: 10, measure: 'rated' },
  { id: 'favorites-5', icon: 'heart', goal: 5, measure: 'favorites' },
  { id: 'collector', icon: 'library', goal: 25, measure: 'series' },
]

export function achievementFacts({ entries, log, infoById = {}, tzOffsetAt }) {
  let episodes = 0, completed = 0, minutes = 0, movies = 0, longCompleted = 0, classicCompleted = 0
  let rated = 0, favorites = 0
  const genres = new Set()
  for (const e of entries) {
    const watched = e.watchedEpisodes.length
    const info = infoById[e.id]
    episodes += watched
    minutes += watched * (info?.duration || DEFAULT_EPISODE_MINUTES)
    if (e.rating != null) rated++
    if (e.pinnedAt) favorites++
    if (watched >= 1) {
      for (const g of info?.genres ?? []) genres.add(g)
      if (info?.format === 'MOVIE') movies++
    }
    if (e.status === 'completed') {
      completed++
      if ((info?.episodes ?? watched) >= 100) longCompleted++
      if (typeof info?.year === 'number' && info.year < 2000) classicCompleted++
    }
  }

  const perDay = new Map()
  let night = 0, early = 0
  for (const item of log) {
    if (item.source !== 'auto') continue
    const tz = tzOffsetAt(item.at)
    const day = localDay(item.at, tz)
    if (day === null) continue
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
    const hour = localHour(item.at, tz)
    if (hour <= 4) night++
    else if (hour <= 8) early++
  }

  return {
    episodes,
    completed,
    hours: minutes / 60,
    longestStreak: longestStreak(perDay.keys()),
    maxPerDay: Math.max(0, ...perDay.values()),
    night,
    early,
    genres: genres.size,
    movies,
    longCompleted,
    classicCompleted,
    rated,
    favorites,
    series: entries.length,
  }
}

export const evaluate = (facts) => ACHIEVEMENTS.map(({ id, icon, goal, measure }) => {
  const value = facts[measure]
  return { id, icon, goal, value, met: value >= goal }
})

export const newlyUnlocked = (evaluated, unlocked) => evaluated
  .filter((a) => a.met && !Object.hasOwn(unlocked, a.id))
  .map((a) => a.id)
