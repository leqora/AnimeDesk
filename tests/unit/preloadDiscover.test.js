import { describe, it, expect, vi } from 'vitest'
import { INVOKE, EVENTS } from '../../src/shared/channels.js'

describe('preload discover api', () => {
  it('exposes list, posters and an unsubscribing onChanged', async () => {
    let api
    const ipcRenderer = { invoke: vi.fn(async () => 'r'), on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }
    vi.resetModules()
    vi.doMock('electron', () => ({ contextBridge: { exposeInMainWorld: (_n, a) => { api = a } }, ipcRenderer, webUtils: {} }))
    await import('../../src/preload/index.js')
    expect(Object.keys(api.discover).sort()).toEqual(['list', 'onChanged', 'posters'])
    await api.discover.list({ force: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(INVOKE.discoverList, { force: true })
    await api.discover.posters([1])
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(INVOKE.discoverPosters, [1])
    const off = api.discover.onChanged(() => {})
    expect(ipcRenderer.on).toHaveBeenCalledWith(EVENTS.discoverChanged, expect.any(Function))
    off()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(EVENTS.discoverChanged, expect.any(Function))
  })
})
