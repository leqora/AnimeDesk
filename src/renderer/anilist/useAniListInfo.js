import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { AIRED_GRACE_MS } from '../../shared/airing.js'
import { infoCache } from './infoCache.js'

const LIVE_WINDOW_MS = 24 * 3600 * 1000
const LIVE_SLACK_MS = 30_000

// undefined = still loading, null = nothing found / failed, falsy title = null.
// Starts from the shared cache so returning to a page shows posters without a skeleton.
// With live, one timer refetches shortly after the next episode has aired and its grace hour passed.
export function useAniListInfo(title, aniListId = null, { live = false } = {}) {
  const api = useApi()
  const cache = infoCache(api)
  const [info, setInfo] = useState(() => (title ? cache.peek(title, aniListId) : null))

  useEffect(() => {
    let active = true
    if (!title) { setInfo(null); return undefined }
    const cached = cache.peek(title, aniListId)
    setInfo(cached)
    if (cached === undefined) cache.get(title, aniListId).then((v) => { if (active) setInfo(v) }).catch(() => { if (active) setInfo(null) })
    return () => { active = false }
  }, [cache, title, aniListId])

  const airingAt = live ? info?.nextAiring?.airingAt : undefined
  useEffect(() => {
    if (!title || airingAt == null) return undefined
    const delay = airingAt + AIRED_GRACE_MS + LIVE_SLACK_MS - Date.now()
    if (delay > LIVE_WINDOW_MS) return undefined
    let active = true
    const timer = setTimeout(() => {
      cache.get(title, aniListId).then((v) => { if (active) setInfo(v) }).catch(() => {})
    }, Math.max(0, delay))
    return () => { active = false; clearTimeout(timer) }
  }, [cache, title, aniListId, airingAt])

  return info
}
