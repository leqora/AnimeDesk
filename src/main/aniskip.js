import path from 'node:path'
import { readJson, writeJsonAtomic } from './jsonStore.js'

const TTL_MS = 7 * 24 * 3600 * 1000
const EMPTY = Object.freeze({ op: null, ed: null, recap: null })
const KIND = { op: 'op', 'mixed-op': 'op', ed: 'ed', 'mixed-ed': 'ed', recap: 'recap' }
const MIN_SEGMENT_S = 1

// AniSkip is crowd-sourced: reversed, out-of-range or overlapping intervals would seek to the wrong place.
export function normalizeSkips(times, duration) {
  const d = Number(duration)
  const known = Number.isFinite(d) && d > 0
  const fix = (seg) => {
    if (!seg || !Number.isFinite(seg.start) || !Number.isFinite(seg.end) || !(seg.end > seg.start)) return null
    const start = Math.max(0, seg.start)
    if (known && start >= d) return null
    const end = known ? Math.min(seg.end, d) : seg.end
    return end - start >= MIN_SEGMENT_S ? { start, end } : null
  }
  const op = fix(times?.op)
  const recap = fix(times?.recap)
  let ed = fix(times?.ed)
  if (ed && op && ed.start < op.end) ed = null
  return { op, ed, recap }
}

export function createAniSkip({ cacheDir, fetchImpl = fetch, now = () => Date.now() }) {
  async function getSkipTimes({ malId, episode, duration }) {
    if (!Number.isInteger(malId) || !Number.isFinite(Number(episode))) return { ...EMPTY }
    const ep = String(Number(episode))
    const file = path.join(cacheDir, `${malId}-${ep}.json`)
    const cached = readJson(file, null).data
    if (cached && now() - cached.at < TTL_MS) return normalizeSkips(cached.times, duration)
    try {
      const url = `https://api.aniskip.com/v2/skip-times/${malId}/${ep}?types=op&types=ed&types=recap&episodeLength=${Math.round(Number(duration) || 0)}`
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } })
      if (!res.ok && res.status !== 404) return { ...EMPTY }
      const body = await res.json()
      const times = { ...EMPTY }
      for (const r of body.results ?? []) {
        const kind = KIND[r.skipType]
        if (kind && !times[kind]) times[kind] = { start: r.interval.startTime, end: r.interval.endTime }
      }
      writeJsonAtomic(file, { at: now(), times })
      return normalizeSkips(times, duration)
    } catch {
      return { ...EMPTY }
    }
  }
  return { getSkipTimes }
}
