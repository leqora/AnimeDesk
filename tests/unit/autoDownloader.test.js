import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAutoDownloader } from '../../src/main/autoDownloader.js'
import { createSeriesPrefs } from '../../src/main/seriesPrefs.js'
import { SOURCE_LAG_MS } from '../../src/shared/autoDownload.js'

const T = 1_800_000_000_000
const MIN = 60_000, H = 60 * MIN

// Minimal fake scheduler driven by a fake clock.
function makeClock() {
  let now = T
  let seq = 0
  const timers = new Map()
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms, every: null }); return id },
    clearTimeout: (id) => { timers.delete(id) },
    setInterval: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms, every: ms }); return id },
    clearInterval: (id) => { timers.delete(id) },
    advance(ms) {
      const target = now + ms
      for (;;) {
        let best = null
        for (const [id, t] of timers) if (t.at <= target && (!best || t.at < best[1].at)) best = [id, t]
        if (!best) break
        const [id, t] = best
        now = Math.max(now, t.at)
        if (t.every) t.at += t.every
        else timers.delete(id)
        t.fn()
      }
      now = target
    },
    pending: () => [...timers.values()].map((t) => t.at - now),
  }
}

let dir, clock, prefs, downloads, settingsState, library, infos

const entry = (over = {}) => ({ id: 'a1', title: 'Show', aniCliTitle: 'Show', aniListId: 10, status: 'watching', watchedEpisodes: [1, 2, 3], ...over })
// aired 5 (episode 6 airs in 1 h)
const infoAired5 = () => ({ status: 'RELEASING', nextAiring: { episode: 6, airingAt: T + H } })

function make(over = {}) {
  return createAutoDownloader({
    library, settings: { get: () => settingsState }, seriesPrefs: prefs, downloads,
    anilist: { getCached: (_t, { aniListId }) => { if (infos[aniListId] instanceof Error) throw infos[aniListId]; return infos[aniListId] ?? null } },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    ...over,
  })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodl-'))
  clock = makeClock()
  prefs = createSeriesPrefs(path.join(dir, 'prefs.json'))
  downloads = { enqueue: vi.fn(() => []) }
  settingsState = { downloadDir: 'D:\\Anime' }
  library = { list: vi.fn(() => [entry()]) }
  infos = { 10: infoAired5() }
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('autoDownloader.check', () => {
  it('hands the new episodes as strings and moves the boundary; a second check hands nothing', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    const ad = make()
    ad.check()
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
    expect(downloads.enqueue).toHaveBeenCalledWith({ title: 'Show', aniCliTitle: 'Show', episodes: ['4', '5'], dir: 'D:\\Anime', auto: true })
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 5, next: { episode: 6, airingAt: T + H } })
    ad.check()
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
  })

  it('moves the boundary even when enqueue skipped the episodes (Review Focus 1)', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    downloads.enqueue = vi.fn(() => []) // nothing added: already downloaded
    make().check()
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 5, next: { episode: 6, airingAt: T + H } })
  })

  it('does nothing without a download folder and keeps the boundary (Review Focus 4)', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    settingsState = { downloadDir: null }
    make().check()
    expect(downloads.enqueue).not.toHaveBeenCalled()
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 3, next: { episode: 6, airingAt: T + H } })
  })

  it('keeps the boundary when enqueue throws', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    downloads.enqueue = vi.fn(() => { throw new Error('boom') })
    expect(() => make().check()).not.toThrow()
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 3, next: { episode: 6, airingAt: T + H } })
  })

  it('one series failing in getCached does not stop another', () => {
    library.list = vi.fn(() => [entry(), entry({ id: 'b2', title: 'Other', aniCliTitle: 'Other', aniListId: 20, watchedEpisodes: [] })])
    infos = { 10: new Error('cache broke'), 20: { status: 'RELEASING', nextAiring: { episode: 3, airingAt: T + H } } }
    prefs.setAutoDownload('Show', { after: 3 })
    prefs.setAutoDownload('Other', { after: 0 })
    make().check()
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
    expect(downloads.enqueue).toHaveBeenCalledWith({ title: 'Other', aniCliTitle: 'Other', episodes: ['1', '2'], dir: 'D:\\Anime', auto: true })
  })
})

