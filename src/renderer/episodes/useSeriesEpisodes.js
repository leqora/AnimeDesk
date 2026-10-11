import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useLatest } from '../player/useLatest.js'

// The series' episode list with spoiler-safe metadata from main. Reloads when the library changes, because a newly
// watched episode moves the spoiler line. Only the latest request may set the state.
export function useSeriesEpisodes({ title, aniListId = null, mode = null, list = null }) {
  const api = useApi()
  const [series, setSeries] = useState(null)
  const args = useLatest({ title, aniListId, mode, list })
  const seq = useRef(0)
  const listKey = list ? list.join('\n') : ''

  const load = useCallback(() => {
    const n = ++seq.current
    if (!title) { setSeries(null); return }
    api.episodes.forSeries(args.current).then((r) => { if (n === seq.current) setSeries(r ?? null) }).catch(() => {})
  }, [api, title, aniListId, mode, listKey])

  useEffect(() => {
    load()
    return api.onLibraryChanged(load)
  }, [load])

  const update = useCallback(async (action) => {
    const n = ++seq.current
    const r = await api.episodes.spoilers(args.current, action).catch(() => null)
    if (r && n === seq.current) setSeries(r)
  }, [api])

  const thumb = useCallback((episode) => api.episodes.thumb({ ...args.current, episode }).catch(() => null), [api])

  return { series, update, thumb }
}
