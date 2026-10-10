export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export function segmentAt(time, skips) {
  if (!skips) return null
  for (const kind of ['op', 'recap', 'ed']) {
    const s = skips[kind]
    if (s && time >= s.start && time < s.end) return kind
  }
  return null
}

export const nextEpisodeNumber = (ep, dir) => Math.max(1, Math.floor(Number(ep)) + dir)

export const shouldOfferResume = (position, duration) =>
  Number.isFinite(position) && Number.isFinite(duration) && duration > 0 && position >= 10 && position <= duration * 0.9

export const trackMax = (prevMax, time, duration) => (duration > 0 ? Math.max(prevMax, Math.min(100, (time / duration) * 100)) : prevMax)

export const isLastEpisode = (ep, total) => Number.isInteger(total) && total > 0 && Number(ep) >= total

const STANDARD_HEIGHTS = [360, 480, 720, 1080, 1440, 2160]

// The decoded frame height as a familiar label: within 10 % of a standard it snaps (1072 → 1080p), otherwise it stays raw.
export function qualityLabel(height) {
  const h = Number(height)
  if (!Number.isFinite(h) || h <= 0) return null
  const near = STANDARD_HEIGHTS.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a))
  return Math.abs(near - h) <= near * 0.1 ? `${near}p` : `${Math.round(h)}p`
}

export const qualityName = (q) => (/^\d+$/.test(String(q)) ? `${q}p` : String(q))

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

// Next/previous rate in RATES, clamped at the ends; a rate off the list goes to the nearest one in that direction.
export function stepRate(rate, dir) {
  if (dir > 0) return RATES.find((r) => r > rate + 1e-9) ?? RATES[RATES.length - 1]
  return [...RATES].reverse().find((r) => r < rate - 1e-9) ?? RATES[0]
}

export const formatRate = (rate, lang) => (lang === 'sr' ? String(rate).replace('.', ',') : String(rate))

export function bufferedRanges(tr) {
  const out = []
  for (let i = 0; i < (tr?.length ?? 0); i++) out.push({ start: tr.start(i), end: tr.end(i) })
  return out
}

export const sameRanges = (a, b) => a.length === b.length && a.every((r, i) => r.start === b[i].start && r.end === b[i].end)
