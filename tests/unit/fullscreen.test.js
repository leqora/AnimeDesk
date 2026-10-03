import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { attachFullscreen, isF11 } from '../../src/main/fullscreen.js'
import { EVENTS } from '../../src/shared/channels.js'

function fakeWin(initial = false) {
  const win = new EventEmitter()
  win.webContents = new EventEmitter()
  let fs = initial
  win.isFullScreen = () => fs
  win.setFullScreen = vi.fn((v) => { if (v !== fs) { fs = v; win.emit(v ? 'enter-full-screen' : 'leave-full-screen') } })
  return win
}

describe('fullscreen', () => {
  it('recognises a plain F11 key-down only', () => {
    expect(isF11({ type: 'keyDown', key: 'F11' })).toBe(true)
    expect(isF11({ type: 'keyUp', key: 'F11' })).toBe(false)
    expect(isF11({ type: 'keyDown', key: 'F11', control: true })).toBe(false)
    expect(isF11({ type: 'keyDown', key: 'F10' })).toBe(false)
  })
  it('toggles on F11, saves the state and tells the renderer', () => {
    const win = fakeWin()
    const settings = { update: vi.fn() }
    const send = vi.fn()
    const fs = attachFullscreen({ win, settings, send })
    const event = { preventDefault: vi.fn() }
    win.webContents.emit('before-input-event', event, { type: 'keyDown', key: 'F11' })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(fs.get()).toBe(true)
    expect(settings.update).toHaveBeenCalledWith({ fullscreen: true })
    expect(send).toHaveBeenCalledWith(EVENTS.fullscreen, true)
    fs.set(false)
    expect(settings.update).toHaveBeenLastCalledWith({ fullscreen: false })
    expect(send).toHaveBeenLastCalledWith(EVENTS.fullscreen, false)
    win.webContents.emit('before-input-event', { preventDefault: vi.fn() }, { type: 'keyDown', key: 'a' })
    expect(fs.get()).toBe(false)
  })
})
