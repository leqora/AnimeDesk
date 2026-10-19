export const AUTO_KEEP = 7
export const PRE_IMPORT_KEEP = 5
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024
export const IMPORT_TTL_MS = 10 * 60 * 1000

const p2 = (n) => String(n).padStart(2, '0')

// Local calendar date. `tzOffsetMin` (Date#getTimezoneOffset sign: minutes behind UTC) is for tests; omitted = machine zone.
export function localDate(ms, tzOffsetMin) {
  if (tzOffsetMin !== undefined) {
    const d = new Date(ms - tzOffsetMin * 60000)
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`
  }
  const d = new Date(ms)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export const autoName = (ms) => `auto-${localDate(ms)}.json`

export function preImportName(ms, n = 1) {
  const d = new Date(ms)
  const suffix = n > 1 ? `-${n}` : ''
  return `pre-import-${localDate(ms)}T${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}${suffix}.json`
}

const PATTERNS = {
  'auto-': /^auto-\d{4}-\d{2}-\d{2}\.json$/,
  'pre-import-': /^pre-import-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(-\d+)?\.json$/,
}

// Names beyond the `keep` newest (by name, descending) of the given kind; other files are never listed.
export function toPrune(names, prefix, keep) {
  const re = PATTERNS[prefix]
  if (!re) return []
  return names.filter((n) => re.test(n)).sort(byAge).reverse().slice(keep)
}

// Oldest first. A same-second pre-import copy carries a numeric "-N" suffix (plain name = 1), compared as a number.
function byAge(a, b) {
  const split = (n) => {
    const m = /^(pre-import-.{19})(?:-(\d+))?\.json$/.exec(n)
    return m ? [m[1], m[2] ? Number(m[2]) : 1] : [n, 1]
  }
  const [ka, na] = split(a)
  const [kb, nb] = split(b)
  if (ka !== kb) return ka < kb ? -1 : 1
  return na - nb
}

// Delay until the next check: next local midnight + 5 min, at most 6 h, never under 60 s.
export function nextDelay(ms) {
  const d = new Date(ms)
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return Math.max(60 * 1000, Math.min(midnight + 5 * 60 * 1000 - ms, 6 * 3600 * 1000))
}

export function latestAuto(names) {
  const found = names.filter((n) => PATTERNS['auto-'].test(n)).sort()
  return found.length ? found[found.length - 1].slice(5, 15) : null
}
