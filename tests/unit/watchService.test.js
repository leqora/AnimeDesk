import { describe, it, expect, vi } from 'vitest'
import { createWatchService } from '../../src/main/watchService.js'
import { EVENTS } from '../../src/shared/channels.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

function setup({ settings = {}, maxPercent = 90, menus = [], seriesPrefs, internalPlayer = null, positions = null, mpvExtraArgs, skipsFor } = {}) {
  const events = []
  let resolveDone
  const aniCli = {
    startSession: vi.fn((opts) => {
      const done = new Promise((r) => { resolveDone = r })
      queueMicrotask(async () => {
        for (const m of menus) m.answer = await opts.onMenu(m)
        await opts.onPlay({ args: ['--force-media-title=Fake Anime Episode 2', 'https://v'] })
        resolveDone({ ok: true, error: null, stderr: '' })
      })
      return { sessionId: 'sid', done, kill: vi.fn() }
    }),
  }
  const player = { play: vi.fn(async () => ({ exitCode: 0, maxPercent })), stop: vi.fn() }
  const library = { recordWatched: vi.fn() }
  const svc = createWatchService({
    aniCli, player, library, internalPlayer, positions, ...(mpvExtraArgs ? { mpvExtraArgs } : {}), ...(skipsFor ? { skipsFor } : {}),
    settings: { get: () => ({ ...DEFAULT_SETTINGS, ...settings }) },
    notify: (ch, p) => events.push([ch, p]),
    seriesPrefs,
  })
  return { svc, aniCli, player, library, events, menus }
}
const flush = () => new Promise((r) => setTimeout(r, 20))

