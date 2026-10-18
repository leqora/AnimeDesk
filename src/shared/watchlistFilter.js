// Pure watchlist search/filter/count/sort rules (no I/O, shared by the renderer).
import { STATUSES } from './domain.js'

export function foldText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchesQuery(entry, facet, query) {
  const q = foldText(query)
  if (!q) return true
  return [entry?.title, entry?.aniCliTitle, facet?.romaji].some((v) => foldText(v).includes(q))
}

function passes(entry, facets, { query = '', genre = 'all' }) {
  const facet = facets?.[entry.id]
  if (genre !== 'all' && !(facet?.genres ?? []).includes(genre)) return false
  return matchesQuery(entry, facet, query)
}

export function filterEntries(entries, { query = '', status = 'all', genre = 'all' } = {}, facets = {}) {
  return (entries ?? []).filter(
    (e) => (status === 'all' || e.status === status) && passes(e, facets, { query, genre })
  )
}

export function statusCounts(entries, { query = '', genre = 'all' } = {}, facets = {}) {
  const counts = { all: 0 }
  for (const s of STATUSES) counts[s] = 0
  for (const e of entries ?? []) {
    if (!passes(e, facets, { query, genre })) continue
    counts.all++
    if (STATUSES.includes(e.status)) counts[e.status]++
  }
  return counts
}

export function genreOptions(facets, entries, selected = 'all') {
  const set = new Set()
  for (const e of entries ?? []) for (const g of facets?.[e.id]?.genres ?? []) set.add(g)
  if (selected !== 'all') set.add(selected)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function sortItems(items, sort) {
  const copy = [...items]
  if (sort === 'rating') copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  else if (sort === 'lastWatched') copy.sort((a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? '')))
  else if (sort === 'added') copy.sort((a, b) => String(b.addedAt ?? '').localeCompare(String(a.addedAt ?? '')))
  else copy.sort((a, b) => a.title.localeCompare(b.title))
  return copy
}
