// Where a context menu of `size` goes so it stays inside the window. anchor.y is used when it fits below, anchor.altY (the
// top edge of the thing the menu belongs to) when it has to flip above. view.top keeps it below the top bar.
export function placeMenu(anchor, size, view) {
  const { w, h } = size
  const { vw, vh, top: viewTop } = view
  const margin = view.margin ?? 8

  let left = anchor.x + w > vw - margin ? (anchor.altX ?? anchor.x) - w : anchor.x
  left = Math.max(margin, Math.min(left, vw - margin - w))

  const lo = Math.max(viewTop, margin)
  const hi = vh - margin - h
  let top = anchor.y + h > vh - margin ? anchor.altY - h : anchor.y
  top = hi < lo ? lo : Math.min(Math.max(top, lo), hi)
  return { left, top }
}
