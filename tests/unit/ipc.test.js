import { describe, it, expect, vi } from 'vitest'
import { INVOKE, EVENTS } from '../../src/shared/channels.js'
import { createHandlers, registerIpc } from '../../src/main/ipc.js'

function services() {
  return {
    settings: { get: vi.fn(() => ({ language: 'sr' })), update: vi.fn((p) => p) },
    library: { list: vi.fn(() => []), add: vi.fn(), update: vi.fn(), remove: vi.fn(), setEpisodeNote: vi.fn(), recordWatched: vi.fn(() => ({ id: 'a' })), setPinned: vi.fn(), wasCorrupt: true },
    seriesPrefs: { get: vi.fn(() => ({ quality: null, mode: null })), set: vi.fn((t, p) => p) },
    anilist: { getForTitle: vi.fn(), search: vi.fn() },
    toolManager: { status: vi.fn(), installMissing: vi.fn(async (cb) => { cb({ id: 'mpv', phase: 'done' }); return {} }), updateAll: vi.fn(async () => []), installOptional: vi.fn(async () => {}) },
    health: { get: vi.fn(), run: vi.fn() },
    internalPlayer: { progress: vi.fn(), closed: vi.fn() },
    watch: { watch: vi.fn(), cancel: vi.fn(), answerMenu: vi.fn(), playLocal: vi.fn(async () => 'watched'), recover: vi.fn(() => ({ ok: true })), retryAgain: vi.fn() },
    downloads: { enqueue: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), queueItems: vi.fn(), listDownloaded: vi.fn(), removeDownloaded: vi.fn(), getDownloaded: vi.fn((id) => (id === 'd1' ? { path: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1' } : null)) },
    electron: { pickFolder: vi.fn(async () => 'D:\\X'), showItemInFolder: vi.fn(), openRepo: vi.fn() },
    tracker: { update: vi.fn(), remove: vi.fn(), recordWatched: vi.fn(() => ({ id: 'a' })) },
    progress: { snapshot: vi.fn(() => ({ level: 1 })), check: vi.fn() },
    updater: { getState: vi.fn(() => ({ status: 'idle' })), check: vi.fn(async () => ({ status: 'none' })), download: vi.fn(() => true), install: vi.fn(() => true), applySettings: vi.fn() },
    whatsNew: { get: vi.fn(() => null), seen: vi.fn() },
    window: { get: vi.fn(() => true), set: vi.fn() },
    positions: { clear: vi.fn() },
    skipLookup: vi.fn(async () => ({ op: { start: 1, end: 2 }, ed: null, recap: null })),
    send: vi.fn(),
  }
}

describe('ipc', () => {
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
    expect(s.watch.playLocal).toHaveBeenCalledWith({ file: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1' })
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
  it('reads and sets window fullscreen', () => {
    const s = services()
    const h = createHandlers(s)
    expect(h[INVOKE.windowGetFullscreen]()).toBe(true)
    h[INVOKE.windowSetFullscreen](false)
    expect(s.window.set).toHaveBeenCalledWith(false)
  })
})
