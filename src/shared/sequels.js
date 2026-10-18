// Pure rules for the "missed sequels" rail: no imports from main/renderer.
export const MAX_CARDS = 20
export const SHOWN_STATUSES = ['FINISHED', 'RELEASING']

export function normTitle(s) {
  return String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

export function sequelsFromMedia(media) {
  const edges = media?.relations?.edges
  if (!Array.isArray(edges)) return []
  const out = []
  for (const e of edges) {
    const n = e?.node
    if (!n || e.relationType !== 'SEQUEL' || n.type !== 'ANIME') continue
    if (!SHOWN_STATUSES.includes(n.status) || n.format === 'MUSIC') continue
    const romaji = n.title?.romaji ?? null
    const english = n.title?.english ?? null
    out.push({
      id: n.id,
      title: english ?? romaji,
      romaji,
      english,
      format: n.format ?? null,
      status: n.status,
      year: n.seasonYear ?? null,
      episodes: n.episodes ?? null,
      coverUrl: n.coverImage?.large ?? null,
    })
  }
  return out
}

export function sourceIds(entries, getCachedId) {
  const out = []
  for (const entry of entries || []) {
    if (entry.status !== 'completed') continue
    const prequelId = entry.aniListId ?? getCachedId?.(entry.title) ?? null
    if (prequelId != null) out.push({ entry, prequelId })
  }
  return out
}

const time = (iso) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? 0 : t
}

export function pickMissedSequels(entries, sequelsById, hidden, getCachedId) {
  const hide = new Set(hidden || [])
  const libIds = new Set()
  const libTitles = new Set()
  for (const e of entries || []) {
    if (e.aniListId != null) libIds.add(e.aniListId)
    for (const t of [e.aniCliTitle, e.title]) {
      const k = normTitle(t)
      if (k) libTitles.add(k)
    }
  }
  const sources = sourceIds(entries, getCachedId).sort(
    (a, b) =>
      time(b.entry.lastWatchedAt) - time(a.entry.lastWatchedAt) ||
      time(b.entry.updatedAt) - time(a.entry.updatedAt)
  )
  const seen = new Set()
  const out = []
  for (const { entry, prequelId } of sources) {
    for (const s of sequelsById?.[prequelId] || []) {
      if (seen.has(s.id) || hide.has(s.id) || libIds.has(s.id)) continue
      const keys = [normTitle(s.romaji), normTitle(s.english)].filter(Boolean)
      if (keys.some((k) => libTitles.has(k))) continue
      seen.add(s.id)
      out.push({ ...s, fromTitle: entry.title, fromId: entry.id })
      if (out.length >= MAX_CARDS) return out
    }
  }
  return out
}
