import { readJson, writeJsonAtomic } from './jsonStore.js'
import { normalizeTitle } from '../shared/domain.js'
import { clampOffset } from '../shared/subtitles.js'
import { QUALITIES, MODES } from './settings.js'

const key = (title) => normalizeTitle(String(title ?? '')).toLowerCase()
const readOffsets = (raw) => {
  const o = raw !== null && typeof raw === 'object' ? raw : {}
  return { sub: clampOffset(o.sub), dub: clampOffset(o.dub) }
}
const readReveal = (raw) => {
  const r = raw !== null && typeof raw === 'object' ? raw : {}
  const episodes = Array.isArray(r.episodes) ? [...new Set(r.episodes.map((e) => String(e ?? '').trim()).filter(Boolean))] : []
  return { all: r.all === true, episodes }
}
const isAfter = (n) => Number.isInteger(n) && n >= 0
const readAuto = (raw) => (raw !== null && typeof raw === 'object' && isAfter(raw.after) ? { after: raw.after } : null)

// Quality, sub/dub, the subtitle offset per mode and the spoiler reveals, remembered per series
// (also for series not in the watchlist).
export function createSeriesPrefs(file) {
  const loaded = readJson(file, { version: 1, series: {} }).data
  const db = loaded && typeof loaded.series === 'object' && loaded.series !== null ? loaded : { version: 1, series: {} }

  function get(title) {
    const raw = db.series[key(title)] ?? {}
    return {
      quality: QUALITIES.includes(raw.quality) ? raw.quality : null,
      mode: MODES.includes(raw.mode) ? raw.mode : null,
      subOffset: readOffsets(raw.subOffset),
      autoDownload: readAuto(raw.autoDownload) !== null,
    }
  }

  // The auto-download boundary: episodes up to `after` are never fetched automatically.
  function getAutoDownload(title) {
    return readAuto((db.series[key(title)] ?? {}).autoDownload)
  }

  function getSpoilers(title) {
    const raw = db.series[key(title)] ?? {}
    return { reveal: readReveal(raw.reveal), metaOff: raw.metaOff === true }
  }

  // One writer for both halves, so changing one never drops the other.
  function persist(k, prefs, spoilers, auto) {
    const stored = {}
    if (prefs.quality !== null) stored.quality = prefs.quality
    if (prefs.mode !== null) stored.mode = prefs.mode
    const offsets = Object.fromEntries(MODES.filter((m) => prefs.subOffset[m] !== 0).map((m) => [m, prefs.subOffset[m]]))
    if (Object.keys(offsets).length) stored.subOffset = offsets
    const { all, episodes } = spoilers.reveal
    if (all || episodes.length) stored.reveal = { ...(all ? { all: true } : {}), ...(episodes.length ? { episodes } : {}) }
    if (spoilers.metaOff) stored.metaOff = true
    if (auto) stored.autoDownload = { after: auto.after }
    if (Object.keys(stored).length) db.series[k] = stored
    else delete db.series[k]
    writeJsonAtomic(file, db)
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
    persist(k, next, getSpoilers(title), getAutoDownload(title))
    return get(title)
  }

  // value: { after: integer >= 0 } to switch it on, null to switch it off; anything else changes nothing.
  function setAutoDownload(title, value) {
    const k = key(title)
    if (!k) return null
    if (value === null) persist(k, get(title), getSpoilers(title), null)
    else if (typeof value === 'object' && isAfter(value.after)) persist(k, get(title), getSpoilers(title), { after: value.after })
    return getAutoDownload(title)
  }

  function setSpoilers(title, action = {}) {
    const k = key(title)
    if (!k || action === null || typeof action !== 'object') return getSpoilers(title)
    const next = getSpoilers(title)
    let changed = false
    if ('episode' in action) {
      const ep = String(action.episode ?? '').trim()
      if (ep && !next.reveal.episodes.includes(ep)) { next.reveal.episodes.push(ep); changed = true }
    }
    if (action.all === true && !next.reveal.all) { next.reveal.all = true; changed = true }
    if (action.reset === true) { next.reveal = { all: false, episodes: [] }; changed = true }
    if (typeof action.metaOff === 'boolean' && action.metaOff !== next.metaOff) { next.metaOff = action.metaOff; changed = true }
    if (changed) persist(k, get(title), next, getAutoDownload(title))
    return getSpoilers(title)
  }

  function resolve(title, settings) {
    const p = get(title)
    return { quality: p.quality ?? settings.quality, mode: p.mode ?? settings.mode }
  }

  return { get, set, resolve, getSpoilers, setSpoilers, getAutoDownload, setAutoDownload }
}
