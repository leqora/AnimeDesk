// ani-cli lists episodes by number ("1", "0", "12.5"); ani.zip keys its main episodes "1".."N".
// Only whole numbers from 1 get metadata; "0", decimals and specials fall back to "Episode N" + the series poster.

export function metaKey(label) {
  const s = String(label ?? '').trim()
  return /^[1-9]\d*$/.test(s) ? s : null
}

// More whole episodes at the source than ani.zip knows means the numbers cannot match (the source counts across
// seasons, or the series is matched to the wrong AniList entry): then no title may be shown, it could be a future one.
export function metaReliability(list, anizip) {
  const count = list.filter((l) => metaKey(l) != null).length
  const known = Number.isInteger(anizip?.episodeCount) && anizip.episodeCount > 0
    ? anizip.episodeCount
    : Object.keys(anizip?.episodes ?? {}).length
  return count <= known ? 'ok' : 'unreliable'
}

export function pickTitle(titles) {
  if (!titles || typeof titles !== 'object') return null
  for (const lang of ['en', 'x-jat']) {
    const v = titles[lang]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const any = Object.values(titles).find((v) => typeof v === 'string' && v.trim())
  return any ? any.trim() : null
}

export function mapEpisode(label, anizip) {
  const key = metaKey(label)
  const e = key ? anizip?.episodes?.[key] : null
  if (!e) return null
  return { title: pickTitle(e.titles), image: e.image ?? null, overview: e.overview ?? null, runtime: e.runtime ?? null }
}
