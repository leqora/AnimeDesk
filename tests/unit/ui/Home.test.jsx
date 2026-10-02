// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { Hero } from '../../../src/renderer/components/Hero.jsx'
import { HomePage, pickHeroEntry, watchingNow } from '../../../src/renderer/pages/HomePage.jsx'
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
    const rail = screen.getByRole('region', { name: 'Gledam sada' })
    fireEvent.click(rail.querySelectorAll('button.card')[1])
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
