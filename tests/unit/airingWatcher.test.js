import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dueNotifications, createAiringWatcher } from '../../src/main/airingWatcher.js'
import { AIRED_GRACE_MS } from '../../src/shared/airing.js'

const T = 1_800_000_000_000
const MIN = 60_000, H = 60 * MIN, D = 24 * H
const entry = (id, aniListId, over = {}) => ({ id, title: `Title ${id}`, status: 'watching', aniListId, ...over })
// info whose next episode `episode` airs at `airingAt`
const eps = (n) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v.episode]))
const fr = (episode, freshAt) => ({ episode, freshAt })
const info = (episode, airingAt) => ({ status: 'RELEASING', nextAiring: { episode, airingAt } })

describe('dueNotifications', () => {
  it('seeds unseen ids without notifying (Review Focus 1)', () => {
    const entries = [entry('a', 1), entry('b', 2), entry('c', 3)]
    const infoById = { 1: info(5, T - 3 * H), 2: info(9, T - H), 3: info(4, T + H) }
    const r = dueNotifications({ entries, infoById, notified: {}, now: T, fresh: true })
    expect(r.due).toEqual([])
    expect(eps(r.notified)).toEqual({ 1: 5, 2: 9, 3: 3 })
  })

  it('notifies once for an episode that aired within 24 h (known airingAt)', () => {
    const r = dueNotifications({ entries: [entry('a', 1)], infoById: { 1: info(6, T - 2 * H) }, notified: { 1: 5 }, now: T })
    expect(r.due).toEqual([{ animeId: 'a', aniListId: 1, title: 'Title a', episode: 6 }])
    expect(eps(r.notified)).toEqual({ 1: 6 })
    const again = dueNotifications({ entries: [entry('a', 1)], infoById: { 1: info(6, T - 2 * H) }, notified: r.notified, now: T + MIN })
    expect(again.due).toEqual([])
  })

  it('does not notify for an episode older than 24 h, but updates memory (Review Focus 2)', () => {
    const r = dueNotifications({ entries: [entry('a', 1)], infoById: { 1: info(9, T - 3 * D) }, notified: { 1: 5 }, now: T })
    expect(r.due).toEqual([])
    expect(eps(r.notified)).toEqual({ 1: 9 })
  })

  it('app off 3 days: only the series with a fresh episode notifies, one item each (Review Focus 2)', () => {
    const entries = [entry('old', 1), entry('new', 2)]
    const infoById = { 1: info(12, T - 3 * D), 2: info(8, T - 2 * H) }
    const r = dueNotifications({ entries, infoById, notified: { 1: 6, 2: 3 }, now: T })
    expect(r.due).toEqual([{ animeId: 'new', aniListId: 2, title: 'Title new', episode: 8 }])
    expect(eps(r.notified)).toEqual({ 1: 12, 2: 8 })
  })

  it('cache already moved on: notifies only if THIS series was in a fresh check within 24 h', () => {
    const infoById = { 1: info(7, T + 5 * D) } // aired = 6, time unknown
    const run = (notified) => dueNotifications({ entries: [entry('a', 1)], infoById, notified, now: T })
    const recent = run({ 1: fr(5, T - 6 * H) })
    expect(recent.due).toEqual([{ animeId: 'a', aniListId: 1, title: 'Title a', episode: 6 }])
    const stale = run({ 1: fr(5, T - 3 * D) })
    expect(stale.due).toEqual([])
    expect(eps(stale.notified)).toEqual({ 1: 6 })
    expect(run({ 1: 5 }).due).toEqual([]) // migrated flat shape: freshAt unknown
    expect(run({ 1: fr(5, null) }).due).toEqual([])
  })

  it('series paused for weeks then set back to watching stays silent although other series are fresh (I-1)', () => {
    const entries = [entry('a', 1), entry('b', 2, { status: 'paused' })]
    const infoById = { 1: info(4, T + D), 2: info(8, T + 5 * D) }
    // fresh checks kept running for series 1 (stamped 2 h ago); series 2 was paused so its stamp is weeks old
    let notified = { 1: fr(3, T - 2 * H), 2: fr(5, T - 30 * D) }
    entries[1].status = 'watching'
    const r = dueNotifications({ entries, infoById, notified, now: T })
    expect(r.due).toEqual([])
    expect(eps(r.notified)).toEqual({ 1: 3, 2: 7 })
  })

  it('series absent from the last fresh check (no cached info) is not stamped fresh', () => {
    const entries = [entry('a', 1), entry('b', 2)]
    const r1 = dueNotifications({ entries, infoById: { 1: info(4, T + D) }, notified: { 1: fr(3, T - H), 2: fr(5, T - 40 * D) }, now: T, fresh: true })
    expect(r1.notified[1].freshAt).toBe(T)
    expect(r1.notified[2].freshAt).toBe(T - 40 * D)
    const r2 = dueNotifications({ entries, infoById: { 1: info(4, T + D), 2: info(8, T + 5 * D) }, notified: r1.notified, now: T + H })
    expect(r2.due).toEqual([])
  })

  it('no schedule at first sighting: not seeded, later schedule seeds silently (I-2)', () => {
    const entries = [entry('a', 1)]
    const r1 = dueNotifications({ entries, infoById: { 1: { status: 'RELEASING', nextAiring: null } }, notified: {}, now: T, fresh: true })
    expect(r1.due).toEqual([])
    expect(r1.notified).toEqual({})
    const r2 = dueNotifications({ entries, infoById: { 1: info(13, T + 3 * D) }, notified: r1.notified, now: T + H, fresh: true })
    expect(r2.due).toEqual([])
    expect(eps(r2.notified)).toEqual({ 1: 12 })
  })

  it('ignores non-watching entries and entries without a valid aniListId', () => {
    const entries = [entry('a', 1, { status: 'completed' }), entry('b', null), entry('c', 'x'), entry('d', 0), entry('e', 5)]
    const infoById = { 1: info(6, T - H), 5: info(6, T - H) }
    const r = dueNotifications({ entries, infoById, notified: { 1: 2, 5: 5 }, now: T })
    expect(r.due.map((d) => d.animeId)).toEqual(['e'])
    expect(eps(r.notified)).toEqual({ 1: 2, 5: 6 })
  })

  it('does not notify without cached info and does not mutate its input', () => {
    const notified = { 1: 2 }
    const r = dueNotifications({ entries: [entry('a', 1)], infoById: {}, notified, now: T })
    expect(r.due).toEqual([])
    expect(eps(r.notified)).toEqual({ 1: 2 })
    expect(notified).toEqual({ 1: 2 })
  })
})

