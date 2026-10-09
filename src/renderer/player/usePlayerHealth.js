import { useEffect, useRef, useState } from 'react'

export const SLOW_MS = 8000
export const STALL_MS = 12000

// Loading/buffering state for the spinner, plus a watchdog for streams that stop advancing without any error event.
export function usePlayerHealth({ video, active, onStall, slowMs = SLOW_MS, stallMs = STALL_MS }) {
  const [buffering, setBuffering] = useState(true)
  const [slow, setSlow] = useState(false)
  const live = useRef({})
  live.current = { active, onStall }

  useEffect(() => {
    if (!buffering) return undefined
    const id = setTimeout(() => setSlow(true), slowMs)
    return () => { clearTimeout(id); setSlow(false) }
  }, [buffering])

  useEffect(() => {
    let last = null
    let since = Date.now()
    let fired = false
    const id = setInterval(() => {
      const v = video.current
      if (fired || !v) return
      // Some HLS streams stop just before the duration without firing "ended"; that is not a stall.
      const nearEnd = Number.isFinite(v.duration) && v.duration - v.currentTime < 2
      if (!live.current.active || v.paused || nearEnd || v.currentTime !== last) { last = v.currentTime; since = Date.now(); return }
      if (Date.now() - since >= stallMs) { fired = true; live.current.onStall?.() }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return {
    buffering,
    slow,
    onWaiting: () => { if (!video.current?.paused) setBuffering(true) },
    onReady: () => setBuffering(false),
  }
}
