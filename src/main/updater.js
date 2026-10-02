import { EVENTS } from '../shared/channels.js'
import { releaseNotesToText } from '../shared/releaseNotes.js'

const FIRST_CHECK_MS = 10000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const BUSY = ['checking', 'downloading', 'ready']

export function createUpdater({
  autoUpdater, isPackaged, currentVersion, getSettings, notify,
  setTimeoutFn = setTimeout, setIntervalFn = setInterval, now = () => new Date().toISOString(),
}) {
  let state = {
    status: isPackaged ? 'idle' : 'disabled',
    currentVersion, version: null, percent: null, notes: null, lastCheckedAt: null, error: null,
  }
  let installing = false
  const set = (patch) => {
    state = { ...state, ...patch }
    notify(EVENTS.updateState, { ...state })
  }
  const message = (err) => String(err?.message ?? err)
  const fail = (err) => (state.status === 'ready' ? set({ error: message(err) }) : set({ status: 'error', error: message(err), lastCheckedAt: now() }))

  if (isPackaged) {
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
    autoUpdater.on('update-not-available', () => set({ status: 'none', lastCheckedAt: now() }))
    autoUpdater.on('update-available', (info) => set({
      status: 'available', version: info?.version ?? null, notes: releaseNotesToText(info?.releaseNotes ?? null),
      percent: null, lastCheckedAt: now(),
    }))
    autoUpdater.on('download-progress', (p) => {
      if (state.status === 'ready') return
      set({ status: 'downloading', percent: Math.round(p?.percent ?? 0) })
    })
    autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info?.version ?? state.version, percent: 100 }))
    autoUpdater.on('error', fail)
  }

  async function check() {
    if (state.status === 'disabled' || BUSY.includes(state.status)) return { ...state }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      fail(err)
    }
    return { ...state }
  }

  function download() {
    if (state.status !== 'available') return false
    set({ status: 'downloading', percent: 0 })
    Promise.resolve(autoUpdater.downloadUpdate()).catch(fail)
    return true
  }

  function install() {
    if (state.status !== 'ready' || installing) return false
    installing = true
    autoUpdater.quitAndInstall(false, true)
    return true
  }

  function applySettings() {
    if (state.status === 'disabled') return
    autoUpdater.autoDownload = getSettings().autoDownloadUpdates !== false
    autoUpdater.autoInstallOnAppQuit = false // never install without the user's click
    if (autoUpdater.autoDownload && state.status === 'available') download()
  }

  function start() {
    if (state.status === 'disabled') return
    applySettings()
    setTimeoutFn(check, FIRST_CHECK_MS)
    setIntervalFn(check, CHECK_EVERY_MS)
  }

  return { start, check, download, install, applySettings, getState: () => ({ ...state }) }
}
