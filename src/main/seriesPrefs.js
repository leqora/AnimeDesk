import { readJson, writeJsonAtomic } from './jsonStore.js'
import { normalizeTitle } from '../shared/domain.js'
import { clampOffset } from '../shared/subtitles.js'
import { QUALITIES, MODES } from './settings.js'

const key = (title) => normalizeTitle(String(title ?? '')).toLowerCase()
const readOffsets = (raw) => {
  const o = raw !== null && typeof raw === 'object' ? raw : {}
  return { sub: clampOffset(o.sub), dub: clampOffset(o.dub) }
}

// Quality, sub/dub and the subtitle offset per mode, remembered per series (also for series not in the watchlist).
export function createSeriesPrefs(file) {
  const loaded = readJson(file, { version: 1, series: {} }).data
  const db = loaded && typeof loaded.series === 'object' && loaded.series !== null ? loaded : { version: 1, series: {} }

  function get(title) {
    const raw = db.series[key(title)] ?? {}
    return {
      quality: QUALITIES.includes(raw.quality) ? raw.quality : null,
      mode: MODES.includes(raw.mode) ? raw.mode : null,
      subOffset: readOffsets(raw.subOffset),
    }
  }

  function set(title, patch = {}) {
    const k = key(title)
    if (!k) return get(title)
    const next = get(title)
    if ('quality' in patch && (patch.quality === null || QUALITIES.includes(patch.quality))) next.quality = patch.quality
    if ('mode' in patch && (patch.mode === null || MODES.includes(patch.mode))) next.mode = patch.mode
    if (patch.subOffset !== null && typeof patch.subOffset === 'object') {
      for (const m of MODES) {
        if (!(m in patch.subOffset)) continue
        const v = patch.subOffset[m]
        if (v === null) next.subOffset[m] = 0
        else if (typeof v === 'number' && Number.isFinite(v)) next.subOffset[m] = clampOffset(v)
      }
    }
    const stored = {}
    if (next.quality !== null) stored.quality = next.quality
    if (next.mode !== null) stored.mode = next.mode
    const offsets = Object.fromEntries(MODES.filter((m) => next.subOffset[m] !== 0).map((m) => [m, next.subOffset[m]]))
    if (Object.keys(offsets).length) stored.subOffset = offsets
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
