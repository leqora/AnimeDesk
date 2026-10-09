// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

vi.mock('hls.js', async () => ({ default: (await import('./fakeHls.js')).FakeHls }))

describe('App', () => {
  it('shows reconnecting between the stalled player and the new one, and back cancels it', async () => {
    let retry, openPlayer
    const api = makeFakeApi({ player: { onRetry: vi.fn((cb) => { retry = cb; return () => {} }), onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
    render(<App api={api} />)
    await waitFor(() => expect(retry).toBeDefined())
    act(() => retry({ title: 'Show', episode: '3', state: 'reconnecting', sessionId: 's2' }))
    expect(screen.getByText('Ponovno povezivanje…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }))
    expect(api.watch.cancel).toHaveBeenCalledWith('s2')
    expect(screen.queryByText('Ponovno povezivanje…')).not.toBeInTheDocument()
    act(() => retry({ title: 'Show', episode: '3', state: 'reconnecting', sessionId: 's3' }))
    act(() => openPlayer({ playbackId: 'p2', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p2/playlist', subtitleUrl: null, resumeAt: 100, autoResume: true, totalEpisodes: 12 }))
    expect(screen.queryByText('Ponovno povezivanje…')).not.toBeInTheDocument()
    expect(document.querySelector('.player')).toBeInTheDocument()
  })
  it('shows a failed recovery with try again', async () => {
    let retry
    const api = makeFakeApi({ player: { onRetry: vi.fn((cb) => { retry = cb; return () => {} }) } })
    render(<App api={api} />)
    await waitFor(() => expect(retry).toBeDefined())
    act(() => retry({ title: 'Show', episode: '3', state: 'failed', error: 'no-sources', sessionId: 's2' }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Epizoda je izašla, ali trenutno nema ispravnih izvora.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(api.player.retryAgain).toHaveBeenCalled()
  })
  it('shows a bilingual error with a retry button instead of a blank window when settings fail to load', async () => {
    const api = makeFakeApi()
    api.settings.get.mockRejectedValueOnce(new Error('disk'))
    render(<App api={api} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Aplikacija nije mogla da se pokrene')
    expect(alert).toHaveTextContent('The app could not start')
    fireEvent.click(screen.getByRole('button', { name: /Pokušaj ponovo/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Podešavanja' })).toBeInTheDocument())
  })
  it('opens the wizard automatically when tools are missing', async () => {
    const api = makeFakeApi({ health: { get: vi.fn(async () => ({ light: 'red', reason: 'missing-tools', missing: ['mpv'] })) } })
    render(<App api={api} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Podešavanje' })).toBeInTheDocument(), { timeout: 3000 })
  })
  it('switches language when settings change and navigates', async () => {
    const api = makeFakeApi()
    render(<App api={api} />)
    await waitFor(() => screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.change(screen.getByLabelText('Jezik'), { target: { value: 'en' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument())
  })
  it('asks whether to mark an episode as watched', async () => {
    let ask
    const api = makeFakeApi({ watch: { onAsk: vi.fn((cb) => { ask = cb; return () => {} }) } })
    render(<App api={api} />)
    await waitFor(() => expect(ask).toBeDefined())
    act(() => ask({ aniCliTitle: 'Show', episode: '5' }))
    expect(screen.getByText('Označi epizodu 5 (Show) kao odgledanu?')).toBeInTheDocument()
  })
  it('queues ask dialogs so no answer is lost', async () => {
    let ask
    const api = makeFakeApi({ watch: { onAsk: vi.fn((cb) => { ask = cb; return () => {} }) } })
    render(<App api={api} />)
    await waitFor(() => expect(ask).toBeDefined())
    act(() => ask({ aniCliTitle: 'Show', episode: '5' }))
    act(() => ask({ aniCliTitle: 'Show', episode: '6' }))
    expect(screen.getByText('Označi epizodu 5 (Show) kao odgledanu?')).toBeInTheDocument()
    expect(screen.queryByText('Označi epizodu 6 (Show) kao odgledanu?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(screen.getByText('Označi epizodu 6 (Show) kao odgledanu?')).toBeInTheDocument())
    expect(api.library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Show', episode: '5' })
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.library.recordWatched).toHaveBeenLastCalledWith({ aniCliTitle: 'Show', episode: '6' })
    expect(api.library.recordWatched).toHaveBeenCalledTimes(2)
  })
  it('warns when the watchlist file was corrupt', async () => {
    const api = makeFakeApi({ library: { wasCorrupt: vi.fn(async () => true) } })
    render(<App api={api} />)
    await waitFor(() => expect(screen.getByText(/bio oštećen/)).toBeInTheDocument())
  })
  it('shows the profile card from stats and opens the profile page', async () => {
    const api = makeFakeApi({ stats: { get: vi.fn(async () => ({ ...EMPTY_STATS, level: 11, title: 'veteran', xp: 3000 })) } })
    api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, profileName: null, systemName: 'nikola' })
    render(<App api={api} />)
    const card = await screen.findByRole('button', { name: /LV 11/ })
    expect(card).toHaveTextContent('N')
    fireEvent.click(card)
    expect(await screen.findByRole('heading', { name: 'nikola' })).toBeInTheDocument()
    expect(api.stats.get.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
  it('does not recompute stats on every page change, only when opening the profile', async () => {
    const api = makeFakeApi()
    render(<App api={api} />)
    await waitFor(() => screen.getByRole('button', { name: 'Podešavanja' }))
    await waitFor(() => expect(api.stats.get).toHaveBeenCalled())
    const before = api.stats.get.mock.calls.length
    for (const name of ['Watchlist', 'Preuzeto', 'Podešavanja', 'Početna']) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    await act(async () => {})
    expect(api.stats.get).toHaveBeenCalledTimes(before)
    fireEvent.click(screen.getByRole('button', { name: 'Profil' }))
    await waitFor(() => expect(api.stats.get).toHaveBeenCalledTimes(before + 1))
  })
  it('Esc leaves fullscreen, but not while a dialog is open', async () => {
    const api = makeFakeApi()
    api.window.getFullscreen.mockResolvedValue(true)
    render(<App api={api} />)
    await screen.findByRole('button', { name: 'Izađi iz celog ekrana (Esc)' })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(api.window.setFullscreen).not.toHaveBeenCalled()
    dialog.remove()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(api.window.setFullscreen).toHaveBeenCalledWith(false)
  })
  it('Esc already handled by a dialog does not leave fullscreen, even when the dialog is gone', async () => {
    const api = makeFakeApi()
    api.window.getFullscreen.mockResolvedValue(true)
    render(<App api={api} />)
    await screen.findByRole('button', { name: 'Izađi iz celog ekrana (Esc)' })
    // A dialog's own Esc handler runs first, closes itself (removed from the DOM) and marks the event as handled.
    const handled = (e) => { if (e.key === 'Escape') e.preventDefault() }
    document.body.addEventListener('keydown', handled)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    document.body.removeEventListener('keydown', handled)
    expect(api.window.setFullscreen).not.toHaveBeenCalled()
  })
  it('registers its Esc listener once, so dialog listeners keep a stable order', async () => {
    let onFs
    const api = makeFakeApi({ window: { onFullscreen: vi.fn((cb) => { onFs = cb; return () => {} }) } })
    const add = vi.spyOn(window, 'addEventListener')
    try {
      render(<App api={api} />)
      await screen.findByRole('button', { name: 'Ceo ekran (F11)' })
      const before = add.mock.calls.filter(([type]) => type === 'keydown').length
      act(() => onFs(true))
      await screen.findByRole('button', { name: 'Izađi iz celog ekrana (Esc)' })
      act(() => onFs(false))
      await screen.findByRole('button', { name: 'Ceo ekran (F11)' })
      expect(add.mock.calls.filter(([type]) => type === 'keydown').length).toBe(before)
      act(() => onFs(true))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(api.window.setFullscreen).toHaveBeenCalledWith(false)
    } finally {
      add.mockRestore()
    }
  })
  it('shows the player over the app and keeps pages mounted', async () => {
    let openPlayer, closePlayer
    const api = makeFakeApi({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }), onClose: vi.fn((cb) => { closePlayer = cb; return () => {} }) } })
    render(<App api={api} />)
    const search = await screen.findByLabelText('Naziv animea…')
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    expect(document.querySelector('.player')).toBeInTheDocument()
    expect(document.querySelector('.app-shell')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.app-shell')).toHaveAttribute('inert')
    expect(search).toBeInTheDocument()
    act(() => closePlayer({ playbackId: 'p1' }))
    expect(document.querySelector('.player')).not.toBeInTheDocument()
    expect(api.player.closed).not.toHaveBeenCalled()
  })
  it('starts the next episode through the normal continue path', async () => {
    let openPlayer
    const api = makeFakeApi({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
    render(<App api={api} />)
    await screen.findByLabelText('Naziv animea…')
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '4' }))
  })
})
