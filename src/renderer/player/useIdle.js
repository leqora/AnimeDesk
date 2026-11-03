import { useEffect, useRef, useState } from 'react'
import { useLatest } from './useLatest.js'

export const HIDE_MS = 3000

// Hides the controls after a while of playback (not at all when `enabled` is false, e.g. in the mini player); a paused video or an open menu (`hold`) keeps them visible.
export function useIdle({ video, hold, enabled = true }) {
  const [idle, setIdle] = useState(false)
  const timer = useRef(null)
  const holdRef = useLatest(hold)
  const enabledRef = useLatest(enabled)
  const poke = useRef(() => {
    setIdle(false)
    clearTimeout(timer.current)
    if (!enabledRef.current) return
    timer.current = setTimeout(() => {
      const v = video.current
      if (v && !v.paused && !holdRef.current) setIdle(true)
    }, HIDE_MS)
  }).current
  useEffect(() => { if (!hold) poke() }, [hold, enabled])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { idle, poke, show: () => setIdle(false) }
}