describe('watchService', () => {
  it('starts ani-cli with the series quality and mode, and a one-off mode wins', async () => {
    const seriesPrefs = { resolve: vi.fn(() => ({ quality: '720', mode: 'dub' })) }
    const { svc, aniCli } = setup({ seriesPrefs })
    expect(svc.watch({ query: 'show', anime: 'Show (12 episodes)' })).toEqual({ sessionId: 'sid', quality: '720', mode: 'dub' })
    expect(seriesPrefs.resolve).toHaveBeenCalledWith('Show (12 episodes)', expect.objectContaining({ quality: 'best' }))
    expect(aniCli.startSession).toHaveBeenLastCalledWith(expect.objectContaining({ quality: '720', mode: 'dub' }))
    expect(svc.watch({ query: 'show', anime: 'Show (12 episodes)', mode: 'sub' })).toEqual({ sessionId: 'sid', quality: '720', mode: 'sub' })
    expect(aniCli.startSession).toHaveBeenLastCalledWith(expect.objectContaining({ quality: '720', mode: 'sub' }))
    svc.watch({ query: 'show', mode: 'weird' })
    expect(seriesPrefs.resolve).toHaveBeenLastCalledWith('show', expect.anything())
    expect(aniCli.startSession).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'dub' }))
    await flush()
  })
  it('falls back to global settings without a prefs store', async () => {
    const { svc, aniCli } = setup({ settings: { quality: '480', mode: 'dub' } })
    svc.watch({ query: 'x' })
    expect(aniCli.startSession).toHaveBeenLastCalledWith(expect.objectContaining({ quality: '480', mode: 'dub' }))
    await flush()
  })
  it('records the episode when watched past the threshold', async () => {
    const { svc, library, events, player } = setup({ maxPercent: 90 })
    svc.watch({ query: 'fake' })
    await flush()
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=Fake Anime Episode 2', 'https://v'], expect.any(Object))
    expect(library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Fake Anime', episode: '2' })
    expect(events.map((e) => e[0])).toEqual([EVENTS.playing, EVENTS.libraryChanged, EVENTS.sessionEnd])
    expect(events.at(-1)[1]).toMatchObject({ retry: false })
  })
  it('does not record below the threshold', async () => {
    const { svc, library } = setup({ maxPercent: 50 })
    svc.watch({ query: 'fake' })
    await flush()
    expect(library.recordWatched).not.toHaveBeenCalled()
  })
  it('asks the UI when askOnClose is on', async () => {
    const { svc, library, events } = setup({ settings: { askOnClose: true } })
    svc.watch({ query: 'fake' })
    await flush()
    expect(library.recordWatched).not.toHaveBeenCalled()
    expect(events).toContainEqual([EVENTS.ask, { aniCliTitle: 'Fake Anime', episode: '2' }])
  })
  it('forwards unknown menus to the UI and resolves them with answerMenu', async () => {
    const menus = [{ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other'] }]
    const { svc, events } = setup({ menus })
    svc.watch({ query: 'fake' })
    await flush()
    const [, req] = events.find((e) => e[0] === EVENTS.menu)
    expect(req).toMatchObject({ sessionId: 'sid', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other'] })
    svc.answerMenu(req.requestId, '2 Other')
    await flush()
    expect(menus[0].answer).toBe('2 Other')
  })
  it('auto-answers menus it already knows (continue watching)', async () => {
    const menus = [{ prompt: 'Select anime: ', lines: ['1 Other', '2 Fake Anime'] }]
    const { svc, events, aniCli } = setup({ menus })
    svc.watch({ query: 'Fake Anime', anime: 'Fake Anime', episode: '3' })
    await flush()
    expect(menus[0].answer).toBe('2 Fake Anime')
    expect(events.some((e) => e[0] === EVENTS.menu)).toBe(false)
    expect(aniCli.startSession.mock.calls[0][0]).toMatchObject({ query: 'Fake Anime', player: 'play', episodes: '3' })
  })
  it('plays local files and applies the same rule', async () => {
    const { svc, player, library } = setup({ maxPercent: 99 })
    expect(await svc.playLocal({ file: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1' })).toBe('watched')
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=A Episode 1', 'D:\\A\\A Episode 1.mp4'], expect.any(Object))
    expect(library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'A', episode: '1' })
  })
  it('cancel kills the session and resolves pending menus with null', async () => {
    const menus = [{ prompt: 'Select anime: ', lines: ['1 X'] }]
    const { svc, aniCli } = setup({ menus })
    const { sessionId } = svc.watch({ query: 'x' })
    await flush()
    svc.cancel(sessionId)
    await flush()
    expect(menus[0].answer).toBeNull()
    expect(aniCli.startSession.mock.results[0].value.kill).toHaveBeenCalled()
  })
  it('cancel during playback closes mpv and does not record the episode', async () => {
    const s = setup({ maxPercent: 99 })
    let release
    s.player.play.mockImplementation(() => new Promise((r) => { release = r }))
    s.player.stop.mockImplementation(() => release({ exitCode: 0, maxPercent: 99 }))
    const { sessionId } = s.svc.watch({ query: 'x' })
    await flush()
    s.svc.cancel(sessionId)
    await flush()
    expect(s.player.stop).toHaveBeenCalled()
    expect(s.library.recordWatched).not.toHaveBeenCalled()
  })
  it('uses the in-app player when playerMode is internal and tracks the same way', async () => {
    const internalPlayer = { play: vi.fn(async () => ({ exitCode: 0, maxPercent: 95, position: 1330, duration: 1400, reason: 'ended' })), stop: vi.fn() }
    const positions = { clear: vi.fn(), save: vi.fn(), get: vi.fn(() => null) }
    const { svc, player, library } = setup({ settings: { playerMode: 'internal' }, internalPlayer, positions })
    svc.watch({ query: 'fake' })
    await flush()
    expect(internalPlayer.play).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fake Anime', episode: '2', url: 'https://v' }), expect.objectContaining({ onProgress: expect.any(Function) }))
    expect(player.play).not.toHaveBeenCalled()
    expect(library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Fake Anime', episode: '2' })
    expect(positions.clear).toHaveBeenCalledWith('Fake Anime', '2')
  })
  it('continues in mpv from the same position when the user asks for the external player', async () => {
    const internalPlayer = { play: vi.fn(async () => ({ exitCode: 0, maxPercent: 30, position: 421.7, duration: 1400, reason: 'external' })), stop: vi.fn() }
    const { svc, player, library } = setup({ settings: { playerMode: 'internal' }, internalPlayer, maxPercent: 90 })
    svc.watch({ query: 'fake' })
    await flush()
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=Fake Anime Episode 2', 'https://v', '--start=421'], expect.any(Object))
    expect(library.recordWatched).toHaveBeenCalled()
  })
  it('shares the recorded state across the in-app to mpv handover (records once, no position save after)', async () => {
    const internalPlayer = {
      play: vi.fn(async (_info, { onProgress }) => {
        onProgress({ position: 1300.9, duration: 1400, maxPercent: 93 })
        return { exitCode: 0, maxPercent: 93, position: 1300.9, duration: 1400, reason: 'external' }
      }),
      stop: vi.fn(),
    }
    const positions = { clear: vi.fn(), save: vi.fn(), get: vi.fn(() => null) }
    const { svc, player, library } = setup({ settings: { playerMode: 'internal' }, internalPlayer, positions })
    player.play.mockImplementation(async (_args, { onProgress }) => {
      onProgress({ position: 1350, duration: 1400, maxPercent: 96 })
      return { exitCode: 0, maxPercent: 96, position: 1380, duration: 1400 }
    })
    svc.watch({ query: 'fake' })
    await flush()
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=Fake Anime Episode 2', 'https://v', '--start=1300'], expect.any(Object))
    expect(library.recordWatched).toHaveBeenCalledTimes(1)
    const savesAfterRecording = positions.save.mock.calls.filter(([, , p]) => p.position > 1300.9)
    expect(savesAfterRecording).toEqual([])
  })
  it('passes extra mpv args in external mode', async () => {
    const { svc, player } = setup({ settings: { playerMode: 'external' }, mpvExtraArgs: () => ['--config-dir=C:/cfg'] })
    svc.watch({ query: 'fake' })
    await flush()
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=Fake Anime Episode 2', 'https://v'], expect.objectContaining({ extraArgs: ['--config-dir=C:/cfg'] }))
  })
  it('gives mpv the series skip lookup and the autoSkip setting', async () => {
    const skipsFor = vi.fn(async () => ({ op: null, ed: null, recap: null }))
    const { svc, player } = setup({ settings: { playerMode: 'external', autoSkip: true }, skipsFor })
    svc.watch({ query: 'fake' })
    await flush()
    const opts = player.play.mock.calls[0][1]
    expect(opts.autoSkip).toBe(true)
    expect(opts.language).toBe('sr')
    await opts.skips(1400)
    expect(skipsFor).toHaveBeenCalledWith('Fake Anime', '2', 1400)
  })
  it('closes the in-app player and records nothing when the session is cancelled', async () => {
    let finishPlay
    const internalPlayer = { play: vi.fn(() => new Promise((r) => { finishPlay = r })), stop: vi.fn(() => finishPlay({ exitCode: 0, maxPercent: 99, reason: 'back' })) }
    const { svc, library } = setup({ settings: { playerMode: 'internal' }, internalPlayer })
    const { sessionId } = svc.watch({ query: 'fake' })
    await new Promise((r) => setTimeout(r, 5))
    svc.cancel(sessionId)
    await flush()
    expect(internalPlayer.stop).toHaveBeenCalled()
    expect(library.recordWatched).not.toHaveBeenCalled()
  })
  it('falls back to mpv when the in-app player fails to start', async () => {
    const internalPlayer = { play: vi.fn(async () => { throw new Error('bad referrer') }), stop: vi.fn() }
    const { svc, player, library } = setup({ settings: { playerMode: 'internal' }, internalPlayer })
    svc.watch({ query: 'fake' })
    await flush()
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=Fake Anime Episode 2', 'https://v'], expect.any(Object))
    expect(library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Fake Anime', episode: '2' })
  })
  it('plays local files in the in-app player in internal mode', async () => {
    const internalPlayer = { play: vi.fn(async () => ({ exitCode: 0, maxPercent: 95, reason: 'ended' })), stop: vi.fn() }
    const { svc, player } = setup({ settings: { playerMode: 'internal' }, internalPlayer })
    await svc.playLocal({ file: 'D:\A\A Episode 1.mp4', title: 'A', episode: 1 })
    expect(internalPlayer.play).toHaveBeenCalledWith(expect.objectContaining({ file: 'D:\A\A Episode 1.mp4', title: 'A', episode: '1', url: 'D:\A\A Episode 1.mp4' }), expect.objectContaining({ onProgress: expect.any(Function) }))
    expect(player.play).not.toHaveBeenCalled()
  })
  it('never records a cancelled session, even past the threshold', async () => {
    let ctl
    const aniCli = {
      startSession: vi.fn((opts) => {
        const done = new Promise(() => {})
        queueMicrotask(() => opts.onPlay({ args: ['--force-media-title=Fake Anime Episode 2', 'https://v'] }))
        return { sessionId: 'sid', done, kill: vi.fn() }
      }),
    }
    const player = { play: vi.fn((args, opts) => new Promise((resolve) => { ctl = { opts, resolve } })), stop: vi.fn(() => ctl.resolve({ exitCode: 1, maxPercent: 95, position: 1330, duration: 1400 })) }
    const library = { recordWatched: vi.fn() }
    const svc = createWatchService({ aniCli, player, library, positions: { get: () => null, save: vi.fn(), clear: vi.fn() }, settings: { get: () => ({ ...DEFAULT_SETTINGS, playerMode: 'external' }) }, notify: () => {} })
    svc.watch({ query: 'fake' })
    await flush()
    svc.cancel('sid')
    ctl.opts.onProgress({ position: 1330, duration: 1400, maxPercent: 95 })
    await flush()
    expect(library.recordWatched).not.toHaveBeenCalled()
  })
})

describe('watchService — continuity', () => {
  function progressSetup({ settings = {}, saved = null, mode = 'external', record } = {}) {
    let ctl
    const player = {
      play: vi.fn((args, opts) => new Promise((resolve) => { ctl = { args, opts, resolve } })),
      stop: vi.fn(() => ctl?.resolve({ exitCode: 1, maxPercent: 0, position: 0, duration: 0 })),
    }
    const positions = { get: vi.fn(() => saved), save: vi.fn(), clear: vi.fn() }
    const library = { recordWatched: record ?? vi.fn() }
    const celebrations = { hold: vi.fn(), release: vi.fn() }
    const events = []
    const svc = createWatchService({
      aniCli: { startSession: vi.fn() }, player, library, positions, celebrations,
      settings: { get: () => ({ ...DEFAULT_SETTINGS, playerMode: mode, ...settings }) },
      notify: (ch, p) => events.push([ch, p]),
    })
    return { svc, player, positions, library, celebrations, events, ctl: () => ctl }
  }
  const local = { file: 'C:/v/ep3.mkv', title: 'Show', episode: 3 }

  it('saves positions from 10 s on and resumes mpv from a saved one', async () => {
    const { svc, positions, ctl } = progressSetup({ saved: { position: 754.6, duration: 1400 } })
    const done = svc.playLocal(local)
    await Promise.resolve()
    expect(ctl().args).toEqual(['--force-media-title=Show Episode 3', 'C:/v/ep3.mkv', '--start=754'])
    expect(ctl().opts).toMatchObject({ resumeAt: 754.6 })
    ctl().opts.onProgress({ position: 9, duration: 1400, maxPercent: 1 })
    expect(positions.save).not.toHaveBeenCalled()
    ctl().opts.onProgress({ position: 800, duration: 1400, maxPercent: 57 })
    expect(positions.save).toHaveBeenLastCalledWith('Show', '3', { position: 800, duration: 1400 })
    ctl().resolve({ exitCode: 0, maxPercent: 60, position: 840, duration: 1400 })
    expect(await done).toBe('none')
    expect(positions.save).toHaveBeenLastCalledWith('Show', '3', { position: 840, duration: 1400 })
  })
  it('starts mpv from the beginning without a saved position', async () => {
    const { svc, ctl } = progressSetup()
    svc.playLocal(local)
    await Promise.resolve()
    expect(ctl().args).toEqual(['--force-media-title=Show Episode 3', 'C:/v/ep3.mkv'])
    expect(ctl().opts.resumeAt ?? null).toBeNull()
    ctl().resolve({ exitCode: 0, maxPercent: 5, position: 50, duration: 1400 })
  })
  it('records once at the threshold, then keeps no position and does not record again on close', async () => {
    const { svc, positions, library, events, ctl } = progressSetup()
    const done = svc.playLocal(local)
    await Promise.resolve()
    ctl().opts.onProgress({ position: 1200, duration: 1400, maxPercent: 86 })
    expect(library.recordWatched).toHaveBeenCalledTimes(1)
    expect(positions.clear).toHaveBeenCalledWith('Show', '3')
    expect(events).toContainEqual([EVENTS.libraryChanged, undefined])
    positions.save.mockClear()
    ctl().opts.onProgress({ position: 30, duration: 1400, maxPercent: 86 }) // seeked back to the start
    ctl().opts.onProgress({ position: 1300, duration: 1400, maxPercent: 93 })
    expect(positions.save).not.toHaveBeenCalled()
    ctl().resolve({ exitCode: 0, maxPercent: 93, position: 40, duration: 1400 })
    expect(await done).toBe('watched')
    expect(library.recordWatched).toHaveBeenCalledTimes(1)
    expect(positions.save).not.toHaveBeenCalled()
  })
  it('waits for close when askOnClose is on', async () => {
    const { svc, library, events, ctl } = progressSetup({ settings: { askOnClose: true } })
    const done = svc.playLocal(local)
    await Promise.resolve()
    ctl().opts.onProgress({ position: 1300, duration: 1400, maxPercent: 95 })
    expect(library.recordWatched).not.toHaveBeenCalled()
    ctl().resolve({ exitCode: 0, maxPercent: 95, position: 1300, duration: 1400 })
    expect(await done).toBe('ask')
    expect(events).toContainEqual([EVENTS.ask, { aniCliTitle: 'Show', episode: '3' }])
  })
  it('retries recording at close when recording at the threshold failed', async () => {
    const record = vi.fn().mockImplementationOnce(() => { throw new Error('disk full') })
    const { svc, library, ctl } = progressSetup({ record })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const done = svc.playLocal(local)
    await Promise.resolve()
    expect(() => ctl().opts.onProgress({ position: 1250, duration: 1400, maxPercent: 90 })).not.toThrow()
    ctl().resolve({ exitCode: 0, maxPercent: 90, position: 1260, duration: 1400 })
    expect(await done).toBe('watched')
    expect(library.recordWatched).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
  it('holds celebrations for the whole playback and releases them even when the player fails', async () => {
    const { svc, celebrations, ctl } = progressSetup()
    const done = svc.playLocal(local)
    await Promise.resolve()
    expect(celebrations.hold).toHaveBeenCalledTimes(1)
    expect(celebrations.release).not.toHaveBeenCalled()
    ctl().resolve({ exitCode: 0, maxPercent: 10, position: 100, duration: 1400 })
    await done
    expect(celebrations.release).toHaveBeenCalledTimes(1)

    const failing = progressSetup()
    failing.player.play.mockRejectedValueOnce(new Error('mpv-missing'))
    await expect(failing.svc.playLocal(local)).rejects.toThrow('mpv-missing')
    expect(failing.celebrations.release).toHaveBeenCalledTimes(1)
  })
})

function retrySetup({ settings = {}, now = () => 1000 } = {}) {
  const events = []
  const sessions = []
  const aniCli = {
    startSession: vi.fn((opts) => {
      let finish
      const done = new Promise((r) => { finish = r })
      const s = { opts, sessionId: `s${sessions.length + 1}`, finish, kill: vi.fn() }
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
  const library = { recordWatched: vi.fn() }
  const positions = { clear: vi.fn(), save: vi.fn(), get: vi.fn(() => null) }
  const svc = createWatchService({
    aniCli, player: { play: vi.fn(), stop: vi.fn() }, internalPlayer, library, positions, now,
    settings: { get: () => ({ ...DEFAULT_SETTINGS, ...settings }) },
    notify: (ch, p) => events.push([ch, p]),
  })
  const args = ['--force-media-title=Show Episode 3', 'https://v']
  return { svc, aniCli, sessions, internalPlayer, library, positions, events, args }
}

describe('watchService player mode', () => {
  it('passes the session mode to the in-app player, also for local files', async () => {
    const internalPlayer = { play: vi.fn(async () => ({ exitCode: 0, maxPercent: 10, reason: 'back' })), stop: vi.fn() }
    const seriesPrefs = { resolve: vi.fn(() => ({ quality: 'best', mode: 'dub' })) }
    const { svc } = setup({ settings: { playerMode: 'internal' }, internalPlayer, seriesPrefs })
    svc.watch({ query: 'fake' })
    await flush()
    expect(internalPlayer.play).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'dub' }), expect.objectContaining({ onProgress: expect.any(Function) }))
    await svc.playLocal({ file: 'D:\A\A Episode 1.mp4', title: 'A', episode: '1', mode: 'dub' })
    expect(internalPlayer.play).toHaveBeenLastCalledWith(expect.objectContaining({ file: 'D:\A\A Episode 1.mp4', mode: 'dub' }), expect.objectContaining({ onProgress: expect.any(Function) }))
    await svc.playLocal({ file: 'D:\A\A Episode 2.mp4', title: 'A', episode: '2' })
    expect(internalPlayer.play).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'sub' }), expect.objectContaining({ onProgress: expect.any(Function) }))
  })
})

describe('watchService recovery', () => {
  it('retry skips afterPlayback even at 95 % and restarts the same episode with the same quality and mode', async () => {
    const { svc, sessions, internalPlayer, library, positions, events, args } = retrySetup({ settings: { quality: '720', mode: 'dub' } })
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    const playing = sessions[0].opts.onPlay({ args })
    await flush()
    expect(svc.recover({ playbackId: 'p1', position: 1300, duration: 1400, maxPercent: 95 })).toEqual({ ok: true })
    await playing
    expect(library.recordWatched).not.toHaveBeenCalled()
    expect(positions.clear).not.toHaveBeenCalled()
    expect(sessions).toHaveLength(2)
    expect(sessions[1].opts).toMatchObject({ query: 'show', episodes: '3', quality: '720', mode: 'dub' })
    expect(events).toContainEqual([EVENTS.playerRetry, { title: 'Show', episode: '3', state: 'reconnecting', sessionId: 's2' }])
    sessions[1].opts.onPlay({ args })
    await flush()
    expect(internalPlayer.play).toHaveBeenLastCalledWith(expect.objectContaining({ resume: { at: 1300, auto: true, title: 'Show', episode: '3' } }), expect.objectContaining({ onProgress: expect.any(Function) }))
    expect(internalPlayer.play.mock.calls[0][0].mode).toBe('dub')
    expect(internalPlayer.play.mock.calls[1][0].mode).toBe('dub')
  })
  it('allows one automatic recovery per episode; manual ones always pass', async () => {
    const { svc, sessions, args } = retrySetup()
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    sessions[0].opts.onPlay({ args })
    await flush()
    expect(svc.recover({ playbackId: 'p1', position: 100 })).toEqual({ ok: true })
    await flush()
    sessions[1].opts.onPlay({ args })
    await flush()
    expect(svc.recover({ playbackId: 'p2', position: 120 })).toEqual({ ok: true, auto: false })
    expect(svc.recover({ playbackId: 'p2', position: 120 }, { manual: true })).toEqual({ ok: true })
  })
  it('forgets the budget after 30 minutes and after a normal finish', async () => {
    let t = 0
    const { svc, sessions, internalPlayer, args } = retrySetup({ now: () => t })
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    sessions[0].opts.onPlay({ args })
    await flush()
    svc.recover({ playbackId: 'p1', position: 100 })
    await flush()
    sessions[1].opts.onPlay({ args })
    await flush()
    t = 30 * 60 * 1000 + 1
    expect(svc.recover({ playbackId: 'p2', position: 100 })).toEqual({ ok: true })
    await flush()
    const ending = sessions[2].opts.onPlay({ args })
    await flush()
    internalPlayer.closed({ playbackId: 'p3', position: 1400, duration: 1400, maxPercent: 100, reason: 'ended' })
    await ending
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    const fresh = sessions.findLast((s) => s.opts.episodes === '3') // the newest session for episode 3 (a prefetch of episode 4 may sit in between)
    fresh.opts.onPlay({ args })
    await flush()
    expect(svc.recover({ playbackId: 'p4', position: 5 })).toEqual({ ok: true })
  })
  it('refuses to recover a playback that is no longer active', () => {
    const { svc } = retrySetup()
    expect(svc.recover({ playbackId: 'nope', position: 1 })).toEqual({ ok: false })
  })
  it('reuses the anime picked in the menu', async () => {
    const { svc, sessions, events, args } = retrySetup()
    svc.watch({ query: 'show' })
    const answer = sessions[0].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Show (12 episodes)', '2 Other'] })
    await flush()
    const [, req] = events.find(([c]) => c === EVENTS.menu)
    svc.answerMenu(req.requestId, '1 Show (12 episodes)')
    await answer
    sessions[0].opts.onPlay({ args })
    await flush()
    svc.recover({ playbackId: 'p1', position: 200 })
    await flush()
    await expect(sessions[1].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other', '2 Show (12 episodes)'] })).resolves.toBe('2 Show (12 episodes)')
  })
  it('a recovery that hits an unknown menu fails instead of showing it', async () => {
    const { svc, sessions, events, args } = retrySetup()
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    sessions[0].opts.onPlay({ args })
    await flush()
    svc.recover({ playbackId: 'p1', position: 200 })
    await flush()
    await expect(sessions[1].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Something else'] })).resolves.toBeNull()
    expect(events.some(([c]) => c === EVENTS.menu)).toBe(false)
    sessions[1].finish({ ok: false, error: 'cancelled', stderr: '' })
    await flush()
    expect(events).toContainEqual([EVENTS.playerRetry, { title: 'Show', episode: '3', state: 'failed', error: 'not-found', sessionId: 's2' }])
    expect(events).toContainEqual([EVENTS.sessionEnd, expect.objectContaining({ sessionId: 's2', retry: true })])
  })
  it('reports the ani-cli error of a failed recovery and can try again by hand', async () => {
    const { svc, sessions, events, args } = retrySetup()
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    sessions[0].opts.onPlay({ args })
    await flush()
    svc.recover({ playbackId: 'p1', position: 200 })
    await flush()
    sessions[1].finish({ ok: false, error: 'no-sources', stderr: 'Episode is released, but no valid sources!' })
    await flush()
    expect(events).toContainEqual([EVENTS.playerRetry, { title: 'Show', episode: '3', state: 'failed', error: 'no-sources', sessionId: 's2' }])
    svc.retryAgain()
    expect(sessions).toHaveLength(3)
    expect(sessions[2].opts).toMatchObject({ episodes: '3' })
    expect(events.at(-1)).toEqual([EVENTS.playerRetry, { title: 'Show', episode: '3', state: 'reconnecting', sessionId: 's3' }])
    svc.retryAgain()
    expect(sessions).toHaveLength(3)
  })
  it('a cancelled recovery reports nothing', async () => {
    const { svc, sessions, events, args } = retrySetup()
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    sessions[0].opts.onPlay({ args })
    await flush()
    svc.recover({ playbackId: 'p1', position: 200 })
    await flush()
    svc.cancel('s2')
    sessions[1].finish({ ok: false, error: 'cancelled', stderr: '' })
    await flush()
    expect(events.some(([c, p]) => c === EVENTS.playerRetry && p.state === 'failed')).toBe(false)
  })
  it('passes the ani-cli quality fallback to the player', async () => {
    const { svc, sessions, internalPlayer, args } = retrySetup()
    svc.watch({ query: 'show', anime: 'Show', episode: '3' })
    sessions[0].opts.onLine('\x1b[1;33m720 not found, defaulting to best\x1b[0m')
    sessions[0].opts.onPlay({ args })
    await flush()
    expect(internalPlayer.play).toHaveBeenCalledWith(expect.objectContaining({ qualityFallback: '720', resume: null }), expect.objectContaining({ onProgress: expect.any(Function) }))
  })
})
