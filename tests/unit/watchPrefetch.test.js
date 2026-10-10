import { describe, it, expect, vi } from 'vitest'
import { createWatchService, PREFETCH_AT_PERCENT, PREFETCH_TTL_MS } from '../../src/main/watchService.js'
import { EVENTS } from '../../src/shared/channels.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

const flush = () => new Promise((r) => setTimeout(r, 20))
const argsFor = (ep, title = 'Show') => [`--force-media-title=${title} Episode ${ep}`, `https://v/${ep}`]

// Like the real bridge: onPlay blocks until the player ends; kill() ends the session.
export function prefetchSetup({ settings = {}, total = null } = {}) {
  const events = []
  const sessions = []
  const current = { ...DEFAULT_SETTINGS, playerMode: 'internal', ...settings }
  const aniCli = {
    startSession: vi.fn((opts) => {
      let finish
      const done = new Promise((r) => { finish = r })
      const s = { opts, sessionId: `s${sessions.length + 1}`, finish, kill: vi.fn(() => finish({ ok: false, error: 'cancelled', stderr: '' })) }
      sessions.push(s)
      return { sessionId: s.sessionId, done, kill: s.kill }
    }),
  }
  let active = null
  const internalPlayer = {
    play: vi.fn((info, opts) => new Promise((resolve) => { active = { info, opts, resolve, playbackId: `p${internalPlayer.play.mock.calls.length}` } })),
    current: () => (active ? { playbackId: active.playbackId, title: active.info.title, episode: active.info.episode } : null),
    // Like the real one: the closing snapshot is reported as progress before the playback resolves.
    closed: vi.fn((p) => { const a = active; active = null; a.opts?.onProgress?.({ position: p.position, duration: p.duration, maxPercent: p.maxPercent }); a.resolve({ exitCode: 0, maxPercent: p.maxPercent, position: p.position, duration: p.duration, reason: p.reason }) }),
    stop: vi.fn(),
  }
  const progress = (maxPercent) => active.opts.onProgress({ position: maxPercent * 14, duration: 1400, maxPercent })
  const close = (maxPercent, reason = 'next') => internalPlayer.closed({ playbackId: active.playbackId, position: maxPercent * 14, duration: 1400, maxPercent, reason })
  const timers = []
  const setTimer = vi.fn((fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t })
  const clearTimer = vi.fn((t) => { if (t) t.cleared = true })
  const fireTimers = () => timers.filter((t) => !t.cleared).forEach((t) => { t.cleared = true; t.fn() })
  const library = { recordWatched: vi.fn() }
  const positions = { clear: vi.fn(), save: vi.fn(), get: vi.fn(() => null) }
  const celebrations = { hold: vi.fn(), release: vi.fn() }
  const player = { play: vi.fn(async (args, opts) => { opts?.onProgress?.({ position: 1330, duration: 1400, maxPercent: 95 }); return { exitCode: 0, maxPercent: 95, position: 1330, duration: 1400 } }), stop: vi.fn() }
  const getTotalEpisodes = vi.fn(() => total)
  const svc = createWatchService({
    aniCli, player, internalPlayer, library, positions, celebrations, getTotalEpisodes, setTimer, clearTimer,
    settings: { get: () => current },
    notify: (ch, p) => events.push([ch, p]),
  })
  // Episode 3 of "Show", opened in the in-app player (as "Next" from episode 2 would).
  async function playEpisode3() {
    svc.watch({ query: 'Show', anime: 'Show', episode: '3' })
    sessions[0].opts.onPlay({ args: argsFor(3) }) // blocks until the player ends, so it is not awaited
    await flush()
  }
  return { svc, aniCli, sessions, internalPlayer, player, library, positions, celebrations, events, current, timers, setTimer, clearTimer, fireTimers, progress, close, playEpisode3 }
}

