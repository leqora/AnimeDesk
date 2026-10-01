import { describe, it, expect, vi } from 'vitest'
import { INVOKE, EVENTS } from '../../src/shared/channels.js'
import { createHandlers, registerIpc } from '../../src/main/ipc.js'

function services() {
  return {
    settings: { get: vi.fn(() => ({ language: 'sr' })), update: vi.fn((p) => p) },
    library: { list: vi.fn(() => []), add: vi.fn(), update: vi.fn(), remove: vi.fn(), setEpisodeNote: vi.fn(), recordWatched: vi.fn(() => ({ id: 'a' })), wasCorrupt: true },
    anilist: { getForTitle: vi.fn(), search: vi.fn() },
    toolManager: { status: vi.fn(), installMissing: vi.fn(async (cb) => { cb({ id: 'mpv', phase: 'done' }); return {} }), updateAll: vi.fn(async () => []) },
    health: { get: vi.fn(), run: vi.fn() },
    watch: { watch: vi.fn(), cancel: vi.fn(), answerMenu: vi.fn(), playLocal: vi.fn(async () => 'watched') },
    downloads: { enqueue: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), queueItems: vi.fn(), listDownloaded: vi.fn(), removeDownloaded: vi.fn(), getDownloaded: vi.fn((id) => (id === 'd1' ? { path: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1' } : null)) },
    electron: { pickFolder: vi.fn(async () => 'D:\\X'), showItemInFolder: vi.fn() },
    progress: { snapshot: vi.fn(() => ({ level: 1 })), check: vi.fn() },
    send: vi.fn(),
  }
}

describe('ipc', () => {
  it('has a handler for every INVOKE channel and nothing else', () => {
    expect(Object.keys(createHandlers(services())).sort()).toEqual(Object.values(INVOKE).sort())
  })
  it('forwards arguments', async () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.libraryUpdate]('id1', { rating: 8 })
    expect(s.library.update).toHaveBeenCalledWith('id1', { rating: 8 })
    h[INVOKE.anilistForTitle]('Frieren', 5)
    expect(s.anilist.getForTitle).toHaveBeenCalledWith('Frieren', { aniListId: 5 })
    h[INVOKE.downloadsRemove]('d1', true)
    expect(s.downloads.removeDownloaded).toHaveBeenCalledWith('d1', { deleteFile: true })
    expect(h[INVOKE.libraryWasCorrupt]()).toBe(true)
  })
  it('recordWatched notifies library-changed', () => {
    const s = services()
    createHandlers(s)[INVOKE.libraryRecord]({ aniCliTitle: 'A', episode: '1' })
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
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
  it('registerIpc strips the event argument', async () => {
    const ipcMain = { handle: vi.fn() }
    const fn = vi.fn(() => 42)
    registerIpc(ipcMain, { 'x:y': fn })
    const [[channel, wrapped]] = ipcMain.handle.mock.calls
    expect(channel).toBe('x:y')
    expect(await wrapped({ sender: {} }, 1, 2)).toBe(42)
    expect(fn).toHaveBeenCalledWith(1, 2)
  })
})
