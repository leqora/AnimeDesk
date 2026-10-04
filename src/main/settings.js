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
  fullscreen: false,
  playerMode: 'internal',
  autoSkip: false,
  autoNext: true,
  subtitleSize: 'M',
  mpvModernUi: true,
})

export const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']
export const MODES = ['sub', 'dub']
export const PLAYER_MODES = ['internal', 'external']
export const SUBTITLE_SIZES = ['S', 'M', 'L']

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
  if (MODES.includes(input.mode)) s.mode = input.mode
  if (typeof input.autoUpdateTools === 'boolean') s.autoUpdateTools = input.autoUpdateTools
  if (typeof input.profileName === 'string' && input.profileName.trim()) s.profileName = input.profileName.trim().slice(0, 32)
  if (typeof input.soundKey === 'boolean') s.soundKey = input.soundKey
  if (typeof input.soundUi === 'boolean') s.soundUi = input.soundUi
  if (Number.isFinite(input.soundVolume)) s.soundVolume = Math.min(100, Math.max(0, Math.round(input.soundVolume)))
  if (typeof input.animations === 'boolean') s.animations = input.animations
  if (typeof input.autoDownloadUpdates === 'boolean') s.autoDownloadUpdates = input.autoDownloadUpdates
  if (typeof input.lastSeenVersion === 'string' && /^\d+\.\d+\.\d+$/.test(input.lastSeenVersion)) s.lastSeenVersion = input.lastSeenVersion
  if (typeof input.fullscreen === 'boolean') s.fullscreen = input.fullscreen
  if (PLAYER_MODES.includes(input.playerMode)) s.playerMode = input.playerMode
  if (typeof input.autoSkip === 'boolean') s.autoSkip = input.autoSkip
  if (typeof input.autoNext === 'boolean') s.autoNext = input.autoNext
  if (SUBTITLE_SIZES.includes(input.subtitleSize)) s.subtitleSize = input.subtitleSize
  if (typeof input.mpvModernUi === 'boolean') s.mpvModernUi = input.mpvModernUi
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
