import { describe, it, expect } from 'vitest'
import { tintFromPixels, posterTint } from '../../src/renderer/theme/posterTint.js'

const px = (...colors) => colors.flatMap(([r, g, b, a = 255]) => [r, g, b, a])
const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

describe('posterTint', () => {
  it('averages colorful pixels into a saturated tint', () => {
    const hex = tintFromPixels(px([200, 30, 40], [220, 40, 60]))
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(parseInt(hex.slice(1, 3), 16)).toBeGreaterThan(parseInt(hex.slice(3, 5), 16))
  })
  it('clamps lightness of bright posters', () => {
    expect(lightness(tintFromPixels(px([255, 240, 120], [250, 250, 90])))).toBeLessThanOrEqual(0.51)
  })
  it('lifts very dark posters', () => {
    expect(lightness(tintFromPixels(px([10, 10, 60], [5, 5, 40])))).toBeGreaterThanOrEqual(0.29)
  })
  it('returns null for grey or transparent images', () => {
    expect(tintFromPixels(px([120, 120, 120], [10, 10, 10]))).toBeNull()
    expect(tintFromPixels(px([200, 30, 40, 0]))).toBeNull()
  })
  it('returns null when the canvas is unavailable', async () => {
    const createCanvas = () => ({ getContext: () => null })
    expect(await posterTint('data:image/png;base64,AA', { createCanvas, loadImage: async () => ({}) })).toBeNull()
    expect(await posterTint(null)).toBeNull()
  })
})
