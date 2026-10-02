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
      autoDownloadUpdates: true, lastSeenVersion: null,
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
})