describe('watchService prefetch — trigger', () => {
  it('starts one quiet ani-cli session for the next episode at 80 %', async () => {
    const t = prefetchSetup({ settings: { quality: '720', mode: 'dub' } })
    await t.playEpisode3()
    t.progress(PREFETCH_AT_PERCENT - 1)
    expect(t.sessions).toHaveLength(1)
    t.progress(PREFETCH_AT_PERCENT)
    expect(t.sessions).toHaveLength(2)
    expect(t.sessions[1].opts).toMatchObject({ query: 'Show', player: 'play', episodes: '4', quality: '720', mode: 'dub' })
    t.progress(95)
    t.progress(100)
    expect(t.sessions).toHaveLength(2)
  })
  it('reuses the anime picked in the menu', async () => {
    const t = prefetchSetup()
    t.svc.watch({ query: 'show' })
    const menu = t.sessions[0].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other', '2 Show (12 episodes)'] })
    await flush()
    const [, req] = t.events.find((e) => e[0] === EVENTS.menu)
    t.svc.answerMenu(req.requestId, '2 Show (12 episodes)')
    await menu
    t.sessions[0].opts.onPlay({ args: argsFor(3) })
    await flush()
    t.progress(85)
    expect(await t.sessions[1].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other', '2 Show (12 episodes)'] })).toBe('2 Show (12 episodes)')
  })
  it('does not prefetch past the last episode, for an episode that is not a number, or without a known episode', async () => {
    const last = prefetchSetup({ total: 3 })
    await last.playEpisode3()
    last.progress(90)
    expect(last.sessions).toHaveLength(1)

    const special = prefetchSetup()
    special.svc.watch({ query: 'Show', anime: 'Show', episode: 'special' })
    special.sessions[0].opts.onPlay({ args: argsFor('special') })
    await flush()
    special.progress(90)
    expect(special.sessions).toHaveLength(1)
  })
  it('prefetches when the episode count is unknown', async () => {
    const t = prefetchSetup({ total: null })
    await t.playEpisode3()
    t.progress(90)
    expect(t.sessions).toHaveLength(2)
  })
  it('never prefetches in external mpv mode', async () => {
    const t = prefetchSetup({ settings: { playerMode: 'external' } })
    t.svc.watch({ query: 'Show', anime: 'Show', episode: '3' })
    await t.sessions[0].opts.onPlay({ args: argsFor(3) })
    expect(t.player.play).toHaveBeenCalled()
    expect(t.sessions).toHaveLength(1)
  })
  it('never prefetches for a downloaded episode', async () => {
    const t = prefetchSetup()
    const done = t.svc.playLocal({ file: 'D:\\A\\Show Episode 3.mp4', title: 'Show', episode: '3' })
    await flush()
    t.progress(95)
    t.close(95, 'ended')
    await done
    expect(t.aniCli.startSession).not.toHaveBeenCalled()
  })
  it('does not prefetch from a playback that is being recovered', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(50)
    expect(t.svc.recover({ playbackId: 'p1', position: 1300, duration: 1400, maxPercent: 95 })).toEqual({ ok: true })
    await flush()
    // the only new session is the recovery of episode 3
    expect(t.sessions).toHaveLength(2)
    expect(t.sessions[1].opts.episodes).toBe('3')
  })
  it('does not duplicate a prefetch with the same key', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    expect(t.sessions).toHaveLength(2)
    t.svc.recover({ playbackId: 'p1', position: 1200, duration: 1400, maxPercent: 85 })
    await flush()
    expect(t.sessions).toHaveLength(3) // the recovery of episode 3
    t.sessions[2].opts.onPlay({ args: argsFor(3) })
    await flush()
    t.progress(90)
    expect(t.sessions).toHaveLength(3)
    expect(t.sessions[1].kill).not.toHaveBeenCalled()
  })
  it('a failing prefetch never breaks recording at the threshold', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.aniCli.startSession.mockImplementation(() => { throw new Error('tools-missing') })
    t.progress(95)
    expect(t.library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Show', episode: '3' })
  })
})

