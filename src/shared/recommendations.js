// Pure rules for the recommendations rail and the "Similar" section: no imports from main/renderer, no I/O.
import { normTitle } from './sequels.js'

// Bump when any rule below changes (the cache drops results of older rules).
export const RULES_VERSION = 1
export const MAX_SEEDS = 50
export const MAX_RAIL = 20
export const MAX_SIMILAR = 8
export const FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA']
export const STATUSES = ['FINISHED', 'RELEASING']

const SERIES_FORMATS = ['TV', 'TV_SHORT', 'ONA']
const LATER_PART_RES = [
  /\b(season|part|cour)\s*([2-9]|\d{2,})\b/i,
  /\b\d+(nd|rd|th)\s+season\b/i,
  /\b(2nd|3rd)\s+stage\b/i,
  /\bII\b/,
]
const PV_RE = /\bPV\b/

// AniList media (fields of spec point 7, relationType already v2) -> rule input.
export function toCase(media) {
  const edges = Array.isArray(media?.relations?.edges) ? media.relations.edges : []
  const anime = edges.filter((e) => e?.node?.type === 'ANIME')
  const romaji = media?.title?.romaji ?? null
  const english = media?.title?.english ?? null
  return {
    title: english ?? romaji,
    romaji,
    format: media?.format ?? null,
    status: media?.status ?? null,
    year: media?.seasonYear ?? null,
    isAdult: media?.isAdult === true,
    prequels: anime
      .filter((e) => e.relationType === 'PREQUEL')
      .map((e) => ({ format: e.node.format ?? null, year: e.node.seasonYear ?? null })),
    parent: anime.some((e) => e.relationType === 'PARENT'),
  }
}

export function isLaterPart(c) {
  const year = c?.year ?? null
  for (const p of c?.prequels || []) {
    const py = p?.year ?? null
    if (SERIES_FORMATS.includes(p?.format) && (py == null || year == null || py <= year)) return true
    if (py != null && year != null && py < year) return true
  }
  return [c?.title, c?.romaji].some((t) => typeof t === 'string' && LATER_PART_RES.some((re) => re.test(t)))
}

export function isSideStory(c) {
  if (c?.parent === true) return true
  return [c?.title, c?.romaji].some((t) => typeof t === 'string' && PV_RE.test(t))
}

export function eligible(c) {
  return (
    FORMATS.includes(c?.format) &&
    STATUSES.includes(c?.status) &&
    c?.isAdult !== true &&
    !isLaterPart(c) &&
    !isSideStory(c)
  )
}

export function libraryIds(entries, getCachedId) {
  const ids = new Set()
  for (const e of entries || []) {
    const id = e.aniListId ?? getCachedId?.(e.title) ?? null
    if (id != null) ids.add(id)
  }
  return ids
}

export function libraryTitles(entries) {
  const titles = new Set()
  for (const e of entries || []) {
    for (const t of [e.aniCliTitle, e.title]) {
      const k = normTitle(t)
      if (k) titles.add(k)
    }
  }
  return titles
}

export function inLibrary(item, ids, titles) {
  if (ids.has(item.id)) return true
  return [item.romaji, item.english].some((t) => {
    const k = normTitle(t)
    return k !== '' && titles.has(k)
  })
}

const time = (iso) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? 0 : t
}

function seedWeight(e) {
  if (typeof e.rating === 'number') {
    if (e.rating >= 8) return 3
    if (e.rating >= 7) return 2
    return 0
  }
  if (e.status === 'completed') return 2
  if (e.status === 'watching') return 1
  return 0
}

export function seedsFrom(entries, getCachedId) {
  const cands = []
  for (const e of entries || []) {
    const id = e.aniListId ?? getCachedId?.(e.title) ?? null
    if (id == null) continue
    const weight = seedWeight(e)
    if (weight > 0) cands.push({ id, weight, entryId: e.id, title: e.title, lw: time(e.lastWatchedAt), up: time(e.updatedAt) })
  }
  cands.sort((a, b) => b.weight - a.weight || b.lw - a.lw || b.up - a.up)
  const seen = new Set()
  const out = []
  for (const s of cands) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push({ id: s.id, weight: s.weight, entryId: s.entryId, title: s.title })
  }
  return out.slice(0, MAX_SEEDS)
}

function excluder(entries, hidden, getCachedId) {
  const ids = libraryIds(entries, getCachedId)
  const titles = libraryTitles(entries)
  const hide = new Set(hidden || [])
  return (item) => !item.eligible || hide.has(item.id) || inLibrary(item, ids, titles)
}

export function pickPersonal(seeds, recsBySeed, entries, hidden, getCachedId) {
  const excluded = excluder(entries, hidden, getCachedId)
  const seedIds = new Set((seeds || []).map((s) => s.id))
  const acc = new Map()
  for (const seed of seeds || []) {
    for (const item of recsBySeed?.[seed.id] || []) {
      if (!(item.rating > 0) || seedIds.has(item.id) || excluded(item)) continue
      const contrib = seed.weight * (10 - item.rank)
      let a = acc.get(item.id)
      if (!a) {
        a = { item, score: 0, ratingSum: 0, best: -Infinity, seed: null }
        acc.set(item.id, a)
      }
      a.score += contrib
      a.ratingSum += item.rating
      if (contrib > a.best) {
        a.best = contrib
        a.seed = seed
        a.item = item
      }
    }
  }
  return [...acc.values()]
    .sort((a, b) => b.score - a.score || b.ratingSum - a.ratingSum || a.item.id - b.item.id)
    .slice(0, MAX_RAIL)
    .map((a) => ({ ...a.item, fromTitle: a.seed.title, fromId: a.seed.entryId }))
}

export function pickTrending(items, entries, hidden, getCachedId) {
  const excluded = excluder(entries, hidden, getCachedId)
  return (items || [])
    .filter((i) => !excluded(i))
    .slice(0, MAX_RAIL)
    .map((i) => ({ ...i, fromTitle: null, fromId: null }))
}

export function pickSimilar(recs, entries, hidden, getCachedId) {
  const excluded = excluder(entries, hidden, getCachedId)
  return (recs || []).filter((i) => i.rating > 0 && !excluded(i)).slice(0, MAX_SIMILAR)
}

export function decideMode(seeds, personal) {
  const hasSeeds = (seeds || []).length > 0
  if (hasSeeds && (personal || []).length > 0) return { mode: 'personal', hint: false }
  return { mode: 'trending', hint: !hasSeeds }
}
