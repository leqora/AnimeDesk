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

// Highest episode known to have aired. AniList drops nextAiring after a finale, in a split-cour gap or a
// hiatus, so the schedule last seen (record.next) and a finished series' episode count fill in.
export function knownAired(info, record, now) {
  const fromCache = airedCount(info, now)
  if (fromCache != null) return fromCache
  const next = record?.next
  const remembered = next && now >= next.airingAt ? next.episode : null
  // A series that finished while the app was off has a remembered schedule older than its finale.
  if (info?.status === 'FINISHED' && Number.isInteger(info.episodes)) return Math.max(info.episodes, remembered ?? 0)
  return remembered
}

// Boundary when the switch is turned on: everything aired or watched so far is "old".
export function initialAfter({ entry, info, now }) {
  return Math.max(knownAired(info, null, now) ?? 0, maxWatched(entry))
}

// The record stored when the switch is turned on. With no known schedule yet it is pending: the boundary
// moves to the aired count once that is known, so a whole backlog is never fetched later.
export function initialRecord({ entry, info, now }) {
  if (knownAired(info, null, now) == null) return { after: maxWatched(entry), pending: true }
  return { after: initialAfter({ entry, info, now }) }
}

const eligible = (e) => e?.status === 'watching' && e.aniListId && e.aniCliTitle
// A prefs record without a sane boundary must not make the series fetch everything from episode 1.
// A pending record waits for a known schedule and never hands anything.
const usable = (p) => Number.isInteger(p?.after) && p.after >= 0 && p.pending !== true
const inLag = (s, now) => s?.airingAt != null && now < s.airingAt + SOURCE_LAG_MS

export function autoDownloadCandidates({ entries, prefsFor, infoById, now, max = MAX_PER_CHECK }) {
  const out = []
  for (const e of entries ?? []) {
    if (!eligible(e)) continue
    const prefs = prefsFor(e.aniCliTitle)
    if (!usable(prefs)) continue
    const info = infoById?.[e.aniListId]
    let last = knownAired(info, prefs, now)
    if (last == null) continue
    // The episode that has just aired is held back until the source has had time to publish it, also when
    // the cache already moved on to the next one (then only the remembered schedule knows its airing time).
    const held = [info?.nextAiring, prefs.next].filter((s) => inLag(s, now))
    // Everything from the lowest held episode up waits too: a finished count can already go past it.
    for (const s of held) if (Number.isInteger(s.episode) && last >= s.episode) last = s.episode - 1
    const episodes = []
    // Everything up to the highest watched episode counts as handled, not just the exact numbers.
    for (let n = Math.max(prefs.after, maxWatched(e)) + 1; n <= last && episodes.length < max; n++) episodes.push(n)
    if (episodes.length) out.push({ animeId: e.id, aniCliTitle: e.aniCliTitle, episodes })
  }
  return out
}

// Earliest moment a not-yet-eligible episode becomes fetchable, or null when nothing is pending.
export function nextCheckAt({ entries, prefsFor, infoById, now }) {
  let best = null
  for (const e of entries ?? []) {
    if (!eligible(e)) continue
    const prefs = prefsFor(e.aniCliTitle)
    if (!usable(prefs)) continue
    for (const next of [infoById?.[e.aniListId]?.nextAiring, prefs.next]) {
      // Nothing to wake up for when that episode is already handed over or watched.
      if (next?.airingAt == null || !(next.episode > Math.max(prefs.after, maxWatched(e)))) continue
      const t = next.airingAt + SOURCE_LAG_MS
      if (t > now && (best == null || t < best)) best = t
    }
  }
  return best
}

// attempts = failures so far (>= 1)
export function retryDelayMs(attempts) {
  return (RETRY_DELAYS_MIN[attempts - 1] ?? 360) * 60_000
}

export function shouldGiveUp({ firstTriedAt, now }) {
  // Fail closed: a corrupt timestamp must never mean retrying forever.
  return !Number.isFinite(firstTriedAt) || now - firstTriedAt >= GIVE_UP_MS
}