describe('watchService prefetch — quiet and parked', () => {
  it('gives up on a menu it cannot answer and shows nothing', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    expect(await t.sessions[1].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other', '2 Another'] })).toBeNull()
    t.sessions[1].finish({ ok: false, error: 'cancelled', stderr: '' })
    await flush()
    expect(t.events.filter((e) => e[0] === EVENTS.menu)).toHaveLength(0)
    expect(t.events.some((e) => e[0] === EVENTS.sessionEnd && e[1].sessionId === 's2')).toBe(false)
  })
  it('parks at onPlay without opening the player, recording or holding celebrations', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    let returned = false
    t.sessions[1].opts.onPlay({ args: argsFor(4) }).then(() => { returned = true })
    await flush()
    expect(returned).toBe(false) // still parked
    expect(t.internalPlayer.play).toHaveBeenCalledTimes(1)
    expect(t.celebrations.hold).toHaveBeenCalledTimes(1)
    expect(t.events.filter((e) => e[0] === EVENTS.playing)).toEqual([[EVENTS.playing, { title: 'Show', episode: '3' }]])
    expect(t.positions.save.mock.calls.every(([, ep]) => ep === '3')).toBe(true)
  })
  it('kills an unused prefetch after the TTL, counted from the end of the triggering episode', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    expect(t.setTimer).not.toHaveBeenCalledWith(expect.any(Function), PREFETCH_TTL_MS)
    const parked = t.sessions[1].opts.onPlay({ args: argsFor(4) })
    t.close(96)
    await flush()
    expect(t.setTimer).toHaveBeenCalledWith(expect.any(Function), PREFETCH_TTL_MS)
    t.fireTimers()
    expect(t.sessions[1].kill).toHaveBeenCalled()
    expect(await parked).toBe(1)
    await flush()
    expect(t.events.some((e) => e[0] === EVENTS.sessionEnd && e[1].sessionId === 's2')).toBe(false)
  })
  it('the TTL does not run while the triggering episode is still playing', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    t.sessions[1].opts.onPlay({ args: argsFor(4) })
    await flush()
    t.fireTimers()
    expect(t.sessions[1].kill).not.toHaveBeenCalled()
  })
  it('a recovery of the triggering episode takes over the prefetch and re-arms the TTL when it ends', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    t.svc.recover({ playbackId: 'p1', position: 1200, duration: 1400, maxPercent: 85 })
    await flush()
    expect(t.setTimer).toHaveBeenCalledTimes(1) // armed when the original playback ended with a retry
    t.sessions[2].opts.onPlay({ args: argsFor(3) })
    await flush()
    t.progress(90) // same key: the recovery playback becomes the owner
    t.close(96)
    await flush()
    expect(t.setTimer).toHaveBeenCalledTimes(2)
    t.fireTimers()
    expect(t.sessions[1].kill).toHaveBeenCalled()
  })
  it('watch() for another episode kills the prefetch', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    t.close(96)
    await flush()
    // episode 3 again by hand (no match for the parked episode 4) → the old prefetch goes
    t.svc.watch({ query: 'Show', anime: 'Show', episode: '3' })
    expect(t.sessions[1].kill).toHaveBeenCalled()
  })
  it('dispose kills the prefetch', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    t.svc.dispose()
    expect(t.sessions[1].kill).toHaveBeenCalled()
    expect(t.clearTimer).toHaveBeenCalled()
    t.svc.dispose() // idempotent
    expect(t.sessions[1].kill).toHaveBeenCalledTimes(1)
  })
})

