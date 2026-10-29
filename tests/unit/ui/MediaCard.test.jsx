// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { MediaCard, cardLine, isSeriesComplete } from '../../../src/renderer/components/MediaCard.jsx'

const entry = (over = {}) => ({ id: 'a', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [1, 2, 3], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null, ...over })
const card = (props = {}, api = makeFakeApi()) => renderUi(<MediaCard entry={entry()} ready onOpen={vi.fn()} onContinue={vi.fn()} {...props} />, { api })

describe('cardLine', () => {
  it('picks the line under the title', () => {
    expect(cardLine(entry(), { 4: { remaining: 16 } })).toEqual({ key: 'card.remaining', vars: { episode: 4, min: 16 } })
    expect(cardLine(entry(), { 7: { remaining: 3 } })).toEqual({ key: 'card.remaining', vars: { episode: 7, min: 3 } })
    expect(cardLine(entry(), { 2: { remaining: 3 } })).toEqual({ key: 'card.next', vars: { episode: 4 } })
    expect(cardLine(entry({ watchedEpisodes: Array.from({ length: 12 }, (_, i) => i + 1) }), {})).toEqual({ key: 'card.completed', vars: {} })
    expect(cardLine(entry({ status: 'planned', watchedEpisodes: [] }), {})).toBeNull()
    expect(cardLine(entry({ status: 'watching', watchedEpisodes: [] }), {})).toEqual({ key: 'card.next', vars: { episode: 1 } })
  })
  it('only calls a series complete when every episode 1..total is watched', () => {
    expect(isSeriesComplete(entry({ totalEpisodes: 2, watchedEpisodes: [1, 2] }))).toBe(true)
    expect(isSeriesComplete(entry({ totalEpisodes: 2, watchedEpisodes: [1, 3] }))).toBe(false)
    expect(isSeriesComplete(entry({ totalEpisodes: null, watchedEpisodes: [1, 2] }))).toBe(false)
  })
})

