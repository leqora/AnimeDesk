// Volume boost above 100 %: one list of allowed levels shared by the settings, the UI and the mpv arguments.
export const BOOST_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3]

export const isBoostLevel = (v) => BOOST_LEVELS.includes(v)

// One level up (dir > 0) or down, clamped at the ends; a value off the list moves to the nearest level in that direction.
export function stepBoost(v, dir) {
  if (!Number.isFinite(v)) return 1
  if (dir > 0) return BOOST_LEVELS.find((l) => l > v + 1e-9) ?? BOOST_LEVELS[BOOST_LEVELS.length - 1]
  return [...BOOST_LEVELS].reverse().find((l) => l < v - 1e-9) ?? BOOST_LEVELS[0]
}

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
