// Airing schedule logic. Only episode numbers and times ever come out of here — never an episode
// title, image or description (those only reach the renderer through main's seriesEpisodes.js).

// After an episode airs, AniList moves nextAiringEpisode on; give it an hour before refetching.
export const AIRED_GRACE_MS = 3600 * 1000

export const ANILIST_STATUSES = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'HIATUS', 'CANCELLED']

// Self-correcting: once airingAt has passed, that episode counts as aired even if the cache is older.
export function airedCount(info, now) {
  const next = info?.nextAiring
  if (!next) return null
  return now >= next.airingAt ? next.episode : next.episode - 1
}

// "N new" = aired episodes after the highest watched one. Skipped episodes are not counted on purpose.
// Nothing watched yet (no integer episode >= 1) -> nothing new.
export function newEpisodeCount(entry, info, now) {
  if (entry?.status !== 'watching' || info?.status !== 'RELEASING' || info?.match === 'close') return 0
  const aired = airedCount(info, now)
  if (aired == null) return 0
  const watched = (entry.watchedEpisodes ?? []).filter((n) => Number.isInteger(n) && n >= 1)
  if (!watched.length) return 0
  const maxWatched = Math.max(...watched)
  return Math.max(0, aired - maxWatched)
}

// After airingAt the next episode is unknown until the cache refreshes, so nothing is shown.
export function upcoming(info, now) {
  const next = info?.match === 'close' ? null : info?.nextAiring
  return next && next.airingAt > now ? next : null
}

export function untilParts(ms) {
  if (!(ms >= 60_000)) return null
  const total = Math.floor(ms / 60_000)
  return { d: Math.floor(total / 1440), h: Math.floor((total % 1440) / 60), min: total % 60 }
}

export function untilKey(ms) {
  const p = untilParts(ms)
  if (!p) return { key: 'airing.soon', vars: {} }
  if (p.d >= 1) return p.h ? { key: 'airing.in.d', vars: { d: p.d, h: p.h } } : { key: 'airing.in.dOnly', vars: { d: p.d } }
  if (p.h >= 1) return p.min ? { key: 'airing.in.h', vars: { h: p.h, min: p.min } } : { key: 'airing.in.hOnly', vars: { h: p.h } }
  return { key: 'airing.in.min', vars: { min: p.min } }
}