describe('autoDownloader.setEnabled', () => {
  it('enqueues under aniCliTitle, not the display title', () => {
    library.list = vi.fn(() => [entry({ title: 'Display Name' })])
    prefs.setAutoDownload('Show', { after: 3 })
    make().check()
    expect(downloads.enqueue).toHaveBeenCalledWith({ title: 'Show', aniCliTitle: 'Show', episodes: ['4', '5'], dir: 'D:\\Anime', auto: true })
  })

  it('enabling again keeps the existing boundary', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    downloads.enqueue = vi.fn(() => [])
    expect(make().setEnabled('a1', true)).toEqual({ ok: true, enabled: true })
    expect(downloads.enqueue).toHaveBeenCalledWith(expect.objectContaining({ episodes: ['4', '5'] }))
  })

  it('enabling a series whose next episode airs later hands nothing now, then exactly that episode after the lag (Review Focus 3)', () => {
    const ad = make()
    ad.start()
    expect(ad.setEnabled('a1', true)).toEqual({ ok: true, enabled: true })
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 5, next: { episode: 6, airingAt: T + H } })
    expect(downloads.enqueue).not.toHaveBeenCalled()
    clock.advance(H + 20 * MIN - 1)
    expect(downloads.enqueue).not.toHaveBeenCalled()
    // the cache moved on after airing: episode 6 aired, episode 7 is next
    infos[10] = { status: 'RELEASING', nextAiring: { episode: 7, airingAt: T + 8 * 24 * H } }
    clock.advance(1 + SOURCE_LAG_MS) // well past airingAt + lag
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
    expect(downloads.enqueue).toHaveBeenCalledWith({ title: 'Show', aniCliTitle: 'Show', episodes: ['6'], dir: 'D:\\Anime', auto: true })
  })

  it('reports errors', () => {
    const ad = make()
    expect(ad.setEnabled('nope', true)).toEqual({ ok: false, error: 'not-found' })
    library.list = vi.fn(() => [entry({ aniCliTitle: undefined })])
    expect(ad.setEnabled('a1', true)).toEqual({ ok: false, error: 'no-title' })
    library.list = vi.fn(() => [entry()])
    settingsState = { downloadDir: null }
    expect(ad.setEnabled('a1', true)).toEqual({ ok: false, error: 'no-dir' })
    expect(prefs.getAutoDownload('Show')).toBeNull()
  })

  it('disabling works without a folder and removes the record', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    settingsState = { downloadDir: null }
    expect(make().setEnabled('a1', false)).toEqual({ ok: true, enabled: false })
    expect(prefs.getAutoDownload('Show')).toBeNull()
  })
})

describe('autoDownloader remembered schedule (finale / unknown next)', () => {
  const watched11 = () => entry({ watchedEpisodes: [1, 2, 3] })
  it('hands the finale exactly once after its airing plus the lag, although the refreshed cache lists no next episode', () => {
    library.list = vi.fn(() => [watched11()])
    infos[10] = { status: 'RELEASING', nextAiring: { episode: 12, airingAt: T + H } }
    const ad = make()
    expect(ad.setEnabled('a1', true)).toEqual({ ok: true, enabled: true })
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 11, next: { episode: 12, airingAt: T + H } })
    clock.advance(H)
    infos[10] = { status: 'RELEASING', nextAiring: null } // airingWatcher's confirming refresh
    ad.check()
    clock.advance(10 * MIN)
    ad.check()
    expect(downloads.enqueue).not.toHaveBeenCalled()
    clock.advance(10 * MIN)
    ad.check()
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
    expect(downloads.enqueue).toHaveBeenCalledWith({ title: 'Show', aniCliTitle: 'Show', episodes: ['12'], dir: 'D:\\Anime', auto: true })
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 12, next: { episode: 12, airingAt: T + H } })
    clock.advance(H)
    ad.check()
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
  })

  it('wakes up for the remembered schedule when the cache has none (split-cour gap)', () => {
    infos[10] = { status: 'RELEASING', nextAiring: { episode: 6, airingAt: T + H } }
    const ad = make()
    ad.start()
    ad.setEnabled('a1', true)
    infos[10] = { status: 'RELEASING', nextAiring: null }
    clock.advance(31 * MIN) // the 30 min check runs with the empty cache
    clock.advance(H + 20 * MIN - 31 * MIN - 1)
    expect(downloads.enqueue).not.toHaveBeenCalled()
    clock.advance(1)
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
    expect(downloads.enqueue).toHaveBeenCalledWith(expect.objectContaining({ episodes: ['6'] }))
    clock.advance(24 * H)
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
  })

  it('keeps holding an episode after the cache moved on to the next one', () => {
    infos[10] = { status: 'RELEASING', nextAiring: { episode: 6, airingAt: T + H } }
    const ad = make()
    ad.setEnabled('a1', true)
    clock.advance(H + 5 * MIN)
    infos[10] = { status: 'RELEASING', nextAiring: { episode: 7, airingAt: T + 8 * 24 * H } }
    ad.check()
    clock.advance(10 * MIN)
    ad.check()
    expect(downloads.enqueue).not.toHaveBeenCalled()
    clock.advance(5 * MIN)
    ad.check()
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
    expect(downloads.enqueue).toHaveBeenCalledWith(expect.objectContaining({ episodes: ['6'] }))
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 6, next: { episode: 7, airingAt: T + 8 * 24 * H } })
  })

  it('enabling a finished series hands nothing', () => {
    infos[10] = { status: 'FINISHED', episodes: 12, nextAiring: null }
    const ad = make()
    expect(ad.setEnabled('a1', true)).toEqual({ ok: true, enabled: true })
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 12 })
    ad.check()
    expect(downloads.enqueue).not.toHaveBeenCalled()
  })
})

