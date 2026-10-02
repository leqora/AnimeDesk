import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createUpdater } from '../../src/main/updater.js'
import { EVENTS } from '../../src/shared/channels.js'

function fakeAutoUpdater() {
  const u = new EventEmitter()
  u.autoDownload = true
  u.autoInstallOnAppQuit = true
  u.checkForUpdates = vi.fn(async () => {})
  u.downloadUpdate = vi.fn(async () => {})
  u.quitAndInstall = vi.fn()
  return u
}
function setup({ isPackaged = true, settings = { autoDownloadUpdates: true } } = {}) {
  const autoUpdater = fakeAutoUpdater()
  const events = []
  const timers = []
  const intervals = []
  const current = { ...settings }
  const updater = createUpdater({
    autoUpdater, isPackaged, currentVersion: '0.3.0',
    getSettings: () => current,
    notify: (ch, s) => events.push([ch, s]),
    setTimeoutFn: (fn, ms) => timers.push([fn, ms]),
    setIntervalFn: (fn, ms) => intervals.push([fn, ms]),
    now: () => '2026-10-02T10:00:00Z',
  })
  return { autoUpdater, events, timers, intervals, updater, current }
}
const last = (events) => events.at(-1)[1]

describe('updater', () => {
  it('is disabled when the app is not packaged', async () => {
    const { updater, autoUpdater, timers } = setup({ isPackaged: false })
    updater.start()
    expect(updater.getState()).toMatchObject({ status: 'disabled', currentVersion: '0.3.0' })
    expect(timers).toEqual([])
    await updater.check()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })
  it('never installs on quit and follows the auto-download setting', () => {
    const { updater, autoUpdater, current } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(autoUpdater.autoDownload).toBe(false)
    current.autoDownloadUpdates = true
    updater.applySettings()
    expect(autoUpdater.autoDownload).toBe(true)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
  })
  it('checks 10 s after start and every 6 hours', async () => {
    const { updater, autoUpdater, timers, intervals } = setup()
    updater.start()
    expect(timers.map((t) => t[1])).toEqual([10000])
    expect(intervals.map((t) => t[1])).toEqual([6 * 60 * 60 * 1000])
    await timers[0][0]()
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })
  it('maps updater events to states', () => {
    const { updater, autoUpdater, events } = setup()
    updater.start()
    autoUpdater.emit('checking-for-update')
    expect(last(events)).toMatchObject({ status: 'checking' })
    autoUpdater.emit('update-available', { version: '0.3.1', releaseNotes: '<p>Novo</p>' })
    expect(last(events)).toMatchObject({ status: 'available', version: '0.3.1', notes: 'Novo', lastCheckedAt: '2026-10-02T10:00:00Z' })
    autoUpdater.emit('download-progress', { percent: 41.6 })
    expect(last(events)).toMatchObject({ status: 'downloading', percent: 42 })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    expect(last(events)).toMatchObject({ status: 'ready', version: '0.3.1', percent: 100 })
    expect(events.every(([ch]) => ch === EVENTS.updateState)).toBe(true)
  })
  it('progress after ready keeps ready', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    autoUpdater.emit('download-progress', { percent: 99 })
    expect(updater.getState().status).toBe('ready')
  })
  it('reports up to date', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-not-available', { version: '0.3.0' })
    expect(updater.getState()).toMatchObject({ status: 'none', lastCheckedAt: '2026-10-02T10:00:00Z' })
  })
  it('an error event or rejected check becomes state error without throwing', async () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('error', new Error('Cannot find latest.yml'))
    expect(updater.getState()).toMatchObject({ status: 'error', error: 'Cannot find latest.yml' })
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await expect(updater.check()).resolves.toMatchObject({ status: 'error', error: 'offline' })
  })
  it('an error after ready keeps the downloaded update installable', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    autoUpdater.emit('error', new Error('later check failed'))
    expect(updater.getState()).toMatchObject({ status: 'ready', error: 'later check failed' })
  })
  it('downloads only when available', () => {
    const { updater, autoUpdater } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    expect(updater.download()).toBe(false)
    autoUpdater.emit('update-available', { version: '0.3.1' })
    expect(updater.download()).toBe(true)
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(updater.getState()).toMatchObject({ status: 'downloading', percent: 0 })
  })
  it('a failed download becomes state error', async () => {
    const { updater, autoUpdater } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('disk full'))
    autoUpdater.emit('update-available', { version: '0.3.1' })
    updater.download()
    await new Promise((r) => setTimeout(r, 0))
    expect(updater.getState()).toMatchObject({ status: 'error', error: 'disk full' })
  })
  it('applySettings starts a pending download', () => {
    const { updater, autoUpdater, current } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    current.autoDownloadUpdates = true
    updater.applySettings()
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })
  it('install only when ready, once', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    expect(updater.install()).toBe(false)
    autoUpdater.emit('update-available', { version: '0.3.1' })
    expect(updater.install()).toBe(false)
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    expect(updater.install()).toBe(true)
    expect(updater.install()).toBe(false)
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
  it('does not re-check while checking, downloading or ready', async () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    await updater.check()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })
  it('does not leak an unhandled rejection from a failed auto-download', async () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      autoUpdater.checkForUpdates.mockResolvedValueOnce({ downloadPromise: Promise.reject(new Error('x')) })
      await updater.check()
      await new Promise((r) => setTimeout(r, 20))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
