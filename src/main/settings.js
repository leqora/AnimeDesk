import { readJson, writeJsonAtomic } from './jsonStore.js'
import { DEFAULT_SUBTITLES, SUBTITLE_FONT_STACKS, SUBTITLE_COLORS } from '../shared/subtitles.js'

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
  subtitles: DEFAULT_SUBTITLES,
  mpvModernUi: true,
  playerVolume: 1,
  playerMuted: false,
})

export const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']
export const MODES = ['sub', 'dub']
export const PLAYER_MODES = ['internal', 'external']
const LEGACY_SUBTITLE_SIZE = { S: 20, M: 40, L: 65 }
const pct = (v, fallback) => (Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fallback)

// Each field on its own: one bad value must not reset the rest. An old S/M/L size seeds `size` once.
export function sanitizeSubtitles(input, legacySize) {
  const d = DEFAULT_SUBTITLES
  const has = input !== null && typeof input === 'object'
  const i = has ? input : {}
  const en = i.enabled !== null && typeof i.enabled === 'object' ? i.enabled : {}
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback)
  return {
    enabled: { sub: bool(en.sub, d.enabled.sub), dub: bool(en.dub, d.enabled.dub) },
    size: pct(i.size, has ? d.size : LEGACY_SUBTITLE_SIZE[legacySize] ?? d.size),
    lineSpacing: pct(i.lineSpacing, d.lineSpacing),
    font: Object.hasOwn(SUBTITLE_FONT_STACKS, i.font) ? i.font : d.font,
    color: SUBTITLE_COLORS.includes(i.color) ? i.color : d.color,
    box: bool(i.box, d.box),
    boxOpacity: pct(i.boxOpacity, d.boxOpacity),
  }
}

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
  s.subtitles = sanitizeSubtitles(input.subtitles, input.subtitleSize)
  if (typeof input.mpvModernUi === 'boolean') s.mpvModernUi = input.mpvModernUi
  if (Number.isFinite(input.playerVolume)) s.playerVolume = Math.min(1, Math.max(0, input.playerVolume))
  if (typeof input.playerMuted === 'boolean') s.playerMuted = input.playerMuted
  return s
}

export function createSettings(file, { systemName = 'Player' } = {}) {
  let current = sanitizeSettings(readJson(file, {}).data)
  const view = () => ({ ...current, systemName })
  return {
    get: view,
    update(patch) {
      const next = { ...current, ...patch }
      // partial subtitle patches (e.g. only enabled.dub) keep the other subtitle fields
      if (patch?.subtitles && typeof patch.subtitles === 'object') {
        next.subtitles = { ...current.subtitles, ...patch.subtitles, enabled: { ...current.subtitles.enabled, ...(patch.subtitles.enabled ?? {}) } }
      }
      current = sanitizeSettings(next)
      writeJsonAtomic(file, current)
      return view()
    },
  }
}