describe('MediaCard', () => {
  it('Continue offers the episode after the highest watched, with the same number in the label and click', async () => {
    const onContinue = vi.fn()
    card({ entry: entry({ totalEpisodes: 220, watchedEpisodes: [112] }), onContinue })
    fireEvent.click(await screen.findByRole('button', { name: /Nastavi EP 113/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '113' })
  })
  it('shows progress on the poster and the saved position under the title', async () => {
    const api = makeFakeApi({ positions: { forSeries: vi.fn(async () => ({ 4: { position: 495, duration: 1440 } })) } })
    const { container } = card({}, api)
    expect(await screen.findByText('EP 4 · ostalo 16 min')).toBeInTheDocument()
    expect(api.positions.forSeries).toHaveBeenCalledWith('Show')
    expect(container.querySelector('.media-card')).toHaveAttribute('data-status', 'watching')
    expect(container.querySelector('.badge--progress')).toHaveTextContent('3/12')
    expect(container.querySelector('.media-card__bar').style.getPropertyValue('--ratio')).toBe('0.25')
    expect(container.querySelector('.badge--score')).toBeNull()
    const open = screen.getByRole('button', { name: 'Show — 3/12, Gledam' })
    expect(open).toHaveAccessibleDescription('EP 4 · ostalo 16 min')
  })
  it('continues the next episode without opening, and opens on the poster', () => {
    const onOpen = vi.fn()
    const onContinue = vi.fn()
    card({ onOpen, onContinue })
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi EP 4' }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '4' })
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Show —/ }))
    expect(onOpen).toHaveBeenCalledWith('a')
  })
  it('disables play until ready and handles an unknown total', () => {
    const { container } = card({ ready: false, entry: entry({ totalEpisodes: null }) })
    expect(screen.getByRole('button', { name: 'Nastavi EP 4' })).toBeDisabled()
    expect(container.querySelector('.badge--progress')).toHaveTextContent('3/?')
    expect(container.querySelector('.media-card__bar')).toBeNull()
  })
  it('marks a completed series and offers no play', () => {
    const { container } = card({ entry: entry({ status: 'completed', totalEpisodes: 2, watchedEpisodes: [1, 2] }) })
    expect(container.querySelector('.badge--progress')).toHaveTextContent('✓ 2/2')
    expect(container.querySelector('.media-card')).toHaveAttribute('data-complete', 'true')
    expect(screen.getByText('✓ Završeno')).toBeInTheDocument()
    expect(container.querySelector('.media-card__play')).toBeNull()
  })
  it('treats status completed as finished even when the total is unknown', () => {
    const { container } = card({ entry: entry({ status: 'completed', totalEpisodes: null, watchedEpisodes: Array.from({ length: 12 }, (_, i) => i + 1) }) })
    expect(screen.getByText('✓ Završeno')).toBeInTheDocument()
    expect(screen.queryByText(/Sledeća/)).toBeNull()
    expect(container.querySelector('.media-card__play')).toBeNull()
    expect(container.querySelector('.badge--progress')).toHaveTextContent('12/?')
    expect(container.querySelector('.media-card')).not.toHaveAttribute('data-complete')
  })
  it('shows the score and the pin action only when asked', () => {
    const onTogglePin = vi.fn()
    const e = entry({ rating: 8, pinnedAt: '2026-10-03T00:00:00Z' })
    const { container, unmount } = card({ entry: e, showScore: true, onTogglePin })
    expect(container.querySelector('.badge--score')).toHaveTextContent('★ 8')
    const pin = screen.getByRole('button', { name: 'Ukloni iz omiljenih: Show' })
    expect(pin).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pin)
    expect(onTogglePin).toHaveBeenCalledWith(e)
    unmount()
    const plain = card({ entry: e })
    expect(plain.container.querySelector('.badge--score')).toBeNull()
    expect(screen.queryByRole('button', { name: /omiljen/ })).not.toBeInTheDocument()
  })
  it('never shows an episode title', async () => {
    const api = makeFakeApi({ positions: { forSeries: vi.fn(async () => ({ 4: { position: 495, duration: 1440 } })) } })
    card({}, api)
    await screen.findByText('EP 4 · ostalo 16 min')
    expect(api.episodes.forSeries).not.toHaveBeenCalled()
  })

  const airingInfo = (over = {}) => ({ id: 1, status: 'RELEASING', nextAiring: { episode: 8, airingAt: Date.now() + 3600 * 1000 }, poster: null, ...over })

  it('shows how many episodes aired since the last watched one', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => airingInfo()) } })
    card({}, api) // watched 1–3, episode 8 airs next → 7 aired → 4 new
    expect(await screen.findByText('4 nove')).toHaveClass('badge--new')
    expect(screen.getByRole('button', { name: /^Show — 3\/12, Gledam, 4 nove epizode$/ })).toBeInTheDocument()
    expect(api.anilist.forTitle).toHaveBeenCalledTimes(1)
    expect(api.episodes.forSeries).not.toHaveBeenCalled()
  })
  it('card refreshes after airing', async () => {
    vi.useFakeTimers()
    try {
      const now = Date.now()
      const forTitle = vi.fn()
        .mockResolvedValueOnce(airingInfo({ nextAiring: { episode: 5, airingAt: now - 10 * 60 * 1000 } }))
        .mockResolvedValue(airingInfo({ nextAiring: { episode: 7, airingAt: now + 7 * 24 * 3600 * 1000 } }))
      card({}, makeFakeApi({ anilist: { forTitle } })) // watched 1–3, episode 5 aired → 2 new
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.getByRole('button', { name: /^Show — 3\/12, Gledam, 2 nove epizode$/ })).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(3600 * 1000 + 31_000) })
      expect(forTitle).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: /^Show — 3\/12, Gledam, 3 nove epizode$/ })).toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })
  it('shows no new-episodes badge when nothing has been watched yet', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => airingInfo()) } })
    card({ entry: entry({ status: 'watching', watchedEpisodes: [] }) }, api)
    await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalled())
    await act(async () => {})
    expect(document.querySelector('.badge--new')).toBeNull()
    expect(screen.getByRole('button', { name: /^Show —/ }).getAttribute('aria-label')).not.toMatch(/nov/)
  })
  it('shows no badge for a planned series or a finished show', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => airingInfo()) } })
    card({ entry: entry({ status: 'planned' }) }, api)
    await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByText(/nove|novih|nova/)).not.toBeInTheDocument()

    const api2 = makeFakeApi({ anilist: { forTitle: vi.fn(async () => airingInfo({ status: 'FINISHED', nextAiring: null })) } })
    card({}, api2)
    await waitFor(() => expect(api2.anilist.forTitle).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByText(/nove|novih|nova/)).not.toBeInTheDocument()
  })

  describe('episode count line (not started)', () => {
    const planned = (over = {}) => entry({ status: 'planned', watchedEpisodes: [], totalEpisodes: null, ...over })
    const withInfo = (info) => makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ id: 1, poster: null, ...info })) } })
    const open = () => screen.getByRole('button', { name: /^Show —/ })

    it('shows episodes and duration and describes the open button with them', async () => {
      card({ entry: planned() }, withInfo({ episodes: 12, duration: 24 }))
      const line = await screen.findByText('12 epizoda · 24 min')
      expect(line).toHaveClass('media-card__peek')
      expect(open()).toHaveAccessibleDescription('12 epizoda · 24 min')
    })
    it('uses the plural form and omits a missing duration', async () => {
      const { unmount } = card({ entry: planned() }, withInfo({ episodes: 2 }))
      expect(await screen.findByText('2 epizode')).toBeInTheDocument()
      unmount()
      card({ entry: planned() }, withInfo({ episodes: 12 }))
      expect(await screen.findByText('12 epizoda')).toBeInTheDocument()
    })
    it('reserves an empty line without aria-describedby when there is no count', async () => {
      const api = withInfo({ duration: 24 })
      const { container } = card({ entry: planned() }, api)
      await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalled())
      await act(async () => {})
      const peek = container.querySelector('.media-card__peek')
      expect(peek).not.toBeNull()
      expect(peek).toBeEmptyDOMElement()
      expect(open()).not.toHaveAttribute('aria-describedby')
    })
    it('shows nothing for a close match', async () => {
      const api = withInfo({ episodes: 12, duration: 24, match: 'close' })
      const { container } = card({ entry: planned() }, api)
      await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalled())
      await act(async () => {})
      expect(container.querySelector('.media-card__peek')).toBeEmptyDOMElement()
      expect(open()).not.toHaveAttribute('aria-describedby')
    })
    it('prefers entry.totalEpisodes over the AniList count', async () => {
      card({ entry: planned({ totalEpisodes: 13 }) }, withInfo({ episodes: 12 }))
      expect(await screen.findByText('13 epizoda')).toBeInTheDocument()
    })
    it('keeps the old line and no peek for a started series', async () => {
      const api = withInfo({ episodes: 12, duration: 24 })
      const { container } = card({}, api)
      await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalled())
      await act(async () => {})
      expect(container.querySelector('.media-card__peek')).toBeNull()
      expect(screen.getByText('Sledeća: EP 4')).toBeInTheDocument()
    })
  })
})
