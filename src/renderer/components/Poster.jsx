import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { Icon } from './Icon.jsx'

export function usePosterInfo(title, aniListId = null) {
  const api = useApi()
  const [info, setInfo] = useState(null)
  useEffect(() => {
    let live = true
    setInfo(null)
    if (title) api.anilist.forTitle(title, aniListId).then((value) => { if (live) setInfo(value ?? null) }).catch(() => {})
    return () => { live = false }
  }, [api, title, aniListId])
  return info
}

export function Poster({ title, aniListId = null }) {
  const info = usePosterInfo(title, aniListId)
  return info?.poster
    ? <img className="poster" src={info.poster} alt="" />
    : <div className="poster poster--empty" aria-hidden="true"><Icon name="film" size={28} /></div>
}
