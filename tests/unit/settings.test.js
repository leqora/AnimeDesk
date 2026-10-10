import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_SETTINGS, sanitizeSettings, createSettings } from '../../src/main/settings.js'

let file
beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-set-')), 'settings.json') })

describe('settings', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      language: 'sr', autoTrack: true, watchedThreshold: 85, askOnClose: false,
      downloadDir: null, quality: 'best', mode: 'sub', autoUpdateTools: true,
      profileName: null, soundKey: true, soundUi: false, soundVolume: 60, animations: true,
      autoDownloadUpdates: true, lastSeenVersion: null, fullscreen: false,
      playerMode: 'internal', autoSkip: false, autoNext: true, subtitles: { enabled: { sub: true, dub: false }, size: 25, lineSpacing: 20, font: 'default', color: 'white', box: true, boxOpacity: 60 }, mpvModernUi: true,
      playerVolume: 1, playerMuted: false,
    })
  })
  it('clamps the threshold and ignores invalid values', () => {
    const s = sanitizeSettings({ watchedThreshold: 120, language: 'de', mode: 'raw', quality: '4k', autoTrack: 'yes' })
    expect(s.watchedThreshold).toBe(100)
    expect(s.language).toBe('sr')
    expect(s.mode).toBe('sub')
    expect(s.quality).toBe('best')
    expect(s.autoTrack).toBe(true)
    expect(sanitizeSettings({ watchedThreshold: 10 }).watchedThreshold).toBe(50)
    expect(sanitizeSettings({ watchedThreshold: 72.6 }).watchedThreshold).toBe(73)
  })
  it('persists updates and allows clearing the download folder', () => {
    const s = createSettings(file)
    s.update({ language: 'en', downloadDir: 'D:\\Anime' })
    expect(createSettings(file).get()).toMatchObject({ language: 'en', downloadDir: 'D:\\Anime' })
    s.update({ downloadDir: null })
    expect(createSettings(file).get().downloadDir).toBeNull()
  })
  it('get() returns a copy', () => {
    const s = createSettings(file)
    s.get().language = 'en'
    expect(s.get().language).toBe('sr')
  })
  it('validates the profile and sound settings', () => {
    expect(sanitizeSettings({ profileName: '  Nikola  ' }).profileName).toBe('Nikola')
    expect(sanitizeSettings({ profileName: '' }).profileName).toBeNull()
    expect(sanitizeSettings({ profileName: 'x'.repeat(40) }).profileName).toHaveLength(32)
    expect(sanitizeSettings({ soundVolume: 140 }).soundVolume).toBe(100)
    expect(sanitizeSettings({ soundVolume: -3 }).soundVolume).toBe(0)
    expect(sanitizeSettings({ soundVolume: 33.6 }).soundVolume).toBe(34)
    expect(sanitizeSettings({ soundKey: false, soundUi: true, animations: false })).toMatchObject({ soundKey: false, soundUi: true, animations: false })
    expect(sanitizeSettings({ soundUi: 'yes' }).soundUi).toBe(false)
  })
  it('exposes the system user name without persisting it', () => {
    const s = createSettings(file, { systemName: 'nikola' })
    expect(s.get().systemName).toBe('nikola')
    s.update({ language: 'en' })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).not.toHaveProperty('systemName')
    expect(s.update({ language: 'sr' }).systemName).toBe('nikola')
  })
  it('validates the update settings', () => {
    expect(sanitizeSettings({ autoDownloadUpdates: false }).autoDownloadUpdates).toBe(false)
    expect(sanitizeSettings({ autoDownloadUpdates: 'no' }).autoDownloadUpdates).toBe(true)
    expect(sanitizeSettings({ lastSeenVersion: '0.3.1' }).lastSeenVersion).toBe('0.3.1')
    expect(sanitizeSettings({ lastSeenVersion: 'v0.3.1' }).lastSeenVersion).toBeNull()
    expect(sanitizeSettings({ lastSeenVersion: 3 }).lastSeenVersion).toBeNull()
  })
  it('keeps a boolean fullscreen flag, off by default', () => {
    expect(DEFAULT_SETTINGS.fullscreen).toBe(false)
    expect(sanitizeSettings({ fullscreen: true }).fullscreen).toBe(true)
    expect(sanitizeSettings({ fullscreen: 'yes' }).fullscreen).toBe(false)
  })
  it('validates the player settings', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ playerMode: 'internal', autoSkip: false, autoNext: true, mpvModernUi: true })
    expect(sanitizeSettings({ playerMode: 'external', autoSkip: true, autoNext: false, mpvModernUi: false })).toMatchObject({ playerMode: 'external', autoSkip: true, autoNext: false, mpvModernUi: false })
    expect(sanitizeSettings({ playerMode: 'vlc', autoSkip: 'yes', autoNext: 1, mpvModernUi: null })).toMatchObject({ playerMode: 'internal', autoSkip: false, autoNext: true, mpvModernUi: true })
  })
  it('sanitises the subtitle settings field by field', () => {
    const s = sanitizeSettings({ subtitles: { enabled: { sub: 'no', dub: true }, size: 140, lineSpacing: -5, font: 'comic', color: 'red', box: 0, boxOpacity: 33.4 } })
    expect(s.subtitles).toEqual({ enabled: { sub: true, dub: true }, size: 100, lineSpacing: 0, font: 'default', color: 'white', box: true, boxOpacity: 33 })
    expect(sanitizeSettings({ subtitles: 'big' }).subtitles).toEqual(DEFAULT_SETTINGS.subtitles)
    expect(sanitizeSettings({ subtitles: { font: 'georgia', color: 'yellow', box: false } }).subtitles).toMatchObject({ font: 'georgia', color: 'yellow', box: false, size: 25 })
  })
  it('migrates the old S/M/L subtitle size once and stops writing it', () => {
    expect(sanitizeSettings({ subtitleSize: 'S' }).subtitles.size).toBe(20)
    expect(sanitizeSettings({ subtitleSize: 'M' }).subtitles.size).toBe(25)
    expect(sanitizeSettings({ subtitleSize: 'L' }).subtitles.size).toBe(65)
    expect(sanitizeSettings({ subtitleSize: 'L', subtitles: { size: 10 } }).subtitles.size).toBe(10)
    expect('subtitleSize' in sanitizeSettings({ subtitleSize: 'L' })).toBe(false)
  })
  it('merges partial subtitle updates deeply and persists them', () => {
    fs.writeFileSync(file, JSON.stringify({ subtitleSize: 'L' }))
    const s = createSettings(file)
    expect(s.update({ subtitles: { enabled: { dub: true } } }).subtitles).toMatchObject({ enabled: { sub: true, dub: true }, size: 65 })
    s.update({ subtitles: { size: 55 } })
    const again = createSettings(file).get()
    expect(again.subtitles).toMatchObject({ enabled: { sub: true, dub: true }, size: 55 })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).subtitleSize).toBeUndefined()
  })
  it('keeps the player volume in 0..1 and the mute flag boolean', () => {
    expect(DEFAULT_SETTINGS.playerVolume).toBe(1)
    expect(DEFAULT_SETTINGS.playerMuted).toBe(false)
    expect(sanitizeSettings({ playerVolume: 0.42 }).playerVolume).toBe(0.42)
    expect(sanitizeSettings({ playerVolume: 1.5 }).playerVolume).toBe(1)
    expect(sanitizeSettings({ playerVolume: -1 }).playerVolume).toBe(0)
    expect(sanitizeSettings({ playerVolume: Number.NaN }).playerVolume).toBe(1)
    expect(sanitizeSettings({ playerVolume: '0.5' }).playerVolume).toBe(1)
    expect(sanitizeSettings({ playerMuted: true }).playerMuted).toBe(true)
    expect(sanitizeSettings({ playerMuted: 'yes' }).playerMuted).toBe(false)
  })
})
