const cache = new Map()

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Average of the colorful pixels, made vivid but dark enough for light text on top.
export function tintFromPixels(data) {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    const [R, G, B, A] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (A < 128 || Math.max(R, G, B) - Math.min(R, G, B) < 24) continue
    r += R; g += G; b += B; n++
  }
  if (!n) return null
  const [h, s, l] = rgbToHsl(r / n, g / n, b / n)
  return hslToHex(h, Math.max(s, 0.55), Math.min(0.5, Math.max(0.3, l)))
}

const defaultLoadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

export async function posterTint(dataUrl, { createCanvas = () => document.createElement('canvas'), loadImage = defaultLoadImage } = {}) {
  if (!dataUrl) return null
  if (cache.has(dataUrl)) return cache.get(dataUrl)
  let tint = null
  try {
    const img = await loadImage(dataUrl)
    const canvas = createCanvas()
    canvas.width = 32
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0, 32, 48)
      tint = tintFromPixels(ctx.getImageData(0, 0, 32, 48).data)
    }
  } catch {
    tint = null
  }
  cache.set(dataUrl, tint)
  return tint
}
