import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE, EVENTS } from '../shared/channels.js'

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args)
const on = (channel) => (cb) => {
  const listener = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('animedesk', {
  player: {
    onOpen: on(EVENTS.playerOpen), onClose: on(EVENTS.playerClose), onRetry: on(EVENTS.playerRetry),
    progress: invoke(INVOKE.playerProgress), closed: invoke(INVOKE.playerClosed),
    recover: invoke(INVOKE.playerRecover), retryAgain: invoke(INVOKE.playerRetryAgain),
  },
  settings: { get: invoke(INVOKE.settingsGet), update: invoke(INVOKE.settingsUpdate) },
  library: {
    list: invoke(INVOKE.libraryList),
    facets: invoke(INVOKE.libraryFacets),
    add: invoke(INVOKE.libraryAdd),
    update: invoke(INVOKE.libraryUpdate),
    remove: invoke(INVOKE.libraryRemove),
    restore: invoke(INVOKE.libraryRestore),
    setEpisodeNote: invoke(INVOKE.libraryNote),
    recordWatched: invoke(INVOKE.libraryRecord),
    wasCorrupt: invoke(INVOKE.libraryWasCorrupt),
    setPinned: invoke(INVOKE.librarySetPinned),
  },
  seriesPrefs: { get: invoke(INVOKE.seriesPrefsGet), set: invoke(INVOKE.seriesPrefsSet) },
  anilist: { forTitle: invoke(INVOKE.anilistForTitle), search: invoke(INVOKE.anilistSearch) },
  episodes: { forSeries: invoke(INVOKE.episodesForSeries), thumb: invoke(INVOKE.episodesThumb), spoilers: invoke(INVOKE.episodesSpoilers) },
  positions: { forSeries: invoke(INVOKE.positionsForSeries) },
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
    onTitle: on(EVENTS.watchTitle),
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
  autoDownload: { set: invoke(INVOKE.autoDownloadSet) },
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
  notifications: { list: invoke(INVOKE.notificationsList), markRead: invoke(INVOKE.notificationsMarkRead) },
  anilistAuth: {
    status: invoke(INVOKE.anilistAuthStatus),
    connect: invoke(INVOKE.anilistAuthConnect),
    disconnect: invoke(INVOKE.anilistAuthDisconnect),
    openAuthorize: invoke(INVOKE.anilistAuthOpenAuthorize),
    openApps: invoke(INVOKE.anilistAuthOpenApps),
    onChange: on(EVENTS.anilistAuthChanged),
  },
  anilistSync: {
    stateFor: invoke(INVOKE.anilistSyncStateFor),
    confirm: invoke(INVOKE.anilistSyncConfirm),
    setEnabled: invoke(INVOKE.anilistSyncSetEnabled),
    candidates: invoke(INVOKE.anilistSyncCandidates),
    pendingConfirm: invoke(INVOKE.anilistSyncPendingConfirm),
    onChange: on(EVENTS.anilistSyncChanged),
  },
  sequels: {
    list: invoke(INVOKE.sequelsList),
    hide: invoke(INVOKE.sequelsHide),
    unhide: invoke(INVOKE.sequelsUnhide),
    onChanged: on(EVENTS.sequelsChanged),
  },
  onNotificationsChanged: on(EVENTS.notificationsChanged),
  onOpenAnime: on(EVENTS.openAnime),
  onOpenPage: on(EVENTS.openPage),
  onLibraryChanged: on(EVENTS.libraryChanged),
  onPositionsChanged: on(EVENTS.positionsChanged),
})
