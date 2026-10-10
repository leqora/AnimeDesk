import { useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { useLatest } from './useLatest.js'
import { stepRate, formatRate } from '../../shared/player.js'

// Playback speed; every playback starts at 1× (nothing is saved).
export function usePlaybackRate({ video, flash, language }) {
  const t = useT()
  const [rate, setRateState] = useState(1)
  const latest = useLatest({ rate, flash, language, t })
  const setRate = (r) => {
    const v = video.current
    try { if (v) v.playbackRate = r } catch { return }
    const l = latest.current
    l.rate = r // a held key repeats before the next render
    setRateState(r)
    l.flash(l.t('player.speedFlash', { value: formatRate(r, l.language) }))
  }
  const step = (dir) => setRate(stepRate(latest.current.rate, dir))
  const reset = () => setRate(1)
  // a new source (hls.js reload) may put the element back to its default rate
  const reapply = () => { const v = video.current; if (v && v.playbackRate !== latest.current.rate) v.playbackRate = latest.current.rate }
  return { rate, setRate, step, reset, reapply }
}
