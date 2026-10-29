// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, act, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { HomeHero } from '../../../src/renderer/components/HomeHero.jsx'

const entry = (over = {}) => ({ id: 'a', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', totalEpisodes: 12, watchedEpisodes: [1, 2], lastWatchedAt: '2026-10-01T10:00:00Z', ...over })
const INFO = { id: 1, poster: 'data:image/png;base64,AAAA', format: 'TV', year: 2023, episodes: 28, genres: ['Action', 'Adventure', 'Fantasy', 'Drama'], description: 'SECRET DESCRIPTION', match: 'exact' }
const apiWith = (over = {}) => makeFakeApi({ anilist: { forTitle: vi.fn(async () => INFO), ...over.anilist }, ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'anilist')) })
const props = { ready: true, onContinue: () => {}, onDetails: () => {} }

describe('HomeHero', () => {
  it('shows title, meta and continue without description', async () => {
    const onContinue = vi.fn()
    const onDetails = vi.fn()
    const { container } = renderUi(<HomeHero entries={[entry()]} {...props} onContinue={onContinue} onDetails={onDetails} />, { api: apiWith() })
    expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
    expect(await screen.findByText('2023 · TV · 28 ep. · Action · Adventure · Fantasy')).toBeInTheDocument()
    expect(container.textContent).not.toContain('SECRET DESCRIPTION')
    expect(container.querySelector('.home-hero')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Nastavi EP 3/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '3' })
    fireEvent.click(screen.getByRole('button', { name: /Detalji/ }))
    expect(onDetails).toHaveBeenCalledWith('a')
  })
  it('offers the saved position with the time left and a progress bar', async () => {
    const api = apiWith({ positions: { forSeries: vi.fn(async () => ({ 3: { position: 495, duration: 1440 } })) } })
    const { container } = renderUi(<HomeHero entries={[entry()]} {...props} />, { api })
    expect(await screen.findByRole('button', { name: /Nastavi EP 3 od 8:15/ })).toBeInTheDocument()
    expect(container.querySelector('.home-hero__progress > span').style.getPropertyValue('--ratio')).toBe(String(495 / 1440))
    expect(screen.getByText('ostalo 16 min')).toBeInTheDocument()
  })
  it('Continue offers the episode after the highest watched, or the latest started one', async () => {
    const onContinue = vi.fn()
    const a = renderUi(<HomeHero entries={[entry({ totalEpisodes: 220, watchedEpisodes: [112] })]} {...props} onContinue={onContinue} />, { api: apiWith() })
    fireEvent.click(screen.getByRole('button', { name: /Nastavi EP 113/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '113' })
    a.unmount()
    const api = apiWith({ positions: { forSeries: vi.fn(async () => ({ 113: { position: 60, duration: 1440 }, 114: { position: 495, duration: 1440 } })) } })
    renderUi(<HomeHero entries={[entry({ id: 'b', totalEpisodes: 220, watchedEpisodes: [112] })]} {...props} onContinue={onContinue} />, { api })
    fireEvent.click(await screen.findByRole('button', { name: /Nastavi EP 114 od 8:15/ }))
    expect(onContinue).toHaveBeenLastCalledWith({ query: 'Show', anime: 'Show', episode: '114' })
  })
  it('uses the banner when allowed, else the tinted poster', async () => {
    const withBanner = apiWith({ anilist: { banner: vi.fn(async () => 'animedesk-img://banner/ab12') } })
    const a = renderUi(<HomeHero entries={[entry()]} {...props} />, { api: withBanner })
    await waitFor(() => expect(a.container.querySelector('.home-hero__banner')).not.toBeNull())
    expect(a.container.querySelector('.home-hero__banner').style.backgroundImage).toContain('animedesk-img://banner/ab12')
    expect(withBanner.anilist.banner).toHaveBeenCalledWith({ kind: 'series', entryId: 'a', info: 1 })
    a.unmount()
    const none = apiWith()
    const b = renderUi(<HomeHero entries={[entry({ id: 'b', title: 'Other' })]} {...props} />, { api: none })
    await waitFor(() => expect(b.container.querySelector('.hero__bg')).not.toBeNull())
    expect(b.container.querySelector('.home-hero__banner')).toBeNull()
  })
  it('asks for the banner again once the AniList record has arrived', async () => {
    const banner = vi.fn(async (req) => (req.info ? 'animedesk-img://banner/ab12' : null))
    const { container } = renderUi(<HomeHero entries={[entry()]} {...props} />, { api: apiWith({ anilist: { banner } }) })
    await waitFor(() => expect(container.querySelector('.home-hero__banner')).not.toBeNull())
    expect(banner).toHaveBeenCalledWith({ kind: 'series', entryId: 'a', info: null })
    expect(banner).toHaveBeenLastCalledWith({ kind: 'series', entryId: 'a', info: 1 })
  })
  it('has no dots for one series; three series get three dots and a click changes the slide', () => {
    const one = renderUi(<HomeHero entries={[entry()]} {...props} />, { api: apiWith() })
    expect(one.container.querySelector('.home-hero__dots')).toBeNull()
    one.unmount()
    const list = [entry(), entry({ id: 'b', title: 'Second' }), entry({ id: 'c', title: 'Third' })]
    renderUi(<HomeHero entries={list} {...props} />, { api: apiWith() })
    const dots = [1, 2, 3].map((n) => screen.getByRole('button', { name: `Serija ${n} od 3` }))
    expect(dots[0]).toHaveAttribute('aria-current', 'true')
    expect(dots[1]).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Second' })).not.toBeInTheDocument() // inactive slides are hidden from the tree
    fireEvent.click(dots[1])
    expect(screen.getByRole('button', { name: 'Serija 2 od 3' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument()
  })
  describe('rotation', () => {
    // All timers are faked, and every test lets the pending AniList/position promises settle before it advances time.
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })
    const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
    it('rotates after 8 s', async () => {
      renderUi(<HomeHero entries={[entry(), entry({ id: 'b', title: 'Second' })]} {...props} />, { api: apiWith() })
      await settle()
      await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument()
    })
    it('focus inside pauses rotation and focus stays', async () => {
      renderUi(<HomeHero entries={[entry(), entry({ id: 'b', title: 'Second' })]} {...props} />, { api: apiWith() })
      await settle()
      const details = screen.getByRole('button', { name: /Detalji/ })
      act(() => details.focus())
      expect(document.activeElement).toBe(details)
      await act(async () => { await vi.advanceTimersByTimeAsync(8000 * 3) })
      expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
      expect(document.activeElement).toBe(details)
    })
    it('does not rotate when animations are off from the first render', async () => {
      renderUi(<HomeHero entries={[entry(), entry({ id: 'b', title: 'Second' })]} {...props} reduced />, { api: apiWith() })
      await settle()
      await act(async () => { await vi.advanceTimersByTimeAsync(8000 * 3) })
      expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
    })
    it('keeps focus and the focused slide when the entries are reordered', async () => {
      const a = entry()
      const b = entry({ id: 'b', title: 'Second' })
      const { rerender } = renderUi(<HomeHero entries={[a, b]} {...props} />, { api: apiWith() })
      await settle()
      const details = screen.getByRole('button', { name: /Detalji/ })
      act(() => details.focus())
      rerender(<HomeHero entries={[b, a]} {...props} />)
      expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Detalji/ })).toBe(details)
      expect(document.activeElement).toBe(details)
      await act(async () => { await vi.advanceTimersByTimeAsync(8000 * 2) })
      expect(document.activeElement).toBe(details)
      act(() => details.blur())
      expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument() // the held series stays shown after the hold ends
    })
    it('hover pauses too', async () => {
      const { container } = renderUi(<HomeHero entries={[entry(), entry({ id: 'b', title: 'Second' })]} {...props} />, { api: apiWith() })
      await settle()
      fireEvent.mouseEnter(container.querySelector('.home-hero'))
      await act(async () => { await vi.advanceTimersByTimeAsync(8000 * 2) })
      expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
      fireEvent.mouseLeave(container.querySelector('.home-hero'))
      await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
      expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument()
    })
  })
})
