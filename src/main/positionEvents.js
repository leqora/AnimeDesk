import { EVENTS } from '../shared/channels.js'

// Trailing throttle: the first call opens a window, the window's end fires once.
export function createThrottle(fn, ms, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null
  const run = () => { timer = null; fn() }
  return {
    call() { if (!timer) timer = setTimer(run, ms) },
    flush() { if (timer) clearTimer(timer); run() },
    dispose() { if (timer) clearTimer(timer); timer = null },
  }
}

// Positions are saved every ~5 s while playing: tell the renderer at most once per window. A clear (the episode
// was just recorded as watched) goes out at once so cards drop its "min left" right away.
export function connectPositionEvents({ positions, send, ms = 5000, setTimer, clearTimer }) {
  const throttle = createThrottle(() => send(EVENTS.positionsChanged), ms, { setTimer, clearTimer })
  const off = positions.onChange((kind) => (kind === 'clear' ? throttle.flush() : throttle.call()))
  return () => { off(); throttle.dispose() }
}
