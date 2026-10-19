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

export function preImportName(ms) {
  const d = new Date(ms)
  return `pre-import-${localDate(ms)}T${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}.json`
}

const PATTERNS = {
  'auto-': /^auto-\d{4}-\d{2}-\d{2}\.json$/,
  'pre-import-': /^pre-import-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/,
}

// Names beyond the `keep` newest (by name, descending) of the given kind; other files are never listed.
export function toPrune(names, prefix, keep) {
  const re = PATTERNS[prefix]
  if (!re) return []
  return names.filter((n) => re.test(n)).sort().reverse().slice(keep)
}

export function latestAuto(names) {
  const found = names.filter((n) => PATTERNS['auto-'].test(n)).sort()
  return found.length ? found[found.length - 1].slice(5, 15) : null
}
