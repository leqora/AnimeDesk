import { EVENTS } from '../shared/channels.js'

export const isF11 = (input) => input.type === 'keyDown' && input.key === 'F11' && !input.control && !input.alt && !input.shift && !input.meta

// F11 is caught in the main process so it works whatever has focus; Esc is handled by the renderer (dialogs use it too).
export function attachFullscreen({ win, settings, send }) {
  win.webContents.on('before-input-event', (event, input) => {
    if (!isF11(input)) return
    event.preventDefault()
    win.setFullScreen(!win.isFullScreen())
  })
  const sync = (value) => { settings.update({ fullscreen: value }); send(EVENTS.fullscreen, value) }
  win.on('enter-full-screen', () => sync(true))
  win.on('leave-full-screen', () => sync(false))
  return { get: () => win.isFullScreen(), set: (v) => win.setFullScreen(Boolean(v)) }
}
