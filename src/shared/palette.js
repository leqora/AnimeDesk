// Pure ranking rules for the Ctrl+K command palette (no I/O).
import { foldText } from './watchlistFilter.js'

export function looseText(s) {
  return foldText(s)
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compactText(s) {
  return looseText(s).replace(/ /g, '')
}

export function isBlankQuery(query) {
  return looseText(query) === ''
}

// 1 equal, 2 prefix, 3 word start, 4 substring, 5 compact prefix, 6 compact substring
export function matchLevel(query, text) {
  const q = looseText(query)
  if (!q) return null
  const t = looseText(text)
  if (t === q) return 1
  if (t.startsWith(q)) return 2
  if (t.includes(' ' + q)) return 3
  if (t.includes(q)) return 4
  const cq = q.replace(/ /g, '')
  const ct = t.replace(/ /g, '')
  if (ct.startsWith(cq)) return 5
  if (ct.includes(cq)) return 6
  return null
}

// Most recent first; entries without a date go last.
function byRecent(a, b) {
  const x = a.lastWatchedAt
  const y = b.lastWatchedAt
  if (x && y) return String(y).localeCompare(String(x))
  if (x) return -1
  if (y) return 1
  return 0
}

export function rankSeries(entries, facets, query, limit = 8) {
  if (isBlankQuery(query)) return []
  const ranked = []
  for (const e of entries) {
    let best = null
    for (const text of [e.title, e.aniCliTitle, facets?.[e.id]?.romaji]) {
      if (!text) continue
      const lvl = matchLevel(query, text)
      if (lvl != null && (best == null || lvl < best)) best = lvl
    }
    if (best != null) ranked.push({ e, lvl: best })
  }
  ranked.sort((a, b) =>
    a.lvl - b.lvl ||
    byRecent(a.e, b.e) ||
    (a.e.title || '').length - (b.e.title || '').length ||
    (a.e.title || '').localeCompare(b.e.title || ''))
  return ranked.slice(0, limit).map(r => r.e)
}

export function continueSeries(entries, limit = 5) {
  return entries
    .filter(e => e.status === 'watching')
    .sort((a, b) => byRecent(a, b) || (a.title || '').localeCompare(b.title || ''))
    .slice(0, limit)
}

export function filterByLabel(items, query) {
  if (isBlankQuery(query)) return items
  return items.filter(i => matchLevel(query, i.label) != null)
}