describe('autoDownloader pending records (schedule unknown at enable)', () => {
  it('enabling without a known schedule is pending; the first known schedule moves the boundary and hands nothing', () => {
    infos[10] = { status: 'RELEASING', nextAiring: null }
    const ad = make()
    expect(ad.setEnabled('a1', true)).toEqual({ ok: true, enabled: true })
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 3, pending: true })
    expect(prefs.get('Show').autoDownload).toBe(true)
    ad.check()
    expect(downloads.enqueue).not.toHaveBeenCalled()
    // later the cache knows: 12 aired, 13 airs in a day
    infos[10] = { status: 'RELEASING', nextAiring: { episode: 13, airingAt: T + 24 * H } }
    ad.check()
    expect(downloads.enqueue).not.toHaveBeenCalled()
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 12, next: { episode: 13, airingAt: T + 24 * H } })
    clock.advance(24 * H + SOURCE_LAG_MS)
    ad.check()
    expect(downloads.enqueue).toHaveBeenCalledTimes(1)
    expect(downloads.enqueue).toHaveBeenCalledWith(expect.objectContaining({ episodes: ['13'] }))
  })

  it('enabling before the series is cached at all is pending', () => {
    delete infos[10]
    const ad = make()
    expect(ad.setEnabled('a1', true)).toEqual({ ok: true, enabled: true })
    expect(prefs.getAutoDownload('Show')).toEqual({ after: 3, pending: true })
    expect(downloads.enqueue).not.toHaveBeenCalled()
  })
})

describe('autoDownloader timers', () => {
  it('start() runs the first check after 90 s, then every 30 min', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    const ad = make()
    ad.start()
    clock.advance(90_000 - 1)
    expect(library.list).not.toHaveBeenCalled()
    clock.advance(1)
    expect(library.list).toHaveBeenCalledTimes(1)
    clock.advance(30 * MIN)
    expect(library.list).toHaveBeenCalledTimes(2)
    clock.advance(30 * MIN)
    expect(library.list).toHaveBeenCalledTimes(3)
  })

  it('caps the next-episode timer at 6 h', () => {
    prefs.setAutoDownload('Show', { after: 5 })
    infos[10] = { status: 'RELEASING', nextAiring: { episode: 6, airingAt: T + 40 * H } }
    const ad = make()
    ad.start()
    ad.check()
    expect(Math.max(...clock.pending())).toBeLessThanOrEqual(6 * H)
    expect(clock.pending().filter((d) => d === 6 * H)).toHaveLength(1)
  })

  it('start() after stop() re-arms and checks again', () => {
    const ad = make()
    ad.start()
    ad.stop()
    ad.start()
    clock.advance(90_000)
    expect(library.list).toHaveBeenCalledTimes(1)
  })

  it('after stop() nothing fires and check() does nothing', () => {
    prefs.setAutoDownload('Show', { after: 3 })
    const ad = make()
    ad.start()
    ad.stop()
    clock.advance(10 * H)
    ad.check()
    expect(library.list).not.toHaveBeenCalled()
    expect(downloads.enqueue).not.toHaveBeenCalled()
    expect(clock.pending()).toEqual([])
  })
})
