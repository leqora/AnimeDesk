// tz follows Date#getTimezoneOffset(): local = UTC - tz (minutes)
const localMs = (iso, tz) => {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms - tz * 60000 : null
}

export const localDay = (iso, tz) => {
  const ms = localMs(iso, tz)
  return ms === null ? null : new Date(ms).toISOString().slice(0, 10)
}

export const localHour = (iso, tz) => {
  const ms = localMs(iso, tz)
  return ms === null ? null : new Date(ms).getUTCHours()
}

export const shiftDay = (day, delta) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export const mondayOf = (day) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return shiftDay(day, -((dow + 6) % 7))
}

// Longest run of consecutive calendar days in a collection of 'YYYY-MM-DD' strings.
export function longestStreak(days) {
  const set = new Set(days)
  let best = 0
  for (const d of set) {
    if (set.has(shiftDay(d, -1))) continue // not the start of a run
    let n = 1
    while (set.has(shiftDay(d, n))) n++
    if (n > best) best = n
  }
  return best
}
