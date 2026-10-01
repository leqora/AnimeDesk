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
})
