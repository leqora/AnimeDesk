import { INVOKE, EVENTS } from '../shared/channels.js'
import { ANILIST_CLIENT_ID, APPS_URL, authorizeUrl } from '../shared/anilistAuth.js'
import { localDate } from '../shared/backupRules.js'
import { createSettingsEffects } from './settingsEffects.js'

export function createHandlers(s) {
  const progress = (p) => s.send(EVENTS.toolProgress, p)
  const settingsEffects = createSettingsEffects({ updater: s.updater, toolManager: s.toolManager, send: s.send, onSettingsChanged: (patch) => s.onSettingsChanged?.(patch) })
  return {
    [INVOKE.settingsGet]: () => s.settings.get(),
    [INVOKE.settingsUpdate]: (patch) => {
      const updated = s.settings.update(patch)
      settingsEffects(patch)
      return updated
    },
    [INVOKE.updateGetState]: () => s.updater.getState(),
    [INVOKE.updateCheck]: () => s.updater.check(),
    [INVOKE.updateDownload]: () => s.updater.download(),
    [INVOKE.updateInstall]: () => s.updater.install(),
    [INVOKE.whatsNewGet]: () => s.whatsNew.get(),
    [INVOKE.whatsNewSeen]: () => s.whatsNew.seen(),
    [INVOKE.notificationsList]: () => ({ items: s.notifications.list(), unread: s.notifications.unreadCount() }),
    [INVOKE.notificationsMarkRead]: () => {
      s.notifications.markAllRead()
      return { items: s.notifications.list(), unread: s.notifications.unreadCount() }
    },
    [INVOKE.windowGetFullscreen]: () => s.window.get(),
    [INVOKE.windowSetFullscreen]: (value) => s.window.set(Boolean(value)),
    [INVOKE.dataExport]: async () => {
      const kind = s.settings.get().language === 'sr' ? 'rezerva' : 'backup'
      const file = await s.electron.saveFile(`AnimeDesk-${kind}-${localDate(Date.now())}.json`)
      if (!file) return { ok: false, canceled: true }
      try {
        s.dataBackup.exportTo(file)
        return { ok: true }
      } catch (err) {
        console.warn('data export failed', err?.message)
        return { ok: false, error: 'write-failed' }
      }
    },
    [INVOKE.dataImportPick]: async () => {
      const file = await s.electron.openFile()
      if (!file) return { ok: false, canceled: true }
      return s.dataBackup.readBackup(file)
    },
    [INVOKE.dataImportApply]: (token) => s.dataBackup.applyImport(typeof token === 'string' ? token : ''),
    [INVOKE.dataInfo]: () => s.dataBackup.info(),
    [INVOKE.dataClearCache]: () => {
      const cacheBytes = s.dataBackup.clearCache()
      s.onCacheCleared?.()
      return { cacheBytes }
    },
    [INVOKE.dataOpenFolder]: async () => { await s.electron.openPath(s.paths.base) },
    [INVOKE.libraryList]: () => s.library.list(),
    // search/genre facets for the watchlist: read from the AniList cache only, never from the network
    [INVOKE.libraryFacets]: () => {
      const facets = {}
      for (const e of s.library.list()) {
        const info = s.anilist.getCached(e.title, { aniListId: e.aniListId })
        if (!info) continue
        facets[e.id] = {
          romaji: typeof info.romaji === 'string' ? info.romaji : null,
          genres: Array.isArray(info.genres) ? info.genres.filter((g) => typeof g === 'string') : [],
        }
      }
      return facets
    },
    [INVOKE.libraryAdd]: (entry) => {
      const added = s.library.add(entry)
      s.onLibraryChanged?.()
      return added
    },
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
    [INVOKE.libraryRestore]: (id) => {
      const result = s.tracker.restore(id)
      if (result.ok) s.send(EVENTS.libraryChanged)
      return result
    },
    [INVOKE.libraryNote]: (id, episode, text) => s.library.setEpisodeNote(id, episode, text),
    [INVOKE.libraryRecord]: (payload) => {
      const entry = s.tracker.recordWatched(payload, 'auto')
      // a watched episode (e.g. "yes" in the ask dialog) must not offer to resume any more
      if (payload?.aniCliTitle && payload.episode != null) s.positions?.clear(payload.aniCliTitle, payload.episode)
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
    [INVOKE.episodesForSeries]: (args) => s.seriesEpisodes.forSeries(args),
    [INVOKE.episodesThumb]: (args) => s.seriesEpisodes.thumb(args),
    [INVOKE.episodesSpoilers]: (args, action) => s.seriesEpisodes.spoilers(args, action),
    [INVOKE.positionsForSeries]: (title) => s.positions?.forSeries(String(title ?? '')) ?? {},
    [INVOKE.toolsStatus]: () => s.toolManager.status(),
    [INVOKE.toolsInstallMissing]: async () => {
      const errors = await s.toolManager.installMissing(progress)
      s.health.run()
      return errors
    },
    [INVOKE.toolsCheckUpdates]: async () => {
      const updated = await s.health.updateTools({ waitForIdle: false, onProgress: progress })
      s.health.run()
      return updated
    },
    [INVOKE.healthGet]: () => s.health.get(),
    [INVOKE.healthRecheck]: () => s.health.run(),
    [INVOKE.watchStart]: (params) => s.watch.watch(params),
    [INVOKE.watchCancel]: (sessionId) => s.watch.cancel(sessionId),
    [INVOKE.menuAnswer]: (requestId, line) => s.watch.answerMenu(requestId, line),
    [INVOKE.downloadsEnqueue]: (params) => s.downloads.enqueue(params),
    [INVOKE.autoDownloadSet]: (animeId, enabled) => s.autoDownloader.setEnabled(animeId, enabled),
    [INVOKE.downloadsPause]: (id) => s.downloads.pause(id),
    [INVOKE.downloadsResume]: (id) => s.downloads.resume(id),
    [INVOKE.downloadsRetryFailed]: () => s.downloads.retryFailed(),
    [INVOKE.downloadsCancel]: (id) => s.downloads.cancel(id),
    [INVOKE.downloadsQueue]: () => s.downloads.queueItems(),
    [INVOKE.downloadsList]: () => s.downloads.listDownloaded(),
    [INVOKE.downloadsRemove]: (id, deleteFile) => s.downloads.removeDownloaded(id, { deleteFile }),
    [INVOKE.downloadsPlay]: async (id) => {
      const d = s.downloads.getDownloaded(id)
      return d ? s.watch.playLocal({ file: d.path, title: d.title, episode: d.episode, mode: d.mode }) : null
    },
    [INVOKE.downloadsOpenFolder]: (id) => {
      const d = s.downloads.getDownloaded(id)
      if (d) s.electron.showItemInFolder(d.path)
    },
    [INVOKE.dialogPickFolder]: () => s.electron.pickFolder(),
    [INVOKE.appOpenRepo]: () => s.electron.openRepo(),
    [INVOKE.statsGet]: () => s.progress.snapshot(),
    [INVOKE.playerProgress]: (p) => s.internalPlayer.progress(p),
    [INVOKE.playerClosed]: (p) => s.internalPlayer.closed(p),
    [INVOKE.playerRecover]: (snapshot, opts) => s.watch.recover(snapshot, opts),
    [INVOKE.playerRetryAgain]: () => s.watch.retryAgain(),
    [INVOKE.externalPlayerState]: () => s.watch.externalState(),
    [INVOKE.externalPlayerStop]: (id) => s.watch.stopExternal(id),
    [INVOKE.skipGet]: (title, episode, duration) => s.skipLookup(title, episode, duration),
    [INVOKE.anilistAuthStatus]: () => s.aniListAuth.status(),
    [INVOKE.anilistAuthConnect]: async (token) => {
      if (typeof token !== 'string') return { ok: false, error: 'empty' }
      const r = await s.aniListAuth.connect(token)
      if (!r?.ok) return { ok: false, error: r?.error ?? 'network' }
      // reset() must run synchronously right after the await above, before any other await: auth.onChange
      // already called sync.resume(), which armed a 0 ms timer that only this reset() can cancel.
      s.aniListSync.reset()
      s.aniListSync.check()
      return { ok: true, status: r.status } // never the token
    },
    [INVOKE.anilistAuthDisconnect]: () => {
      const r = s.aniListAuth.disconnect()
      if (!r?.ok) return { ok: false }
      s.aniListSync.reset()
      return { ok: true }
    },
    [INVOKE.anilistAuthOpenAuthorize]: () => {
      const url = authorizeUrl(ANILIST_CLIENT_ID)
      if (!url) return false
      s.electron.openExternal(url)
      return true
    },
    [INVOKE.anilistAuthOpenApps]: () => { s.electron.openExternal(APPS_URL) },
    [INVOKE.anilistSyncStateFor]: (entryId) => s.aniListSync.stateFor(entryId),
    [INVOKE.anilistSyncConfirm]: (entryId, mediaId) => {
      let result
      try {
        result = s.library.confirmAniList(entryId, mediaId)
      } catch {
        return { ok: false, error: 'invalid' }
      }
      if (result?.ok) {
        s.aniListSync.syncNow(entryId)
        s.send(EVENTS.libraryChanged)
      }
      return result
    },
    [INVOKE.anilistSyncSetEnabled]: (entryId, enabled) => {
      const entry = s.library.get(entryId)
      if (!entry) return false
      const value = s.seriesPrefs.setAniListSync(entry.aniCliTitle ?? entry.title, Boolean(enabled))
      s.aniListSync.check()
      return value
    },
    [INVOKE.anilistSyncCandidates]: (search) => s.anilist.candidates(search),
    [INVOKE.anilistSyncPendingConfirm]: () => {
      const all = s.library.list()
      // A media id already confirmed on another entry can never be confirmed here ('taken').
      const taken = new Set(all.filter((e) => e.aniListConfirmed === true && e.aniListId != null).map((e) => e.aniListId))
      return all
        .filter((e) => e.aniListId != null && !e.aniListConfirmed && !taken.has(e.aniListId))
        .map((e) => ({ id: e.id, title: e.title, aniListId: e.aniListId }))
    },
    [INVOKE.sequelsList]: () => s.sequels.list(),
    [INVOKE.sequelsHide]: (id) => (Number.isInteger(id) && id > 0 ? s.sequels.hide(id) : { ok: false }),
    [INVOKE.sequelsUnhide]: (id) => (Number.isInteger(id) && id > 0 ? s.sequels.unhide(id) : { ok: false }),
    [INVOKE.recommendationsList]: () => s.recommendations.list(),
    [INVOKE.recommendationsHide]: (id) => (Number.isInteger(id) && id > 0 ? s.recommendations.hide(id) : { ok: false }),
    [INVOKE.recommendationsUnhide]: (id) => (Number.isInteger(id) && id > 0 ? s.recommendations.unhide(id) : { ok: false }),
    [INVOKE.recommendationsForSeries]: (id) => (Number.isInteger(id) && id > 0 ? s.recommendations.forSeries(id) : { items: [] }),
    [INVOKE.scheduleList]: (opts) => s.schedule.list({ force: Boolean(opts) && typeof opts === 'object' && opts.force === true }),
    [INVOKE.discoverList]: (opts) => s.discover.list({ force: Boolean(opts) && typeof opts === 'object' && opts.force === true }),
    [INVOKE.discoverPosters]: (ids) => (Array.isArray(ids)
      ? s.discover.posters(ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, 40))
      : {}),
    [INVOKE.schedulePosters]: (ids) => (Array.isArray(ids)
      ? s.schedule.posters(ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, 40))
      : {}),
  }
}

export function registerIpc(ipcMain, handlers) {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args) => fn(...args))
  }
}
