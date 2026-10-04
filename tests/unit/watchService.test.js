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
    const positions = { clear: vi.fn() }
    const { svc, player, library } = setup({ settings: { playerMode: 'internal' }, internalPlayer, positions })
    svc.watch({ query: 'fake' })
    await flush()
    expect(internalPlayer.play).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fake Anime', episode: '2', url: 'https://v' }))
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
    expect(internalPlayer.play).toHaveBeenCalledWith(expect.objectContaining({ file: 'D:\A\A Episode 1.mp4', title: 'A', episode: '1', url: 'D:\A\A Episode 1.mp4' }))
    expect(player.play).not.toHaveBeenCalled()
  })
})
