// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

vi.mock('../../../src/renderer/player/loadPlayer.js', async () => {
  const { PlayerView } = await import('../../../src/renderer/components/PlayerView.jsx')
  return { loadPlayer: async () => ({ PlayerView }) }
})

const episode = { playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const topbar = () => document.querySelector('.topbar')

// jsdom has no media state; give the element a writable `paused`
const makePlaying = (video) => {
  let paused = false
  Object.defineProperty(video, 'paused', { configurable: true, get: () => paused, set: (v) => { paused = v } })
  Object.defineProperty(video, 'duration', { configurable: true, value: 1400 })
  fireEvent(video, new Event('loadedmetadata'))
  fireEvent(video, new Event('play'))
}

async function start({ fullscreen = false, apiOver = {} } = {}) {
  let openPlayer
  let retry
  let fs
  const api = makeFakeApi({
    player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }), onRetry: vi.fn((cb) => { retry = cb; return () => {} }) },
    window: { getFullscreen: vi.fn(async () => fullscreen), onFullscreen: vi.fn((cb) => { fs = cb; return () => {} }) },
    ...apiOver,
  })
  render(<App api={api} />)
  await screen.findByLabelText('Naziv animea…')
  return {
    api,
    open: async (ep = episode) => { act(() => openPlayer(ep)); await waitFor(() => expect(document.querySelector('video')).not.toBeNull()); await flush(); makePlaying(document.querySelector('video')) },
    retry: (s) => act(() => retry(s)),
    setFullscreen: (v) => act(() => fs(v)),
  }
}

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(function () { return Promise.resolve() })
  HTMLMediaElement.prototype.pause = vi.fn()
  window.requestIdleCallback = vi.fn(() => 1)
  window.cancelIdleCallback = vi.fn()
})
afterEach(() => { vi.useRealTimers(); delete window.requestIdleCallback; delete window.cancelIdleCallback })

