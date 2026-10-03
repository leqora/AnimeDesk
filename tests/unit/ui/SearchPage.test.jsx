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
    await waitFor(() => expect(api.watch.answerMenu).toHaveBeenCalledWith('r1', '2 Frieren Specials'))

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
    await waitFor(() => expect(api.watch.answerMenu).toHaveBeenCalledWith('r1', '1 Show'))
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
    await waitFor(() => expect(api.watch.answerMenu).toHaveBeenCalledWith('r1', '1 Show'))
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2'] }))
    await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toHaveClass('ep--watched'))
    expect(screen.getByRole('button', { name: '2' })).not.toHaveClass('ep--watched')
  })

  const toEpisodes = async (api, handlers, lines = ['1', '2', '3']) => {
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    await waitFor(() => expect(api.watch.answerMenu).toHaveBeenCalledWith('r1', '1 Show'))
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines }))
  }
  const search = (q = 'show') => {
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: q } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
  }

  it('reports focus and hides the search form while choosing', () => {
    const { api, handlers } = withEvents()
    const onFocusChange = vi.fn()
    renderUi(<SearchPage {...props({ onFocusChange })} />, { api })
    search()
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    expect(onFocusChange).toHaveBeenLastCalledWith(true)
    expect(screen.queryByLabelText('Naziv animea…')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Nazad/ }))
    expect(api.watch.answerMenu).toHaveBeenLastCalledWith('r1', null)
    expect(onFocusChange).toHaveBeenLastCalledWith(false)
  })

  it('stays focused while busy after an anime was picked', async () => {
    const { api, handlers } = withEvents()
    const onFocusChange = vi.fn()
    renderUi(<SearchPage {...props({ onFocusChange })} />, { api })
    search()
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    await waitFor(() => expect(api.watch.answerMenu).toHaveBeenCalledWith('r1', '1 Show'))
    expect(onFocusChange).toHaveBeenLastCalledWith(true)
    expect(screen.queryByLabelText('Naziv animea…')).not.toBeInTheDocument()
    act(() => handlers.end({ sessionId: 's1', result: { ok: false, error: 'cancelled' } }))
    expect(onFocusChange).toHaveBeenLastCalledWith(false)
  })

  it('pages long episode lists', async () => {
    const { api, handlers } = withEvents()
    renderUi(<SearchPage {...props()} />, { api })
    search()
    await toEpisodes(api, handlers, Array.from({ length: 250 }, (_, i) => String(i + 1)))
    expect(screen.getByRole('group', { name: 'Grupe epizoda' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(100)
  })

  it('loads and saves series prefs; changing mode restarts the session and ignores the old one', async () => {
    const { api, handlers } = withEvents()
    api.seriesPrefs.get.mockResolvedValue({ quality: null, mode: null })
    api.watch.start.mockResolvedValueOnce({ sessionId: 's1' }).mockResolvedValueOnce({ sessionId: 's2' })
    renderUi(<SearchPage {...props()} />, { api })
    search()
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledTimes(1))
    await toEpisodes(api, handlers)
    await waitFor(() => expect(api.seriesPrefs.get).toHaveBeenCalledWith('Show'))
    fireEvent.change(screen.getByLabelText('Kvalitet'), { target: { value: '720' } })
    await waitFor(() => expect(api.seriesPrefs.set).toHaveBeenCalledWith('Show', { quality: '720' }))
    expect(api.watch.cancel).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Režim'), { target: { value: 'dub' } })
    await waitFor(() => expect(api.watch.cancel).toHaveBeenCalledWith('s1'))
    expect(api.watch.start).toHaveBeenLastCalledWith({ query: 'Show', anime: 'Show' })
    act(() => handlers.end({ sessionId: 's1', result: { ok: false, error: 'cancelled' } }))
    expect(screen.getByText('Pretraga…')).toBeInTheDocument()
    act(() => handlers.menu({ requestId: 'r3', sessionId: 's2', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2'] }))
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
  })

  it('restarts with the picked title when it has saved prefs, ignoring the old session', async () => {
    const { api, handlers } = withEvents()
    api.seriesPrefs.get.mockImplementation(async (title) => (title === 'Show' ? { quality: null, mode: 'dub' } : { quality: null, mode: null }))
    api.watch.start.mockResolvedValueOnce({ sessionId: 's1', mode: 'sub' }).mockResolvedValueOnce({ sessionId: 's2', mode: 'dub' })
    renderUi(<SearchPage {...props()} />, { api })
    search('show')
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledTimes(1))
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    await waitFor(() => expect(api.watch.cancel).toHaveBeenCalledWith('s1'))
    expect(api.watch.start).toHaveBeenLastCalledWith({ query: 'Show', anime: 'Show' })
    expect(api.watch.answerMenu).not.toHaveBeenCalled()
    // Late events of the cancelled session are dropped.
    act(() => handlers.menu({ requestId: 'rx', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    expect(screen.queryByRole('heading', { name: 'Izaberi anime' })).not.toBeInTheDocument()
    expect(screen.getByText('Pretraga…')).toBeInTheDocument()
    act(() => handlers.end({ sessionId: 's1', result: { ok: false, error: 'cancelled' } }))
    expect(screen.getByText('Pretraga…')).toBeInTheDocument()
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledTimes(2))
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's2', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2'] }))
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
  })

  it('does not restart when the new mode equals the one the session was started with', async () => {
    const { api, handlers } = withEvents()
    // The running session already plays dub (resolved by the main process) although the page shows "default".
    api.watch.start.mockResolvedValueOnce({ sessionId: 's1', mode: 'dub' })
    renderUi(<SearchPage {...props()} />, { api })
    search()
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledTimes(1))
    await toEpisodes(api, handlers)
    await waitFor(() => expect(api.seriesPrefs.get).toHaveBeenCalledWith('Show'))
    fireEvent.change(screen.getByLabelText('Režim'), { target: { value: 'dub' } })
    await waitFor(() => expect(api.seriesPrefs.set).toHaveBeenCalledWith('Show', { mode: 'dub' }))
    await act(async () => {})
    expect(api.watch.cancel).not.toHaveBeenCalled()
    expect(api.watch.start).toHaveBeenCalledTimes(1)
  })

  it('offers to play subtitled when the episode has no dub', async () => {
    const { api, handlers } = withEvents()
    renderUi(<SearchPage {...props()} />, { api })
    search()
    await toEpisodes(api, handlers)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gledaj' }))
    act(() => handlers.end({ sessionId: 's1', result: { ok: false, error: 'no-dub', stderr: 'No sources found for dub!' } }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ova epizoda nema dub.')
    fireEvent.click(screen.getByRole('button', { name: 'Pusti sa titlom' }))
    expect(api.watch.start).toHaveBeenLastCalledWith({ query: 'Show', anime: 'Show', episode: '2', mode: 'sub' })
  })
})
