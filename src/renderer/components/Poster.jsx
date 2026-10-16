import { useState } from 'react'
import { useAniListInfo } from '../anilist/useAniListInfo.js'
import { Icon } from './Icon.jsx'

// undefined = still loading, null = nothing found; callers that only read info?.poster see no difference.
export function usePosterInfo(title, aniListId = null) {
  return useAniListInfo(title, aniListId, { live: true })
}

const Empty = () => <div className="poster poster--empty" aria-hidden="true"><Icon name="film" size={28} /></div>

// With children (a card overlay) the poster gets a frame and load states; without, the plain output stays as it was.
export function Poster({ title, aniListId = null, children = null }) {
  const info = usePosterInfo(title, aniListId)
  if (!children) {
    const src = info?.poster ?? null
    return src ? <img className="poster" src={src} alt="" /> : <Empty />
  }
  return <PosterFrame info={info}>{children}</PosterFrame>
}

// The framed poster for callers that already hold the AniList info (one request per card).
export function PosterFrame({ info, children }) {
  const src = info?.poster ?? null
  // Keyed by src so a new poster starts unloaded without a reset effect (which could race a fast onLoad).
  const [loadedSrc, setLoadedSrc] = useState(null)
  const [failedSrc, setFailedSrc] = useState(null)
  const loaded = src !== null && loadedSrc === src
  const failed = src !== null && failedSrc === src
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
