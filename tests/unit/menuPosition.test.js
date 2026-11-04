import { describe, it, expect } from 'vitest'
import { placeMenu } from '../../src/shared/menuPosition.js'

const view = { vw: 1280, vh: 800, top: 56, margin: 8 }
const size = { w: 220, h: 300 }

describe('placeMenu', () => {
  it('opens at the anchor in the middle', () => {
    expect(placeMenu({ x: 400, y: 200, altY: 200 }, size, view)).toEqual({ left: 400, top: 200 })
  })
  it('flips left at the right edge', () => {
    expect(placeMenu({ x: 1200, y: 200, altY: 200 }, size, view).left).toBe(980)
  })
  it('never goes left of the margin after flipping', () => {
    expect(placeMenu({ x: 150, y: 200, altY: 200 }, { w: 1200, h: 300 }, view).left).toBe(8)
  })
  it('altX aligns the right edge of the menu with the anchor element when it flips', () => {
    expect(placeMenu({ x: 1100, y: 200, altY: 200, altX: 1240 }, size, view).left).toBe(1020)
    expect(placeMenu({ x: 400, y: 200, altY: 200, altX: 600 }, size, view).left).toBe(400)
  })
  it('flips up at the bottom edge', () => {
    expect(placeMenu({ x: 400, y: 700, altY: 700 }, size, view).top).toBe(400)
  })
  it('uses altY for an element anchor', () => {
    expect(placeMenu({ x: 400, y: 760, altY: 500 }, size, view).top).toBe(200)
  })
  it('sticks below the top bar when taller than the window', () => {
    expect(placeMenu({ x: 400, y: 200, altY: 200 }, { w: 220, h: 900 }, view).top).toBe(56)
  })
  it('never goes above the top bar', () => {
    expect(placeMenu({ x: 400, y: 700, altY: 300 }, size, view).top).toBe(56)
  })
  it('defaults the margin to 8', () => {
    expect(placeMenu({ x: 150, y: 200, altY: 200 }, { w: 1200, h: 300 }, { vw: 1280, vh: 800, top: 0 }).left).toBe(8)
  })
})
