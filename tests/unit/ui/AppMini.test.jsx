// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

const gate = vi.hoisted(() => ({ crash: false }))
vi.mock('../../../src/renderer/player/loadPlayer.js', async () => {
  const { PlayerView } = await import('../../../src/renderer/components/PlayerView.jsx')
  const { createElement } = await import('react')
  const Guarded = (props) => { if (gate.crash) throw new Error('boom'); return createElement(PlayerView, props) }
  return { loadPlayer: async () => ({ PlayerView: Guarded }) }
})
const entry = { id: 'a1', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [1], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null }

const ep = (id, episode = '3') => ({ playbackId: id, title: 'Show', episode, kind: 'hls', src: `http://127.0.0.1:9/${id}`, subtitleUrl: null, resumeAt: null, totalEpisodes: 12 })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const mini = () => document.querySelector('.player--mini')
const pointer = (target, type, x, y) => act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })) })

async function start({ fullscreen = false, library = [] } = {}) {
  const cb = {}
  const ends = new Set()
  const playings = new Set()
  const menus = new Set()
  const titles = new Set()
  const sub = (set) => (f) => { set.add(f); return () => set.delete(f) }
  cb.end = (e) => [...ends].forEach((f) => f(e))
  cb.playing = (e) => [...playings].forEach((f) => f(e))
  cb.menu = (e) => [...menus].forEach((f) => f(e))
  cb.title = (e) => [...titles].forEach((f) => f(e))
  const api = makeFakeApi({
    window: { getFullscreen: vi.fn(async () => fullscreen) },
    library: { list: vi.fn(async () => library) },
    stats: { onAchievements: vi.fn((f) => { cb.achievements = f; return () => {} }) },
    player: { onOpen: vi.fn((f) => { cb.open = f; return () => {} }), onRetry: vi.fn((f) => { cb.retry = f; return () => {} }), onClose: vi.fn((f) => { cb.close = f; return () => {} }) },
    watch: { onSessionEnd: vi.fn(sub(ends)), onPlaying: vi.fn(sub(playings)), onMenu: vi.fn(sub(menus)), onTitle: vi.fn(sub(titles)) },
  })
  api.onOpenAnime = vi.fn((f) => { cb.anime = f; return () => {} })
  let sessions = 0
  api.watch.start.mockImplementation(async () => ({ sessionId: `s${++sessions}` }))
  render(<App api={api} sound={{ play: vi.fn(() => true) }} />)
  await screen.findByLabelText('Naziv animea…')
  await waitFor(() => expect(cb.open).toBeDefined())
  return {
    api, cb,
    open: async (p = ep('p1')) => { act(() => cb.open(p)); await waitFor(() => expect(document.querySelector('video')).not.toBeNull()); await flush() },
    pickFromSearch: async (episode = '2') => {
      fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'naruto' } })
      fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
      await waitFor(() => expect(api.watch.start).toHaveBeenCalled())
      await flush()
      api.watch.start.mockClear()
      act(() => cb.menu({ requestId: 'r1', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
      act(() => cb.title({ sessionId: 's1', title: 'Naruto' }))
      fireEvent.click(await screen.findByRole('button', { name: episode }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Gledaj' })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: 'Gledaj' }))
      act(() => cb.playing({ title: 'Naruto', episode, sessionId: 's1' }))
    },
  }
}

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(function () { return Promise.resolve() })
  HTMLMediaElement.prototype.pause = vi.fn()
  window.requestIdleCallback = vi.fn(() => 1)
  window.cancelIdleCallback = vi.fn()
})
afterEach(() => { gate.crash = false; delete window.requestIdleCallback; delete window.cancelIdleCallback })

