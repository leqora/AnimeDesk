// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

vi.mock('../../../src/renderer/player/loadPlayer.js', async () => {
  const { PlayerView } = await import('../../../src/renderer/components/PlayerView.jsx')
  return { loadPlayer: async () => ({ PlayerView }) }
})

const ep = (id, episode = '3') => ({ playbackId: id, title: 'Show', episode, kind: 'hls', src: `http://127.0.0.1:9/${id}`, subtitleUrl: null, resumeAt: null, totalEpisodes: 12 })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const mini = () => document.querySelector('.player--mini')
const pointer = (target, type, x, y) => act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })) })

async function start({ fullscreen = false } = {}) {
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
    player: { onOpen: vi.fn((f) => { cb.open = f; return () => {} }), onRetry: vi.fn((f) => { cb.retry = f; return () => {} }), onClose: vi.fn((f) => { cb.close = f; return () => {} }) },
    watch: { onSessionEnd: vi.fn(sub(ends)), onPlaying: vi.fn(sub(playings)), onMenu: vi.fn(sub(menus)), onTitle: vi.fn(sub(titles)) },
  })
  let sessions = 0
  api.watch.start.mockImplementation(async () => ({ sessionId: `s${++sessions}` }))
  render(<App api={api} />)
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
afterEach(() => { delete window.requestIdleCallback; delete window.cancelIdleCallback })

describe('App mini player', () => {
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
})
