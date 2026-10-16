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
const info = (episode, airingAt) => ({ status: 'RELEASING', nextAiring: { episode, airingAt } })

describe('dueNotifications', () => {
  it('seeds unseen ids without notifying (Review Focus 1)', () => {
    const entries = [entry('a', 1), entry('b', 2), entry('c', 3)]
    const infoById = { 1: info(5, T - 3 * H), 2: info(9, T - H), 3: info(4, T + H) }
    const r = dueNotifications({ entries, infoById, notified: {}, lastCheckAt: T - H, now: T })
    expect(r.due).toEqual([])
    expect(r.notified).toEqual({ 1: 5, 2: 9, 3: 3 })
  })

  it('notifies once for an episode that aired within 24 h (known airingAt)', () => {
    const r = dueNotifications({ entries: [entry('a', 1)], infoById: { 1: info(6, T - 2 * H) }, notified: { 1: 5 }, now: T })
    expect(r.due).toEqual([{ animeId: 'a', aniListId: 1, title: 'Title a', episode: 6 }])
    expect(r.notified).toEqual({ 1: 6 })
    const again = dueNotifications({ entries: [entry('a', 1)], infoById: { 1: info(6, T - 2 * H) }, notified: r.notified, now: T + MIN })
    expect(again.due).toEqual([])
  })

  it('does not notify for an episode older than 24 h, but updates memory (Review Focus 2)', () => {
    const r = dueNotifications({ entries: [entry('a', 1)], infoById: { 1: info(9, T - 3 * D) }, notified: { 1: 5 }, now: T })
    expect(r.due).toEqual([])
    expect(r.notified).toEqual({ 1: 9 })
  })

  it('app off 3 days: only the series with a fresh episode notifies, one item each (Review Focus 2)', () => {
    const entries = [entry('old', 1), entry('new', 2)]
    const infoById = { 1: info(12, T - 3 * D), 2: info(8, T - 2 * H) }
    const r = dueNotifications({ entries, infoById, notified: { 1: 6, 2: 3 }, now: T })
    expect(r.due).toEqual([{ animeId: 'new', aniListId: 2, title: 'Title new', episode: 8 }])
    expect(r.notified).toEqual({ 1: 12, 2: 8 })
  })

  it('cache already moved on: notifies only if previous check was within 24 h', () => {
    const infoById = { 1: info(7, T + 5 * D) } // aired = 6, time unknown
    const recent = dueNotifications({ entries: [entry('a', 1)], infoById, notified: { 1: 5 }, lastCheckAt: T - 6 * H, now: T })
    expect(recent.due).toEqual([{ animeId: 'a', aniListId: 1, title: 'Title a', episode: 6 }])
    const stale = dueNotifications({ entries: [entry('a', 1)], infoById, notified: { 1: 5 }, lastCheckAt: T - 3 * D, now: T })
    expect(stale.due).toEqual([])
    expect(stale.notified).toEqual({ 1: 6 })
    const none = dueNotifications({ entries: [entry('a', 1)], infoById, notified: { 1: 5 }, lastCheckAt: null, now: T })
    expect(none.due).toEqual([])
  })

  it('ignores non-watching entries and entries without a valid aniListId', () => {
    const entries = [entry('a', 1, { status: 'completed' }), entry('b', null), entry('c', 'x'), entry('d', 0), entry('e', 5)]
    const infoById = { 1: info(6, T - H), 5: info(6, T - H) }
    const r = dueNotifications({ entries, infoById, notified: { 1: 2, 5: 5 }, now: T })
    expect(r.due.map((d) => d.animeId)).toEqual(['e'])
    expect(r.notified).toEqual({ 1: 2, 5: 6 })
  })

  it('does not notify without cached info and does not mutate its input', () => {
    const notified = { 1: 2 }
    const r = dueNotifications({ entries: [entry('a', 1)], infoById: {}, notified, now: T })
    expect(r.due).toEqual([])
    expect(r.notified).toEqual({ 1: 2 })
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

  it('seeds on first check; lastCheckAt is persisted only after a successful refresh', async () => {
    const w = make()
    w.check()
    expect(notify).not.toHaveBeenCalled()
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(saved.notified).toEqual({ 1: 5 })
    expect(saved.lastCheckAt).toBeNull()
    await w.refresh()
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastCheckAt).toBe(T)
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
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(1) // nothing before airingAt
    await vi.advanceTimersByTimeAsync(AIRED_GRACE_MS) // only the grace refresh
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2 * H)
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(6 * H) // 6 h interval from start is next
    expect(anilist.refreshAiring).toHaveBeenCalledTimes(3)
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

  it('moved-on cache: notifies after a refresh when last fresh check was recent; stale lastCheckAt does not', async () => {
    fs.writeFileSync(file, JSON.stringify({ lastCheckAt: T - 3 * D, notified: { 1: 5 } }))
    state.infos[1] = info(7, T + 5 * D)
    const w = make()
    await w.refresh()
    expect(notify).not.toHaveBeenCalled()
    w.stop()
    fs.writeFileSync(file, JSON.stringify({ lastCheckAt: T - 6 * H, notified: { 1: 5 } }))
    const w2 = make()
    await w2.refresh()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].episode).toBe(6)
    w2.stop()
  })

  it('persists memory across instances (no duplicate notification)', () => {
    const w = make()
    w.check()
    w.stop()
    vi.setSystemTime(T + 3 * H)
    const w1 = make()
    w1.check()
    expect(notify).toHaveBeenCalledTimes(1)
    w1.stop()
    const w2 = make()
    w2.check()
    expect(notify).toHaveBeenCalledTimes(1)
    w2.stop()
  })

  it('corrupt file starts empty (seeds again)', () => {
    fs.writeFileSync(file, '{not json')
    const w = make()
    w.check()
    expect(notify).not.toHaveBeenCalled()
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).notified).toEqual({ 1: 5 })
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

  it('a throwing notify does not stop the other notifications', () => {
    state.entries = [entry('a', 1), entry('b', 2)]
    state.infos = { 1: info(6, T + H), 2: info(3, T + H) }
    const w = make()
    w.check()
    vi.setSystemTime(T + 2 * H)
    notify.mockImplementationOnce(() => { throw new Error('boom') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    w.check()
    expect(notify).toHaveBeenCalledTimes(2)
    warn.mockRestore()
    w.stop()
  })
})
