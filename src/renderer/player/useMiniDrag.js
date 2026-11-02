import { useEffect, useLayoutEffect } from 'react'
import { miniSize, miniRect, clampPos, nearestCorner, CLICK_SLOP } from './miniLayout.js'
import { useLatest } from './useLatest.js'

const SNAP_MS = 200
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

function place(el, corner) {
  const vp = viewport()
  const size = miniSize(vp.width)
  const at = miniRect(corner, vp, size)
  el.style.width = `${size.width}px`
  el.style.height = `${size.height}px`
  el.style.left = `${at.x}px`
  el.style.top = `${at.y}px`
}

// Positions a floating mini player in a corner, lets it be dragged (it snaps to the nearest corner on release),
// and treats a short press as a click. Only active while `enabled`; otherwise the element keeps its stylesheet layout.
export function useMiniDrag({ ref, enabled = true, corner, onCorner, onClick }) {
  const latest = useLatest({ corner, onCorner, onClick })

  // Placement (before paint, so switching to mini never flashes the full-screen box) and window resize.
  useLayoutEffect(() => {
    const el = ref.current
    if (!enabled || !el) return undefined
    const onResize = () => { if (!el.classList.contains('player--dragging')) place(el, latest.current.corner) }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      for (const p of ['width', 'height', 'left', 'top', 'transform']) el.style.removeProperty(p)
    }
  }, [enabled])
  useLayoutEffect(() => {
    if (enabled && ref.current) place(ref.current, corner)
  }, [enabled, corner])

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return undefined
    let drag = null
    let snapTimer = null

    const move = (e) => {
      if (e.pointerId !== drag.id) return // another pointer (second finger) is not this drag
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag.dist = Math.hypot(dx, dy)
      drag.pos = clampPos({ x: drag.start.x + dx, y: drag.start.y + dy }, drag.vp, drag.size)
      el.style.left = `${drag.pos.x}px`
      el.style.top = `${drag.pos.y}px`
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      try { el.releasePointerCapture?.(drag.id) } catch { /* not captured */ }
    }
    const up = (e) => {
      if (e.pointerId !== drag.id) return
      const d = drag
      stop()
      drag = null
      el.classList.remove('player--dragging')
      const cancelled = e.type === 'pointercancel'
      if (d.dist < CLICK_SLOP || cancelled) {
        place(el, latest.current.corner)
        if (!cancelled) latest.current.onClick?.()
        return
      }
      // the window may have been resized during the drag: judge the drop against the current viewport
      const vp = viewport()
      const size = miniSize(vp.width)
      const dropped = clampPos(d.pos, vp, size)
      const next = nearestCorner(dropped, vp, size)
      const target = miniRect(next, vp, size)
      place(el, next)
      // Slide into the corner with a transform only: jump to the target, then undo the offset with a transition.
      el.style.left = `${target.x}px`
      el.style.top = `${target.y}px`
      el.style.transform = `translate(${dropped.x - target.x}px, ${dropped.y - target.y}px)`
      el.getBoundingClientRect()
      el.classList.add('player--snap')
      el.style.transform = ''
      clearTimeout(snapTimer)
      snapTimer = setTimeout(() => el.classList.remove('player--snap'), SNAP_MS)
      latest.current.onCorner?.(next)
    }
    const down = (e) => {
      if (e.button > 0 || e.isPrimary === false || e.target?.closest?.('button, a, input, select')) return
      const vp = viewport()
      const size = miniSize(vp.width)
      const start = miniRect(latest.current.corner, vp, size)
      clearTimeout(snapTimer)
      el.classList.remove('player--snap')
      el.style.transform = ''
      drag = { x: e.clientX, y: e.clientY, start, pos: start, vp, size, dist: 0, id: e.pointerId }
      try { el.setPointerCapture?.(e.pointerId) } catch { /* synthetic or already released pointer */ }
      el.classList.add('player--dragging')
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    }
    el.addEventListener('pointerdown', down)
    return () => {
      el.removeEventListener('pointerdown', down)
      if (drag) stop()
      el.classList.remove('player--dragging', 'player--snap')
      clearTimeout(snapTimer)
    }
  }, [enabled])
}
