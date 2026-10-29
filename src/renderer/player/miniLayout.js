// Pure layout helpers for the floating mini player (no DOM, no React).
export const MINI_PAD = 20
export const TOPBAR_H = 56
export const CLICK_SLOP = 10

export function miniSize(viewportWidth) {
  const width = viewportWidth >= 1024 ? 400 : 300
  return { width, height: (width * 9) / 16 }
}

// Allowed range of the top-left corner.
export function miniBounds(viewport, size) {
  return {
    left: MINI_PAD,
    right: viewport.width - size.width - MINI_PAD,
    top: TOPBAR_H + MINI_PAD,
    bottom: viewport.height - size.height - MINI_PAD,
  }
}

export function miniRect(corner, viewport, size) {
  const b = miniBounds(viewport, size)
  return { x: corner[1] === 'l' ? b.left : b.right, y: corner[0] === 't' ? b.top : b.bottom }
}

// The corner whose resting position is closest (Euclidean) to the dropped top-left position.
export function nearestCorner(pos, viewport, size) {
  let best = 'br'
  let bestDist = Infinity
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    const r = miniRect(corner, viewport, size)
    const d = (r.x - pos.x) ** 2 + (r.y - pos.y) ** 2
    if (d < bestDist) { bestDist = d; best = corner }
  }
  return best
}

export function clampPos(pos, viewport, size) {
  const b = miniBounds(viewport, size)
  return {
    x: Math.min(Math.max(pos.x, b.left), b.right),
    y: Math.min(Math.max(pos.y, b.top), b.bottom),
  }
}