describe('App top bar over the player', () => {
  it('topbar stays interactive while the player is open and controls are visible', async () => {
    const { open } = await start()
    await open()
    const settings = screen.getByRole('button', { name: 'Podešavanja' })
    expect(settings.closest('[inert]')).toBeNull()
    expect(topbar()).not.toHaveClass('topbar--hidden')
    expect(document.querySelector('main.content')).toHaveAttribute('inert')
    expect(document.querySelector('.app-shell')).toHaveClass('app-shell--playing')
    expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert')
  })

  it('topbar hides with the player controls when idle', async () => {
    const { open } = await start()
    await open()
    vi.useFakeTimers()
    fireEvent.mouseMove(document.querySelector('.player'))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(topbar()).toHaveClass('topbar--hidden')
    expect(topbar()).toHaveAttribute('inert')
    fireEvent.mouseMove(document.querySelector('.player'))
    expect(topbar()).not.toHaveClass('topbar--hidden')
    expect(topbar()).not.toHaveAttribute('inert')
  })

  it('topbar stays while hovered', async () => {
    const { open } = await start()
    await open()
    vi.useFakeTimers()
    fireEvent.mouseMove(document.querySelector('.player'))
    fireEvent.pointerEnter(topbar())
    act(() => { vi.advanceTimersByTime(5000) })
    expect(topbar()).not.toHaveClass('topbar--hidden')
    expect(document.querySelector('.player')).not.toHaveClass('player--idle')
    fireEvent.pointerLeave(topbar())
    act(() => { vi.advanceTimersByTime(3000) })
    expect(topbar()).toHaveClass('topbar--hidden')
  })

  it('topbar stays while focused', async () => {
    const { open } = await start()
    await open()
    vi.useFakeTimers()
    fireEvent.mouseMove(document.querySelector('.player'))
    act(() => { screen.getByRole('button', { name: 'Podešavanja' }).focus() })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(topbar()).not.toHaveClass('topbar--hidden')
  })

  it('topbar stays while one of its menus is open', async () => {
    const { open } = await start()
    await open()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Nalog' }))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(topbar()).not.toHaveClass('topbar--hidden')
  })

  it('the bar under the cursor stays visible on the next playback', async () => {
    const { open } = await start()
    await open()
    fireEvent.pointerEnter(topbar())
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    await open({ ...episode, playbackId: 'p2', episode: '4' })
    vi.useFakeTimers()
    fireEvent.mouseMove(document.querySelector('.player'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(topbar()).not.toHaveClass('topbar--hidden')
  })

  it('focus moves to the player when the bar hides around it (fullscreen from the avatar menu)', async () => {
    const { open, setFullscreen } = await start()
    await open()
    act(() => { screen.getByRole('button', { name: 'Podešavanja' }).focus() })
    expect(topbar().contains(document.activeElement)).toBe(true)
    setFullscreen(true)
    expect(topbar()).toHaveClass('topbar--hidden')
    expect(document.activeElement).toBe(document.querySelector('.player'))
  })

  it('topbar is hidden in fullscreen during playback', async () => {
    const { open, setFullscreen } = await start({ fullscreen: true })
    await open()
    expect(document.querySelector('.player')).toHaveClass('player--fullscreen')
    expect(topbar()).toHaveClass('topbar--hidden')
    fireEvent.mouseMove(document.querySelector('.player'))
    expect(topbar()).toHaveClass('topbar--hidden')
    setFullscreen(false)
    expect(topbar()).not.toHaveClass('topbar--hidden')
  })

  it('topbar is hidden and inert while reconnecting', async () => {
    const { retry } = await start()
    retry({ state: 'reconnecting', title: 'Show', episode: '3', sessionId: 's1' })
    expect(topbar()).toHaveClass('topbar--hidden')
    expect(topbar()).toHaveAttribute('inert')
    expect(document.querySelector('main.content')).toHaveAttribute('inert')
  })

  it('Esc in an open topbar menu closes the menu, not the player', async () => {
    const { api, open } = await start()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Nalog' }))
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(menu).not.toBeInTheDocument()
    expect(api.player.closed).not.toHaveBeenCalled()
    expect(document.querySelector('.player')).toBeInTheDocument()
  })

  it('player shortcuts ignore keys pressed inside the topbar', async () => {
    const { api, open } = await start()
    await open()
    const settings = screen.getByRole('button', { name: 'Podešavanja' })
    fireEvent.keyDown(settings, { key: 'f', code: 'KeyF' })
    expect(api.window.setFullscreen).not.toHaveBeenCalled()
    fireEvent.keyDown(document.querySelector('.player'), { key: 'f', code: 'KeyF' })
    expect(api.window.setFullscreen).toHaveBeenCalledWith(true)
  })

  it('page content is not inert without a player', async () => {
    await start()
    expect(document.querySelector('main.content')).not.toHaveAttribute('inert')
    expect(document.querySelector('.app-shell')).not.toHaveClass('app-shell--playing')
    expect(topbar()).not.toHaveClass('topbar--hidden')
  })

  describe('actions during playback', () => {
    it('clicking a topbar page during playback closes the player and opens the page', async () => {
      const { api, open } = await start()
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
      await waitFor(() => expect(document.querySelector('.player')).toBeNull())
      expect(api.player.closed).toHaveBeenCalledTimes(1)
      expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'nav', playbackId: 'p1' }))
      expect(await screen.findByRole('heading', { name: 'Podešavanja' })).toBeInTheDocument()
      await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
    })

    it('avatar menu "Profil" during playback closes the player first', async () => {
      const { api, open } = await start()
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Nalog' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Profil' }))
      await waitFor(() => expect(document.querySelector('.player')).toBeNull())
      expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'nav' }))
      expect(await screen.findByRole('heading', { name: 'Profil' })).toBeInTheDocument()
    })

    it('fullscreen toggle from the avatar menu keeps the player open', async () => {
      const { api, open } = await start()
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Nalog' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /ekran/i }))
      expect(api.window.setFullscreen).toHaveBeenCalledWith(true)
      expect(api.player.closed).not.toHaveBeenCalled()
      expect(document.querySelector('.player')).toBeInTheDocument()
    })

    it('palette pill during playback closes the player and opens the palette', async () => {
      const { api, open } = await start()
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Brza pretraga' }))
      await waitFor(() => expect(document.querySelector('.player')).toBeNull())
      expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'nav' }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('a later playback is not closed by an earlier top bar request', async () => {
      const { api, open } = await start()
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
      await waitFor(() => expect(document.querySelector('.player')).toBeNull())
      await open({ ...episode, playbackId: 'p2' })
      await flush()
      expect(document.querySelector('.player')).toBeInTheDocument()
      expect(api.player.closed).toHaveBeenCalledTimes(1)
    })

    it('bell item opening a series during playback closes the player first', async () => {
      const { api, open } = await start({ apiOver: {
        library: { list: vi.fn(async () => [{ id: 'a1', title: 'Show' }]) },
        notifications: { list: vi.fn(async () => ({ items: [{ id: 'n1', animeId: 'a1', title: 'Show', episode: '4', at: new Date().toISOString(), read: false }], unread: 1 })) },
      } })
      await open()
      fireEvent.click(screen.getByRole('button', { name: /Obaveštenja/ }))
      fireEvent.click(await screen.findByRole('button', { name: /Show — EP 4/ }))
      await waitFor(() => expect(document.querySelector('.player')).toBeNull())
      expect(api.player.closed).toHaveBeenCalledTimes(1)
      expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'nav' }))
      await waitFor(() => expect(document.querySelector('.topbar [aria-current="page"]')).toHaveAccessibleName('Watchlist'))
    })

    it('semaphore during playback closes the player and opens the wizard', async () => {
      const { api, open } = await start()
      await open()
      fireEvent.click(screen.getByRole('button', { name: /Sve radi|Provera|Potrebna instalacija|Izvor trenutno|Ažuriranje/ }))
      await waitFor(() => expect(document.querySelector('.player')).toBeNull())
      expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'nav' }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
  })
})
