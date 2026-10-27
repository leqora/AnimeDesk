// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { ContinueCard } from '../../../src/renderer/components/ContinueCard.jsx'

const entry = (over = {}) => ({ id: 'a', title: 'Show', aniCliTitle: 'Show CLI', aniListId: 7, status: 'watching', totalEpisodes: 12, watchedEpisodes: [1, 2, 3, 4], pinnedAt: null, ...over })
const POSTER = 'data:image/png;base64,POSTER'
const THUMB = 'data:image/jpeg;base64,THUMB'
const apiWith = (over = {}) => makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ id: 7, poster: POSTER, duration: 24 })), banner: vi.fn(async () => null), ...over.anilist }, ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'anilist')) })
const cb = { ready: true, onContinue: () => {}, onOpen: () => {} }

describe('ContinueCard', () => {
  it('image order: episode thumb, then banner, then tinted poster', async () => {
    const withThumb = apiWith({ episodes: { thumb: vi.fn(async () => THUMB) } })
    const a = renderUi(<ContinueCard entry={entry()} {...cb} />, { api: withThumb })
    await waitFor(() => expect(a.container.querySelector('.continue-card__img')).toHaveAttribute('src', THUMB))
    expect(withThumb.episodes.thumb).toHaveBeenCalledWith({ title: 'Show CLI', aniListId: 7, episode: 5 })
    expect(withThumb.anilist.banner).not.toHaveBeenCalled()
    a.unmount()

    const withBanner = apiWith({ episodes: { thumb: vi.fn(async () => null) }, anilist: { banner: vi.fn(async () => 'animedesk-img://banner/ab12') } })
    const b = renderUi(<ContinueCard entry={entry({ id: 'b' })} {...cb} />, { api: withBanner })
    await waitFor(() => expect(b.container.querySelector('.continue-card__img')).toHaveAttribute('src', 'animedesk-img://banner/ab12'))
    expect(withBanner.anilist.banner).toHaveBeenCalledWith({ kind: 'series', entryId: 'b' })
    b.unmount()

    const poster = apiWith({ episodes: { thumb: vi.fn(async () => null) } })
    const c = renderUi(<ContinueCard entry={entry({ id: 'c' })} {...cb} />, { api: poster })
    await waitFor(() => expect(c.container.querySelector('.continue-card__poster')).not.toBeNull())
    expect(c.container.querySelector('.continue-card__img')).toBeNull()
  })
  it('text: with the saved position and without, never an episode title', async () => {
    const saved = apiWith({ positions: { forSeries: vi.fn(async () => ({ 5: { position: 720, duration: 1440 } })) } })
    const a = renderUi(<ContinueCard entry={entry()} {...cb} />, { api: saved })
    expect(await screen.findByText('Epizoda 5 · ostalo 12 min')).toBeInTheDocument()
    expect(screen.getByText('Show')).toBeInTheDocument()
    a.unmount()
    renderUi(<ContinueCard entry={entry()} {...cb} />, { api: apiWith() })
    expect(screen.getByText('Epizoda 5')).toBeInTheDocument()
  })
  it('click plays, small buttons open details and pin', () => {
    const onContinue = vi.fn()
    const onOpen = vi.fn()
    const api = apiWith()
    renderUi(<ContinueCard entry={entry()} ready onContinue={onContinue} onOpen={onOpen} />, { api })
    fireEvent.click(screen.getByRole('button', { name: /Nastavi EP 5/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show CLI', anime: 'Show CLI', episode: '5' })
    fireEvent.click(screen.getByRole('button', { name: /Detalji/ }))
    expect(onOpen).toHaveBeenCalledWith('a')
    fireEvent.click(screen.getByRole('button', { name: /Dodaj u omiljene/ }))
    expect(api.library.setPinned).toHaveBeenCalledWith('a', true)
  })
  it('real Tab order: card, details, pin', async () => {
    const user = userEvent.setup()
    renderUi(<ContinueCard entry={entry()} {...cb} />, { api: apiWith() })
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Nastavi EP 5/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Detalji/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Dodaj u omiljene/ }))
  })
  it('warns when the favorites limit is reached and unpins a pinned series', async () => {
    const api = apiWith({ library: { setPinned: vi.fn(async () => ({ ok: false })) } })
    const a = renderUi(<ContinueCard entry={entry()} {...cb} />, { api })
    fireEvent.click(screen.getByRole('button', { name: /Dodaj u omiljene/ }))
    expect(await screen.findByText(/najviše 5 serija/)).toBeInTheDocument()
    a.unmount()
    const api2 = apiWith()
    renderUi(<ContinueCard entry={entry({ pinnedAt: 'x' })} {...cb} />, { api: api2 })
    fireEvent.click(screen.getByRole('button', { name: /Ukloni iz omiljenih/ }))
    expect(api2.library.setPinned).toHaveBeenCalledWith('a', false)
  })
})
