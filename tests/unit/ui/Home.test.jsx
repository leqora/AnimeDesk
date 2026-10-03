// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { Hero } from '../../../src/renderer/components/Hero.jsx'
import { SeriesCard } from '../../../src/renderer/components/SeriesCard.jsx'
import { HomePage, pickHeroEntry, watchingNow, pinnedEntries } from '../../../src/renderer/pages/HomePage.jsx'
import { WatchlistPage } from '../../../src/renderer/pages/WatchlistPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const entry = (over = {}) => ({ id: 'a', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [1, 2], episodeNotes: {}, lastWatchedAt: '2026-10-01T10:00:00Z', ...over })

describe('home helpers', () => {
  it('picks the most recently watched series', () => {
    const list = [entry({ id: 'a', lastWatchedAt: '2026-09-01T00:00:00Z' }), entry({ id: 'b' }), entry({ id: 'c', status: 'completed', lastWatchedAt: '2026-10-05T00:00:00Z' }), entry({ id: 'd', lastWatchedAt: null })]
    expect(pickHeroEntry(list).id).toBe('b')
    expect(pickHeroEntry([entry({ status: 'planned' })])).toBeNull()
    expect(watchingNow(list).map((e) => e.id)).toEqual(['b', 'a', 'd'])
    expect(watchingNow(Array.from({ length: 14 }, (_, i) => entry({ id: `x${i}` })))).toHaveLength(10)
  })
})

describe('Hero', () => {
  it('continues with the next episode when ready', () => {
    const onContinue = vi.fn()
    const onDetails = vi.fn()
    const { rerender } = renderUi(<Hero entry={entry()} ready={false} onContinue={onContinue} onDetails={onDetails} onSearch={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
    expect(screen.getByText('EP 2 / 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nastavi EP 3/ })).toBeDisabled()
    rerender(<Hero entry={entry()} ready onContinue={onContinue} onDetails={onDetails} onSearch={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Nastavi EP 3/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '3' })
    fireEvent.click(screen.getByRole('button', { name: /Detalji/ }))
    expect(onDetails).toHaveBeenCalledWith('a')
  })
  it('welcomes a new user and focuses search', () => {
    const onSearch = vi.fn()
    renderUi(<Hero entry={null} ready onContinue={() => {}} onDetails={() => {}} onSearch={onSearch} />)
    expect(screen.getByRole('heading', { name: 'Šta gledamo danas?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pretraži/ }))
    expect(onSearch).toHaveBeenCalled()
  })
})

describe('HomePage', () => {
  it('shows hero, the watching-now rail and the search', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry(), entry({ id: 'b', title: 'Other', aniCliTitle: 'Other', lastWatchedAt: '2026-09-01T00:00:00Z' })]) } })
    const onOpenAnime = vi.fn()
    renderUi(<HomePage ready settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={() => {}} onOpenAnime={onOpenAnime} />, { api })
    expect(await screen.findByRole('heading', { name: 'Show' })).toBeInTheDocument()
    const rail = screen.getByRole('region', { name: 'Nastavi gledanje' })
    fireEvent.click(rail.querySelectorAll('button.series-card__open')[1])
    expect(onOpenAnime).toHaveBeenCalledWith('b')
    expect(screen.getByRole('button', { name: 'Traži' })).toBeInTheDocument()
  })
})

describe('WatchlistPage initialOpenId', () => {
  it('opens the requested series directly', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry()]) } })
    renderUi(<WatchlistPage ready onContinue={() => {}} initialOpenId="a" />, { api })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nazad' })).toBeInTheDocument())
  })
})

describe('pinned + cards', () => {
  it('orders pinned series by pin time', () => {
    const list = [entry({ id: 'a', pinnedAt: '2026-10-03T02:00:00Z' }), entry({ id: 'b', pinnedAt: null }), entry({ id: 'c', pinnedAt: '2026-10-03T01:00:00Z' }), entry({ id: 'd' })]
    expect(pinnedEntries(list).map((e) => e.id)).toEqual(['c', 'a'])
  })
  it('shows progress and continues without opening details', () => {
    const onOpen = vi.fn()
    const onContinue = vi.fn()
    renderUi(<SeriesCard entry={entry({ watchedEpisodes: [1, 2, 3, 4, 5, 6, 7] })} ready onOpen={onOpen} onContinue={onContinue} />)
    expect(screen.getByText('EP 7 / 12')).toBeInTheDocument()
    expect(screen.getByText('58%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi EP 8' }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '8' })
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    expect(onOpen).toHaveBeenCalledWith('a')
  })
  it('hides percent when the total is unknown and disables play until ready', () => {
    renderUi(<SeriesCard entry={entry({ totalEpisodes: null })} ready={false} onOpen={() => {}} onContinue={() => {}} />)
    expect(screen.getByText('EP 2 / ?')).toBeInTheDocument()
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Nastavi EP/ })).toBeDisabled()
  })
})

describe('HomePage sections', () => {
  const home = (api) => renderUi(<HomePage ready settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={() => {}} onOpenAnime={() => {}} />, { api })
  it('shows Favorites above Continue watching only when something is pinned', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'p', title: 'Pinned', aniCliTitle: 'Pinned', pinnedAt: '2026-10-03T00:00:00Z' }), entry()]) } })
    home(api)
    const fav = await screen.findByRole('region', { name: 'Omiljeni' })
    const cont = screen.getByRole('region', { name: 'Nastavi gledanje' })
    expect(fav.compareDocumentPosition(cont) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('has no Favorites section without pins', async () => {
    home(makeFakeApi({ library: { list: vi.fn(async () => [entry()]) } }))
    await screen.findByRole('region', { name: 'Nastavi gledanje' })
    expect(screen.queryByRole('region', { name: 'Omiljeni' })).not.toBeInTheDocument()
  })
  it('shows rail arrows only when the cards overflow', async () => {
    const sw = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
    const cw = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    HTMLElement.prototype.scrollBy = vi.fn()
    home(makeFakeApi({ library: { list: vi.fn(async () => [entry()]) } }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sledeće' }))
    expect(HTMLElement.prototype.scrollBy).toHaveBeenCalledWith({ left: 400, behavior: 'smooth' })
    sw.mockRestore(); cw.mockRestore()
  })
  it('hides hero and rails while choosing an episode', async () => {
    const handlers = {}
    const capture = (name) => vi.fn((cb) => { handlers[name] = cb; return () => {} })
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry()]) }, watch: { onMenu: capture('menu'), onPlaying: capture('playing'), onSessionEnd: capture('end') } })
    home(api)
    await screen.findByRole('region', { name: 'Nastavi gledanje' })
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    expect(screen.queryByRole('region', { name: 'Nastavi gledanje' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Show', level: 1 })).not.toBeInTheDocument()
    act(() => handlers.end({ sessionId: 's1', result: { ok: false, error: 'cancelled' } }))
    expect(await screen.findByRole('region', { name: 'Nastavi gledanje' })).toBeInTheDocument()
  })
})
