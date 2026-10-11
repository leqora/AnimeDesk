// Spoiler rule: M = the highest watched episode. Episodes up to M are shown fully (gaps below M too), the next one
// (up to M+1) shows its title and thumbnail without the summary, and everything after it is hidden.
// A revealed episode or series, or protection turned off, counts as watched.

const toNumber = (n) => {
  if (typeof n === 'number') return n
  const s = String(n ?? '').trim()
  return s === '' ? NaN : Number(s)
}

export function watchedMax(watched = []) {
  let max = 0
  for (const w of watched) {
    const n = toNumber(w)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

export function episodeVisibility(n, { enabled = true, watchedMax: max = 0, revealAll = false, revealed = [] } = {}) {
  if (!enabled || revealAll) return 'full'
  const num = toNumber(n)
  if (!Number.isFinite(num)) return 'hidden'
  if (num <= max || revealed.some((r) => toNumber(r) === num)) return 'full'
  if (num <= max + 1) return 'preview'
  return 'hidden'
}

// Built from a whitelist, never by spreading `meta`: a field ani.zip adds tomorrow cannot slip through.
// The image URL never leaves main; the renderer asks for the thumbnail by episode number.
export function redactEpisode(number, meta, visibility) {
  const runtime = Number.isFinite(meta?.runtime) && meta.runtime > 0 ? meta.runtime : null
  const out = { number: String(number), runtime, visibility }
  if (visibility === 'hidden' || !meta) return out
  if (typeof meta.title === 'string' && meta.title) out.title = meta.title
  out.hasThumb = typeof meta.image === 'string' && meta.image.length > 0
  if (visibility === 'full' && typeof meta.overview === 'string' && meta.overview) out.overview = meta.overview
  return out
}
