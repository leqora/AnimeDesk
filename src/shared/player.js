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
