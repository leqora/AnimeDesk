import { useEffect, useRef, useState } from 'react'
import { useLatest } from './useLatest.js'

export const VOLUME_SAVE_MS = 500

// Volume/mute of the <video>, saved after the slider settles (and on unmount, when the timer would be lost).
export function usePlayerVolume({ video, settings, onSettings }) {
  const [volume, setVolumeState] = useState(settings.playerVolume)
  const [muted, setMuted] = useState(settings.playerMuted)
  const latest = useLatest({ settings, onSettings })
  const timer = useRef(null)
  const pending = useRef(null)
  const flush = useRef(() => {
    clearTimeout(timer.current)
    const p = pending.current
    pending.current = null
    const s = latest.current.settings
    if (p && (p.playerVolume !== s.playerVolume || p.playerMuted !== s.playerMuted)) latest.current.onSettings(p)
  }).current
  useEffect(() => {
    const v = video.current
    v.volume = settings.playerVolume
    v.muted = settings.playerMuted
    return flush
  }, [])
  const onVolumeChange = () => {
    const v = video.current
    setVolumeState(v.volume)
    setMuted(v.muted)
    pending.current = { playerVolume: v.volume, playerMuted: v.muted }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, VOLUME_SAVE_MS)
  }
  const toggleMute = () => { video.current.muted = !video.current.muted }
  const setVolume = (x) => { video.current.volume = x; video.current.muted = false }
  const nudge = (delta) => { const v = video.current; v.volume = Math.min(1, Math.max(0, v.volume + delta)) }
  return { volume, muted, onVolumeChange, toggleMute, setVolume, nudge }
}
