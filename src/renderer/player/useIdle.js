import { useEffect, useRef, useState } from 'react'
import { useLatest } from './useLatest.js'

export const HIDE_MS = 3000

// Hides the controls after a while of playback; a paused video or an open menu (`hold`) keeps them visible.
export function useIdle({ video, hold }) {
  const [idle, setIdle] = useState(false)
  const timer = useRef(null)
  const holdRef = useLatest(hold)
  const poke = useRef(() => {
    setIdle(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const v = video.current
      if (v && !v.paused && !holdRef.current) setIdle(true)
    }, HIDE_MS)
  }).current
  useEffect(() => { if (!hold) poke() }, [hold])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { idle, poke, show: () => setIdle(false) }
}
