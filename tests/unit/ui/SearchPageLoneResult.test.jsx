// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SearchPage } from '../../../src/renderer/pages/SearchPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

// ani-cli picks a lone search result itself: the page sees the episode menu first, and main sends the title later.
function lone() {
  const handlers = {}
  const capture = (name) => vi.fn((cb) => { handlers[name] = cb; return () => {} })
  const api = makeFakeApi({ watch: { onMenu: capture('menu'), onPlaying: capture('playing'), onSessionEnd: capture('end'), onTitle: capture('title') } })
  const props = { ready: true, settings: { ...DEFAULT_SETTINGS, downloadDir: 'D:\Anime' }, onSettings: vi.fn(), onOpenWizard: vi.fn(), pendingWatch: null, onPendingHandled: vi.fn() }
  renderUi(<SearchPage {...props} />, { api })
  fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'lone show' } })
  fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
  act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
  return { api, handlers }
}

describe('SearchPage: lone search result', () => {
  it('focus moves to the picker heading, not body', () => {
    lone()
    expect(document.activeElement).toBe(screen.getByRole('heading'))
  })
  it('does not steal focus from an element that still exists', () => {
    const handlers = {}
    const capture = (name) => vi.fn((cb) => { handlers[name] = cb; return () => {} })
    const api = makeFakeApi({ watch: { onMenu: capture('menu'), onPlaying: capture('playing'), onSessionEnd: capture('end'), onTitle: capture('title') } })
    renderUi(<SearchPage ready settings={{ ...DEFAULT_SETTINGS, downloadDir: 'D:\Anime' }} onSettings={vi.fn()} onOpenWizard={vi.fn()} pendingWatch={null} onPendingHandled={vi.fn()} />, { api })
    const input = screen.getByLabelText('Naziv animea…')
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    // the search bar is hidden once the episode menu shows, so focus an element that survives: the back button appears with the menu
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1'] }))
    const back = screen.getByRole('button', { name: /Nazad/ })
    back.focus()
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2'] }))
    expect(document.activeElement).toBe(back)
  })
  it('waits for the title: no empty heading, add and download disabled, watching still works', async () => {
    const { api } = lone()
    expect(screen.getByRole('heading')).toHaveTextContent('Tražim naslov… — Izaberi epizodu')
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByRole('button', { name: 'Dodaj u watchlist' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Preuzmi izabrane' })).toBeDisabled()
    expect(screen.queryByLabelText('Kvalitet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gledaj' }))
    expect(api.watch.answerMenu).toHaveBeenLastCalledWith('r1', '2')
  })
  it('uses the title main found for the heading, the watchlist and downloads', async () => {
    const { api, handlers } = lone()
    await act(async () => { await handlers.title({ sessionId: 's1', title: 'Lone Show' }) })
    expect(screen.getByRole('heading')).toHaveTextContent('Lone Show — Izaberi epizodu')
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj u watchlist' }))
    await waitFor(() => expect(api.library.add).toHaveBeenCalledWith({ title: 'Lone Show', aniCliTitle: 'Lone Show' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preuzmi izabrane' }))
    await waitFor(() => expect(api.downloads.enqueue).toHaveBeenCalledWith({ title: 'Lone Show', aniCliTitle: 'Lone Show', episodes: ['3'], dir: 'D:\Anime' }))
  })
  it('ignores a title for another session', async () => {
    const { handlers } = lone()
    await act(async () => { await handlers.title({ sessionId: 'old', title: 'Other' }) })
    expect(screen.getByRole('heading')).toHaveTextContent('Tražim naslov…')
  })
  it('shows the search text when the title cannot be found, and keeps add/download off', async () => {
    const { handlers } = lone()
    await act(async () => { await handlers.title({ sessionId: 's1', title: null }) })
    expect(screen.getByRole('heading')).toHaveTextContent('„lone show” — Izaberi epizodu')
    expect(screen.getByRole('button', { name: 'Dodaj u watchlist' })).toBeDisabled()
  })
  it('restarts for the found series when it has saved quality or audio, like picking it in the menu', async () => {
    const { api, handlers } = lone()
    api.seriesPrefs.get.mockResolvedValue({ quality: '720', mode: null, subOffset: { sub: 0, dub: 0 } })
    api.watch.start.mockResolvedValue({ sessionId: 's2' })
    await act(async () => { await handlers.title({ sessionId: 's1', title: 'Lone Show' }) })
    await waitFor(() => expect(api.watch.start).toHaveBeenLastCalledWith({ query: 'Lone Show', anime: 'Lone Show' }))
    expect(api.watch.cancel).toHaveBeenCalledWith('s1')
  })
  it('does not restart once the user already chose an episode', async () => {
    const { api, handlers } = lone()
    api.seriesPrefs.get.mockResolvedValue({ quality: '720', mode: null, subOffset: { sub: 0, dub: 0 } })
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gledaj' }))
    await act(async () => { await handlers.title({ sessionId: 's1', title: 'Lone Show' }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(api.watch.cancel).not.toHaveBeenCalled()
    expect(api.watch.start).toHaveBeenCalledTimes(1)
  })
  it('ignores a late title of the previous search once a new search started', async () => {
    const { api, handlers } = lone()
    fireEvent.click(screen.getByRole('button', { name: /Nazad/ }))
    api.watch.start.mockResolvedValue({ sessionId: 's2' })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'other show' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    await act(async () => { await handlers.title({ sessionId: 's1', title: 'Old Show' }) })
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's2', kind: 'episode', prompt: 'Select episode: ', lines: ['1'] }))
    expect(screen.getByRole('heading')).toHaveTextContent('Tražim naslov…')
  })
})
