import { useEffect } from 'react'

// Volume above 100 % via Web Audio: element -> gain (-> limiter) -> destination.
// A media element can only be wrapped once (a second createMediaElementSource throws InvalidStateError),
// so the graph is created lazily per element and re-wired on every change.
let ctx = null
let graphs = new WeakMap()
let warned = false

const warnOnce = (err) => {
  if (warned) return
  warned = true
  console.warn('Volume boost unavailable:', err)
}

// Test seam: forget the shared context and all graphs.
export function __resetVolumeBoostForTests() {
  ctx = null
  graphs = new WeakMap()
  warned = false
}

function getContext(Impl) {
  if (ctx) return ctx
  if (!Impl) { warnOnce('no AudioContext'); return null }
  try { ctx = new Impl() } catch (err) { warnOnce(err) }
  return ctx
}

function getGraph(el, Impl) {
  const existing = graphs.get(el)
  if (existing) return existing
  const c = getContext(Impl)
  if (!c) return null
  try {
    // create the nodes first: a failure below must not leave the element captured by an output-less source
    const gain = c.createGain()
    const limiter = c.createDynamicsCompressor()
    limiter.threshold.value = -1
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.25
    const source = c.createMediaElementSource(el)
    const graph = { source, gain, limiter }
    graphs.set(el, graph)
    return graph
  } catch (err) { warnOnce(err); return null }
}

const disconnectAll = ({ source, gain, limiter }) => { source.disconnect(); gain.disconnect(); limiter.disconnect() }

export function useVolumeBoost(video, boost, { AudioContextImpl = typeof window === 'undefined' ? undefined : window.AudioContext } = {}) {
  useEffect(() => {
    const el = video.current
    if (!el) return undefined
    const existing = graphs.get(el)
    if (boost === 1 && !existing) return undefined
    const graph = getGraph(el, AudioContextImpl)
    if (!graph || !ctx) return undefined
    const { source, gain, limiter } = graph
    disconnectAll(graph)
    source.connect(gain)
    if (boost > 1) { gain.connect(limiter); limiter.connect(ctx.destination) } else gain.connect(ctx.destination)
    gain.gain.setTargetAtTime(boost, ctx.currentTime, 0.02)
    return () => disconnectAll(graph)
  }, [video, boost]) // eslint-disable-line react-hooks/exhaustive-deps

  // Browsers start the context suspended until a user gesture.
  useEffect(() => {
    const el = video.current
    if (!el) return undefined
    const wake = () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}) }
    // On play always resume: the previous player's suspend() may still be pending (state still 'running'),
    // and calls run in order, so resume() queued after it leaves the context running.
    const onPlay = () => { if (ctx) ctx.resume().catch(() => {}) }
    el.addEventListener('play', onPlay)
    window.addEventListener('keydown', wake)
    window.addEventListener('pointerdown', wake)
    return () => {
      el.removeEventListener('play', onPlay)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('pointerdown', wake)
      // player closed: do not keep the output stream open for the rest of the session (play/keydown/pointerdown resume it)
      if (ctx) ctx.suspend().catch(() => {})
    }
  }, [video])
}
