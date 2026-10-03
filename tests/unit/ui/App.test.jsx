// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

describe('App', () => {
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
})
