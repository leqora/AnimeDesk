import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { Icon } from './Icon.jsx'

// undefined = still loading, null = nothing found; callers that only read info?.poster see no difference.
export function usePosterInfo(title, aniListId = null) {
  const api = useApi()
  const [info, setInfo] = useState(title ? undefined : null)
  useEffect(() => {
    let live = true
    setInfo(title ? undefined : null)
    if (title) api.anilist.forTitle(title, aniListId).then((value) => { if (live) setInfo(value ?? null) }).catch(() => { if (live) setInfo(null) })
    return () => { live = false }
  }, [api, title, aniListId])
  return info
}

const Empty = () => <div className="poster poster--empty" aria-hidden="true"><Icon name="film" size={28} /></div>

// With children (a card overlay) the poster gets a frame and load states; without, the plain output stays as it was.
export function Poster({ title, aniListId = null, children = null }) {
  const info = usePosterInfo(title, aniListId)
  const src = info?.poster ?? null
  // Keyed by src so a new poster starts unloaded without a reset effect (which could race a fast onLoad).
  const [loadedSrc, setLoadedSrc] = useState(null)
  const [failedSrc, setFailedSrc] = useState(null)
  const loaded = src !== null && loadedSrc === src
  const failed = src !== null && failedSrc === src

  if (!children) return src ? <img className="poster" src={src} alt="" /> : <Empty />

  const missing = info === null || (info !== undefined && !src) || failed
  return (
    <div className="poster-frame">
      {missing ? <Empty /> : (
        <>
          {!loaded && <div className="poster poster--skeleton" aria-hidden="true" />}
          {src && <img className={loaded ? 'poster poster--in' : 'poster poster--loading'} src={src} alt="" onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} />}
        </>
      )}
      {children}
    </div>
  )
}
