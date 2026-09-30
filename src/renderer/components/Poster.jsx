import { useEffect, useState } from 'react'
import { useApi } from '../api.js'

export function Poster({ title, aniListId = null }) {
  const api = useApi()
  const [poster, setPoster] = useState(null)
  useEffect(() => {
    let live = true
    api.anilist.forTitle(title, aniListId).then((info) => { if (live) setPoster(info?.poster ?? null) }).catch(() => {})
    return () => { live = false }
  }, [api, title, aniListId])
  return poster ? <img className="poster" src={poster} alt="" /> : <div className="poster poster--empty" aria-hidden="true" />
}
