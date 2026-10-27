import { useEffect, useState } from 'react'

const osReduced = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)

// Index of the visible slide. The timer only runs with 2+ slides while not paused, the document is visible and motion
// is allowed; every manual choice restarts it. The returned index is always inside 0..count-1.
// `reduced` is the in-app "animations off" setting (passed in, so it is right from the first render); the OS preference is read live.
export function useRotation({ count, intervalMs = 8000, paused = false, reduced: appReduced = false }) {
  const [raw, setRaw] = useState(0)
  const [hidden, setHidden] = useState(() => document.hidden)
  const [osOff, setOsOff] = useState(osReduced)

  useEffect(() => {
    const onVisible = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisible)
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const onMotion = () => setOsOff(osReduced())
    mq?.addEventListener?.('change', onMotion)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      mq?.removeEventListener?.('change', onMotion)
    }
  }, [])

  const index = count > 0 ? raw % count : 0
  const running = count > 1 && !paused && !hidden && !osOff && !appReduced
  useEffect(() => {
    if (!running) return undefined
    const timer = setTimeout(() => setRaw((index + 1) % count), intervalMs)
    return () => clearTimeout(timer)
  }, [running, index, count, intervalMs])

  return [index, setRaw]
}
