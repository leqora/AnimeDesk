const W = 160
const H = 90

// One frame of the (hidden) preview <video> as a small JPEG data URL; null when there is nothing to draw.
// A tainted canvas throws SecurityError from toDataURL on purpose: the caller turns the preview off.
export function captureFrame(video) {
  if (!video || !video.videoWidth || video.readyState < 2) return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // centered "cover" crop so a non-16:9 source is not stretched
  const vw = video.videoWidth
  const vh = video.videoHeight || vw * H / W
  let sw = vw
  let sh = vw * H / W
  if (sh > vh) { sh = vh; sw = vh * W / H }
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H)
  return canvas.toDataURL('image/jpeg', 0.7)
}
