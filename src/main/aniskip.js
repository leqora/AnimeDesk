import path from 'node:path'
import { readJson, writeJsonAtomic } from './jsonStore.js'

const TTL_MS = 7 * 24 * 3600 * 1000
const EMPTY = Object.freeze({ op: null, ed: null, recap: null })
const KIND = { op: 'op', 'mixed-op': 'op', ed: 'ed', 'mixed-ed': 'ed', recap: 'recap' }

export function createAniSkip({ cacheDir, fetchImpl = fetch, now = () => Date.now() }) {
  async function getSkipTimes({ malId, episode, duration }) {
    if (!Number.isInteger(malId) || !Number.isFinite(Number(episode))) return { ...EMPTY }
    const ep = String(Number(episode))
    const file = path.join(cacheDir, `${malId}-${ep}.json`)
    const cached = readJson(file, null).data
    if (cached && now() - cached.at < TTL_MS) return cached.times
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
      return times
    } catch {
      return { ...EMPTY }
    }
  }
  return { getSkipTimes }
}
