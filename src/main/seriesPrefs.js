import { readJson, writeJsonAtomic } from './jsonStore.js'
import { normalizeTitle } from '../shared/domain.js'
import { QUALITIES, MODES } from './settings.js'

const key = (title) => normalizeTitle(String(title ?? '')).toLowerCase()

// Quality and sub/dub chosen on the episode page, remembered per series (also for series not in the watchlist).
export function createSeriesPrefs(file) {
  const loaded = readJson(file, { version: 1, series: {} }).data
  const db = loaded && typeof loaded.series === 'object' && loaded.series !== null ? loaded : { version: 1, series: {} }

  function get(title) {
    const raw = db.series[key(title)] ?? {}
    return {
      quality: QUALITIES.includes(raw.quality) ? raw.quality : null,
      mode: MODES.includes(raw.mode) ? raw.mode : null,
    }
  }

  function set(title, patch = {}) {
    const k = key(title)
    if (!k) return get(title)
    const next = get(title)
    if ('quality' in patch && (patch.quality === null || QUALITIES.includes(patch.quality))) next.quality = patch.quality
    if ('mode' in patch && (patch.mode === null || MODES.includes(patch.mode))) next.mode = patch.mode
    const stored = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== null))
    if (Object.keys(stored).length) db.series[k] = stored
    else delete db.series[k]
    writeJsonAtomic(file, db)
    return get(title)
  }

  function resolve(title, settings) {
    const p = get(title)
    return { quality: p.quality ?? settings.quality, mode: p.mode ?? settings.mode }
  }

  return { get, set, resolve }
}
