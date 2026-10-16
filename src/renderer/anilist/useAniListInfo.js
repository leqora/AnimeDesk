import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { AIRED_GRACE_MS } from '../../shared/airing.js'
import { infoCache } from './infoCache.js'

const LIVE_WINDOW_MS = 24 * 3600 * 1000
const LIVE_SLACK_MS = 30_000
// Main returns the stale entry (same airingAt) when the network fails, so "still the same past airingAt"
// is the usual failure shape. Retry with growing gaps (last repeats) until airingAt + LIVE_GIVE_UP_MS.
export const LIVE_RETRY_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000]
export const LIVE_GIVE_UP_MS = 24 * 3600_000

// undefined = still loading, null = nothing found / failed, falsy title = null.
// Starts from the shared cache so returning to a page shows posters without a skeleton.
// State is tagged with its key, so after a title/id change another series' info is never returned.
// With live, one timer refetches shortly after the next episode has aired and its grace hour passed.
export function useAniListInfo(title, aniListId = null, { live = false } = {}) {
  const api = useApi()
  const cache = infoCache(api)
  const key = `${aniListId ?? ''}|${title ?? ''}`
  const [state, setState] = useState(null) // { key, info }

  useEffect(() => {
    let active = true
    if (!title || cache.peek(title, aniListId) !== undefined) return undefined
    cache.get(title, aniListId)
      .then((info) => { if (active) setState({ key, info }) })
      .catch(() => { if (active) setState({ key, info: null }) })
    return () => { active = false }
  }, [cache, key])

  // A refetch by any view of this series (e.g. a live timer elsewhere) reaches this one too.
  useEffect(() => {
    if (!title) return undefined
    return cache.subscribe(title, aniListId, (value) => setState({ key, info: value }))
  }, [cache, key])

  let info
  if (!title) info = null
  else if (state?.key === key) info = state.info
  else info = cache.peek(title, aniListId)

  const airingAt = live ? info?.nextAiring?.airingAt : undefined
  useEffect(() => {
    if (!title || airingAt == null) return undefined
    const delay = airingAt + AIRED_GRACE_MS + LIVE_SLACK_MS - Date.now()
    if (delay > LIVE_WINDOW_MS) return undefined
    if (Date.now() >= airingAt + LIVE_GIVE_UP_MS) return undefined
    let active = true
    let timer
    let attempt = 0
    const schedule = (ms) => { timer = setTimeout(run, Math.max(0, ms)) }
    const retry = () => {
      if (!active || Date.now() >= airingAt + LIVE_GIVE_UP_MS) return
      schedule(LIVE_RETRY_MS[Math.min(attempt++, LIVE_RETRY_MS.length - 1)])
    }
    function run() {
      cache.get(title, aniListId).then((value) => {
        if (!active) return
        setState({ key, info: value })
        if (value?.nextAiring?.airingAt === airingAt) retry() // schedule not updated yet
      }).catch(retry)
    }
    schedule(delay)
    return () => { active = false; clearTimeout(timer) }
  }, [cache, key, airingAt])

  return info
}