describe('watchService prefetch — adoption', () => {
  it('"Next" adopts the parked session: same sessionId, no new ani-cli run, the player opens with its link', async () => {
    const t = prefetchSetup({ settings: { quality: '720', mode: 'sub' } })
    await t.playEpisode3()
    t.progress(85)
    t.sessions[1].opts.onPlay({ args: argsFor(4) })
    await flush()
    t.close(96)
    await flush()
    expect(t.svc.watch({ query: 'Show', anime: 'Show', episode: '4' })).toEqual({ sessionId: 's2', quality: '720', mode: 'sub' })
    expect(t.aniCli.startSession).toHaveBeenCalledTimes(2)
    await flush()
    expect(t.internalPlayer.play).toHaveBeenCalledTimes(2)
    expect(t.internalPlayer.play.mock.calls[1][0]).toMatchObject({ title: 'Show', episode: '4', url: 'https://v/4', resume: null, mode: 'sub' })
    expect(t.events).toContainEqual([EVENTS.playing, { title: 'Show', episode: '4' }])
    expect(t.sessions[1].kill).not.toHaveBeenCalled()
    t.close(30, 'back')
    await flush()
    t.sessions[1].finish({ ok: true, error: null, stderr: '' })
    await flush()
    expect(t.events).toContainEqual([EVENTS.sessionEnd, { sessionId: 's2', retry: false, result: { ok: true, error: null, stderr: '' } }])
  })
  it('adopts a prefetch that has not parked yet; it plays as soon as ani-cli reaches the player', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    t.close(96)
    await flush()
    expect(t.svc.watch({ query: 'Show', anime: 'Show', episode: '4' }).sessionId).toBe('s2')
    // after adoption a menu that needs the user is shown, like in any session
    const menu = t.sessions[1].opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2'] })
    await flush()
    const [, req] = t.events.find((e) => e[0] === EVENTS.menu)
    expect(req.sessionId).toBe('s2')
    t.svc.answerMenu(req.requestId, '2')
    expect(await menu).toBe('2')
    t.sessions[1].opts.onPlay({ args: argsFor(4) })
    await flush()
    expect(t.internalPlayer.play).toHaveBeenCalledTimes(2)
    expect(t.sessions[1].kill).not.toHaveBeenCalled()
  })
  it.each([
    ['another episode', (t) => t.svc.watch({ query: 'Show', anime: 'Show', episode: '5' })],
    ['another series', (t) => t.svc.watch({ query: 'Other', anime: 'Other', episode: '4' })],
    ['changed quality', (t) => { t.current.quality = '480'; t.svc.watch({ query: 'Show', anime: 'Show', episode: '4' }) }],
    ['a forced mode', (t) => t.svc.watch({ query: 'Show', anime: 'Show', episode: '4', mode: 'dub' })],
  ])('does not adopt for %s: the prefetch is killed and a fresh session starts', async (_, act) => {
    const t = prefetchSetup({ settings: { quality: '720', mode: 'sub' } })
    await t.playEpisode3()
    t.progress(85)
    t.sessions[1].opts.onPlay({ args: argsFor(4) })
    t.close(96)
    await flush()
    act(t)
    expect(t.sessions[1].kill).toHaveBeenCalled()
    expect(t.sessions).toHaveLength(3)
  })
  it('does not adopt a prefetch that already failed', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    t.sessions[1].finish({ ok: false, error: 'episode-not-released', stderr: '' })
    t.close(96)
    await flush()
    expect(t.svc.watch({ query: 'Show', anime: 'Show', episode: '4' }).sessionId).toBe('s3')
  })
  it('adoption stops the TTL', async () => {
    const t = prefetchSetup()
    await t.playEpisode3()
    t.progress(85)
    t.sessions[1].opts.onPlay({ args: argsFor(4) })
    t.close(96)
    await flush()
    t.svc.watch({ query: 'Show', anime: 'Show', episode: '4' })
    t.fireTimers()
    expect(t.sessions[1].kill).not.toHaveBeenCalled()
  })
})

describe('watchService prefetch — recovery and recording', () => {
  async function adoptedEpisode4(t) {
    await t.playEpisode3()
    t.progress(85)
    t.sessions[1].opts.onPlay({ args: argsFor(4) })
    t.close(96)
    await flush()
    t.svc.watch({ query: 'Show', anime: 'Show', episode: '4' })
    await flush()
  }
  it('the first recovery of an adopted session does not use up the automatic recovery', async () => {
    const t = prefetchSetup()
    await adoptedEpisode4(t)
    expect(t.svc.recover({ playbackId: 'p2', position: 10, duration: 1400, maxPercent: 1 })).toEqual({ ok: true })
    await flush()
    expect(t.sessions.at(-1).opts.episodes).toBe('4')
    t.sessions.at(-1).opts.onPlay({ args: argsFor(4) })
    await flush()
    // a real stall later in the episode still gets its automatic try ...
    expect(t.svc.recover({ playbackId: 'p3', position: 600, duration: 1400, maxPercent: 43 })).toEqual({ ok: true })
    await flush()
    t.sessions.at(-1).opts.onPlay({ args: argsFor(4) })
    await flush()
    // ... and only then the budget applies, as in 0.6.0
    expect(t.svc.recover({ playbackId: 'p4', position: 700, duration: 1400, maxPercent: 50 })).toEqual({ ok: true, auto: false })
  })
  it('records both episodes exactly once, as without prefetch', async () => {
    const t = prefetchSetup()
    await adoptedEpisode4(t)
    t.progress(95)
    t.close(97, 'ended')
    await flush()
    expect(t.library.recordWatched.mock.calls).toEqual([
      [{ aniCliTitle: 'Show', episode: '3' }],
      [{ aniCliTitle: 'Show', episode: '4' }],
    ])
    expect(t.celebrations.hold).toHaveBeenCalledTimes(2)
    expect(t.celebrations.release).toHaveBeenCalledTimes(2)
  })
  it('askOnClose still asks on close for the adopted episode', async () => {
    const t = prefetchSetup({ settings: { askOnClose: true } })
    await adoptedEpisode4(t)
    t.close(97, 'ended')
    await flush()
    expect(t.library.recordWatched).not.toHaveBeenCalled()
    expect(t.events).toContainEqual([EVENTS.ask, { aniCliTitle: 'Show', episode: '4' }])
  })
})