describe('createAiringWatcher', () => {
  let dir, file, state, library, anilist, notify

  const make = () => createAiringWatcher({ library, anilist, file, notify })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airing-'))
    file = path.join(dir, 'airingWatcher.json')
    state = { entries: [entry('a', 1)], infos: { 1: info(6, T + 2 * H) } }
    library = { list: () => state.entries }
    anilist = {
      getCached: vi.fn((_t, { aniListId }) => state.infos[aniListId] ?? null),
      refreshAiring: vi.fn(async () => new Map()),
    }
    notify = vi.fn()
  })
  afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('seeds on first check; freshAt is persisted only after a successful refresh', async () => {
    const w = make()
    w.check()
    expect(notify).not.toHaveBeenCalled()
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(saved.notified).toEqual({ 1: { episode: 5, freshAt: null } })
    await w.refresh()
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).notified).toEqual({ 1: { episode: 5, freshAt: T } })
    w.stop()
  })

  it('notifies when the episode airs (timer at airingAt), then schedules a grace refresh', async () => {
    const w = make()
    w.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(notify).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2 * H)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({ animeId: 'a', aniListId: 1, title: 'Title a', episode: 6 })
    const before = anilist.refreshAiring.mock.calls.length
    await vi.advanceTimersByTimeAsync(AIRED_GRACE_MS)
    expect(anilist.refreshAiring.mock.calls.length).toBe(before + 1)
    expect(notify).toHaveBeenCalledTimes(1)
    w.stop()
  })

  it('refresh rejection is swallowed; check still fires at known airingAt; no tight retry loop (Review Focus 3)', async () => {
    anilist.refreshAiring.mockRejectedValue(new Error('AniList down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = make()
    w.start()
    await vi.advanceTimersByTimeAsync(60_000) // first refresh fails
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(H + 59 * MIN) // up to airingAt (T + 2h)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(2) // first refresh + the one confirming refresh at airingAt (failed, announced from cache, no loop)
    await vi.advanceTimersByTimeAsync(AIRED_GRACE_MS) // only the grace refresh
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(2 * H)
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(6 * H) // 6 h interval from start is next
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(4)
    warn.mockRestore()
    w.stop()
  })

  it('re-arms the check timer through 6 h hops until the far airingAt', async () => {
    state.infos[1] = info(6, T + 20 * H)
    const w = make()
    w.start()
    await vi.advanceTimersByTimeAsync(19 * H)
    expect(notify).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(H + 1000)
    expect(notify).toHaveBeenCalledTimes(1)
    w.stop()
  })

  it('moved-on cache: notifies after a refresh when the series own freshAt is recent; stale one does not', async () => {
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T - 3 * D) } }))
    state.infos[1] = info(7, T + 5 * D)
    const w = make()
    await w.refresh()
    expect(notify).not.toHaveBeenCalled()
    w.stop()
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T - 6 * H) } }))
    const w2 = make()
    await w2.refresh()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].episode).toBe(6)
    w2.stop()
  })

  it('persists memory across instances (no duplicate notification)', async () => {
    const w = make()
    w.check()
    w.stop()
    vi.setSystemTime(T + 3 * H)
    const w1 = make()
    w1.check()
    await vi.advanceTimersByTimeAsync(0) // confirming refresh resolves
    expect(notify).toHaveBeenCalledTimes(1)
    w1.stop()
    const w2 = make()
    w2.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(notify).toHaveBeenCalledTimes(1)
    w2.stop()
  })

  it('refreshes before announcing an episode found in cache', async () => {
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T) } }))
    state.infos[1] = info(6, T - MIN)
    let release
    anilist.refreshAiring.mockImplementation(() => new Promise((res) => { release = res }))
    const w = make()
    w.check()
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
    release(new Map())
    await vi.advanceTimersByTimeAsync(0)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].episode).toBe(6)
    w.stop()
  })

  it('does not announce a delayed episode and re-arms for the new time', async () => {
    anilist.refreshAiring.mockImplementation(async () => {
      if (state.infos[1].nextAiring.airingAt === T + 2 * H) state.infos[1] = info(6, T + 4 * H) // AniList moved it +2 h
      return new Map()
    })
    const w = make()
    w.start()
    await vi.advanceTimersByTimeAsync(2 * H) // timer check at the old airingAt -> confirm -> delayed
    expect(notify).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2 * H)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].episode).toBe(6)
    w.stop()
  })

  it('announces the season finale when the fresh data has no next episode', async () => {
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(11, T) } }))
    state.infos[1] = info(12, T - MIN)
    anilist.refreshAiring.mockImplementation(async () => {
      state.infos[1] = { status: 'FINISHED', nextAiring: null }
      return new Map()
    })
    const w = make()
    w.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].episode).toBe(12)
    w.stop()
  })

  it('announces an episode whose next airing already moved on, even after a long gap', async () => {
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T - 30 * H) } }))
    state.infos[1] = info(6, T - MIN)
    anilist.refreshAiring.mockImplementation(async () => {
      state.infos[1] = info(7, T + 7 * D)
      return new Map()
    })
    const w = make()
    w.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].episode).toBe(6)
    w.stop()
  })

  it('announces from cache once when the refresh fails', async () => {
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T) } }))
    state.infos[1] = info(6, T - MIN)
    anilist.refreshAiring.mockRejectedValue(new Error('AniList down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = make()
    w.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].episode).toBe(6)
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(MIN)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(1)
    warn.mockRestore()
    w.stop()
  })

  it('announces nothing when stopped during the confirming refresh', async () => {
    for (const fail of [false, true]) {
      fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T) } }))
      state.infos[1] = info(6, T - MIN)
      let settle
      anilist.refreshAiring.mockImplementation(() => new Promise((res, rej) => { settle = fail ? () => rej(new Error('x')) : () => res(new Map()) }))
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const w = make()
      w.check()
      w.stop()
      settle()
      await vi.advanceTimersByTimeAsync(0)
      expect(notify).not.toHaveBeenCalled()
      warn.mockRestore()
    }
  })

  it('confirms several due series with one refresh', async () => {
    state.entries = [entry('a', 1), entry('b', 2)]
    state.infos = { 1: info(6, T - MIN), 2: info(4, T - MIN) }
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T), 2: fr(3, T) } }))
    const w = make()
    w.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(1)
    expect(anilist.refreshAiring).toHaveBeenCalledWith([1, 2])
    expect(notify).toHaveBeenCalledTimes(2)
    w.stop()
  })

  it('corrupt file starts empty (seeds again)', () => {
    fs.writeFileSync(file, '{not json')
    const w = make()
    w.check()
    expect(notify).not.toHaveBeenCalled()
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).notified).toEqual({ 1: { episode: 5, freshAt: null } })
    w.stop()
  })

  it('only passes valid, deduped aniListIds to refreshAiring', async () => {
    state.entries = [entry('a', 1), entry('b', 1), entry('c', null), entry('d', 2, { status: 'completed' }), entry('e', 3)]
    const w = make()
    await w.refresh()
    expect(anilist.refreshAiring).toHaveBeenCalledWith([1, 3])
    w.stop()
  })

  it('stop() clears all timers and prevents later work', async () => {
    const w = make()
    w.start()
    await vi.advanceTimersByTimeAsync(2 * H + 10) // due -> grace timer pending too
    w.stop()
    expect(vi.getTimerCount()).toBe(0)
    const calls = anilist.refreshAiring.mock.calls.length
    await vi.advanceTimersByTimeAsync(24 * H)
    expect(anilist.refreshAiring.mock.calls.length).toBe(calls)
  })

  it('a throwing notify does not stop the other notifications', async () => {
    state.entries = [entry('a', 1), entry('b', 2)]
    state.infos = { 1: info(6, T + H), 2: info(3, T + H) }
    const w = make()
    w.check()
    vi.setSystemTime(T + 2 * H)
    notify.mockImplementationOnce(() => { throw new Error('boom') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    w.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(notify).toHaveBeenCalledTimes(2)
    warn.mockRestore()
    w.stop()
  })

  it('migrates the old flat file shape and drops invalid entries (M-2)', () => {
    fs.writeFileSync(file, JSON.stringify({ lastCheckAt: T, notified: { 1: 5, 2: -1, 3: 'x', 4: 1.5, 5: { episode: 2, freshAt: 'bad' } } }))
    const w = make()
    w.check()
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).notified).toEqual({ 1: { episode: 5, freshAt: null }, 5: { episode: 2, freshAt: null } })
    expect(notify).not.toHaveBeenCalled()
    w.stop()
  })

  it('unreadable file starts empty instead of throwing (M-1)', () => {
    fs.mkdirSync(file) // a directory where the file should be: readFileSync throws EISDIR
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let w
    expect(() => { w = make() }).not.toThrow()
    expect(() => w.check()).not.toThrow()
    expect(notify).not.toHaveBeenCalled()
    warn.mockRestore()
    w.stop()
  })

  it('stop() while a refresh is in flight: no check, no notify, no write afterwards (I-3)', async () => {
    let release
    anilist.refreshAiring.mockImplementation(() => new Promise((res) => { release = res }))
    state.infos[1] = info(6, T - H) // would be due
    fs.writeFileSync(file, JSON.stringify({ notified: { 1: fr(5, T - H) } }))
    const before = fs.readFileSync(file, 'utf8')
    const w = make()
    const p = w.refresh()
    w.stop()
    release(new Map())
    await p
    expect(notify).not.toHaveBeenCalled()
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })
})
