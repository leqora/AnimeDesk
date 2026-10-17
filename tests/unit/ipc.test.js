import { describe, it, expect, vi } from 'vitest'
import { INVOKE, EVENTS } from '../../src/shared/channels.js'
import { createHandlers, registerIpc } from '../../src/main/ipc.js'

function services() {
  return {
    settings: { get: vi.fn(() => ({ language: 'sr' })), update: vi.fn((p) => p) },
    library: { list: vi.fn(() => []), add: vi.fn(), update: vi.fn(), remove: vi.fn(), setEpisodeNote: vi.fn(), recordWatched: vi.fn(() => ({ id: 'a' })), setPinned: vi.fn(), wasCorrupt: true },
    seriesPrefs: { get: vi.fn(() => ({ quality: null, mode: null })), set: vi.fn((t, p) => p) },
    anilist: { getForTitle: vi.fn(), search: vi.fn() },
    seriesEpisodes: { forSeries: vi.fn(async () => ({ episodes: [], source: 'menu', meta: 'none' })), thumb: vi.fn(async () => null), spoilers: vi.fn(async () => ({ episodes: [] })) },
    toolManager: { status: vi.fn(), installMissing: vi.fn(async (cb) => { cb({ id: 'mpv', phase: 'done' }); return {} }), updateAll: vi.fn(async () => []), installOptional: vi.fn(async () => {}) },
    health: { get: vi.fn(), run: vi.fn() },
    internalPlayer: { progress: vi.fn(), closed: vi.fn() },
    watch: { watch: vi.fn(), cancel: vi.fn(), answerMenu: vi.fn(), playLocal: vi.fn(async () => 'watched'), recover: vi.fn(() => ({ ok: true })), retryAgain: vi.fn() },
    downloads: { enqueue: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), queueItems: vi.fn(), listDownloaded: vi.fn(), removeDownloaded: vi.fn(), getDownloaded: vi.fn((id) => (id === 'd1' ? { path: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1', mode: 'dub' } : null)) },
    electron: { pickFolder: vi.fn(async () => 'D:\\X'), showItemInFolder: vi.fn(), openRepo: vi.fn() },
    tracker: { update: vi.fn(), remove: vi.fn(), restore: vi.fn(), recordWatched: vi.fn(() => ({ id: 'a' })) },
    progress: { snapshot: vi.fn(() => ({ level: 1 })), check: vi.fn() },
    updater: { getState: vi.fn(() => ({ status: 'idle' })), check: vi.fn(async () => ({ status: 'none' })), download: vi.fn(() => true), install: vi.fn(() => true), applySettings: vi.fn() },
    whatsNew: { get: vi.fn(() => null), seen: vi.fn() },
    autoDownloader: { setEnabled: vi.fn(() => ({ ok: true, enabled: true })) },
    notifications: { list: vi.fn(() => [{ id: 'n1' }]), unreadCount: vi.fn(() => 1), markAllRead: vi.fn() },
    window: { get: vi.fn(() => true), set: vi.fn() },
    positions: { clear: vi.fn(), forSeries: vi.fn((title) => (title === 'Show' ? { 4: { position: 495, duration: 1440 } } : {})) },
    skipLookup: vi.fn(async () => ({ op: { start: 1, end: 2 }, ed: null, recap: null })),
    send: vi.fn(),
    aniListAuth: {
      status: vi.fn(() => ({ connected: false, name: null, expiresAt: null, state: 'none' })),
      connect: vi.fn(async () => ({ ok: true, status: { connected: true, name: 'leqora', expiresAt: null, state: 'ok' }, token: 'SECRET' })),
      disconnect: vi.fn(() => ({ ok: true })),
    },
    aniListSync: { stateFor: vi.fn(() => ({ state: 'off' })), syncNow: vi.fn(), check: vi.fn(), reset: vi.fn() },
  }
}

describe('ipc', () => {
  it('routes the episode list, thumbnails and spoiler actions to seriesEpisodes', async () => {
    const s = services()
    const h = createHandlers(s)
    const args = { title: 'Show', list: ['1'] }
    await h[INVOKE.episodesForSeries](args)
    expect(s.seriesEpisodes.forSeries).toHaveBeenCalledWith(args)
    await h[INVOKE.episodesThumb]({ ...args, episode: '1' })
    expect(s.seriesEpisodes.thumb).toHaveBeenCalledWith({ ...args, episode: '1' })
    await h[INVOKE.episodesSpoilers](args, { all: true })
    expect(s.seriesEpisodes.spoilers).toHaveBeenCalledWith(args, { all: true })
    expect(INVOKE.episodesForSeries).toBe('episodes:for-series')
  })
  it('forwards the auto-download switch to the auto-downloader', () => {
    const s = services()
    const r = createHandlers(s)[INVOKE.autoDownloadSet]('a1', true)
    expect(s.autoDownloader.setEnabled).toHaveBeenCalledWith('a1', true)
    expect(r).toEqual({ ok: true, enabled: true })
    expect(INVOKE.autoDownloadSet).toBe('auto-download:set')
  })
  it('retries all failed downloads', () => {
    const s = services()
    s.downloads.retryFailed = vi.fn()
    createHandlers(s)[INVOKE.downloadsRetryFailed]()
    expect(s.downloads.retryFailed).toHaveBeenCalled()
  })
  it('pins through the library and reports the limit without throwing', () => {
    const s = services()
    const h = createHandlers(s)
    s.library.setPinned.mockReturnValueOnce({ id: 'a', pinnedAt: 'x' })
    expect(h[INVOKE.librarySetPinned]('a', true)).toEqual({ ok: true, entry: { id: 'a', pinnedAt: 'x' } })
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
    s.send.mockClear()
    s.library.setPinned.mockImplementationOnce(() => { throw new Error('pin-limit') })
    expect(h[INVOKE.librarySetPinned]('b', true)).toEqual({ ok: false, error: 'pin-limit' })
    expect(s.send).not.toHaveBeenCalled()
    s.library.setPinned.mockImplementationOnce(() => { throw new Error('unknown anime id: z') })
    expect(() => h[INVOKE.librarySetPinned]('z', true)).toThrow('unknown anime id')
  })
  it('reads and writes series prefs', () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.seriesPrefsGet]('Show')
    expect(s.seriesPrefs.get).toHaveBeenCalledWith('Show')
    expect(h[INVOKE.seriesPrefsSet]('Show', { mode: 'dub' })).toEqual({ mode: 'dub' })
  })
  it('forwards player progress and close to the internal player', () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.playerProgress]({ playbackId: 'p', position: 1 })
    h[INVOKE.playerClosed]({ playbackId: 'p', reason: 'back' })
    expect(s.internalPlayer.progress).toHaveBeenCalledWith({ playbackId: 'p', position: 1 })
    expect(s.internalPlayer.closed).toHaveBeenCalledWith({ playbackId: 'p', reason: 'back' })
  })
  it('forwards player recovery to the watch service', () => {
    const s = services()
    const h = createHandlers(s)
    expect(h[INVOKE.playerRecover]({ playbackId: 'p', position: 3 }, { manual: true })).toEqual({ ok: true })
    expect(s.watch.recover).toHaveBeenCalledWith({ playbackId: 'p', position: 3 }, { manual: true })
    h[INVOKE.playerRetryAgain]()
    expect(s.watch.retryAgain).toHaveBeenCalled()
  })
  it('notifies the renderer after library update and remove', () => {
    const s = services()
    s.tracker.update.mockReturnValue({ id: 'id1' })
    s.tracker.remove.mockReturnValue(true)
    const h = createHandlers(s)
    expect(h[INVOKE.libraryUpdate]('id1', { rating: 8 })).toEqual({ id: 'id1' })
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
    s.send.mockClear()
    expect(h[INVOKE.libraryRemove]('id1')).toBe(true)
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
  })
  it('library:restore returns the tracker result and notifies only on success', () => {
    const s = services()
    const h = createHandlers(s)
    s.tracker.restore.mockReturnValueOnce({ ok: true, entry: { id: 'a' } })
    expect(h[INVOKE.libraryRestore]('a')).toEqual({ ok: true, entry: { id: 'a' } })
    expect(s.tracker.restore).toHaveBeenCalledWith('a')
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
    s.send.mockClear()
    s.tracker.restore.mockReturnValueOnce({ ok: false, error: 'expired' })
    expect(h[INVOKE.libraryRestore]('a')).toEqual({ ok: false, error: 'expired' })
    expect(s.send).not.toHaveBeenCalled()
  })
  it('opens the fixed repo URL through the main process', () => {
    const s = services()
    createHandlers(s)[INVOKE.appOpenRepo]('https://evil.example')
    expect(s.electron.openRepo).toHaveBeenCalledWith()
  })
  it('has a handler for every INVOKE channel and nothing else', () => {
    expect(Object.keys(createHandlers(services())).sort()).toEqual(Object.values(INVOKE).sort())
  })
  it('forwards arguments', async () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.libraryUpdate]('id1', { rating: 8 })
    expect(s.tracker.update).toHaveBeenCalledWith('id1', { rating: 8 })
    h[INVOKE.libraryRemove]('id1')
    expect(s.tracker.remove).toHaveBeenCalledWith('id1')
    h[INVOKE.statsGet]()
    expect(s.progress.snapshot).toHaveBeenCalled()
    h[INVOKE.anilistForTitle]('Frieren', 5)
    expect(s.anilist.getForTitle).toHaveBeenCalledWith('Frieren', { aniListId: 5 })
    h[INVOKE.downloadsRemove]('d1', true)
    expect(s.downloads.removeDownloaded).toHaveBeenCalledWith('d1', { deleteFile: true })
    expect(h[INVOKE.libraryWasCorrupt]()).toBe(true)
  })
  it('recordWatched notifies library-changed', () => {
    const s = services()
    createHandlers(s)[INVOKE.libraryRecord]({ aniCliTitle: 'A', episode: '1' })
    expect(s.tracker.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'A', episode: '1' }, 'auto')
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
  })
  it('clears the resume position of an episode marked watched from the ask dialog', () => {
    const s = services()
    createHandlers(s)[INVOKE.libraryRecord]({ aniCliTitle: 'A', episode: '1' })
    expect(s.positions.clear).toHaveBeenCalledWith('A', '1')
  })
  it('reads the saved positions of one series', async () => {
    const s = services()
    const h = createHandlers(s)
    expect(INVOKE.positionsForSeries).toBe('positions:for-series')
    expect(await h[INVOKE.positionsForSeries]('Show')).toEqual({ 4: { position: 495, duration: 1440 } })
    expect(await h[INVOKE.positionsForSeries](undefined)).toEqual({})
    expect(s.positions.forSeries).toHaveBeenLastCalledWith('')
    expect(await createHandlers({ ...s, positions: null })[INVOKE.positionsForSeries]('Show')).toEqual({})
  })
  it('installMissing streams progress and re-runs the health check', async () => {
    const s = services()
    await createHandlers(s)[INVOKE.toolsInstallMissing]()
    expect(s.send).toHaveBeenCalledWith(EVENTS.toolProgress, { id: 'mpv', phase: 'done' })
    expect(s.health.run).toHaveBeenCalled()
  })
  it('plays and opens downloaded files by id', async () => {
    const s = services()
    const h = createHandlers(s)
    expect(await h[INVOKE.downloadsPlay]('d1')).toBe('watched')
    expect(s.watch.playLocal).toHaveBeenCalledWith({ file: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1', mode: 'dub' })
    h[INVOKE.downloadsOpenFolder]('d1')
    expect(s.electron.showItemInFolder).toHaveBeenCalledWith('D:\\A\\A Episode 1.mp4')
    expect(await h[INVOKE.downloadsPlay]('nope')).toBeNull()
  })
  it('looks up skip times', async () => {
    const s = services()
    expect(await createHandlers(s)[INVOKE.skipGet]('Show', '1', 1400)).toEqual({ op: { start: 1, end: 2 }, ed: null, recap: null })
    expect(s.skipLookup).toHaveBeenCalledWith('Show', '1', 1400)
  })
  it('registerIpc strips the event argument', async () => {
    const ipcMain = { handle: vi.fn() }
    const fn = vi.fn(() => 42)
    registerIpc(ipcMain, { 'x:y': fn })
    const [[channel, wrapped]] = ipcMain.handle.mock.calls
    expect(channel).toBe('x:y')
    expect(await wrapped({ sender: {} }, 1, 2)).toBe(42)
    expect(fn).toHaveBeenCalledWith(1, 2)
  })
  it('routes update calls and re-applies updater settings', async () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.updateGetState]()
    await h[INVOKE.updateCheck]()
    h[INVOKE.updateDownload]()
    h[INVOKE.updateInstall]()
    h[INVOKE.whatsNewGet]()
    h[INVOKE.whatsNewSeen]()
    expect(s.updater.getState).toHaveBeenCalled()
    expect(s.updater.check).toHaveBeenCalled()
    expect(s.updater.download).toHaveBeenCalled()
    expect(s.updater.install).toHaveBeenCalled()
    expect(s.whatsNew.get).toHaveBeenCalled()
    expect(s.whatsNew.seen).toHaveBeenCalled()
    h[INVOKE.settingsUpdate]({ language: 'en' })
    expect(s.updater.applySettings).not.toHaveBeenCalled()
    h[INVOKE.settingsUpdate]({ autoDownloadUpdates: false })
    expect(s.updater.applySettings).toHaveBeenCalledTimes(1)
  })
  it('installs the optional uosc skin when mpvModernUi is turned on', () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.settingsUpdate]({ mpvModernUi: false })
    expect(s.toolManager.installOptional).not.toHaveBeenCalled()
    h[INVOKE.settingsUpdate]({ mpvModernUi: true })
    expect(s.toolManager.installOptional).toHaveBeenCalledTimes(1)
  })
  it('forwards notifications list and mark-read to the store', () => {
    const s = services()
    const h = createHandlers(s)
    expect(h[INVOKE.notificationsList]()).toEqual({ items: [{ id: 'n1' }], unread: 1 })
    expect(h[INVOKE.notificationsMarkRead]()).toEqual({ items: [{ id: 'n1' }], unread: 1 })
    expect(s.notifications.markAllRead).toHaveBeenCalledTimes(1)
  })
  it('reads and sets window fullscreen', () => {
    const s = services()
    const h = createHandlers(s)
    expect(h[INVOKE.windowGetFullscreen]()).toBe(true)
    h[INVOKE.windowSetFullscreen](false)
    expect(s.window.set).toHaveBeenCalledWith(false)
  })
})

