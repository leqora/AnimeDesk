import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniListSync } from '../../src/main/anilistSync.js'
import { AniListAuthError } from '../../src/main/anilist.js'

const T = 1_800_000_000_000
const S = 1000, MIN = 60 * S, H = 60 * MIN

async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve() }

function makeClock() {
  let now = T
  let seq = 0
  const timers = new Map()
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id },
    clearTimeout: (id) => { timers.delete(id) },
    async advance(ms) {
      const target = now + ms
      for (;;) {
        let best = null
        for (const [id, t] of timers) if (t.at <= target && (!best || t.at < best[1].at)) best = [id, t]
        if (!best) break
        const [id, t] = best
        now = Math.max(now, t.at)
        timers.delete(id)
        t.fn()
        await flush()
      }
      now = target
      await flush()
    },
    count: () => timers.size,
  }
}

const entry = (over = {}) => ({
  id: 'e1', title: 'Show', aniCliTitle: 'Show', aniListId: 100, aniListConfirmed: true,
  status: 'watching', watchedEpisodes: [1, 2, 3], ...over,
})

describe('anilistSync service', () => {
  let dir, file, clock, entries, prefsOff, remote, listEntry, saveProgress, anilist, tokenValue, authState
  let authListeners, auth, library, seriesPrefs, services

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anilist-sync-'))
    file = path.join(dir, 'anilist-sync.json')
    clock = makeClock()
    entries = [entry()]
    prefsOff = new Set()
    remote = { episodes: 12, entry: null }
    listEntry = vi.fn(async () => structuredClone(remote))
    saveProgress = vi.fn(async (id, { progress, status }) => ({ progress, status: status ?? 'CURRENT' }))
    anilist = { listEntry, saveProgress }
    tokenValue = 'tok'
    authState = 'ok'
    authListeners = new Set()
    auth = {
      token: vi.fn(() => tokenValue),
      markExpired: vi.fn(() => { tokenValue = null; authState = 'expired'; for (const f of [...authListeners]) f({ state: authState }) }),
      status: () => ({ state: authState }),
      onChange: (fn) => { authListeners.add(fn); return () => authListeners.delete(fn) },
    }
    library = {
      list: () => entries.map((e) => structuredClone(e)),
      get: (id) => structuredClone(entries.find((e) => e.id === id) ?? null),
      findConfirmed: (mid) => structuredClone(entries.find((e) => e.aniListConfirmed === true && e.aniListId === mid) ?? null),
    }
    seriesPrefs = { getAniListSync: (title) => !prefsOff.has(title) }
    services = []
  })
  afterEach(() => {
    for (const s of services) s.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const make = () => {
    const s = createAniListSync({
      file, library, seriesPrefs, anilist, auth,
      now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    })
    services.push(s)
    return s
  }
  const stored = () => JSON.parse(fs.readFileSync(file, 'utf8'))

  it('debounces: three changes 10 s apart give one request 30 s after the last', async () => {
    const s = make()
    s.check()
    await clock.advance(10 * S)
    entries[0].watchedEpisodes = [1, 2, 3, 4]
    s.check()
    await clock.advance(10 * S)
    entries[0].watchedEpisodes = [1, 2, 3, 4, 5]
    s.check()
    await clock.advance(29 * S)
    expect(listEntry).not.toHaveBeenCalled()
    await clock.advance(1 * S)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(saveProgress).toHaveBeenCalledTimes(1)
    expect(saveProgress).toHaveBeenCalledWith(100, { progress: 5, status: 'CURRENT' }, 'tok')
    expect(s.stateFor('e1')).toEqual({ state: 'synced', progress: 5 })
    expect(stored().sent['100']).toMatchObject({ progress: 5, status: 'CURRENT' })
    expect(stored().pending).toEqual({})
  })

  it('an unrelated library change does not move the deadline of an unchanged item', async () => {
    const s = make()
    s.check()
    await clock.advance(20 * S)
    s.check()
    await clock.advance(10 * S)
    expect(listEntry).toHaveBeenCalledTimes(1)
  })

  it('does nothing for unconfirmed, opted-out or id-less entries', async () => {
    entries = [
      entry({ id: 'a', aniListConfirmed: false }),
      entry({ id: 'b', aniCliTitle: 'Off', aniListId: 101 }),
      entry({ id: 'c', aniListId: null }),
    ]
    prefsOff.add('Off')
    const s = make()
    s.check()
    await clock.advance(10 * MIN)
    expect(listEntry).not.toHaveBeenCalled()
    expect(saveProgress).not.toHaveBeenCalled()
    expect(s.stateFor('a')).toEqual({ state: 'off' })
    expect(s.stateFor('b')).toEqual({ state: 'off' })
    expect(s.stateFor('c')).toEqual({ state: 'off' })
  })

  it('AniList ahead: no save, remembered, next check makes no request', async () => {
    remote = { episodes: 12, entry: { progress: 8, status: 'CURRENT' } }
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(saveProgress).not.toHaveBeenCalled()
    s.check()
    await clock.advance(5 * MIN)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(s.stateFor('e1')).toEqual({ state: 'synced', progress: 8 })
  })

  it('COMPLETED on AniList: no save, state synced and no repeated lookups', async () => {
    remote = { episodes: 12, entry: { progress: 2, status: 'COMPLETED' } }
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).not.toHaveBeenCalled()
    expect(s.stateFor('e1').state).toBe('synced')
    s.check()
    await clock.advance(5 * MIN)
    expect(listEntry).toHaveBeenCalledTimes(1)
  })

  it('mismatch: no save, state mismatch, cleared by a later local change', async () => {
    entries[0].watchedEpisodes = [11, 12, 13]
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).not.toHaveBeenCalled()
    expect(s.stateFor('e1').state).toBe('mismatch')
    s.check()
    await clock.advance(5 * MIN)
    expect(listEntry).toHaveBeenCalledTimes(1)
    remote = { episodes: 14, entry: null }
    entries[0].watchedEpisodes = [11, 12, 13, 14]
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).toHaveBeenCalledTimes(1)
    expect(s.stateFor('e1')).toEqual({ state: 'synced', progress: 14 })
  })

  it('network errors retry at +1, +5, +15, +60 min then +6 h', async () => {
    const times = []
    listEntry.mockImplementation(async () => { times.push(clock.now() - T); throw new TypeError('fetch failed') })
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(s.stateFor('e1')).toEqual({ state: 'pending', retryAt: T + 30 * S + MIN })
    await clock.advance(7 * H + 90 * MIN)
    const base = 30 * S
    expect(times.slice(0, 6)).toEqual([
      base, base + MIN, base + 6 * MIN, base + 21 * MIN, base + 81 * MIN, base + 81 * MIN + 6 * H,
    ])
    expect(stored().pending['100'].attempts).toBeGreaterThanOrEqual(5)
  })

  it('HTTP 5xx and 429 are transient, not rejections', async () => {
    listEntry.mockRejectedValue(new Error('AniList HTTP 429'))
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(stored().pending['100']).toMatchObject({ attempts: 1, rejected: 0 })
    listEntry.mockRejectedValue(new Error('AniList HTTP 503'))
    await clock.advance(MIN)
    expect(stored().pending['100']).toMatchObject({ attempts: 2, rejected: 0 })
  })

  it('4xx rejections stop after MAX_REJECTED with state error until local progress changes', async () => {
    listEntry.mockRejectedValue(new Error('AniList HTTP 404'))
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(stored().pending['100']).toMatchObject({ attempts: 0, rejected: 1 })
    await clock.advance(7 * H + 3 * H)
    await clock.advance(10 * H)
    expect(listEntry).toHaveBeenCalledTimes(5)
    expect(s.stateFor('e1').state).toBe('error')
    expect(stored().pending).toEqual({})
    s.check()
    await clock.advance(10 * H)
    expect(listEntry).toHaveBeenCalledTimes(5)
    listEntry.mockImplementation(async () => structuredClone(remote))
    entries[0].watchedEpisodes = [1, 2, 3, 4]
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).toHaveBeenCalledTimes(1)
    expect(s.stateFor('e1').state).toBe('synced')
  })

  it('a pending item survives a restart and runs 60 s after start()', async () => {
    const a = make()
    a.check()
    a.stop()
    expect(stored().pending['100']).toBeTruthy()
    await clock.advance(5 * MIN)
    const b = make()
    b.start()
    await clock.advance(59 * S)
    expect(listEntry).not.toHaveBeenCalled()
    await clock.advance(1 * S)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })

  it('start() also picks up progress that was never queued', async () => {
    const s = make()
    s.start()
    await clock.advance(59 * S)
    expect(listEntry).not.toHaveBeenCalled()
    await clock.advance(1 * S)
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })

  it('auth error: markExpired once, no more calls, item kept; reset empties the queue', async () => {
    listEntry.mockRejectedValue(new AniListAuthError('bad'))
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(auth.markExpired).toHaveBeenCalledTimes(1)
    expect(auth.markExpired).toHaveBeenCalledWith('tok')
    expect(s.stateFor('e1').state).toBe('expired')
    await clock.advance(24 * H)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(auth.markExpired).toHaveBeenCalledTimes(1)
    expect(stored().pending['100']).toBeTruthy()
    // reconnect: token again -> queue resumes
    listEntry.mockImplementation(async () => structuredClone(remote))
    tokenValue = 'tok2'; authState = 'ok'
    for (const f of [...authListeners]) f({ state: 'ok' })
    s.reset()
    expect(stored()).toMatchObject({ version: 1, sent: {}, pending: {} })
    await clock.advance(24 * H)
    expect(listEntry).toHaveBeenCalledTimes(1)
  })

  it('token returning resumes queued items without waiting', async () => {
    listEntry.mockRejectedValueOnce(new AniListAuthError('bad'))
    const s = make()
    s.start()
    s.check()
    await clock.advance(30 * S)
    expect(auth.markExpired).toHaveBeenCalledTimes(1)
    tokenValue = 'tok2'; authState = 'ok'
    for (const f of [...authListeners]) f({ state: 'ok' })
    await flush()
    await clock.advance(1 * S)
    expect(saveProgress).toHaveBeenCalledWith(100, { progress: 3, status: 'CURRENT' }, 'tok2')
  })

  it('no token: nothing runs, queue kept', async () => {
    tokenValue = null
    const s = make()
    s.check()
    await clock.advance(10 * MIN)
    expect(listEntry).not.toHaveBeenCalled()
    expect(stored().pending['100']).toBeTruthy()
  })

  it('entry unconfirmed between schedule and run: no request, item dropped', async () => {
    const s = make()
    s.check()
    await clock.advance(10 * S)
    entries[0].aniListConfirmed = false
    await clock.advance(30 * S)
    expect(listEntry).not.toHaveBeenCalled()
    expect(stored().pending).toEqual({})
  })

  it('entry unconfirmed while the lookup is in flight: no save', async () => {
    let release
    listEntry.mockImplementation(() => new Promise((r) => { release = () => r(structuredClone(remote)) }))
    const s = make()
    s.check()
    await clock.advance(30 * S)
    entries[0].aniListConfirmed = false
    release()
    await flush()
    expect(saveProgress).not.toHaveBeenCalled()
    expect(stored().pending).toEqual({})
  })

  it('check() drops pending items of opted-out series', async () => {
    const s = make()
    s.check()
    prefsOff.add('Show')
    s.check()
    await clock.advance(MIN)
    expect(listEntry).not.toHaveBeenCalled()
    expect(stored().pending).toEqual({})
  })

  it('stop(): no request after the debounce elapses', async () => {
    const s = make()
    s.check()
    s.stop()
    await clock.advance(10 * MIN)
    expect(listEntry).not.toHaveBeenCalled()
  })

  it('syncNow requests without waiting 30 s', async () => {
    const s = make()
    s.syncNow('e1')
    await clock.advance(0)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })

  it('syncNow with no token makes no request and keeps the item queued', async () => {
    tokenValue = null
    const s = make()
    s.syncNow('e1')
    await clock.advance(10 * MIN)
    expect(listEntry).not.toHaveBeenCalled()
    expect(saveProgress).not.toHaveBeenCalled()
    expect(stored().pending['100']).toBeTruthy()
  })

  it('syncNow ignores entries that are not eligible', async () => {
    entries[0].aniListConfirmed = false
    const s = make()
    s.syncNow('e1')
    s.syncNow('missing')
    await clock.advance(MIN)
    expect(listEntry).not.toHaveBeenCalled()
  })

  it('never runs two requests in parallel; a change during flight runs after the first finishes', async () => {
    const gates = []
    saveProgress.mockImplementation((id, { progress, status }) => new Promise((r) => { gates.push(() => r({ progress, status: status ?? 'CURRENT' })) }))
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).toHaveBeenCalledTimes(1)
    entries[0].watchedEpisodes = [1, 2, 3, 4, 5]
    s.check()
    await clock.advance(5 * MIN)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(saveProgress).toHaveBeenCalledTimes(1)
    gates[0]()
    await flush()
    await clock.advance(30 * S)
    expect(listEntry).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(saveProgress.mock.calls[1][1].progress).toBe(5)
    gates[1]()
    await flush()
    expect(s.stateFor('e1')).toEqual({ state: 'synced', progress: 5 })
  })

  it('two series run one after the other', async () => {
    entries = [entry(), entry({ id: 'e2', aniListId: 200, aniCliTitle: 'Other' })]
    let inFlight = 0, maxInFlight = 0
    listEntry.mockImplementation(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve(); await Promise.resolve()
      inFlight--
      return structuredClone(remote)
    })
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(1)
  })

  it('completed status without new progress sends COMPLETED', async () => {
    remote = { episodes: 3, entry: { progress: 3, status: 'CURRENT' } }
    entries[0].status = 'completed'
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).toHaveBeenCalledWith(100, { progress: 3, status: 'COMPLETED' }, 'tok')
    expect(stored().sent['100'].status).toBe('COMPLETED')
    s.check()
    await clock.advance(MIN)
    expect(listEntry).toHaveBeenCalledTimes(1)
  })

  it('stores what AniList returned', async () => {
    saveProgress.mockResolvedValue({ progress: 3, status: 'CURRENT' })
    entries[0].watchedEpisodes = [1, 2, 3]
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(stored().sent['100']).toMatchObject({ progress: 3, status: 'CURRENT' })
    expect(typeof stored().sent['100'].at).toBe('number')
  })

  it('reset clears sent, pending, flags and timers', async () => {
    const s = make()
    s.check()
    await clock.advance(30 * S)
    entries[0].watchedEpisodes = [1, 2, 3, 4]
    s.check()
    s.reset()
    expect(stored()).toEqual({ version: 1, sent: {}, pending: {}, flags: {} })
    await clock.advance(10 * MIN)
    expect(listEntry).toHaveBeenCalledTimes(1)
  })

  it('reset also clears the first-run timer', () => {
    const s = make()
    s.start()
    expect(clock.count()).toBe(1)
    s.reset()
    expect(clock.count()).toBe(0)
  })

  it('findConfirmed throwing in run() backs the item off by a minute instead of spinning', async () => {
    const real = library.findConfirmed
    let calls = 0
    library.findConfirmed = (mid) => { calls++; if (calls === 1) throw new Error('boom'); return real(mid) }
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(calls).toBe(1)
    await clock.advance(59 * S)
    expect(calls).toBe(1)
    expect(listEntry).not.toHaveBeenCalled()
    await clock.advance(1 * S)
    expect(listEntry).toHaveBeenCalledTimes(1)
  })

  it('an error escaping run() backs the item off and is logged scrubbed (no spin)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fs.writeFileSync(file, JSON.stringify({
      version: 1, sent: {}, flags: {},
      pending: { 100: { progress: 3, status: 'CURRENT', attempts: 0, rejected: 4, nextAt: 0, error: null } },
    }))
    listEntry.mockRejectedValue(new Error(`AniList HTTP 400 ${'x'.repeat(500)}`))
    const real = library.findConfirmed
    let calls = 0
    library.findConfirmed = (mid) => { calls++; if (calls === 2) throw new Error('y'.repeat(500)); return real(mid) }
    const s = make()
    s.start()
    await clock.advance(60 * S)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][1]).length).toBeLessThanOrEqual(200)
    await clock.advance(59 * S)
    expect(listEntry).toHaveBeenCalledTimes(1)
    await clock.advance(1 * S)
    expect(listEntry).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('reset during a request: the late result does not write back', async () => {
    let release
    saveProgress.mockImplementation(() => new Promise((r) => { release = () => r({ progress: 3, status: 'CURRENT' }) }))
    const s = make()
    s.check()
    await clock.advance(30 * S)
    s.reset()
    release()
    await flush()
    expect(stored().sent).toEqual({})
  })

  it('onChange fires on state changes and can unsubscribe', async () => {
    const s = make()
    const fn = vi.fn()
    const off = s.onChange(fn)
    s.check()
    expect(fn).toHaveBeenCalled()
    await clock.advance(30 * S)
    const n = fn.mock.calls.length
    off()
    s.reset()
    expect(fn.mock.calls.length).toBe(n)
  })

  it('stateFor: off when not connected, pending before the run', async () => {
    const s = make()
    s.check()
    expect(s.stateFor('e1')).toEqual({ state: 'pending' })
    authState = 'none'
    expect(s.stateFor('e1')).toEqual({ state: 'off' })
    expect(s.stateFor('nope')).toEqual({ state: 'off' })
  })

  it('persisted state is reloaded (sent survives restart, no repeated lookup)', async () => {
    const a = make()
    a.check()
    await clock.advance(30 * S)
    a.stop()
    const b = make()
    b.start()
    await clock.advance(5 * MIN)
    expect(listEntry).toHaveBeenCalledTimes(1)
    expect(b.stateFor('e1')).toEqual({ state: 'synced', progress: 3 })
  })

  it('a corrupt file starts empty', async () => {
    fs.writeFileSync(file, '{ nope')
    const s = make()
    s.check()
    await clock.advance(30 * S)
    expect(saveProgress).toHaveBeenCalledTimes(1)
  })
})
