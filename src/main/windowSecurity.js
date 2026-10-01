// The window only ever shows the app itself: in dev the Vite server, in production the bundled file.
export function isAppUrl(url, devUrl) {
  if (devUrl) return url.startsWith(devUrl)
  return url.startsWith('file://')
}

export function hardenWindow(webContents, { devUrl }) {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, devUrl)) event.preventDefault()
  })
}
