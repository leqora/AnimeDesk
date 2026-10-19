import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification, powerMonitor, safeStorage } from 'electron'
import path from 'node:path'
import os from 'node:os'
import extractZip from 'extract-zip'
import { createPaths } from './paths.js'
import { createSettings } from './settings.js'
import { createLibrary } from './library.js'
import { createSeriesPrefs } from './seriesPrefs.js'
import { createToolManager } from './toolManager.js'
import { ensureMpvConfig } from './mpvConfig.js'
import { getJson, download, isOnline } from './http.js'
import { run } from './run.js'
import { createBridgeServer } from './bridgeServer.js'
import { createAniCliBridge } from './aniCliBridge.js'
import { createPlayer } from './playerMonitor.js'
import { createStreamServer } from './streamServer.js'
import { createInternalPlayer } from './internalPlayer.js'
import { createPositions } from './positions.js'
import { connectPositionEvents } from './positionEvents.js'
import { createWatchService } from './watchService.js'
import { createDownloads } from './downloads.js'
import { createAniList } from './anilist.js'
import { createEpisodeMeta } from './episodeMeta.js'
import { createEpisodeLists } from './episodeLists.js'
import { createSeriesEpisodes } from './seriesEpisodes.js'
import { createFillerInfo } from './fillerInfo.js'
import { createAniSkip } from './aniskip.js'
import { createSkipLookup, createTotalEpisodes } from './skipLookup.js'
import { createWatchLog } from './watchLog.js'
import { createProgress } from './progress.js'
import { createCelebrations } from './celebrations.js'
import { createTracker } from './tracker.js'
import { createDataBackup } from './dataBackup.js'
import { createSettingsEffects } from './settingsEffects.js'
import { computeStats } from '../shared/stats.js'
import { createHealthCheck } from './healthCheck.js'
import { createHealthStore } from './healthStore.js'
import { createHandlers, registerIpc } from './ipc.js'
import { hardenWindow } from './windowSecurity.js'
import { attachFullscreen } from './fullscreen.js'
import { autoUpdater } from 'electron-updater'
import { createUpdater } from './updater.js'
import { createWhatsNew, readReleaseNotes } from './whatsNew.js'
import { markdownToText } from '../shared/releaseNotes.js'
import { EVENTS } from '../shared/channels.js'
import { createNotificationsStore } from './notificationsStore.js'
import { createAiringWatcher } from './airingWatcher.js'
import { createAutoDownloader } from './autoDownloader.js'
import { createAniListAuth } from './anilistAuth.js'
import { createAniListSync } from './anilistSync.js'
import { createSequels } from './sequels.js'
import { createTray } from './tray.js'
import { shouldHideOnClose, startHidden, notificationText, shouldNotifyDownload, trayLabels } from './background.js'

const REPO_URL = 'https://github.com/leqora/AnimeDesk'
const SIX_HOURS = 6 * 60 * 60 * 1000

app.setAppUserModelId('com.leqora.animedesk')
app.setPath('userData', process.env.ANIMEDESK_USER_DATA ?? path.join(app.getPath('appData'), 'AnimeDesk'))
// The lock is per userData, so isolated e2e/manual profiles do not collide with an installed app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

let win = null
let pendingShow = false // a second launch (without --hidden) that arrived before the window existed
let quitting = false
let tray = null
const liveNotifications = new Set() // Windows GC drops click handlers of unreferenced Notification objects
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) }

let fullscreen = null

function showWindow() {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  fullscreen?.afterShow()
}

// Registered right after the lock: main() awaits several things before the window exists, and a second launch
// during that time would otherwise be lost.
if (gotLock) {
  app.on('second-instance', (_e, argv) => {
    if (startHidden(argv)) return
    if (win) showWindow()
    else pendingShow = true
  })
}

