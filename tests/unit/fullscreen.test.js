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
  win.hide = vi.fn(() => { if (fs) { fs = false; win.emit('leave-full-screen') } })
  return win
}

function setup(initial) {
  const win = fakeWin(initial)
  const state = { fullscreen: initial }
  const settings = { get: () => state, update: vi.fn((patch) => Object.assign(state, patch)) }
  const send = vi.fn()
  const fs = attachFullscreen({ win, settings, send })
  return { win, settings, send, fs }
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
  it('keeps the fullscreen setting when the window is hidden to the tray', () => {
    const { win, settings, send, fs } = setup(true)
    fs.beforeHide()
    win.hide()
    expect(settings.update).not.toHaveBeenCalledWith({ fullscreen: false })
    expect(send).not.toHaveBeenCalledWith(EVENTS.fullscreen, false)
  })
  it('returns to fullscreen when shown again', () => {
    const { win, fs } = setup(true)
    fs.beforeHide()
    win.hide()
    fs.afterShow()
    expect(win.setFullScreen).toHaveBeenCalledWith(true)
    expect(fs.get()).toBe(true)
  })
  it('does not enter fullscreen on show when it was off', () => {
    const { win, fs } = setup(false)
    fs.beforeHide()
    win.hide()
    fs.afterShow()
    expect(win.setFullScreen).not.toHaveBeenCalledWith(true)
  })
  it('remembers leaving fullscreen with Esc before hiding', () => {
    const { win, settings, fs } = setup(true)
    fs.set(false)
    fs.beforeHide()
    win.hide()
    fs.afterShow()
    expect(fs.get()).toBe(false)
    expect(settings.update).toHaveBeenLastCalledWith({ fullscreen: false })
  })
  it('saves leaving fullscreen again after the window is shown', () => {
    const { win, settings, fs } = setup(true)
    fs.beforeHide()
    win.hide()
    fs.afterShow()
    fs.set(false)
    expect(settings.update).toHaveBeenLastCalledWith({ fullscreen: false })
  })
})
