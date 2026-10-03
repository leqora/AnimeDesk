// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { WatchlistPage, sortItems } from '../../../src/renderer/pages/WatchlistPage.jsx'
import { AnimeDetail } from '../../../src/renderer/pages/AnimeDetail.jsx'

const entry = (over = {}) => ({
  id: 'a1', title: 'Frieren', aniCliTitle: 'Frieren', aniListId: null, status: 'watching', rating: null, comment: '',
  totalEpisodes: 4, watchedEpisodes: [1, 2], episodeNotes: { 2: 'lepo' }, lastWatchedAt: null, pinnedAt: null, ...over,
})

describe('sortItems', () => {
  it('sorts by title, rating and last watched', () => {
    const items = [
      { title: 'B', rating: 5, lastWatchedAt: '2026-01-01' },
      { title: 'A', rating: null, lastWatchedAt: null },
      { title: 'C', rating: 9, lastWatchedAt: '2026-05-01' },
    ]
    expect(sortItems(items, 'title').map((i) => i.title)).toEqual(['A', 'B', 'C'])
    expect(sortItems(items, 'rating').map((i) => i.title)).toEqual(['C', 'B', 'A'])
    expect(sortItems(items, 'lastWatched').map((i) => i.title)).toEqual(['C', 'B', 'A'])
  })
})

describe('WatchlistPage', () => {
  it('shows an empty message and adds an anime manually', async () => {
    const { api } = renderUi(<WatchlistPage ready onContinue={() => {}} />)
    await waitFor(() => expect(screen.getByText('Watchlist je prazna.')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Naziv animea'), { target: { value: 'Dandadan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj ručno' }))
    await waitFor(() => expect(api.library.add).toHaveBeenCalledWith({ title: 'Dandadan' }))
  })
  it('filters by status', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry(), entry({ id: 'a2', title: 'Naruto', status: 'dropped' })]) } })
    renderUi(<WatchlistPage ready onContinue={() => {}} />, { api })
    await waitFor(() => screen.getByText('Naruto'))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'dropped' } })
    expect(screen.queryByText('Frieren')).not.toBeInTheDocument()
    expect(screen.getByText('Naruto')).toBeInTheDocument()
  })
  it('pins from the detail page and explains the limit', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Show' })]) } })
    api.library.setPinned.mockResolvedValueOnce({ ok: false, error: 'pin-limit' })
    renderUi(<WatchlistPage ready onContinue={() => {}} initialOpenId="a" />, { api })
    fireEvent.click(await screen.findByRole('button', { name: /Dodaj u omiljene/ }))
    expect(await screen.findByText('Možeš zakačiti najviše 5 serija. Otkači neku pa pokušaj ponovo.')).toBeInTheDocument()
    expect(api.library.setPinned).toHaveBeenCalledWith('a', true)
  })
  it('pins from a watchlist card without opening it', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Show', pinnedAt: '2026-10-03T00:00:00Z' })]) } })
    renderUi(<WatchlistPage ready onContinue={() => {}} />, { api })
    const star = await screen.findByRole('button', { name: 'Ukloni iz omiljenih: Show' })
    expect(star).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(star)
    expect(api.library.setPinned).toHaveBeenCalledWith('a', false)
    expect(screen.queryByRole('button', { name: /Nazad/ })).not.toBeInTheDocument()
  })
  it('pages a long series in the detail page', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Long', totalEpisodes: 1100, watchedEpisodes: [], episodeNotes: {} })]) } })
    renderUi(<WatchlistPage ready onContinue={() => {}} initialOpenId="a" />, { api })
    expect(await screen.findByRole('group', { name: 'Grupe epizoda' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    expect(screen.getByLabelText('Beleška za epizodu 7')).toBeInTheDocument()
  })
})

describe('AnimeDetail', () => {
  const info = { id: 154587, genres: ['Adventure'], year: 2023, episodes: 28, description: 'Tajna radnja', poster: null }

  it('hides the description until the user asks for it', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info) } })
    renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => screen.getByText('Adventure'))
    expect(screen.queryByText('Tajna radnja')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži opis' }))
    expect(screen.getByText('Tajna radnja')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sakrij opis' }))
    expect(screen.queryByText('Tajna radnja')).not.toBeInTheDocument()
  })
  it('links AniList id but keeps a known episode count', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info) } })
    renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { aniListId: 154587 }))
  })
  it('edits rating, status and comment', async () => {
    const onChanged = vi.fn()
    const { api } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={onChanged} onContinue={() => {}} />)
    fireEvent.change(screen.getByLabelText('Ocena'), { target: { value: '8' } })
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { rating: 8 }))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paused' } })
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { status: 'paused' }))
    fireEvent.change(screen.getByLabelText('Komentar'), { target: { value: 'super' } })
    fireEvent.blur(screen.getByLabelText('Komentar'))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { comment: 'super' }))
    expect(onChanged).toHaveBeenCalled()
  })
  it('shows progress, edits episode notes and toggles watched', async () => {
    const { api } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />)
    expect(screen.getByText('Napredak: 2 / 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByLabelText('Beleška za epizodu 2')).toHaveValue('lepo')
    fireEvent.change(screen.getByLabelText('Beleška za epizodu 2'), { target: { value: 'najbolja' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.library.setEpisodeNote).toHaveBeenCalledWith('a1', 2, 'najbolja'))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni oznaku odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { watchedEpisodes: [1] }))
  })
  it('continues with the first unwatched episode and removes after confirmation', async () => {
    const onContinue = vi.fn()
    const onBack = vi.fn()
    const { api } = renderUi(<AnimeDetail entry={entry()} ready onBack={onBack} onChanged={() => {}} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi gledanje' }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Frieren', anime: 'Frieren', episode: '3' })
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(api.library.remove).toHaveBeenCalledWith('a1'))
    expect(onBack).toHaveBeenCalled()
  })
  it('disables continue when components are not ready', () => {
    renderUi(<AnimeDetail entry={entry()} ready={false} onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />)
    expect(screen.getByRole('button', { name: 'Nastavi gledanje' })).toBeDisabled()
  })
  it('shows a banner with the blurred poster', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ ...info, poster: 'data:image/png;base64,AA' })) } })
    const { container } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => expect(container.querySelector('.banner .hero__bg')).not.toBeNull())
    expect(container.querySelector('.banner .hero__bg').style.backgroundImage).toContain('data:image/png;base64,AA')
    expect(within(container.querySelector('.banner')).getByRole('heading', { name: 'Frieren' })).toBeInTheDocument()
  })
})
