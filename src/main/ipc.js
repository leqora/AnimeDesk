import { INVOKE, EVENTS } from '../shared/channels.js'

export function createHandlers(s) {
  const progress = (p) => s.send(EVENTS.toolProgress, p)
  return {
    [INVOKE.settingsGet]: () => s.settings.get(),
    [INVOKE.settingsUpdate]: (patch) => {
      const updated = s.settings.update(patch)
      if (patch && 'autoDownloadUpdates' in patch) s.updater.applySettings()
      return updated
    },
    [INVOKE.updateGetState]: () => s.updater.getState(),
    [INVOKE.updateCheck]: () => s.updater.check(),
    [INVOKE.updateDownload]: () => s.updater.download(),
    [INVOKE.updateInstall]: () => s.updater.install(),
    [INVOKE.whatsNewGet]: () => s.whatsNew.get(),
    [INVOKE.whatsNewSeen]: () => s.whatsNew.seen(),
    [INVOKE.windowGetFullscreen]: () => s.window.get(),
    [INVOKE.windowSetFullscreen]: (value) => s.window.set(Boolean(value)),
    [INVOKE.libraryList]: () => s.library.list(),
    [INVOKE.libraryAdd]: (entry) => s.library.add(entry),
    [INVOKE.libraryUpdate]: (id, patch) => {
      const result = s.tracker.update(id, patch)
      s.send(EVENTS.libraryChanged)
      return result
    },
    [INVOKE.libraryRemove]: (id) => {
      const result = s.tracker.remove(id)
      s.send(EVENTS.libraryChanged)
      return result
    },
    [INVOKE.libraryNote]: (id, episode, text) => s.library.setEpisodeNote(id, episode, text),
    [INVOKE.libraryRecord]: (payload) => {
      const entry = s.tracker.recordWatched(payload, 'auto')
      s.send(EVENTS.libraryChanged)
      return entry
    },
    [INVOKE.libraryWasCorrupt]: () => s.library.wasCorrupt,
    [INVOKE.librarySetPinned]: (id, pinned) => {
      try {
        const entry = s.library.setPinned(id, Boolean(pinned))
        s.send(EVENTS.libraryChanged)
        return { ok: true, entry }
      } catch (err) {
        if (err.message === 'pin-limit') return { ok: false, error: 'pin-limit' }
        throw err
      }
    },
    [INVOKE.seriesPrefsGet]: (title) => s.seriesPrefs.get(title),
    [INVOKE.seriesPrefsSet]: (title, patch) => s.seriesPrefs.set(title, patch),
    [INVOKE.anilistForTitle]: (title, aniListId = null) => s.anilist.getForTitle(title, { aniListId }),
    [INVOKE.anilistSearch]: (query) => s.anilist.search(query),
    [INVOKE.toolsStatus]: () => s.toolManager.status(),
    [INVOKE.toolsInstallMissing]: async () => {
      const errors = await s.toolManager.installMissing(progress)
      s.health.run()
      return errors
    },
    [INVOKE.toolsCheckUpdates]: async () => {
      const updated = await s.toolManager.updateAll(undefined, progress)
      s.health.run()
      return updated
    },
    [INVOKE.healthGet]: () => s.health.get(),
    [INVOKE.healthRecheck]: () => s.health.run(),
    [INVOKE.watchStart]: (params) => s.watch.watch(params),
    [INVOKE.watchCancel]: (sessionId) => s.watch.cancel(sessionId),
    [INVOKE.menuAnswer]: (requestId, line) => s.watch.answerMenu(requestId, line),
    [INVOKE.downloadsEnqueue]: (params) => s.downloads.enqueue(params),
    [INVOKE.downloadsPause]: (id) => s.downloads.pause(id),
    [INVOKE.downloadsResume]: (id) => s.downloads.resume(id),
    [INVOKE.downloadsCancel]: (id) => s.downloads.cancel(id),
    [INVOKE.downloadsQueue]: () => s.downloads.queueItems(),
    [INVOKE.downloadsList]: () => s.downloads.listDownloaded(),
    [INVOKE.downloadsRemove]: (id, deleteFile) => s.downloads.removeDownloaded(id, { deleteFile }),
    [INVOKE.downloadsPlay]: async (id) => {
      const d = s.downloads.getDownloaded(id)
      return d ? s.watch.playLocal({ file: d.path, title: d.title, episode: d.episode }) : null
    },
    [INVOKE.downloadsOpenFolder]: (id) => {
      const d = s.downloads.getDownloaded(id)
      if (d) s.electron.showItemInFolder(d.path)
    },
    [INVOKE.dialogPickFolder]: () => s.electron.pickFolder(),
    [INVOKE.statsGet]: () => s.progress.snapshot(),
  }
}

export function registerIpc(ipcMain, handlers) {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args) => fn(...args))
  }
}
