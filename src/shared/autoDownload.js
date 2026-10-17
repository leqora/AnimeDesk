// Pure auto-download logic. Only episode numbers and times ever come out of here — never an episode
// title, image or description.
import { airedCount } from './airing.js'

// Sources lag behind AniList's airing time; wait this long after airingAt before fetching a just-aired episode.
export const SOURCE_LAG_MS = 20 * 60 * 1000
export const MAX_PER_CHECK = 3
export const GIVE_UP_MS = 3 * 24 * 3600 * 1000
export const RETRYABLE_ERRORS = ['episode-not-released', 'no-sources', 'blocked', 'unknown']

const RETRY_DELAYS_MIN = [30, 60, 120, 240]

export function maxWatched(entry) {
  return Math.max(0, ...(entry?.watchedEpisodes ?? []).filter(Number.isInteger))
}

// Boundary when the switch is turned on: everything aired or watched so far is "old".
export function initialAfter({ entry, info, now }) {
  return Math.max(airedCount(info, now) ?? 0, maxWatched(entry))
}

const eligible = (e) => e?.status === 'watching' && e.aniListId && e.aniCliTitle

export function autoDownloadCandidates({ entries, prefsFor, infoById, now, max = MAX_PER_CHECK }) {
  const out = []
  for (const e of entries ?? []) {
    if (!eligible(e)) continue
    const prefs = prefsFor(e.aniCliTitle)
    if (!prefs) continue
    const info = infoById?.[e.aniListId]
    let last = airedCount(info, now)
    if (last == null) continue
    // The episode that has just aired is held back until the source has had time to publish it.
    if (last === info.nextAiring.episode && now < info.nextAiring.airingAt + SOURCE_LAG_MS) last -= 1
    const watched = new Set(e.watchedEpisodes ?? [])
    const episodes = []
    for (let n = (prefs.after ?? 0) + 1; n <= last && episodes.length < max; n++) {
      if (!watched.has(n)) episodes.push(n)
    }
    if (episodes.length) out.push({ animeId: e.id, aniCliTitle: e.aniCliTitle, episodes })
  }
  return out
}

// Earliest moment a not-yet-eligible episode becomes fetchable, or null when nothing is pending.
export function nextCheckAt({ entries, prefsFor, infoById, now }) {
  let best = null
  for (const e of entries ?? []) {
    if (!eligible(e) || !prefsFor(e.aniCliTitle)) continue
    const at = infoById?.[e.aniListId]?.nextAiring?.airingAt
    if (at == null) continue
    const t = at + SOURCE_LAG_MS
    if (t > now && (best == null || t < best)) best = t
  }
  return best
}

// attempts = failures so far (>= 1)
export function retryDelayMs(attempts) {
  return (RETRY_DELAYS_MIN[attempts - 1] ?? 360) * 60_000
}

export function shouldGiveUp({ firstTriedAt, now }) {
  return now - firstTriedAt >= GIVE_UP_MS
}
