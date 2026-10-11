import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'

// Numbers or list, remembered globally in settings.episodeView.
export function useEpisodeView() {
  const api = useApi()
  const [view, setView] = useState('numbers')
  const touched = useRef(false) // a click before the saved value arrives must win
  useEffect(() => {
    let live = true
    api.settings.get().then((s) => {
      if (live && !touched.current && (s?.episodeView === 'list' || s?.episodeView === 'numbers')) setView(s.episodeView)
    }).catch(() => {})
    return () => { live = false }
  }, [api])
  const change = (v) => {
    touched.current = true
    setView(v)
    api.settings.update({ episodeView: v }).catch(() => {})
  }
  return [view, change]
}
