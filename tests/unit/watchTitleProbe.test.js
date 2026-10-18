import { describe, it, expect, vi } from 'vitest'
import { createWatchService } from '../../src/main/watchService.js'
import { EVENTS } from '../../src/shared/channels.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

// ani-cli picks a lone search result itself: the session's first menu is the episode menu.
function setup({ probeResult = 'Lone Show (4 episodes)', episodeLists = null, withProbe = true } = {}) {
  const events = []
  const sessions = []
  const probes = []
  const aniCli = {
    startSession: vi.fn((opts) => {
      let end
      const done = new Promise((r) => { end = r })
      const s = { opts, done, end: (r = { ok: true }) => end(r), kill: vi.fn(() => end({ ok: false, error: 'cancelled' })), sessionId: `sid${sessions.length + 1}` }
      sessions.push(s)
      return s
    }),
  }
  if (withProbe) {
    aniCli.probeTitle = vi.fn((args) => {
      let resolve
      const p = { args, done: new Promise((r) => { resolve = r }), kill: vi.fn(() => resolve(null)), resolve: (t = probeResult) => resolve(t) }
      probes.push(p)
      return p
    })
  }
  const svc = createWatchService({
    aniCli, player: { play: vi.fn(async () => ({ exitCode: 0, maxPercent: 0 })), stop: vi.fn() }, library: { recordWatched: vi.fn() },
    settings: { get: () => ({ ...DEFAULT_SETTINGS, quality: '720', mode: 'sub' }) }, notify: (ch, p) => events.push([ch, p]), episodeLists,
  })
  return { svc, aniCli, sessions, probes, events }
}
const flush = () => new Promise((r) => setTimeout(r, 0))
const titles = (events) => events.filter(([ch]) => ch === EVENTS.watchTitle).map(([, p]) => p)

describe('watchService: title of a lone search result', () => {
  it('probes the title when the first menu is the episode menu, and reports it for the session', async () => {
    const episodeLists = { set: vi.fn() }
    const { svc, aniCli, sessions, probes, events } = setup({ episodeLists })
    svc.watch({ query: 'lone show' })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2', '3', '4'] })
    expect(aniCli.probeTitle).toHaveBeenCalledWith({ query: 'lone show', episode: '1', quality: '720', mode: 'sub' })
    expect(episodeLists.set).not.toHaveBeenCalled()
    probes[0].resolve()
    await flush()
    expect(titles(events)).toEqual([{ sessionId: 'sid1', title: 'Lone Show' }])
    expect(episodeLists.set).toHaveBeenCalledWith('Lone Show', 'sub', ['1', '2', '3', '4'])
  })
  it('reports null when the probe finds no title', async () => {
    const { svc, sessions, probes, events } = setup({ probeResult: null })
    svc.watch({ query: 'lone show' })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1'] })
    probes[0].resolve()
    await flush()
    expect(titles(events)).toEqual([{ sessionId: 'sid1', title: null }])
  })
  it('does not probe when the series is passed in (watchlist, continue watching)', async () => {
    const { svc, aniCli, sessions } = setup()
    svc.watch({ query: 'Show', anime: 'Show' })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2'] })
    expect(aniCli.probeTitle).not.toHaveBeenCalled()
  })
  it('does not probe after the user picked the series in the anime menu', async () => {
    const { svc, aniCli, sessions, events } = setup()
    svc.watch({ query: 'show' })
    const answered = sessions[0].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Show', '2 Other'] })
    const { requestId } = events.find(([ch]) => ch === EVENTS.menu)[1]
    svc.answerMenu(requestId, '1 Show')
    await answered
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2'] })
    expect(aniCli.probeTitle).not.toHaveBeenCalled()
  })
  it('probes once per session', async () => {
    const { svc, aniCli, sessions } = setup()
    svc.watch({ query: 'lone show' })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2'] })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2'] })
    expect(aniCli.probeTitle).toHaveBeenCalledTimes(1)
  })
  it('kills the probe when the session ends first, and reports nothing', async () => {
    const { svc, sessions, probes, events } = setup()
    svc.watch({ query: 'lone show' })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2'] })
    svc.cancel('sid1')
    await flush()
    expect(probes[0].kill).toHaveBeenCalled()
    expect(titles(events)).toEqual([])
  })
  it('works without a probe (older bridge): no event', async () => {
    const { svc, sessions, events } = setup({ withProbe: false })
    svc.watch({ query: 'lone show' })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1'] })
    await flush()
    expect(titles(events)).toEqual([])
  })
  it('dispose (app quit) kills a running probe', () => {
    const { svc, sessions, probes } = setup()
    svc.watch({ query: 'lone show' })
    sessions[0].opts.onMenu({ prompt: 'Select episode: ', lines: ['1'] })
    svc.dispose()
    expect(probes[0].kill).toHaveBeenCalled()
  })
})
