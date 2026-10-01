import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { hardenWindow, isAppUrl } from '../../src/main/windowSecurity.js'

function fakeContents() {
  const wc = new EventEmitter()
  wc.setWindowOpenHandler = vi.fn((fn) => { wc.openHandler = fn })
  return wc
}
const navigate = (wc, url) => {
  const event = { preventDefault: vi.fn() }
  wc.emit('will-navigate', event, url)
  return event.preventDefault.mock.calls.length > 0
}

describe('windowSecurity', () => {
  it('recognises the app page in dev and in production', () => {
    expect(isAppUrl('http://localhost:5173/#x', 'http://localhost:5173')).toBe(true)
    expect(isAppUrl('file:///C:/Program%20Files/AnimeDesk/resources/app.asar/out/renderer/index.html', null)).toBe(true)
    expect(isAppUrl('https://evil.example/', 'http://localhost:5173')).toBe(false)
    expect(isAppUrl('https://evil.example/', null)).toBe(false)
  })
  it('denies every new window', () => {
    const wc = fakeContents()
    hardenWindow(wc, { devUrl: null })
    expect(wc.openHandler({ url: 'https://evil.example/' })).toEqual({ action: 'deny' })
  })
  it('blocks navigation away from the app', () => {
    const wc = fakeContents()
    hardenWindow(wc, { devUrl: 'http://localhost:5173' })
    expect(navigate(wc, 'https://evil.example/')).toBe(true)
    expect(navigate(wc, 'http://localhost:5173/')).toBe(false)
  })
})
