// Volume boost above 100 %: one list of allowed levels shared by the settings, the UI and the mpv arguments.
export const BOOST_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3]

export const isBoostLevel = (v) => BOOST_LEVELS.includes(v)

// null for 1 (boost off); the Serbian format has a space before the percent sign.
export function formatBoost(v, lang) {
  if (v === 1) return null
  const pct = Math.round(v * 100)
  return lang === 'sr' ? `${pct} %` : `${pct}%`
}

// Gain plus a limiter so boosted peaks do not clip.
export function mpvBoostArgs(v) {
  if (v === 1 || !isBoostLevel(v)) return []
  return [`--af-add=@animedesk-boost:lavfi=[volume=${v},alimiter=limit=0.95:level=disabled]`]
}
