import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import os from 'node:os'
import extractZip from 'extract-zip'
import { createPaths } from './paths.js'
import { createSettings } from './settings.js'
import { createLibrary } from './library.js'
import { createSeriesPrefs } from './seriesPrefs.js'
import { createToolManager } from './toolManager.js'
import { getJson, download, isOnline } from './http.js'
import { run } from './run.js'
import { createBridgeServer } from './bridgeServer.js'
import { createAniCliBridge } from './aniCliBridge.js'
import { createPlayer } from './playerMonitor.js'
import { createWatchService } from './watchService.js'
import { createDownloads } from './downloads.js'
import { createAniList } from './anilist.js'
import { createWatchLog } from './watchLog.js'
import { createProgress } from './progress.js'
import { createTracker } from './tracker.js'
import { computeStats } from '../shared/stats.js'
import { createHealthCheck } from './healthCheck.js'
import { createHandlers, registerIpc } from './ipc.js'
import { hardenWindow } from './windowSecurity.js'
import { attachFullscreen } from './fullscreen.js'
import { autoUpdater } from 'electron-updater'
import { createUpdater } from './updater.js'
import { createWhatsNew, readReleaseNotes } from './whatsNew.js'
import { markdownToText } from '../shared/releaseNotes.js'
import { EVENTS } from '../shared/channels.js'

const REPO_URL = 'https://github.com/leqora/AnimeDesk'
const SIX_HOURS = 6 * 60 * 60 * 1000

app.setPath('userData', process.env.ANIMEDESK_USER_DATA ?? path.join(app.getPath('appData'), 'AnimeDesk'))

let win = null
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) }

let fullscreen = null

function createWindow(settings) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    fullscreen: settings.get().fullscreen,
    backgroundColor: '#15151c',
    autoHideMenuBar: true,
    title: 'AnimeDesk',
    icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // the bundled preload only needs contextBridge and ipcRenderer
    },
  })
  hardenWindow(win.webContents, { devUrl: process.env.ELECTRON_RENDERER_URL ?? null })
  fullscreen = attachFullscreen({ win, settings, send })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function main() {
  await app.whenReady()
  const paths = createPaths(app.getPath('userData'))
  const settings = createSettings(paths.settings, { systemName: os.userInfo().username })
  const releasesDir = app.isPackaged ? path.join(process.resourcesPath, 'releases') : path.join(app.getAppPath(), 'docs', 'releases')
  const whatsNew = createWhatsNew({ settings, currentVersion: app.getVersion(), readNotes: (v) => markdownToText(readReleaseNotes(releasesDir, v)) })
  whatsNew.init()
  const updater = createUpdater({ autoUpdater, isPackaged: app.isPackaged, currentVersion: app.getVersion(), getSettings: () => settings.get(), notify: send })
  const library = createLibrary(paths.library)
  const seriesPrefs = createSeriesPrefs(paths.seriesPrefs)
  const anilist = createAniList({ cacheDir: paths.cache })
  const watchLog = createWatchLog(paths.watchLog)
  const computeSnapshot = () => {
    const entries = library.list()
    const infoById = {}
    for (const e of entries) {
      const info = anilist.getCached(e.title, { aniListId: e.aniListId })
      if (info) infoById[e.id] = info
    }
    const now = new Date()
    return computeStats({ entries, log: watchLog.list(), infoById, now: now.toISOString(), tzOffsetAt: (iso) => new Date(iso).getTimezoneOffset() })
  }
  const progress = createProgress({ file: paths.profile, computeSnapshot, notify: send })
  progress.init()
  const tracker = createTracker({ library, watchLog, progress })
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
  const watch = createWatchService({ aniCli, player, library: { recordWatched: (p) => tracker.recordWatched(p, 'auto') }, settings, notify: send, seriesPrefs })
  const downloads = createDownloads({ file: paths.downloads, aniCli, onChange: () => send(EVENTS.downloads, downloads.queueItems()), resolvePrefs: (title) => seriesPrefs.resolve(title, settings.get()) })
  const health = createHealthCheck({ toolManager, aniCli, isOnline, onState: (s) => send(EVENTS.health, s) })

  registerIpc(ipcMain, createHandlers({
    settings, library, seriesPrefs, tracker, progress, anilist, toolManager, health, watch, downloads, updater, whatsNew, send,
    window: { get: () => fullscreen?.get() ?? false, set: (v) => fullscreen?.set(v) },
    electron: {
      pickFolder: async () => {
        const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
        return r.canceled ? null : r.filePaths[0]
      },
      showItemInFolder: (p) => shell.showItemInFolder(p),
      openRepo: () => shell.openExternal(REPO_URL),
    },
  }))

  createWindow(settings)
  updater.start()
  health.run().then(() => health.dailyUpdate({ enabled: settings.get().autoUpdateTools, now: new Date().toISOString() }))
  setInterval(() => { if (health.get().reason === 'source-down') health.run() }, SIX_HOURS)

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => { server.stop() })
}

main()
