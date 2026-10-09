import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE, EVENTS } from '../shared/channels.js'

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args)
const on = (channel) => (cb) => {
  const listener = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('animedesk', {
  player: { onOpen: on(EVENTS.playerOpen), onClose: on(EVENTS.playerClose), progress: invoke(INVOKE.playerProgress), closed: invoke(INVOKE.playerClosed) },
  settings: { get: invoke(INVOKE.settingsGet), update: invoke(INVOKE.settingsUpdate) },
  library: {
    list: invoke(INVOKE.libraryList),
    add: invoke(INVOKE.libraryAdd),
    update: invoke(INVOKE.libraryUpdate),
    remove: invoke(INVOKE.libraryRemove),
    setEpisodeNote: invoke(INVOKE.libraryNote),
    recordWatched: invoke(INVOKE.libraryRecord),
    wasCorrupt: invoke(INVOKE.libraryWasCorrupt),
    setPinned: invoke(INVOKE.librarySetPinned),
  },
  seriesPrefs: { get: invoke(INVOKE.seriesPrefsGet), set: invoke(INVOKE.seriesPrefsSet) },
  anilist: { forTitle: invoke(INVOKE.anilistForTitle), search: invoke(INVOKE.anilistSearch) },
  tools: {
    status: invoke(INVOKE.toolsStatus),
    installMissing: invoke(INVOKE.toolsInstallMissing),
    checkUpdates: invoke(INVOKE.toolsCheckUpdates),
    onProgress: on(EVENTS.toolProgress),
  },
  health: { get: invoke(INVOKE.healthGet), recheck: invoke(INVOKE.healthRecheck), onChange: on(EVENTS.health) },
  watch: {
    start: invoke(INVOKE.watchStart),
    cancel: invoke(INVOKE.watchCancel),
    answerMenu: invoke(INVOKE.menuAnswer),
    onMenu: on(EVENTS.menu),
    onAsk: on(EVENTS.ask),
    onPlaying: on(EVENTS.playing),
    onSessionEnd: on(EVENTS.sessionEnd),
  },
  downloads: {
    enqueue: invoke(INVOKE.downloadsEnqueue),
    pause: invoke(INVOKE.downloadsPause),
    resume: invoke(INVOKE.downloadsResume),
    retryFailed: invoke(INVOKE.downloadsRetryFailed),
    cancel: invoke(INVOKE.downloadsCancel),
    queue: invoke(INVOKE.downloadsQueue),
    list: invoke(INVOKE.downloadsList),
    remove: invoke(INVOKE.downloadsRemove),
    play: invoke(INVOKE.downloadsPlay),
    openFolder: invoke(INVOKE.downloadsOpenFolder),
    onChange: on(EVENTS.downloads),
  },
  stats: { get: invoke(INVOKE.statsGet), onLevelUp: on(EVENTS.levelUp), onSeriesCompleted: on(EVENTS.seriesCompleted) },
  update: {
    getState: invoke(INVOKE.updateGetState),
    check: invoke(INVOKE.updateCheck),
    download: invoke(INVOKE.updateDownload),
    install: invoke(INVOKE.updateInstall),
    onState: on(EVENTS.updateState),
  },
  whatsNew: { get: invoke(INVOKE.whatsNewGet), seen: invoke(INVOKE.whatsNewSeen) },
  window: { getFullscreen: invoke(INVOKE.windowGetFullscreen), setFullscreen: invoke(INVOKE.windowSetFullscreen), onFullscreen: on(EVENTS.fullscreen) },
  dialog: { pickFolder: invoke(INVOKE.dialogPickFolder) },
  skip: { get: invoke(INVOKE.skipGet) },
  app: { openRepo: invoke(INVOKE.appOpenRepo) },
  onLibraryChanged: on(EVENTS.libraryChanged),
})
