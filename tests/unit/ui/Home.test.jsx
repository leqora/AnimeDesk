// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { Hero } from '../../../src/renderer/components/Hero.jsx'
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
  it('offers to continue from the saved position', async () => {
    const onContinue = vi.fn()
    const api = makeFakeApi({ positions: { forSeries: vi.fn(async () => ({ 3: { position: 495, duration: 1440 } })) } })
    const { container } = renderUi(<Hero entry={entry()} ready onContinue={onContinue} onDetails={() => {}} onSearch={() => {}} />, { api })
    fireEvent.click(await screen.findByRole('button', { name: /Nastavi EP 3 od 8:15/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '3' })
    expect(container.querySelector('.hero__ep-progress > span').style.getPropertyValue('--ratio')).toBe(String(495 / 1440))
    expect(api.positions.forSeries).toHaveBeenCalledWith('Show')
  })
  it('shows new episodes and when the next one airs, and updates when it airs', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const AT = new Date(2026, 9, 16, 17, 30).getTime()
    vi.setSystemTime(AT - (2 * 24 + 4) * 3600 * 1000)
    try {
      const info = { id: 1, status: 'RELEASING', nextAiring: { episode: 6, airingAt: AT }, poster: null }
      const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info) } })
      renderUi(<Hero entry={entry()} ready onContinue={() => {}} onDetails={() => {}} onSearch={() => {}} />, { api })
      expect(await screen.findByText('EP 6 izlazi za 2 d 4 h · pet 17:30')).toBeInTheDocument()
      expect(screen.getByText('3 nove')).toHaveClass('badge--inline') // aired 5, watched up to 2
      act(() => { vi.advanceTimersByTime((2 * 24 + 4) * 3600 * 1000 + 60_000) })
      expect(screen.queryByText(/izlazi/)).not.toBeInTheDocument()
      expect(screen.getByText('4 nove')).toBeInTheDocument()
      expect(api.episodes.forSeries).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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
    fireEvent.click(rail.querySelectorAll('button.media-card__open')[1])
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
  it('uses media cards in the rails with play but no pin', async () => {
    const onContinue = vi.fn()
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry()]) } })
    renderUi(<HomePage ready settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={onContinue} onOpenAnime={() => {}} />, { api })
    const rail = await screen.findByRole('region', { name: 'Nastavi gledanje' })
    expect(rail.querySelector('.media-card')).not.toBeNull()
    expect(rail.querySelector('.media-card__pin')).toBeNull()
    fireEvent.click(rail.querySelector('.media-card__play'))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '3' })
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