function createWindow(settings) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    fullscreen: settings.get().fullscreen,
    show: false,
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
  win.once('ready-to-show', () => {
    if (pendingShow) showWindow()
    else if (!startHidden(process.argv)) win.show()
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function main() {
  await app.whenReady()
  const paths = createPaths(app.getPath('userData'))
  const settings = createSettings(paths.settings, { systemName: os.userInfo().username, isPackaged: app.isPackaged })
  const releasesDir = app.isPackaged ? path.join(process.resourcesPath, 'releases') : path.join(app.getAppPath(), 'docs', 'releases')
  const whatsNew = createWhatsNew({ settings, currentVersion: app.getVersion(), readNotes: (v) => markdownToText(readReleaseNotes(releasesDir, v)) })
  whatsNew.init()
  const updater = createUpdater({ autoUpdater, isPackaged: app.isPackaged, currentVersion: app.getVersion(), getSettings: () => settings.get(), notify: send })
  const library = createLibrary(paths.library)
  const seriesPrefs = createSeriesPrefs(paths.seriesPrefs)
  const anilist = createAniList({ cacheDir: paths.cache })
  const episodeMeta = createEpisodeMeta({ cacheDir: paths.anizipCache })
  const episodeLists = createEpisodeLists(paths.episodeLists)
  const fillerInfo = createFillerInfo({ cacheDir: paths.jikanCache })
  const seriesEpisodes = createSeriesEpisodes({ library, seriesPrefs, settings, anilist, episodeMeta, episodeLists, fillerInfo, onMarksChanged: () => send(EVENTS.episodesChanged) })
  const aniskip = createAniSkip({ cacheDir: path.join(paths.base, 'cache', 'aniskip') })
  const skipLookup = createSkipLookup({ anilist, aniskip, findAniListId: (title) => library.findByAniCliTitle(title)?.aniListId })
  const positions = createPositions(paths.positions)
  positions.prune(60)
  const stopPositionEvents = connectPositionEvents({ positions, send })
  const streams = createStreamServer()
  await streams.start()
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
  const celebrations = createCelebrations(send)
  const progress = createProgress({ file: paths.profile, computeSnapshot, notify: celebrations.notify })
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
  const totalEpisodes = createTotalEpisodes({ library, anilist })
  const internalPlayer = createInternalPlayer({
    streams, notify: send, positions, seriesPrefs,
    getTotalEpisodes: totalEpisodes,
  })
  const mpvConfigDir = path.join(paths.base, 'mpv-config')
  const mpvExtraArgs = () => {
    if (!settings.get().mpvModernUi) return []
    try {
      const dir = ensureMpvConfig({ dir: mpvConfigDir, uoscRoot: toolManager.toolPaths().uoscRoot, version: toolManager.version('uosc') })
      return dir ? [`--config-dir=${dir}`] : []
    } catch { return [] }
  }
  const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(app.getAppPath(), 'build', 'icon.ico')
  // OS toast; the object is kept referenced until it is clicked, closed or failed (Windows GC drops handlers otherwise).
  const osNotify = (kind, data, onClick) => {
    if (!Notification.isSupported()) return
    try {
      const n = new Notification({ ...notificationText(kind, data, settings.get().language), icon: iconPath })
      const release = () => liveNotifications.delete(n)
      n.on('click', () => { release(); onClick?.() })
      n.on('close', release)
      n.on('failed', release)
      liveNotifications.add(n)
      n.show()
    } catch (err) { console.warn('notification failed', err?.message) }
  }
  const notificationsStore = createNotificationsStore(paths.notifications, { onChange: (payload) => send(EVENTS.notificationsChanged, payload) })
  const airingWatcher = createAiringWatcher({
    library, anilist, file: paths.airingNotified,
    notify: ({ animeId, title, episode }) => {
      const item = notificationsStore.add({ animeId, title, episode })
      if (!item || !settings.get().notifyNewEpisodes) return
      osNotify('episode', { title, episode }, () => { showWindow(); send(EVENTS.openAnime, { animeId }) })
    },
  })
  const crypt = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s),
    decrypt: (b) => safeStorage.decryptString(b),
  }
  const aniListAuth = createAniListAuth({ file: paths.anilistAuth, crypt, anilist })
  const aniListSync = createAniListSync({ file: paths.anilistSync, library, seriesPrefs, anilist, auth: aniListAuth })
  aniListAuth.onChange((status) => send(EVENTS.anilistAuthChanged, status))
  aniListSync.onChange(() => send(EVENTS.anilistSyncChanged))
  const sequels = createSequels({ file: paths.sequels, library, anilist, settings })
  sequels.onChange(() => send(EVENTS.sequelsChanged))
  const applyLoginItem = () => {
    if (!app.isPackaged) return
    try { app.setLoginItemSettings({ openAtLogin: Boolean(settings.get().launchAtLogin), args: ['--hidden'] }) } catch (err) { console.warn('login item failed', err?.message) }
  }
  applyLoginItem()
  // Auto-tracking and IPC both announce library changes through here; a newly "watching" series gets seeded promptly.
  const sendAndWatch = (channel, payload) => {
    send(channel, payload)
    if (channel === EVENTS.libraryChanged) { airingWatcher.check(); autoDownloader.check(); aniListSync.check(); sequels.check() }
  }
  const watch = createWatchService({ mpvExtraArgs, skipsFor: skipLookup, aniCli, player, internalPlayer, positions, library: { recordWatched: (p) => tracker.recordWatched(p, 'auto') }, settings, notify: sendAndWatch, seriesPrefs, celebrations, getTotalEpisodes: totalEpisodes, episodeLists })
  const downloads = createDownloads({
    file: paths.downloads, aniCli,
    onChange: () => send(EVENTS.downloads, downloads.queueItems()),
    onFinished: ({ title, episode, status }) => {
      const windowFocused = Boolean(win && !win.isDestroyed() && win.isFocused() && win.isVisible())
      if (!shouldNotifyDownload({ notifyDownloads: settings.get().notifyDownloads, windowFocused })) return
      osNotify(status === 'done' ? 'downloaded' : 'downloadFailed', { title, episode }, () => { showWindow(); send(EVENTS.openPage, { page: 'downloads' }) })
    },
    resolvePrefs: (title) => seriesPrefs.resolve(title, settings.get()), episodeLists })
  const autoDownloader = createAutoDownloader({ library, anilist, seriesPrefs, settings, downloads })
  const health = createHealthCheck({
    toolManager, aniCli, isOnline, onState: (s) => send(EVENTS.health, s),
    store: createHealthStore({ file: paths.health }),
    isBusy: () => aniCli.activeSessions() > 0,
  })

  const onSettingsChanged = (patch) => {
    if (patch && 'launchAtLogin' in patch) applyLoginItem()
    if (patch && 'language' in patch) tray?.setLabels(trayLabels(settings.get().language))
  }
  // The same side effects run for settings:update and for settings replaced by a data import.
  const settingsEffects = createSettingsEffects({ updater, toolManager, send, onSettingsChanged })
  const dataBackup = createDataBackup({
    paths, library, watchLog, seriesPrefs, positions, settings, tracker, progress, appVersion: app.getVersion(),
    cacheDirs: [paths.cache, paths.anizipCache, path.join(paths.base, 'cache', 'aniskip'), paths.jikanCache],
    isCorrupt: () => library.wasCorrupt || watchLog.wasCorrupt,
    onImported: (keys) => {
      const now = settings.get()
      settingsEffects(Object.fromEntries(keys.map((k) => [k, now[k]])))
      sendAndWatch(EVENTS.libraryChanged) // also runs the airing/auto-download/sync/sequel checks
    },
  })

  registerIpc(ipcMain, createHandlers({
    paths, dataBackup, settings, library, seriesPrefs, tracker, progress, anilist, seriesEpisodes, skipLookup, positions, toolManager, health, watch, internalPlayer, downloads, autoDownloader, updater, whatsNew, notifications: notificationsStore, aniListAuth, aniListSync, sequels,
    send: sendAndWatch,
    onLibraryChanged: () => { airingWatcher.check(); autoDownloader.check(); aniListSync.check(); sequels.check() },
    onSettingsChanged,
    onCacheCleared: () => { fillerInfo.forget(); airingWatcher.refresh().catch(() => {}).finally(() => { autoDownloader.check(); sequels.check() }) },
    window: { get: () => fullscreen?.get() ?? false, set: (v) => fullscreen?.set(v) },
    electron: {
      pickFolder: async () => {
        const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
        return r.canceled ? null : r.filePaths[0]
      },
      showItemInFolder: (p) => shell.showItemInFolder(p),
      openRepo: () => shell.openExternal(REPO_URL),
      openExternal: (url) => shell.openExternal(url),
      saveFile: async (defaultName) => {
        const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), defaultName), filters: [{ name: 'JSON', extensions: ['json'] }] })
        return r.canceled ? null : r.filePath
      },
      openFile: async () => {
        const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
        return r.canceled ? null : r.filePaths[0]
      },
      openPath: (p) => shell.openPath(p),
    },
  }))

  createWindow(settings)
  // A renderer reload or crash ends in-app playback without a playerClosed call, which would hold celebrations
  // forever. stop() is a no-op when nothing is playing (e.g. the very first load).
  const releasePlayback = () => { try { internalPlayer.stop() } catch (err) { console.warn('internalPlayer.stop failed', err?.message) } }
  win.webContents.on('render-process-gone', releasePlayback)
  win.webContents.on('did-start-loading', releasePlayback)
  win.on('close', (e) => {
    if (!shouldHideOnClose({ closeToTray: settings.get().closeToTray, quitting })) return
    e.preventDefault()
    fullscreen?.beforeHide()
    win.hide()
    releasePlayback()
    if (!settings.get().trayHintShown) {
      settings.update({ trayHintShown: true })
      osNotify('trayHint', {})
    }
  })
  // Windows logoff/shutdown must not be blocked by close-to-tray.
  win.on('query-session-end', () => { quitting = true })
  win.on('session-end', () => { quitting = true; app.quit() })
  tray = createTray({ Tray, Menu, iconPath, labels: trayLabels(settings.get().language), onOpen: showWindow, onQuit: () => app.quit() })
  powerMonitor.on('resume', () => { downloads.rearm(); aniListSync.resume(); dataBackup.resume(); airingWatcher.refresh().finally(() => autoDownloader.check()) })
  airingWatcher.start()
  sequels.start()
  dataBackup.start()
  aniListSync.start()
  autoDownloader.start()
  updater.start()
  health.run({ optimistic: true }).then(() => health.dailyUpdate({ enabled: settings.get().autoUpdateTools, now: new Date().toISOString() }))
    .then(() => health.whenIdle())
    .then(() => { if (settings.get().mpvModernUi) return toolManager.installOptional() })
  setInterval(() => { if (health.get().reason === 'source-down') health.run() }, SIX_HOURS)

  app.on('window-all-closed', () => { if (!shouldHideOnClose({ closeToTray: settings.get().closeToTray, quitting })) app.quit() })
  app.on('before-quit', () => { quitting = true; airingWatcher.stop(); autoDownloader.stop(); aniListSync.stop(); sequels.stop(); dataBackup.stop(); aniListAuth.dispose(); downloads.dispose(); tray?.destroy(); stopPositionEvents(); watch.dispose(); server.stop(); streams.stop() })
}

// A failed startup must not leave a silent background process; a stray rejection must not go unnoticed.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection', err))

if (gotLock) main().catch(async (err) => {
  console.error('Startup failed', err)
  await app.whenReady()
  dialog.showErrorBox('AnimeDesk', `Aplikacija nije mogla da se pokrene / The app could not start.\n\n${err?.stack ?? err}`)
  app.exit(1)
})
