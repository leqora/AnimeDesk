import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatest } from './useLatest.js'
import { captureFrame } from './captureFrame.js'
import { bufferedRanges } from '../../shared/player.js'
import {
  PREVIEW_DEBOUNCE_MS, PREVIEW_IDLE_MS, PREVIEW_SEEK_TIMEOUT_MS,
  previewAllowed, bucketOf, bufferedAhead, canFetch, pruneRecent, createFrameCache,
} from '../../shared/framePreview.js'

const HLS_CONFIG = {
  enableWorker: true, autoStartLoad: false, startLevel: 0, capLevelToPlayerSize: false,
  maxBufferLength: 4, maxMaxBufferLength: 4, backBufferLength: 0,
}
const OFF = { allowed: false, src: null, exact: false }

// Frame preview for the seek bar: a lazily created hidden <video> (+ its own hls.js instance) that is sought to the
// hovered time and drawn to a small canvas. Never touches the main player; every error is silent and turns the
// preview off for this episode. At most one seek is outstanding, with at most one newer target waiting behind it.
export function useFramePreview({ open, host, main, modeRef, frontierRef, statusRef, enabled, HlsImpl, capture = captureFrame }) {
  const [frame, setFrame] = useState(null)
  const live = useLatest({ open, enabled, HlsImpl, capture })
  // per-episode state; `inst` is the lazily created preview player
  const s = useRef({ inst: null, failed: false, dead: true, hovering: false, at: 0, recent: [], debounce: null, idle: null }).current

  const show = (next) => setFrame((prev) => (prev && next && prev.allowed === next.allowed && prev.src === next.src && prev.exact === next.exact ? prev : next))

  const allowedAt = (at) => !s.failed && live.current.enabled && modeRef.current !== 'off' && previewAllowed(modeRef.current, at, frontierRef.current)

  const refresh = () => {
    if (!s.hovering || s.dead) return
    const at = s.at
    if (!allowedAt(at)) { show(OFF); return }
    const cache = s.inst?.cache
    const b = bucketOf(at)
    const hit = cache?.get(b)
    if (hit !== undefined) { show({ allowed: true, src: hit, exact: true }); return }
    const near = cache?.nearest(b)
    show({ allowed: true, src: near ? near.src : null, exact: false })
  }

  const destroyInst = () => {
    const inst = s.inst
    if (!inst) return
    s.inst = null
    inst.alive = false
    clearTimeout(inst.timeout)
    clearTimeout(inst.tick)
    inst.video.removeEventListener('seeked', inst.onSeeked)
    inst.video.removeEventListener('error', inst.onError)
    try { inst.hls?.destroy() } catch { /* silent */ }
    inst.video.removeAttribute('src')
    try { inst.video.load() } catch { /* detached / not implemented */ }
    inst.video.remove()
    inst.cache.clear()
  }

  const fail = () => {
    s.failed = true
    clearTimeout(s.debounce)
    destroyInst()
    if (s.hovering && !s.dead) show(OFF)
  }

  const settle = (inst, f, src) => {
    if (!inst.alive || inst.flight !== f) return
    inst.flight = null
    clearTimeout(inst.timeout)
    clearTimeout(inst.tick)
    if (src) inst.cache.set(bucketOf(f.at), src)
    refresh()
  }

  const finishSeek = (inst, f) => {
    if (!inst.alive || inst.flight !== f) return
    let src = null
    if (Math.abs(inst.video.currentTime - f.at) > 1) { settle(inst, f, null); return }
    try { src = live.current.capture(inst.video) } catch { fail(); return }
    settle(inst, f, src)
  }

  const createInst = () => {
    const { open: o, HlsImpl: Hls } = live.current
    const parent = host.current
    if (!parent) return null
    const video = document.createElement('video')
    video.className = 'player__preview-src'
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('aria-hidden', 'true')
    const inst = { alive: true, video, hls: null, cache: createFrameCache(), flight: null, timeout: null, tick: null, onSeeked: null, onError: null }
    inst.onSeeked = () => {
      const f = inst.flight
      if (!inst.alive || !f || f.seeked) return
      f.seeked = true
      const done = () => finishSeek(inst, f)
      // requestVideoFrameCallback may never fire (no new frame presented), so a timer always backs it up
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => { if (inst.alive) done() })
        inst.tick = setTimeout(done, 200)
      } else inst.tick = setTimeout(done, 0)
    }
    inst.onError = () => { if (inst.alive) fail() }
    video.addEventListener('seeked', inst.onSeeked)
    video.addEventListener('error', inst.onError)
    if (o.kind === 'file') {
      video.preload = 'metadata'
      video.crossOrigin = 'anonymous'
      video.src = o.src
    } else {
      video.preload = 'auto'
      const hls = new Hls(HLS_CONFIG)
      inst.hls = hls
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!inst.alive) return
        if (hls.levels?.length > 1) hls.currentLevel = 0
        // a seek requested before the manifest was parsed could not start loading yet
        if (s.hovering && inst.flight && inst.flight.needsLoad) { inst.flight.needsLoad = false; hls.startLoad(inst.flight.at) }
      })
      hls.on(Hls.Events.ERROR, (_e, d) => { if (inst.alive && d?.fatal) fail() })
      hls.loadSource(o.src)
      hls.attachMedia(video)
    }
    parent.appendChild(video)
    s.inst = inst
    return inst
  }

  const guardOk = (inst) => {
    const kind = live.current.open.kind === 'file' ? 'file' : 'hls'
    const m = main.current
    if (kind === 'hls' && !m) return false
    const now = Date.now()
    s.recent = pruneRecent(s.recent, now)
    let ahead = 0
    if (kind === 'hls') ahead = bufferedAhead(bufferedRanges(m.buffered), m.currentTime)
    const st = statusRef.current || {}
    return canFetch({
      kind, inFlight: !!inst.flight, mainPaused: !!m?.paused, ahead,
      buffering: !!st.buffering, failed: !!st.failed, readyState: m?.readyState ?? 0, recent: s.recent, now,
    })
  }

  const start = (inst, at) => {
    if (!guardOk(inst)) return
    s.recent.push(Date.now())
    const f = { at, seeked: false, needsLoad: false }
    inst.flight = f
    inst.hls?.stopLoad()
    try { inst.video.currentTime = at } catch { /* not seekable yet */ }
    if (inst.hls) {
      if (inst.hls.levels?.length) inst.hls.startLoad(at)
      else f.needsLoad = true
    }
    inst.timeout = setTimeout(() => settle(inst, f, null), PREVIEW_SEEK_TIMEOUT_MS)
  }

  function request(at) {
    if (s.failed || s.dead || !allowedAt(at)) return
    const inst = s.inst || createInst()
    if (!inst) return
    if (inst.cache.get(bucketOf(at)) !== undefined) return
    if (inst.flight) {
      // replace the outstanding seek: stopLoad() aborts the fragment it needs, so its `seeked` would never come
      clearTimeout(inst.timeout)
      clearTimeout(inst.tick)
      inst.flight = null
    }
    start(inst, at)
  }

  const hover = useCallback((at) => {
    if (s.dead) return
    s.hovering = true
    s.at = at
    clearTimeout(s.idle)
    clearTimeout(s.debounce)
    refresh()
    if (!allowedAt(at)) return
    s.debounce = setTimeout(() => request(s.at), PREVIEW_DEBOUNCE_MS)
  }, [])

  const leave = useCallback(() => {
    if (s.dead) return
    s.hovering = false
    clearTimeout(s.debounce)
    clearTimeout(s.idle)
    const inst = s.inst
    if (inst) {
      clearTimeout(inst.timeout)
      clearTimeout(inst.tick)
      inst.flight = null
      inst.hls?.stopLoad()
      s.idle = setTimeout(destroyInst, PREVIEW_IDLE_MS)
    }
    show(null)
  }, [])

  useEffect(() => {
    s.failed = false
    s.hovering = false
    s.recent = []
    s.dead = !enabled
    return () => {
      s.dead = true
      s.hovering = false
      clearTimeout(s.debounce)
      clearTimeout(s.idle)
      destroyInst()
      setFrame(null)
    }
  }, [open.playbackId, enabled])

  return { hover, leave, frame }
}
