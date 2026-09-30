import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import extractZip from 'extract-zip'
import { createPaths } from './paths.js'
import { createSettings } from './settings.js'
import { createLibrary } from './library.js'
import { createToolManager } from './toolManager.js'
import { getJson, download, isOnline } from './http.js'
import { run } from './run.js'
import { createBridgeServer } from './bridgeServer.js'
import { createAniCliBridge } from './aniCliBridge.js'
import { createPlayer } from './playerMonitor.js'
import { createWatchService } from './watchService.js'
import { createDownloads } from './downloads.js'
import { createAniList } from './anilist.js'
import { createHealthCheck } from './healthCheck.js'
import { createHandlers, registerIpc } from './ipc.js'
import { EVENTS } from '../shared/channels.js'

const SIX_HOURS = 6 * 60 * 60 * 1000

app.setPath('userData', process.env.ANIMEDESK_USER_DATA ?? path.join(app.getPath('appData'), 'AnimeDesk'))

let win = null
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) }

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#15151c',
    autoHideMenuBar: true,
    title: 'AnimeDesk',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function main() {
  await app.whenReady()
  const paths = createPaths(app.getPath('userData'))
  const settings = createSettings(paths.settings)
  const library = createLibrary(paths.library)
  const toolManager = createToolManager({
    paths,
    http: { getJson, download },
    extractZip: (file, dir) => extractZip(file, { dir }),
    runExe: (file, args) => run(file, args).done,
  })
  const server = createBridgeServer()
  await server.start()
  const bridgesDir = app.isPackaged ? path.join(process.resourcesPath, 'bridges') : path.join(app.getAppPath(), 'resources', 'bridges')
  const aniCli = createAniCliBridge({
    toolManager,
    server,
    bridges: { menu: path.join(bridgesDir, 'menu-bridge.sh'), player: path.join(bridgesDir, 'animedesk-mpv-bridge.sh') },
    getSettings: () => settings.get(),
    historyDir: paths.aniCliHistory,
  })
  const player = createPlayer({ getMpvPath: () => toolManager.toolPaths().mpv })
  const watch = createWatchService({ aniCli, player, library, settings, notify: send })
  const downloads = createDownloads({ file: paths.downloads, aniCli, onChange: () => send(EVENTS.downloads, downloads.queueItems()) })
  const anilist = createAniList({ cacheDir: paths.cache })
  const health = createHealthCheck({ toolManager, aniCli, isOnline, onState: (s) => send(EVENTS.health, s) })

  registerIpc(ipcMain, createHandlers({
    settings, library, anilist, toolManager, health, watch, downloads, send,
    electron: {
      pickFolder: async () => {
        const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
        return r.canceled ? null : r.filePaths[0]
      },
      showItemInFolder: (p) => shell.showItemInFolder(p),
    },
  }))

  createWindow()
  health.run().then(() => health.dailyUpdate({ enabled: settings.get().autoUpdateTools, now: new Date().toISOString() }))
  setInterval(() => { if (health.get().reason === 'source-down') health.run() }, SIX_HOURS)

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => { server.stop() })
}

main()
