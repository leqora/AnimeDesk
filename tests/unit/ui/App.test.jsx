// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

vi.mock('hls.js', async () => ({ default: (await import('./fakeHls.js')).FakeHls }))

describe('App', () => {
  it('notices sit in .content__notices, the first child of main', async () => {
    const api = makeFakeApi({ library: { wasCorrupt: vi.fn(async () => true) } })
    render(<App api={api} />)
    const warn = await screen.findByText(/bio oštećen/)
    const main = document.querySelector('main.content')
    expect(main.firstElementChild).toHaveClass('content__notices')
    expect(main.firstElementChild).toContainElement(warn)
    expect(main.querySelector('.page-enter')).not.toContainElement(warn)
  })
  it('moves focus to main after a page is chosen from the avatar menu, also for the current page', async () => {
    render(<App api={makeFakeApi()} />)
    const avatar = await screen.findByRole('button', { name: 'Nalog' })
    avatar.focus()
    fireEvent.keyDown(avatar, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profil' }))
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
    fireEvent.click(screen.getByRole('button', { name: 'Nalog' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profil' }))
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
  })
  it('moves focus to main after a page is chosen from the narrow Menu', async () => {
    window.matchMedia = vi.fn((query) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      render(<App api={makeFakeApi()} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Meni' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Watchlist' }))
      await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
    } finally { delete window.matchMedia }
  })
  it('app-shell data-at-top follows scroll', async () => {
    render(<App api={makeFakeApi()} />)
    await screen.findByRole('button', { name: 'Nalog' })
    const shell = document.querySelector('.app-shell')
    const main = document.querySelector('main.content')
    expect(shell).toHaveAttribute('data-at-top', 'true')
    main.scrollTop = 120
    fireEvent.scroll(main)
    expect(shell).toHaveAttribute('data-at-top', 'false')
    main.scrollTop = 0
    fireEvent.scroll(main)
    expect(shell).toHaveAttribute('data-at-top', 'true')
  })
  it('opens the Discover page from the menu', async () => {
    const api = makeFakeApi()
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Otkrij' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Otkrij' })).toBeInTheDocument()
    expect(api.discover.list).toHaveBeenCalled()
  })
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
  describe('playback speed across playbacks', () => {
    const ep = (id, episode) => ({ playbackId: id, title: 'Show', episode, kind: 'hls', src: `http://127.0.0.1:9/s/t/${id}/playlist`, subtitleUrl: null, resumeAt: null, totalEpisodes: 12 })
    const start = async () => {
      let retry, openPlayer, closePlayer
      const api = makeFakeApi({ player: {
        onRetry: vi.fn((cb) => { retry = cb; return () => {} }),
        onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }),
        onClose: vi.fn((cb) => { closePlayer = cb; return () => {} }),
      } })
      render(<App api={api} />)
      await waitFor(() => expect(openPlayer).toBeDefined())
      return {
        // PlayerView is lazy: under a loaded full-suite run its first import can take longer than the default 1 s
        open: async (p) => { act(() => openPlayer(p)); await screen.findByRole('button', { name: 'Podešavanja plejera' }, { timeout: 5000 }) },
        close: () => act(() => closePlayer({})),
        retry: (episode) => act(() => retry({ title: 'Show', episode, state: 'reconnecting', sessionId: 's2' })),
      }
    }
    // The shortcut handler is attached by an effect after the lazy player mounts; press `]` until the speed flash proves it was handled.
    const speedUp = () => waitFor(() => {
      fireEvent.keyDown(window, { key: ']', code: 'BracketRight' })
      expect(screen.getByText(/(Brzina|Speed): 1[.,]25×/)).toBeInTheDocument()
    }, { timeout: 5000 })
    const pressedRate = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Podešavanja plejera' }))
      const pressed = within(screen.getByRole('dialog')).getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true')
      return pressed.textContent
    }
    it('keeps the speed when the same episode reconnects after a stall', async () => {
      const s = await start()
      await s.open(ep('p1', '3'))
      await speedUp()
      s.close()
      s.retry('3')
      await s.open(ep('p2', '3'))
      expect(pressedRate()).toBe('1,25×')
    })
    it('starts a different episode, or the same one opened again normally, at 1×', async () => {
      const s = await start()
      await s.open(ep('p1', '3'))
      await speedUp()
      s.close()
      await s.open(ep('p2', '4'))
      expect(pressedRate()).toBe('1×')
      s.close()
      await s.open(ep('p3', '3'))
      expect(pressedRate()).toBe('1×')
      s.close()
      s.retry('3')
      await s.open(ep('p4', '3'))
      expect(pressedRate()).toBe('1×')
    })
    it('does not carry the speed into a reconnect of another episode', async () => {
      const s = await start()
      await s.open(ep('p1', '3'))
      await speedUp()
      s.close()
      s.retry('4')
      await s.open(ep('p2', '4'))
      expect(pressedRate()).toBe('1×')
    })
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
  it('after import Settings remounts with the new values and stats are re-read', async () => {
    const imported = { ...DEFAULT_SETTINGS, watchedThreshold: 77, profileName: 'Uvezeno' }
    const api = makeFakeApi({
      data: {
        importPick: vi.fn(async () => ({ ok: true, preview: { token: 't', createdAt: null, appVersion: null, series: 1, logEntries: 2, skipped: 0, current: { series: 0, logEntries: 0 } } })),
        importApply: vi.fn(async () => ({ ok: true, settings: imported })),
      },
    })
    render(<App api={api} />)
    await waitFor(() => screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    expect(screen.getByLabelText('Epizoda je odgledana posle (%)')).toHaveValue(DEFAULT_SETTINGS.watchedThreshold)
    const statsCalls = api.stats.get.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Zameni podatke' }))
    await waitFor(() => expect(screen.getByLabelText('Epizoda je odgledana posle (%)')).toHaveValue(77))
    expect(screen.getByLabelText('Ime na profilu')).toHaveValue('Uvezeno')
    expect(api.stats.get.mock.calls.length).toBeGreaterThan(statsCalls)
  })
  it('after a successful import the corrupt banner disappears and focus lands on Uvezi', async () => {
    const api = makeFakeApi({
      library: { wasCorrupt: vi.fn(async () => true) },
      data: {
        importPick: vi.fn(async () => ({ ok: true, preview: { token: 't', createdAt: null, appVersion: null, series: 1, logEntries: 2, skipped: 0, current: { series: 0, logEntries: 0 } } })),
        importApply: vi.fn(async () => ({ ok: true, settings: DEFAULT_SETTINGS })),
      },
    })
    render(<App api={api} />)
    await waitFor(() => expect(screen.getByText(/bio oštećen/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Zameni podatke' }))
    await waitFor(() => expect(screen.queryByText(/bio oštećen/)).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Uvezi' })).toHaveFocus())
  })
  it('a failing stats refresh after import does not break the app', async () => {
    const api = makeFakeApi({
      data: {
        importPick: vi.fn(async () => ({ ok: true, preview: { token: 't', createdAt: null, appVersion: null, series: 1, logEntries: 2, skipped: 0, current: { series: 0, logEntries: 0 } } })),
        importApply: vi.fn(async () => ({ ok: true, settings: DEFAULT_SETTINGS })),
      },
    })
    render(<App api={api} />)
    await waitFor(() => screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    api.stats.get.mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Zameni podatke' }))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
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
    const avatar = await screen.findByRole('button', { name: 'Nalog' })
    expect(avatar).toHaveTextContent('N')
    fireEvent.click(avatar)
    expect(screen.getByText('LV 11')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profil' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Nalog' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profil' }))
    await waitFor(() => expect(api.stats.get).toHaveBeenCalledTimes(before + 1))
  })
  it('Esc leaves fullscreen, but not while a dialog is open', async () => {
    const api = makeFakeApi()
    api.window.getFullscreen.mockResolvedValue(true)
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nalog' }))
    await screen.findByRole('menuitem', { name: 'Izađi iz celog ekrana (Esc)' })
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
    fireEvent.click(await screen.findByRole('button', { name: 'Nalog' }))
    await screen.findByRole('menuitem', { name: 'Izađi iz celog ekrana (Esc)' })
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
    const remove = vi.spyOn(window, 'removeEventListener')
    const keydown = (spy) => spy.mock.calls.filter(([type]) => type === 'keydown').map(([, fn]) => fn)
    try {
      render(<App api={api} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Nalog' }))
      await screen.findByRole('menuitem', { name: 'Ceo ekran (F11)' })
      // Only the listeners that exist before the toggles matter; listeners other components add later (under load) must not fail this test.
      const registered = keydown(add)
      expect(registered.length).toBeGreaterThan(0)
      remove.mockClear()
      act(() => onFs(true))
      await screen.findByRole('menuitem', { name: 'Izađi iz celog ekrana (Esc)' })
      act(() => onFs(false))
      await screen.findByRole('menuitem', { name: 'Ceo ekran (F11)' })
      const removed = keydown(remove)
      expect(registered.filter((fn) => removed.includes(fn))).toEqual([])
      act(() => onFs(true))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(api.window.setFullscreen).toHaveBeenCalledWith(false)
    } finally {
      add.mockRestore()
      remove.mockRestore()
    }
  })
  it('shows the player over the app and keeps pages mounted', async () => {
    let openPlayer, closePlayer
    const api = makeFakeApi({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }), onClose: vi.fn((cb) => { closePlayer = cb; return () => {} }) } })
    render(<App api={api} />)
    const search = await screen.findByLabelText('Naziv animea…')
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    expect(document.querySelector('.player')).toBeInTheDocument()
    expect(document.querySelector('main.content')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('main.content')).toHaveAttribute('inert')
    expect(search).toBeInTheDocument()
    act(() => closePlayer({ playbackId: 'p1' }))
    expect(document.querySelector('.player')).not.toBeInTheDocument()
    expect(api.player.closed).not.toHaveBeenCalled()
  })
  it('closes the bell panel when playback starts', async () => {
    let openPlayer
    const api = makeFakeApi({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: /Obaveštenja/ }))
    expect(await screen.findByRole('dialog', { name: 'Obaveštenja' })).toBeInTheDocument()
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    expect(document.querySelector('.player')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Obaveštenja' })).toBeNull()
  })
  it('starts the next episode through the normal continue path', async () => {
    let openPlayer
    const api = makeFakeApi({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
    render(<App api={api} />)
    await screen.findByLabelText('Naziv animea…')
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sledeća epizoda' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '4' }))
  })
  it('searchAnime from a card lands on Home with the query and runs the search', async () => {
    const rec = { id: 5, title: 'Rec Show', romaji: 'Rec Romaji', format: 'TV', status: 'FINISHED', year: 2020, episodes: 12, genres: [], poster: null, fromTitle: 'X', fromId: 1 }
    const api = makeFakeApi({ recommendations: { list: vi.fn(async () => ({ mode: 'personal', hint: false, items: [rec] })) } })
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Potraži Rec Show' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Rec Romaji' }))
    expect(document.getElementById('search-input').value).toBe('Rec Romaji')
  })
  it('shows the external mpv bar first in .content__notices (first in main.content) and refocuses main when it disappears', async () => {
    let push
    const upd = { status: 'ready', currentVersion: '0.3.0', version: '0.3.1', percent: null, notes: null, lastCheckedAt: null, error: null }
    const api = makeFakeApi({
      externalPlayer: { state: vi.fn(async () => ({ id: 'a', title: 'Frieren', episode: '1' })), onChange: vi.fn((cb) => { push = cb; return () => {} }) },
      update: { getState: vi.fn(async () => upd) },
    })
    const { container } = render(<App api={api} sound={{ play: vi.fn() }} />)
    const region = await screen.findByRole('region', { name: 'Spoljni plejer' })
    await screen.findByText('Verzija 0.3.1 je spremna')
    const main = container.querySelector('main.content')
    expect(main.firstElementChild).toHaveClass('content__notices')
    expect(main.firstElementChild.firstElementChild).toBe(region)
    expect(region.nextElementSibling).toHaveClass('update-banner')
    screen.getByRole('button', { name: 'Zaustavi' }).focus()
    await act(async () => {})
    act(() => push(null))
    await waitFor(() => expect(document.activeElement).toBe(main))
  })
})
