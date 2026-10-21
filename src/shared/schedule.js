// Pure rules for the weekly airing schedule: no I/O, no imports from main/renderer.
// Only episode numbers and air times are handled here (no spoilers).
import { isLaterPart, isSideStory } from './recommendations.js'
import { normTitle } from './sequels.js'

export const DAYS = 7

/** A poster may be shown/downloaded only for non-adult first parts. `c` is the toCase shape. */
export function posterAllowed(c) {
  return c?.isAdult !== true && !isLaterPart(c) && !isSideStory(c)
}

/** Whether a series belongs in the "All" view. */
export function shownInAll(c) {
  return c?.isAdult !== true && c?.format !== 'MUSIC'
}

/** 7 local days from today's local midnight; calendar arithmetic keeps DST days 23/25 h long. */
export function dayWindow(nowMs) {
  const n = new Date(nowMs)
  const y = n.getFullYear()
  const m = n.getMonth()
  const d = n.getDate()
  const days = []
  for (let i = 0; i < DAYS; i++) days.push(new Date(y, m, d + i).getTime())
  return { from: days[0], to: new Date(y, m, d + DAYS).getTime(), days }
}

/**
 * Whether the clock changes inside [dayStart, dayEnd): 'back' (offset grows, e.g. CEST -> CET),
 * 'forward', or null. A switch exactly at dayStart leaves the whole day in the new offset.
 */
export function clockChange(dayStart, dayEnd, offsetAt = (ms) => new Date(ms).getTimezoneOffset()) {
  const a = offsetAt(dayStart)
  const b = offsetAt(dayEnd - 1)
  return b > a ? 'back' : b < a ? 'forward' : null
}

// One fixed collator: the order never depends on the system language.
const titleCollator = new Intl.Collator('en', { sensitivity: 'base' })

/** One row per media for airings in [dayStart, dayEnd), sorted by time, title, then mediaId. */
export function groupDay(items, dayStart, dayEnd) {
  const byMedia = new Map()
  for (const it of items || []) {
    if (!(it.airingAt >= dayStart && it.airingAt < dayEnd)) continue
    const row = byMedia.get(it.mediaId)
    if (!row) {
      byMedia.set(it.mediaId, {
        mediaId: it.mediaId,
        title: it.title,
        romaji: it.romaji,
        format: it.format,
        entryId: it.entryId ?? null,
        posterHidden: !!it.posterHidden,
        airingAt: it.airingAt,
        episodes: [it.episode, it.episode],
      })
      continue
    }
    if (it.airingAt < row.airingAt) row.airingAt = it.airingAt
    if (it.episode < row.episodes[0]) row.episodes[0] = it.episode
    if (it.episode > row.episodes[1]) row.episodes[1] = it.episode
  }
  return [...byMedia.values()].sort(
    (a, b) => a.airingAt - b.airingAt ||
      titleCollator.compare(a.title ?? a.romaji ?? '', b.title ?? b.romaji ?? '') ||
      a.mediaId - b.mediaId,
  )
}

/** Library entry for a schedule item, or null. Dropped entries never match; id beats title. */
export function libraryMatch(item, entries, getCachedId) {
  const live = (entries || []).filter((e) => e && e.status !== 'dropped')
  for (const e of live) {
    const id = e.aniListId ?? getCachedId?.(e.title) ?? null
    if (id != null && id === item.mediaId) return e
  }
  const keys = [item.romaji, item.english, item.title].map(normTitle).filter(Boolean)
  for (const e of live) {
    for (const t of [e.aniCliTitle, e.title]) {
      const k = normTitle(t)
      if (k !== '' && keys.includes(k)) return e
    }
  }
  return null
}
