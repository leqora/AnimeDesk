// Scrolls `el` to `y`, waiting (rAF loop) until its content is tall enough, e.g. a page that loads its list async.
// The user scrolling or clicking meanwhile cancels it. Returns cancel().
export function restoreScroll(el, y, { timeoutMs = 1500 } = {}) {
  if (!el) return () => {}
  if (!(y > 0)) { el.scrollTop = 0; return () => {} }
  const start = Date.now()
  let raf = null
  let stopped = false
  const events = ['wheel', 'keydown', 'pointerdown']
  const stop = () => {
    stopped = true
    if (raf != null) cancelAnimationFrame?.(raf)
    events.forEach((n) => el.removeEventListener(n, stop))
  }
  events.forEach((n) => el.addEventListener(n, stop))
  const tick = () => {
    if (stopped) return
    const max = Math.max(0, el.scrollHeight - el.clientHeight)
    if (max >= y || Date.now() - start >= timeoutMs) {
      el.scrollTop = Math.min(y, max)
      stop()
      return
    }
    raf = requestAnimationFrame(tick)
  }
  tick()
  return stop
}