describe('App mini player', () => {
  it('achievement toast Profil action uses the current player state (minimizes a full player)', async () => {
    const s = await start()
    await waitFor(() => expect(s.cb.achievements).toBeDefined())
    act(() => s.cb.achievements({ ids: ['marathon'] }))
    const profile = await screen.findByRole('button', { name: 'Profil' })
    await s.open() // e.g. auto-next opened the next episode while the toast was visible
    expect(mini()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Profil' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    expect(s.api.player.closed).not.toHaveBeenCalled()
    expect(profile).toBeDefined()
    expect(document.querySelector('main.content')).not.toHaveAttribute('inert')
    expect(document.querySelector('.profile-section')).not.toBeNull()
  })

  it('top bar page click minimizes instead of closing', async () => {
    const s = await start()
    await s.open()
    const video = document.querySelector('video')
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    expect(s.api.player.closed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Watchlist' })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector('main.content')).not.toHaveAttribute('inert')
    expect(document.querySelector('.app-shell')).not.toHaveClass('app-shell--playing')
    expect(document.querySelector('video')).toBe(video)
  })

  it('minimize button minimizes, focuses the page and leaves window fullscreen', async () => {
    const s = await start({ fullscreen: true })
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    expect(s.api.window.setFullscreen).toHaveBeenCalledWith(false)
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
  })

  it('expand keeps the page underneath', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Raspored' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Raspored' })).toHaveAttribute('aria-current', 'page'))
    fireEvent.click(screen.getByRole('button', { name: 'Uvećaj' }))
    await waitFor(() => expect(mini()).toBeNull())
    expect(document.querySelector('main.content')).toHaveAttribute('inert')
    fireEvent.click(screen.getAllByRole('button', { name: 'Nazad' }).find((b) => !b.closest('[aria-hidden="true"]')))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(screen.getByRole('button', { name: 'Raspored' })).toHaveAttribute('aria-current', 'page')
  })

  it('minimize then expand without navigating keeps the origin', async () => {
    const s = await start()
    await s.pickFromSearch('2')
    await s.open({ ...ep('p1', '2'), title: 'Naruto' })
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Uvećaj' }))
    await waitFor(() => expect(mini()).toBeNull())
    s.api.watch.start.mockClear()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nazad' }).find((b) => !b.closest('[aria-hidden="true"]')))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledWith({ query: 'Naruto', anime: 'Naruto' }))
  })

  it('palette and Alt+Left work in mini', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(mini()).not.toBeNull()
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Početna' })).toHaveAttribute('aria-current', 'page'))
    expect(mini()).not.toBeNull()
  })

  it('close in mini stays on the page', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'nav', playbackId: 'p1' }))
    expect(screen.getByRole('button', { name: 'Watchlist' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
  })

  it('recovery in mini stays mini and leaves an open palette alone', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })
    const dialog = await screen.findByRole('dialog')
    act(() => s.cb.close())
    act(() => s.cb.retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 'r1' }))
    expect(document.querySelector('.player--reconnect.player--mini')).not.toBeNull()
    expect(screen.getByRole('dialog')).toBe(dialog)
    act(() => s.cb.open(ep('p2')))
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull())
    await flush()
    expect(mini()).not.toBeNull()
    expect(document.querySelector('.player--reconnect')).toBeNull()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('a non-retry session end right behind player-retry does not drop the mini', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.close())
    act(() => {
      s.cb.retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 'r1' })
      s.cb.end({ sessionId: 'A', retry: false, result: { ok: true } })
    })
    expect(document.querySelector('.player--reconnect.player--mini')).not.toBeNull()
  })

  it('x on the reconnecting mini cancels the session and stays on the page', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.close())
    act(() => s.cb.retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 'r1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(s.api.watch.cancel).toHaveBeenCalledWith('r1')
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(screen.getByRole('button', { name: 'Watchlist' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
  })

  it('a cancelled recovery clears the reconnecting mini; one for another session changes nothing', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.close())
    act(() => s.cb.retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 'r1' }))
    expect(document.querySelector('.player--reconnect.player--mini')).not.toBeNull()
    act(() => s.cb.retry({ state: 'cancelled', title: 'Show', episode: '3', sessionId: 'zz' }))
    expect(document.querySelector('.player--reconnect.player--mini')).not.toBeNull()
    act(() => s.cb.retry({ state: 'cancelled', title: 'Show', episode: '3', sessionId: 'r1' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(mini()).toBeNull()
    expect(screen.getByRole('button', { name: 'Watchlist' })).toHaveAttribute('aria-current', 'page')
    // focus was inside the reconnecting element: it moves to the page
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
  })

  it('a cancelled recovery does not move focus that is outside the reconnecting element', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.close())
    act(() => s.cb.retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 'r1' }))
    const btn = screen.getByRole('button', { name: 'Watchlist' })
    btn.focus()
    act(() => s.cb.retry({ state: 'cancelled', title: 'Show', episode: '3', sessionId: 'r1' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(document.activeElement).toBe(btn)
  })

  it('x on the reconnecting mini forgets the origin', async () => {
    const s = await start()
    await s.pickFromSearch('2')
    await s.open({ ...ep('p1', '2'), title: 'Naruto' })
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.close())
    act(() => s.cb.retry({ state: 'reconnecting', title: 'Naruto', episode: '2', sessionId: 'r1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    await s.open(ep('p9', '5')) // a later episode started with no origin
    s.api.watch.start.mockClear()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nazad' }).find((b) => !b.closest('[aria-hidden="true"]')))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    await flush()
    expect(s.api.watch.start).not.toHaveBeenCalled()
  })

  it('a new episode started from the detail while mini returns to that detail', async () => {
    const s = await start({ library: [entry] })
    act(() => s.cb.anime({ animeId: 'a1' }))
    await waitFor(() => expect(document.querySelector('.detail-hero')).not.toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: /^Nastavi EP 2/ }))
    await s.open(ep('p1', '2'))
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.anime({ animeId: 'a1' })) // back on the detail while the first episode is still mini
    await waitFor(() => expect(document.querySelector('.detail-hero')).not.toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: /^Nastavi EP 2/ }))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalled())
    act(() => s.cb.close())
    await s.open(ep('p2', '2'))
    expect(mini()).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nazad' }).find((b) => !b.closest('[aria-hidden="true"]')))
    await waitFor(() => expect(document.querySelector('.detail-hero')).not.toBeNull())
  })

  it('an episode picked in Search while mini reopens that list on Back', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Početna' }))
    await s.pickFromSearch('2')
    act(() => s.cb.close())
    await s.open({ ...ep('p2', '2'), title: 'Naruto' })
    expect(mini()).toBeNull()
    s.api.watch.start.mockClear()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nazad' }).find((b) => !b.closest('[aria-hidden="true"]')))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledWith({ query: 'Naruto', anime: 'Naruto' }))
  })

  it.each([
    ['the session ends', (s) => s.cb.end({ sessionId: 's0', retry: false, result: { ok: true } })],
    ['mpv starts playing', (s) => s.cb.playing({ title: 'Show', episode: '4', sessionId: 's7' })],
  ])('mini does not outlive a closed player when %s', async (_n, fire) => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.close())
    act(() => fire(s))
    act(() => s.cb.retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 'r1' }))
    expect(document.querySelector('.player--reconnect')).not.toBeNull()
    expect(document.querySelector('.player--mini')).toBeNull()
  })

  it('a crash while mini shows the full error screen and Close drops the player', async () => {
    const s = await start()
    await s.open()
    gate.crash = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    const close = await screen.findByRole('button', { name: 'Zatvori' })
    expect(document.querySelector('.error-fallback--overlay')).not.toBeNull()
    expect(document.querySelector('main.content')).toHaveAttribute('inert')
    fireEvent.click(close)
    expect(s.api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'back', playbackId: 'p1' }))
    await waitFor(() => expect(document.querySelector('.error-fallback--overlay')).toBeNull())
    vi.restoreAllMocks()
  })

  it('a new episode opens full', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    act(() => s.cb.close())
    await s.open(ep('p2', '4'))
    expect(document.querySelector('.player')).not.toBeNull()
    expect(mini()).toBeNull()
    expect(document.querySelector('main.content')).toHaveAttribute('inert')
  })

  it('corner is remembered', async () => {
    const s = await start()
    await s.open()
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    const bottomRight = mini().style.left
    pointer(mini(), 'pointerdown', 900, 600)
    pointer(window, 'pointermove', 300, 300)
    pointer(window, 'pointermove', 100, 100)
    pointer(window, 'pointerup', 100, 100)
    await waitFor(() => expect(mini().style.left).toBe('20px'))
    expect(mini().style.left).not.toBe(bottomRight)
    fireEvent.click(screen.getByRole('button', { name: 'Uvećaj' }))
    await waitFor(() => expect(mini()).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    expect(mini().style.left).toBe('20px')
  })

  const dragTopLeft = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    const bottomRight = mini().style.left
    pointer(mini(), 'pointerdown', 900, 600)
    pointer(window, 'pointermove', 300, 300)
    pointer(window, 'pointermove', 100, 100)
    pointer(window, 'pointerup', 100, 100)
    await waitFor(() => expect(mini().style.left).toBe('20px'))
    return bottomRight
  }

  it('a new episode starts the mini player bottom-right again', async () => {
    const s = await start()
    await s.open()
    const bottomRight = await dragTopLeft()
    act(() => s.cb.open(ep('p2', '4')))
    await waitFor(() => expect(mini()).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    await waitFor(() => expect(mini()).not.toBeNull())
    expect(mini().style.left).toBe(bottomRight)
  })

  it('a quiet recovery of the same episode keeps the dragged corner', async () => {
    const s = await start()
    await s.open()
    await dragTopLeft()
    act(() => s.cb.close())
    act(() => s.cb.retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 'r1' }))
    act(() => s.cb.open(ep('p2')))
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull())
    await flush()
    expect(mini()).not.toBeNull()
    expect(mini().style.left).toBe('20px')
  })
})
