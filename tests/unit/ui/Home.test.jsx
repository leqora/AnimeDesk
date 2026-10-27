// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { HomePage, pickHeroEntries, watchingNow, pinnedEntries } from '../../../src/renderer/pages/HomePage.jsx'
import { WatchlistPage } from '../../../src/renderer/pages/WatchlistPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'
import { seasonOf } from '../../../src/shared/discover.js'

const entry = (over = {}) => ({ id: 'a', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [1, 2], episodeNotes: {}, lastWatchedAt: '2026-10-01T10:00:00Z', ...over })

describe('home helpers', () => {
  it('picks the most recently watched series', () => {
    const list = [entry({ id: 'a', lastWatchedAt: '2026-09-01T00:00:00Z' }), entry({ id: 'b' }), entry({ id: 'c', status: 'completed', lastWatchedAt: '2026-10-05T00:00:00Z' }), entry({ id: 'd', lastWatchedAt: null })]
    expect(pickHeroEntries(list).map((e) => e.id)).toEqual(['b', 'a'])
    expect(pickHeroEntries([entry({ status: 'planned' })])).toEqual([])
    expect(pickHeroEntries(Array.from({ length: 8 }, (_, i) => entry({ id: `x${i}` })))).toHaveLength(5)
    expect(pickHeroEntries(Array.from({ length: 8 }, (_, i) => entry({ id: `x${i}` })), 2)).toHaveLength(2)
    expect(watchingNow(list).map((e) => e.id)).toEqual(['b', 'a', 'd'])
    expect(watchingNow(Array.from({ length: 14 }, (_, i) => entry({ id: `x${i}` })))).toHaveLength(10)
  })
})

describe('HomePage', () => {
  it('shows hero, the watching-now rail and the search', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry(), entry({ id: 'b', title: 'Other', aniCliTitle: 'Other', lastWatchedAt: '2026-09-01T00:00:00Z' })]) } })
    const onOpenAnime = vi.fn()
    renderUi(<HomePage ready settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={() => {}} onOpenAnime={onOpenAnime} />, { api })
    expect(await screen.findByRole('heading', { name: 'Show' })).toBeInTheDocument()
    const rail = screen.getByRole('region', { name: 'Nastavi gledanje' })
    expect(rail).toHaveClass('rail--wide')
    expect(rail.querySelectorAll('.continue-card')).toHaveLength(2)
    expect(rail.querySelector('.media-card')).toBeNull() // no poster rail with the same title any more
    fireEvent.click(within(rail).getByRole('button', { name: 'Detalji: Other' }))
    expect(onOpenAnime).toHaveBeenCalledWith('b')
    expect(screen.getByRole('button', { name: 'Traži' })).toBeInTheDocument()
  })
})

describe('WatchlistPage animeId', () => {
  it('opens the requested series directly', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry()]) } })
    renderUi(<WatchlistPage ready onContinue={() => {}} animeId="a" />, { api })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nazad' })).toBeInTheDocument())
  })
})

describe('pinned + cards', () => {
  it('orders pinned series by pin time', () => {
    const list = [entry({ id: 'a', pinnedAt: '2026-10-03T02:00:00Z' }), entry({ id: 'b', pinnedAt: null }), entry({ id: 'c', pinnedAt: '2026-10-03T01:00:00Z' }), entry({ id: 'd' })]
    expect(pinnedEntries(list).map((e) => e.id)).toEqual(['c', 'a'])
  })
  it('plays from a continue card', async () => {
    const onContinue = vi.fn()
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry()]) } })
    renderUi(<HomePage ready settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={onContinue} onOpenAnime={() => {}} />, { api })
    const rail = await screen.findByRole('region', { name: 'Nastavi gledanje' })
    expect(rail.querySelector('.continue-card')).not.toBeNull()
    fireEvent.click(rail.querySelector('.continue-card__open'))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '3' })
  })
})

describe('HomePage sections', () => {
  const home = (api) => renderUi(<HomePage ready settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={() => {}} onOpenAnime={() => {}} />, { api })
  it('shows Favorites above Continue watching only when something is pinned', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'p', title: 'Pinned', aniCliTitle: 'Pinned', status: 'planned', pinnedAt: '2026-10-03T00:00:00Z' }), entry()]) } })
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
  it('keeps a pinned series in only one of the neighbouring rails (the continue card wins)', async () => {
    home(makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'p', title: 'Pinned', aniCliTitle: 'Pinned', pinnedAt: '2026-10-03T00:00:00Z' })]) } }))
    await screen.findByRole('region', { name: 'Nastavi gledanje' })
    expect(screen.queryByRole('region', { name: 'Omiljeni' })).not.toBeInTheDocument()
  })
  it('shows the popular banner when nothing is being watched', async () => {
    const items = [{ id: 11, title: 'Fresh One', romaji: 'Fresh Romaji', format: 'TV', status: 'RELEASING', year: 2026, episodes: 12, genres: ['Action'], poster: 'data:image/png;base64,AAAA', entryId: null }]
    const peek = vi.fn(async () => ({ season: seasonOf(Date.now()), items }))
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ status: 'planned' })]) }, discover: { peek } })
    const { container } = home(api)
    expect(await screen.findByRole('heading', { name: 'Fresh One' })).toBeInTheDocument()
    expect(screen.getByText('Popularno ove sezone · #1')).toBeInTheDocument()
    expect(container.querySelector('.home-hero')).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Nastavi gledanje' })).not.toBeInTheDocument()
    expect(document.getElementById('search-input')).not.toBeNull()
  })
  it('does not label a stale season rail as "this season"', async () => {
    const stale = { season: { season: seasonOf(Date.now()).season, year: seasonOf(Date.now()).year - 1 }, items: [{ id: 12, title: 'Old Rail', format: 'TV', genres: [], poster: null, entryId: null }] }
    const api = makeFakeApi({ discover: { peek: vi.fn(async () => stale) }, recommendations: { list: vi.fn(async () => ({ mode: 'trending', hint: false, items: [{ id: 13, title: 'Trending One', format: 'TV', genres: [], poster: null }] })) } })
    home(api)
    expect(await screen.findByText('Popularno sada · #1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trending One', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/Popularno ove sezone/)).not.toBeInTheDocument()
  })
  it('shows the welcome screen when there is nothing popular either', async () => {
    home(makeFakeApi())
    expect(await screen.findByRole('heading', { name: 'Šta gledamo danas?' })).toBeInTheDocument()
  })
  it('freezes the popular list while Home is mounted', async () => {
    let libraryListener = () => {}
    const items = [{ id: 11, title: 'Fresh One', format: 'TV', genres: [], poster: null, entryId: null }]
    const peek = vi.fn(async () => ({ season: seasonOf(Date.now()), items }))
    const api = makeFakeApi({ discover: { peek } })
    api.onLibraryChanged = vi.fn((cb) => { libraryListener = cb; return () => {} })
    home(api)
    await screen.findByRole('heading', { name: 'Fresh One' })
    items[0].entryId = 'now-in-library' // the library changed (e.g. + Watchlist); the slide must stay
    api.library.list.mockResolvedValue([entry({ status: 'planned', title: 'Fresh One' })])
    await act(async () => { libraryListener() })
    expect(screen.getByRole('heading', { name: 'Fresh One' })).toBeInTheDocument()
  })
})
