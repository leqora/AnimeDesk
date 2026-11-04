const W = 160
const H = 90

// One frame of the (hidden) preview <video> as a small JPEG data URL; null when there is nothing to draw.
// A tainted canvas throws SecurityError from toDataURL on purpose: the caller turns the preview off.
export function captureFrame(video) {
  if (!video || !video.videoWidth) return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, W, H)
  return canvas.toDataURL('image/jpeg', 0.7)
}
