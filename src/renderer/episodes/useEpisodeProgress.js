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

function sameProgress(a, b) {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => b[k] && a[k].position === b[k].position && a[k].duration === b[k].duration)
}

// One IPC subscription per api object, shared by every hook instance (cards, hero, pickers).
const hubs = new WeakMap()
function subscribe(api, cb) {
  let hub = hubs.get(api)
  if (!hub) {
    hub = { set: new Set(), off: null }
    hub.off = api.onPositionsChanged(() => { for (const fn of [...hub.set]) fn() })
    hubs.set(api, hub)
  }
  hub.set.add(cb)
  return () => {
    hub.set.delete(cb)
    if (hub.set.size === 0) {
      hub.off?.()
      if (hubs.get(api) === hub) hubs.delete(api)
    }
  }
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
        .then((r) => { if (live && n === seq) { const next = toProgress(r); setProgress((prev) => (sameProgress(prev, next) ? prev : next)) } })
        .catch(() => { if (live && n === seq) setProgress(EMPTY) })
    }
    load()
    const off = subscribe(api, load)
    return () => { live = false; off() }
  }, [api, title])
  return progress
}
