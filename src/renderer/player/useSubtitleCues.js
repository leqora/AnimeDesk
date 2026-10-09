import { useEffect, useRef, useState } from 'react'
import { activeCues, isTopCue } from '../../shared/subtitles.js'

// The <track> stays the parser (mode "hidden": the browser loads cues but draws nothing); we pick the cues for
// currentTime − offset ourselves and only re-render when the visible set changes.
export function useSubtitleCues(trackRef, videoRef, offset, playbackId) {
  const [cues, setCues] = useState([])
  const [status, setStatus] = useState(trackRef.current ? 'loading' : 'none')
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const shown = useRef([])
  const refresh = useRef(() => {})

  useEffect(() => {
    const el = trackRef.current
    const v = videoRef.current
    shown.current = []
    setCues([])
    if (!el || !v) { setStatus('none'); return undefined }
    setStatus('loading')
    if (el.track) el.track.mode = 'hidden'
    refresh.current = () => {
      const track = el.track
      if (!track) return
      if (track.mode !== 'hidden') track.mode = 'hidden'
      const next = activeCues(track.cues ? Array.from(track.cues) : [], v.currentTime - offsetRef.current)
      if (next.length === shown.current.length && next.every((c, i) => c === shown.current[i])) return
      shown.current = next
      setCues(next.map((c, i) => ({ id: `${c.startTime}:${i}:${c.id ?? ''}`, text: c.text, top: isTopCue(c) })))
    }
    const tick = () => refresh.current()
    let frame = null
    const stop = () => {
      if (!frame) return
      if (frame.kind === 'video') v.cancelVideoFrameCallback(frame.id)
      else cancelAnimationFrame(frame.id)
      frame = null
    }
    const loop = () => {
      tick()
      if (typeof v.requestVideoFrameCallback === 'function') frame = { kind: 'video', id: v.requestVideoFrameCallback(loop) }
      else if (typeof requestAnimationFrame === 'function') frame = { kind: 'raf', id: requestAnimationFrame(loop) }
    }
    const start = () => { stop(); loop() }
    const onLoad = () => { setStatus('ready'); tick() }
    const onError = () => setStatus('error')
    el.addEventListener('load', onLoad)
    el.addEventListener('error', onError)
    for (const e of ['timeupdate', 'seeked', 'pause']) v.addEventListener(e, tick)
    v.addEventListener('playing', start)
    v.addEventListener('pause', stop)
    v.addEventListener('ended', stop)
    if (!v.paused) start()
    return () => {
      stop()
      el.removeEventListener('load', onLoad)
      el.removeEventListener('error', onError)
      for (const e of ['timeupdate', 'seeked', 'pause']) v.removeEventListener(e, tick)
      v.removeEventListener('playing', start)
      v.removeEventListener('pause', stop)
      v.removeEventListener('ended', stop)
      refresh.current = () => {}
    }
  }, [playbackId])

  useEffect(() => { refresh.current() }, [offset])

  return { cues, status }
}
