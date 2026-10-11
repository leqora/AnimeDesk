import { readJson, writeJsonAtomic } from './jsonStore.js'
import { normalizeTitle } from '../shared/domain.js'
import { MODES } from './settings.js'

const key = (title) => normalizeTitle(String(title ?? '')).toLowerCase()

// The real ani-cli episode list per series and mode ("0", "12.5", gaps), so the series page can show it
// instead of 1..max. Filled whenever ani-cli shows its episode menu.
export function createEpisodeLists(file, { now = () => new Date().toISOString() } = {}) {
  const loaded = readJson(file, { version: 1, series: {} }).data
  const db = loaded && typeof loaded.series === 'object' && loaded.series !== null ? loaded : { version: 1, series: {} }

  function get(title, mode) {
    const e = db.series[key(title)]?.[mode]
    if (!Array.isArray(e?.episodes)) return null
    const list = e.episodes.filter((x) => typeof x === 'string' && x)
    return list.length ? list : null
  }

  function set(title, mode, list) {
    const k = key(title)
    if (!k || !MODES.includes(mode) || !Array.isArray(list)) return
    const episodes = list.map((l) => String(l ?? '').trim()).filter(Boolean)
    if (!episodes.length) return
    const prev = get(title, mode)
    if (prev && prev.length === episodes.length && prev.every((x, i) => x === episodes[i])) return
    db.series[k] = { ...(db.series[k] ?? {}), [mode]: { episodes, at: now() } }
    writeJsonAtomic(file, db)
  }

  return { get, set }
}
