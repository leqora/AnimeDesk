// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SearchPage } from '../../../src/renderer/pages/SearchPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

function withEvents() {
  const handlers = {}
  const capture = (name) => vi.fn((cb) => { handlers[name] = cb; return () => {} })
  const api = makeFakeApi({ watch: { onMenu: capture('menu'), onPlaying: capture('playing'), onSessionEnd: capture('end') } })
  return { api, handlers }
}
const props = (over = {}) => ({ ready: true, settings: { ...DEFAULT_SETTINGS }, onSettings: vi.fn(), onOpenWizard: vi.fn(), pendingWatch: null, onPendingHandled: vi.fn(), ...over })

describe('SearchPage', () => {
  it('is blocked until components are ready', () => {
    const p = props({ ready: false })
    renderUi(<SearchPage {...p} />)
    expect(screen.getByRole('button', { name: 'Traži' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Potrebno je instalirati komponente')
    fireEvent.click(screen.getByRole('button', { name: 'Otvori instalaciju' }))
    expect(p.onOpenWizard).toHaveBeenCalled()
  })

  it('walks search → anime → episode → watch', async () => {
    const { api, handlers } = withEvents()
    renderUi(<SearchPage {...props()} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'frieren' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    expect(api.watch.start).toHaveBeenCalledWith({ query: 'frieren' })

    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Frieren', '2 Frieren Specials'] }))
    fireEvent.click(screen.getByRole('button', { name: /Frieren Specials/ }))
    expect(api.watch.answerMenu).toHaveBeenCalledWith('r1', '2 Frieren Specials')

    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
    expect(screen.getByRole('heading', { name: /Frieren Specials/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gledaj' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gledaj' }))
    expect(api.watch.answerMenu).toHaveBeenLastCalledWith('r2', '2')

    act(() => handlers.playing({ title: 'Frieren Specials', episode: '2' }))
    expect(screen.getByText('Pušta se: Frieren Specials — epizoda 2')).toBeInTheDocument()
    act(() => handlers.end({ sessionId: 's1', result: { ok: true, error: null } }))
    expect(screen.getByRole('button', { name: 'Traži' })).toBeEnabled()
  })

  it('downloads selected episodes, asking for a folder and remembering it', async () => {
    const { api, handlers } = withEvents()
    api.dialog.pickFolder.mockResolvedValue('D:\\Anime')
    const p = props()
    renderUi(<SearchPage {...p} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByLabelText('Zapamti ovaj folder'))
    fireEvent.click(screen.getByRole('button', { name: 'Preuzmi izabrane' }))
    await waitFor(() => expect(api.downloads.enqueue).toHaveBeenCalledWith({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '3'], dir: 'D:\\Anime' }))
    expect(p.onSettings).toHaveBeenCalledWith({ downloadDir: 'D:\\Anime' })
    expect(api.watch.answerMenu).toHaveBeenLastCalledWith('r2', null)
    expect(screen.getByText('Dodato u red za preuzimanje: 2')).toBeInTheDocument()
  })

  it('shows a translated error with details', async () => {
    const { api, handlers } = withEvents()
    renderUi(<SearchPage {...props()} />, { api })
    act(() => handlers.end({ sessionId: 's1', result: { ok: false, error: 'no-results', stderr: 'No results found!' } }))
    expect(screen.getByRole('alert')).toHaveTextContent('Nema rezultata.')
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži detalje' }))
    expect(screen.getByText('No results found!')).toBeInTheDocument()
  })

  it('starts a pending "continue watching" request once ready', async () => {
    const p = props({ pendingWatch: { query: 'Show', anime: 'Show', episode: '4' } })
    const { api } = renderUi(<SearchPage {...p} />)
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '4' }))
    expect(p.onPendingHandled).toHaveBeenCalled()
  })

  it('cancels a session waiting on a menu when the user leaves the page', async () => {
    const { api, handlers } = withEvents()
    const { unmount } = renderUi(<SearchPage {...props()} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalled())
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    unmount()
    expect(api.watch.cancel).toHaveBeenCalledWith('s1')
  })

  it('does not cancel while an episode is playing', async () => {
    const { api, handlers } = withEvents()
    const { unmount } = renderUi(<SearchPage {...props()} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalled())
    act(() => handlers.playing({ title: 'Show', episode: '1' }))
    unmount()
    expect(api.watch.cancel).not.toHaveBeenCalled()
  })

  it('marks already watched episodes', async () => {
    const { api, handlers } = withEvents()
    api.library.list.mockResolvedValue([{ id: 'a', title: 'Show', aniCliTitle: 'Show', watchedEpisodes: [1] }])
    renderUi(<SearchPage {...props()} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'show' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2'] }))
    await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toHaveClass('ep--watched'))
    expect(screen.getByRole('button', { name: '2' })).not.toHaveClass('ep--watched')
  })
})
