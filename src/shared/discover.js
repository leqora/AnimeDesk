// Pure rules for the Discover page: no I/O, no imports from main/renderer.
// Only title/poster/year/format/episode count/genres of a series; nothing about single episodes (spec point 9).
import { FORMATS, isLaterPart, isSideStory } from './recommendations.js'

export const RAIL_KEYS = ['season', 'upcoming', 'movies', 'trending']
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
const SURPRISE_STATUSES = ['RELEASING', 'FINISHED']
const collator = new Intl.Collator('en', { sensitivity: 'base' })

// Local month: Jan-Mar winter, Apr-Jun spring, Jul-Sep summer, Oct-Dec fall.
export function seasonOf(nowMs) {
  const d = new Date(nowMs)
  return { season: SEASONS[Math.floor(d.getMonth() / 3)], year: d.getFullYear() }
}

export function nextSeason({ season, year }) {
  const i = SEASONS.indexOf(season)
  return i === SEASONS.length - 1 ? { season: SEASONS[0], year: year + 1 } : { season: SEASONS[i + 1], year }
}

// c has the toCase shape. Same functions as the recommendations rules; `eligible` is not used because it
// only allows FINISHED/RELEASING and the "upcoming" rail is NOT_YET_RELEASED.
export function shownInDiscover(c) {
  return (
    FORMATS.includes(c?.format) &&
    c?.status !== 'CANCELLED' &&
    c?.isAdult !== true &&
    !isLaterPart(c) &&
    !isSideStory(c)
  )
}

export function buildRails(raw, { max = 20, isInLibrary = () => false } = {}) {
  const seen = new Set()
  const rails = {}
  for (const key of RAIL_KEYS) {
    const out = []
    for (const item of Array.isArray(raw?.[key]) ? raw[key] : []) {
      if (seen.has(item.id) || !(item.shown === true || isInLibrary(item))) continue
      seen.add(item.id)
      out.push(item)
    }
    rails[key] = out.slice(0, max)
  }
  return rails
}

export function genreOptions(rails) {
  const set = new Set()
  for (const key of RAIL_KEYS) for (const item of rails?.[key] || []) for (const g of item.genres || []) set.add(g)
  return [...set].sort(collator.compare)
}

export function filterRails(rails, genre) {
  if (genre == null) return rails
  const out = {}
  for (const key of RAIL_KEYS) out[key] = (rails?.[key] || []).filter((i) => (i.genres || []).includes(genre))
  return out
}

export function surprisePool(rails, isInLibrary, hiddenIds = []) {
  const hidden = new Set(hiddenIds)
  return ['season', 'movies', 'trending']
    .flatMap((key) => rails?.[key] || [])
    .filter((i) => SURPRISE_STATUSES.includes(i.status) && !hidden.has(i.id) && !isInLibrary(i))
}

export function pickSurprise(pool, lastId, random = Math.random) {
  if (!pool.length) return null
  const choices = pool.length >= 2 ? pool.filter((i) => i.id !== lastId) : pool
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
}
