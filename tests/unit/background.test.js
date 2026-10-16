import { describe, it, expect } from 'vitest'
import { shouldHideOnClose, startHidden, notificationText, shouldNotifyDownload } from '../../src/main/background.js'

describe('background helpers', () => {
  it('hides on close only with closeToTray and not while quitting', () => {
    expect(shouldHideOnClose({ closeToTray: true, quitting: false })).toBe(true)
    expect(shouldHideOnClose({ closeToTray: false, quitting: false })).toBe(false)
    expect(shouldHideOnClose({ closeToTray: true, quitting: true })).toBe(false)
  })
  it('detects --hidden', () => {
    expect(startHidden(['app.exe', '--hidden'])).toBe(true)
    expect(startHidden(['app.exe'])).toBe(false)
    expect(startHidden(undefined)).toBe(false)
  })
  it('builds the copy in sr and en', () => {
    const d = { title: 'Frieren', episode: 5 }
    expect(notificationText('episode', d, 'sr')).toEqual({ title: 'Nova epizoda', body: 'Frieren — EP 5' })
    expect(notificationText('episode', d, 'en')).toEqual({ title: 'New episode', body: 'Frieren — EP 5' })
    expect(notificationText('downloaded', d, 'sr')).toEqual({ title: 'AnimeDesk', body: 'Preuzeto: Frieren — EP 5' })
    expect(notificationText('downloaded', d, 'en')).toEqual({ title: 'AnimeDesk', body: 'Downloaded: Frieren — EP 5' })
    expect(notificationText('downloadFailed', d, 'sr').body).toBe('Preuzimanje nije uspelo: Frieren — EP 5')
    expect(notificationText('downloadFailed', d, 'en').body).toBe('Download failed: Frieren — EP 5')
    expect(notificationText('trayHint', {}, 'sr')).toEqual({ title: 'AnimeDesk', body: 'AnimeDesk radi u pozadini — ikona je pored sata' })
    expect(notificationText('trayHint', {}, 'en')).toEqual({ title: 'AnimeDesk', body: 'AnimeDesk keeps running in the background — the icon is next to the clock' })
  })
  it('falls back to sr for an unknown language', () => {
    expect(notificationText('episode', { title: 'A', episode: 1 }, 'xx').title).toBe('Nova epizoda')
  })
  it('notifies downloads only when enabled and the window is not focused', () => {
    expect(shouldNotifyDownload({ notifyDownloads: true, windowFocused: false })).toBe(true)
    expect(shouldNotifyDownload({ notifyDownloads: true, windowFocused: true })).toBe(false)
    expect(shouldNotifyDownload({ notifyDownloads: false, windowFocused: false })).toBe(false)
    expect(shouldNotifyDownload({ notifyDownloads: true, windowFocused: undefined })).toBe(true)
  })
})
