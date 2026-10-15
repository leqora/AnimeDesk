import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { progressRatio, remainingMinutes } from '../../shared/player.js'

const EMPTY = {}

function toProgress(raw) {
  const out = {}
  for (const [ep, v] of Object.entries(raw ?? {})) {
    if (!v || !Number.isFinite(v.position) || !Number.isFinite(v.duration) || v.duration <= 0) continue
    out[ep] = { position: v.position, duration: v.duration, ratio: progressRatio(v.position, v.duration), remaining: remainingMinutes(v.position, v.duration) }
  }
  return out
}

// Saved positions of one series (by ani-cli title), refreshed when main reports a change. Only numbers and times —
// never anything about what happens in an episode. Only the latest request may set the state.
export function useEpisodeProgress(title) {
  const api = useApi()
  const [progress, setProgress] = useState(EMPTY)
  useEffect(() => {
    setProgress(EMPTY)
    if (!title) return undefined
    let live = true
    let seq = 0
    const load = () => {
      const n = ++seq
      api.positions.forSeries(title)
        .then((r) => { if (live && n === seq) setProgress(toProgress(r)) })
        .catch(() => { if (live && n === seq) setProgress(EMPTY) })
    }
    load()
    const off = api.onPositionsChanged(load)
    return () => { live = false; off?.() }
  }, [api, title])
  return progress
}
