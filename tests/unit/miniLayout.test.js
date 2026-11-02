import { describe, it, expect } from 'vitest'
import { miniSize, miniRect, miniBounds, nearestCorner, clampPos, MINI_PAD, TOPBAR_H, CLICK_SLOP } from '../../src/renderer/player/miniLayout.js'

describe('miniLayout', () => {
  const vp = { width: 1280, height: 800 }
  const size = { width: 400, height: 225 }
  it('exports the constants', () => {
    expect([MINI_PAD, TOPBAR_H, CLICK_SLOP]).toEqual([20, 56, 10])
  })
  it('sizes by viewport width with a 16:9 ratio', () => {
    expect(miniSize(1280)).toEqual({ width: 400, height: 225 })
    expect(miniSize(1024)).toEqual({ width: 400, height: 225 })
    expect(miniSize(1023)).toEqual({ width: 300, height: 168.75 })
  })
  it('computes bounds of the top-left corner', () => {
    expect(miniBounds(vp, size)).toEqual({ left: 20, right: 860, top: 76, bottom: 555 })
  })
  it('places the mini in every corner', () => {
    expect(miniRect('br', vp, size)).toEqual({ x: 860, y: 555 })
    expect(miniRect('tl', vp, size)).toEqual({ x: 20, y: 76 })
    expect(miniRect('tr', vp, size)).toEqual({ x: 860, y: 76 })
    expect(miniRect('bl', vp, size)).toEqual({ x: 20, y: 555 })
  })
  it('handles a small viewport', () => {
    expect(miniRect('br', { width: 800, height: 600 }, miniSize(800))).toEqual({ x: 480, y: 411.25 })
  })
  it('finds the nearest corner', () => {
    expect(nearestCorner({ x: 100, y: 500 }, vp, size)).toBe('bl')
    expect(nearestCorner({ x: 900, y: 100 }, vp, size)).toBe('tr')
    expect(nearestCorner({ x: 20, y: 76 }, vp, size)).toBe('tl')
    expect(nearestCorner({ x: 860, y: 555 }, vp, size)).toBe('br')
  })
  it('picks the corner whose mini position is closest, not by the viewport midpoint', () => {
    // the usable y range is 76..555, so its midpoint (315.5) decides, not the viewport's (400)
    expect(nearestCorner({ x: 100, y: 300 }, vp, size)).toBe('tl')
    expect(nearestCorner({ x: 100, y: 330 }, vp, size)).toBe('bl')
    expect(nearestCorner({ x: 800, y: 300 }, vp, size)).toBe('tr')
  })
  it('clamps a position into the bounds', () => {
    expect(clampPos({ x: -50, y: 10 }, vp, size)).toEqual({ x: 20, y: 76 })
    expect(clampPos({ x: 5000, y: 5000 }, vp, size)).toEqual({ x: 860, y: 555 })
    expect(clampPos({ x: 300, y: 300 }, vp, size)).toEqual({ x: 300, y: 300 })
  })
})