describe('ipc anilist login and sync', () => {
  it('connect never returns the token, resets and checks sync on success', async () => {
    const s = services()
    const r = await createHandlers(s)[INVOKE.anilistAuthConnect]('tok')
    expect(s.aniListAuth.connect).toHaveBeenCalledWith('tok')
    expect(r).toEqual({ ok: true, status: { connected: true, name: 'leqora', expiresAt: null, state: 'ok' } })
    expect(JSON.stringify(r)).not.toContain('SECRET')
    expect(s.aniListSync.reset).toHaveBeenCalledTimes(1)
    expect(s.aniListSync.check).toHaveBeenCalledTimes(1)
    expect(s.aniListSync.reset.mock.invocationCallOrder[0]).toBeLessThan(s.aniListSync.check.mock.invocationCallOrder[0])
  })
  it('a failed connect returns only the error and leaves sync alone', async () => {
    const s = services()
    s.aniListAuth.connect.mockResolvedValueOnce({ ok: false, error: 'rejected' })
    expect(await createHandlers(s)[INVOKE.anilistAuthConnect]('bad')).toEqual({ ok: false, error: 'rejected' })
    expect(s.aniListSync.reset).not.toHaveBeenCalled()
    expect(s.aniListSync.check).not.toHaveBeenCalled()
  })
  it('a non-string token is rejected as empty without touching auth', async () => {
    const s = services()
    const h = createHandlers(s)
    expect(await h[INVOKE.anilistAuthConnect](undefined)).toEqual({ ok: false, error: 'empty' })
    expect(await h[INVOKE.anilistAuthConnect]({ x: 1 })).toEqual({ ok: false, error: 'empty' })
    expect(s.aniListAuth.connect).not.toHaveBeenCalled()
  })
  it('pendingConfirm leaves out entries whose AniList series is confirmed on another entry', () => {
    const s = services()
    s.library.list = vi.fn(() => [
      { id: 'a', title: 'A', aniListId: 5, aniListConfirmed: false },
      { id: 'b', title: 'B', aniListId: 5, aniListConfirmed: true },
      { id: 'c', title: 'C', aniListId: 7, aniListConfirmed: false },
    ])
    expect(createHandlers(s)[INVOKE.anilistSyncPendingConfirm]()).toEqual([{ id: 'c', title: 'C', aniListId: 7 }])
  })
  it('disconnect resets sync only when the auth store really disconnected', () => {
    const s = services()
    const h = createHandlers(s)
    expect(h[INVOKE.anilistAuthDisconnect]()).toEqual({ ok: true })
    expect(s.aniListAuth.disconnect).toHaveBeenCalled()
    expect(s.aniListSync.reset).toHaveBeenCalledTimes(1)
    s.aniListAuth.disconnect.mockReturnValueOnce({ ok: false })
    expect(h[INVOKE.anilistAuthDisconnect]()).toEqual({ ok: false })
    expect(s.aniListSync.reset).toHaveBeenCalledTimes(1)
  })
  it('status is forwarded; authorize opens only the fixed AniList authorize URL', () => {
    const s = services()
    s.electron.openExternal = vi.fn()
    const h = createHandlers(s)
    expect(h[INVOKE.anilistAuthStatus]()).toEqual({ connected: false, name: null, expiresAt: null, state: 'none' })
    expect(h[INVOKE.anilistAuthOpenAuthorize]()).toBe(true)
    expect(s.electron.openExternal).toHaveBeenCalledWith('https://anilist.co/api/v2/oauth/authorize?client_id=54128&response_type=token')
    s.electron.openExternal.mockClear()
    h[INVOKE.anilistAuthOpenApps]()
    expect(s.electron.openExternal).toHaveBeenCalledWith('https://anilist.co/settings/apps')
  })
  it('confirm calls the library, then syncNow, and emits libraryChanged', () => {
    const s = services()
    s.library.confirmAniList = vi.fn(() => ({ ok: true, entry: { id: 'a' } }))
    const r = createHandlers(s)[INVOKE.anilistSyncConfirm]('a', 99)
    expect(s.library.confirmAniList).toHaveBeenCalledWith('a', 99)
    expect(r).toEqual({ ok: true, entry: { id: 'a' } })
    expect(s.aniListSync.syncNow).toHaveBeenCalledWith('a')
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
  })
  it('confirm turns a taken id into a result and a throw into invalid, without syncing', () => {
    const s = services()
    const h = createHandlers(s)
    s.library.confirmAniList = vi.fn(() => ({ ok: false, error: 'taken', title: 'Other' }))
    expect(h[INVOKE.anilistSyncConfirm]('a', 99)).toEqual({ ok: false, error: 'taken', title: 'Other' })
    s.library.confirmAniList = vi.fn(() => { throw new Error('invalid aniListId') })
    expect(h[INVOKE.anilistSyncConfirm]('a', -1)).toEqual({ ok: false, error: 'invalid' })
    expect(s.aniListSync.syncNow).not.toHaveBeenCalled()
    expect(s.send).not.toHaveBeenCalled()
  })
  it('setEnabled stores the pref by aniCliTitle ?? title, then checks', () => {
    const s = services()
    s.seriesPrefs.setAniListSync = vi.fn((t, e) => e)
    s.library.get = vi.fn((id) => (id === 'a' ? { id: 'a', title: 'T', aniCliTitle: 'AC' } : id === 'b' ? { id: 'b', title: 'Only' } : null))
    const h = createHandlers(s)
    expect(h[INVOKE.anilistSyncSetEnabled]('a', true)).toBe(true)
    expect(s.seriesPrefs.setAniListSync).toHaveBeenLastCalledWith('AC', true)
    h[INVOKE.anilistSyncSetEnabled]('b', false)
    expect(s.seriesPrefs.setAniListSync).toHaveBeenLastCalledWith('Only', false)
    expect(s.aniListSync.check).toHaveBeenCalledTimes(2)
    expect(h[INVOKE.anilistSyncSetEnabled]('zzz', true)).toBe(false)
  })
  it('stateFor, candidates and pendingConfirm', async () => {
    const s = services()
    s.anilist.candidates = vi.fn(async () => [{ id: 1 }])
    s.library.list = vi.fn(() => [
      { id: 'a', title: 'A', aniListId: 5, aniListConfirmed: false, extra: 1 },
      { id: 'b', title: 'B', aniListId: 6, aniListConfirmed: true },
      { id: 'c', title: 'C', aniListId: null },
    ])
    const h = createHandlers(s)
    expect(h[INVOKE.anilistSyncStateFor]('a')).toEqual({ state: 'off' })
    expect(s.aniListSync.stateFor).toHaveBeenCalledWith('a')
    expect(await h[INVOKE.anilistSyncCandidates]('x')).toEqual([{ id: 1 }])
    expect(h[INVOKE.anilistSyncPendingConfirm]()).toEqual([{ id: 'a', title: 'A', aniListId: 5 }])
  })
})

describe('ipc background hooks', () => {
  it('calls onSettingsChanged with the updated settings', () => {
    const s = services()
    s.onSettingsChanged = vi.fn()
    createHandlers(s)[INVOKE.settingsUpdate]({ launchAtLogin: true })
    expect(s.onSettingsChanged).toHaveBeenCalledWith({ launchAtLogin: true })
  })
  it('calls onLibraryChanged after a library add', () => {
    const s = services()
    s.onLibraryChanged = vi.fn()
    createHandlers(s)[INVOKE.libraryAdd]({ title: 'A' })
    expect(s.onLibraryChanged).toHaveBeenCalled()
  })
  it('works without the hooks', () => {
    const s = services()
    const h = createHandlers(s)
    expect(() => h[INVOKE.settingsUpdate]({ language: 'en' })).not.toThrow()
    expect(() => h[INVOKE.libraryAdd]({ title: 'A' })).not.toThrow()
  })
})
