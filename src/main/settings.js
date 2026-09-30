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
  return s
}

export function createSettings(file) {
  let current = sanitizeSettings(readJson(file, {}).data)
  return {
    get: () => ({ ...current }),
    update(patch) {
      current = sanitizeSettings({ ...current, ...patch })
      writeJsonAtomic(file, current)
      return { ...current }
    },
  }
}
