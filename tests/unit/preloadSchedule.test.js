import { describe, it, expect, vi } from 'vitest'
import { INVOKE, EVENTS } from '../../src/shared/channels.js'

describe('preload schedule api', () => {
  it('exposes list, posters and an unsubscribing onChanged', async () => {
    let api
    const ipcRenderer = { invoke: vi.fn(async () => 'r'), on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }
    vi.resetModules()
    vi.doMock('electron', () => ({ contextBridge: { exposeInMainWorld: (_n, a) => { api = a } }, ipcRenderer, webUtils: {} }))
    await import('../../src/preload/index.js')
    expect(Object.keys(api.schedule).sort()).toEqual(['list', 'onChanged', 'posters'])
    await api.schedule.list({ force: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(INVOKE.scheduleList, { force: true })
    await api.schedule.posters([1])
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(INVOKE.schedulePosters, [1])
    const off = api.schedule.onChanged(() => {})
    expect(ipcRenderer.on).toHaveBeenCalledWith(EVENTS.scheduleChanged, expect.any(Function))
    expect(typeof off).toBe('function')
    off()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(EVENTS.scheduleChanged, expect.any(Function))
  })
})

describe('preload external player api', () => {
  it('exposes state, stop and an unsubscribing onChange', async () => {
    let api
    const ipcRenderer = { invoke: vi.fn(async () => 'r'), on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }
    vi.resetModules()
    vi.doMock('electron', () => ({ contextBridge: { exposeInMainWorld: (_n, a) => { api = a } }, ipcRenderer, webUtils: {} }))
    await import('../../src/preload/index.js')
    expect(Object.keys(api.externalPlayer).sort()).toEqual(['onChange', 'state', 'stop'])
    await api.externalPlayer.state()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(INVOKE.externalPlayerState)
    await api.externalPlayer.stop('id1')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(INVOKE.externalPlayerStop, 'id1')
    const off = api.externalPlayer.onChange(() => {})
    expect(ipcRenderer.on).toHaveBeenCalledWith(EVENTS.externalPlayer, expect.any(Function))
    off()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(EVENTS.externalPlayer, expect.any(Function))
  })
})
