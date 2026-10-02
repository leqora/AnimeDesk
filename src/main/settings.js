import { readJson, writeJsonAtomic } from './jsonStore.js'

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'sr',
  autoTrack: true,
  watchedThreshold: 85,
  askOnClose: false,
  downloadDir: null,
  quality: 'best',
  mode: 'sub',
  autoUpdateTools: true,
  profileName: null,
  soundKey: true,
  soundUi: false,
  soundVolume: 60,
  animations: true,
  autoDownloadUpdates: true,
  lastSeenVersion: null,
})

const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']

export function sanitizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS }
  if (input.language === 'sr' || input.language === 'en') s.language = input.language
  if (typeof input.autoTrack === 'boolean') s.autoTrack = input.autoTrack
  if (Number.isFinite(input.watchedThreshold)) {
    s.watchedThreshold = Math.min(100, Math.max(50, Math.round(input.watchedThreshold)))
  }
  if (typeof input.askOnClose === 'boolean') s.askOnClose = input.askOnClose
  if (typeof input.downloadDir === 'string' && input.downloadDir) s.downloadDir = input.downloadDir
  if (QUALITIES.includes(input.quality)) s.quality = input.quality
  if (input.mode === 'sub' || input.mode === 'dub') s.mode = input.mode
  if (typeof input.autoUpdateTools === 'boolean') s.autoUpdateTools = input.autoUpdateTools
  if (typeof input.profileName === 'string' && input.profileName.trim()) s.profileName = input.profileName.trim().slice(0, 32)
  if (typeof input.soundKey === 'boolean') s.soundKey = input.soundKey
  if (typeof input.soundUi === 'boolean') s.soundUi = input.soundUi
  if (Number.isFinite(input.soundVolume)) s.soundVolume = Math.min(100, Math.max(0, Math.round(input.soundVolume)))
  if (typeof input.animations === 'boolean') s.animations = input.animations
  if (typeof input.autoDownloadUpdates === 'boolean') s.autoDownloadUpdates = input.autoDownloadUpdates
  if (typeof input.lastSeenVersion === 'string' && /^\d+\.\d+\.\d+$/.test(input.lastSeenVersion)) s.lastSeenVersion = input.lastSeenVersion
  return s
}

export function createSettings(file, { systemName = 'Player' } = {}) {
  let current = sanitizeSettings(readJson(file, {}).data)
  const view = () => ({ ...current, systemName })
  return {
    get: view,
    update(patch) {
      current = sanitizeSettings({ ...current, ...patch })
      writeJsonAtomic(file, current)
      return view()
    },
  }
}
