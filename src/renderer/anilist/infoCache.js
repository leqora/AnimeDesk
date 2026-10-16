import { AIRED_GRACE_MS } from '../../shared/airing.js'

export const INFO_TTL_MS = 10 * 60 * 1000
const MIN_TTL_MS = 60 * 1000

const caches = new WeakMap()

const keyOf = (title, aniListId) => (aniListId ? `id:${aniListId}` : `t:${title}`)

// One cache per api object. An entry is valid for 10 minutes, but never past airingAt + 1 h
// (so an "airs soon" row does not go stale); null (not found) is cached the same 10 minutes.
export function infoCache(api, { now = Date.now } = {}) {
  let cache = caches.get(api)
  if (cache) return cache
  const store = new Map() // key -> { info, until }
  const inflight = new Map() // key -> Promise
  cache = {
    peek(title, aniListId = null) {
      const key = keyOf(title, aniListId)
      const hit = store.get(key)
      if (!hit) return undefined
      if (now() >= hit.until) { store.delete(key); return undefined }
      return hit.info
    },
    get(title, aniListId = null) {
      const cached = cache.peek(title, aniListId)
      if (cached !== undefined) return Promise.resolve(cached)
      const key = keyOf(title, aniListId)
      if (inflight.has(key)) return inflight.get(key)
      const p = (async () => api.anilist.forTitle(title, aniListId))().then((value) => {
        const info = value ?? null
        let until = now() + INFO_TTL_MS
        if (info?.nextAiring) until = Math.min(until, info.nextAiring.airingAt + AIRED_GRACE_MS)
        // an entry already past its airing grace must not be born expired (it would re-fetch on every mount)
        until = Math.max(until, now() + MIN_TTL_MS)
        store.set(key, { info, until })
        // Also under the id key, so a later lookup by the freshly linked aniListId hits the same entry.
        if (info?.id) store.set(keyOf(title, info.id), { info, until })
        return info
      }).finally(() => { inflight.delete(key) })
      inflight.set(key, p)
      return p
    },
  }
  caches.set(api, cache)
  return cache
}
