import { describe, it, expect, vi } from 'vitest'
import { createWatchService } from '../../src/main/watchService.js'
import { EVENTS } from '../../src/shared/channels.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

function setup({ settings = {}, maxPercent = 90, menus = [] } = {}) {
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
    aniCli, player, library,
    settings: { get: () => ({ ...DEFAULT_SETTINGS, ...settings }) },
    notify: (ch, p) => events.push([ch, p]),
  })
  return { svc, aniCli, player, library, events, menus }
}
const flush = () => new Promise((r) => setTimeout(r, 20))

describe('watchService', () => {
  it('records the episode when watched past the threshold', async () => {
    const { svc, library, events, player } = setup({ maxPercent: 90 })
    svc.watch({ query: 'fake' })
    await flush()
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=Fake Anime Episode 2', 'https://v'])
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
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=A Episode 1', 'D:\\A\\A Episode 1.mp4'])
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
})
