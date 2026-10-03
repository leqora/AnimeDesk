// Run with `npm run icon` (Electron, not Node): renders build/icon.svg and writes build/icon.ico + build/icon.png.
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { packIco } from './ico.mjs'

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const root = path.resolve(import.meta.dirname, '..')
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'))

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden"><img src="data:image/svg+xml;base64,${svg.toString('base64')}" width="256" height="256" style="display:block"></body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 300))
  const big = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 })
  const pngs = SIZES.map((size) => ({ size, data: big.resize({ width: size, height: size, quality: 'best' }).toPNG() }))
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), packIco(pngs))
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), pngs.at(-1).data)
  console.log('wrote build/icon.ico and build/icon.png')
  win.destroy()
  app.quit()
})
