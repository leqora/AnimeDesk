import { useEffect, useState } from 'react'
import { useLatest } from './useLatest.js'

export const COUNTDOWN_S = 10

// What happens when an episode ends: a countdown to the next one, a manual choice, or the end of the series.
export function useEpisodeEnd({ autoNext, lastEpisode, onNext }) {
  const [end, setEnd] = useState(null)
  const [left, setLeft] = useState(COUNTDOWN_S)
  const next = useLatest(onNext)
  const finish = () => {
    if (lastEpisode) setEnd('done')
    else if (autoNext) { setLeft(COUNTDOWN_S); setEnd('countdown') }
    else setEnd('manual')
  }
  useEffect(() => {
    if (end !== 'countdown') return undefined
    const id = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(id)
  }, [end])
  useEffect(() => { if (end === 'countdown' && left <= 0) next.current() }, [left, end])
  return { end, left, finish, cancel: () => setEnd('manual') }
}
