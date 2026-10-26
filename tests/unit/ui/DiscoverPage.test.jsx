// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { DiscoverPage } from '../../../src/renderer/pages/DiscoverPage.jsx'

// A genre taken from genreOptions always matches at least one item, so the "no series for this genre" state cannot be reached
// through the select; this switch lets one test force filterRails to come back empty to exercise that branch.
const force = vi.hoisted(() => ({ emptyFilter: false }))
vi.mock('../../../src/shared/discover.js', async (orig) => {
  const real = await orig()
  return {
    ...real,
    filterRails: (rails, genre) => (force.emptyFilter && genre != null ? { season: [], upcoming: [], movies: [], trending: [] } : real.filterRails(rails, genre)),
  }
})

const it_ = (id, over = {}) => ({
  id, title: `Title ${id}`, romaji: `Romaji ${id}`, format: 'TV', status: 'RELEASING', year: 2026, episodes: 12, genres: ['Action'], start: { year: 2026, month: 10 }, entryId: null, ...over,
})
const RAILS = () => ({
  season: [it_(1), it_(2, { genres: ['Drama'] }), it_(3, { status: 'NOT_YET_RELEASED', start: { year: 2026, month: 12 }, genres: ['Action', 'Comedy'] }), it_(4, { entryId: 'e4', genres: ['Comedy'] })],
  upcoming: [it_(5, { status: 'NOT_YET_RELEASED', start: { year: 2027, month: 1 }, genres: ['Fantasy'] })],
  movies: [it_(6, { format: 'MOVIE', status: 'FINISHED', genres: ['Fantasy'] })],
  trending: [it_(7, { genres: ['Drama'] })],
})
const NONE = { season: [], upcoming: [], movies: [], trending: [] }
const data = (over = {}) => ({
  state: 'ok', refreshing: false, fetchedAt: 1, retryAt: null, season: { season: 'FALL', year: 2026 }, next: { season: 'WINTER', year: 2027 }, rails: RAILS(), hiddenIds: [], ...over,
})
const apiWith = (payload, extra = {}) => makeFakeApi({ discover: { list: vi.fn(async () => payload), ...extra } })
const page = (api, props = {}) => {
  const p = { ready: true, onOpenAnime: vi.fn(), onSearch: vi.fn(), ...props }
  return { ...renderUi(<DiscoverPage {...p} />, { api }), ...p }
}
const heading = () => screen.getByRole('heading', { level: 2, name: 'Otkrij' })
const genreSelect = () => screen.getByRole('combobox', { name: 'Žanr' })

afterEach(() => { vi.restoreAllMocks(); force.emptyFilter = false })

describe('DiscoverPage', () => {
  it('shows a busy skeleton while loading', async () => {
    const { container } = page(apiWith(data({ state: 'loading', refreshing: true, rails: NONE })))
    expect(await screen.findByTestId('discover-skeleton')).toBeInTheDocument()
    expect(container.querySelector('section.page')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('AniList trenutno nema ništa za prikaz.')).toBeNull()
  })

  it('renders the four rails with their titles and skips empty ones', async () => {
    const { unmount } = page(apiWith(data()))
    for (const name of ['Popularno — jesen 2026', 'Uskoro — zima 2027', 'Popularni filmovi', 'Popularno sada']) expect(await screen.findByRole('region', { name })).toBeInTheDocument()
    unmount()
    page(apiWith(data({ rails: { ...RAILS(), movies: [] } })))
    await screen.findByRole('region', { name: 'Popularno sada' })
    expect(screen.queryByRole('region', { name: 'Popularni filmovi' })).toBeNull()
  })

  it('opens search for a card outside the library and the entry for a library card (with badge)', async () => {
    const { onSearch, onOpenAnime } = page(apiWith(data()))
    fireEvent.click(await screen.findByRole('button', { name: 'Potraži Title 1' }))
    expect(onSearch).toHaveBeenCalledWith('Romaji 1')
    const mine = screen.getByRole('button', { name: 'Potraži Title 4, U Watchlist-i' })
    expect(within(mine).getByText('U Watchlist-i')).toBeInTheDocument()
    fireEvent.click(mine)
    expect(onOpenAnime).toHaveBeenCalledWith('e4')
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('a not yet released card is not a button', async () => {
    page(apiWith(data()))
    await screen.findByRole('button', { name: 'Potraži Title 1' })
    expect(screen.queryByRole('button', { name: /Title 3/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Title 5/ })).toBeNull()
    expect(screen.getByRole('group', { name: /^Title 3, počinje/ })).toBeInTheDocument()
  })

  it('lists the genres and filters every rail', async () => {
    page(apiWith(data()))
    await screen.findByRole('button', { name: 'Potraži Title 1' })
    expect(within(genreSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual(['Svi žanrovi', 'Action', 'Comedy', 'Drama', 'Fantasy'])
    fireEvent.change(genreSelect(), { target: { value: 'Fantasy' } })
    expect(screen.queryByRole('region', { name: 'Popularno — jesen 2026' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Popularno sada' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Popularni filmovi' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Uskoro — zima 2027' })).toBeInTheDocument()
    fireEvent.change(genreSelect(), { target: { value: '' } })
    expect(screen.getByRole('region', { name: 'Popularno sada' })).toBeInTheDocument()
  })

  it('no items for the genre shows the message, and the reset restores and focuses the select', async () => {
    page(apiWith(data()))
    await screen.findByRole('button', { name: 'Potraži Title 1' })
    force.emptyFilter = true
    fireEvent.change(genreSelect(), { target: { value: 'Fantasy' } })
    expect(screen.getByText('Nema serija za ovaj žanr.')).toBeInTheDocument()
    expect(screen.queryByText('AniList trenutno nema ništa za prikaz.')).toBeNull()
    const reset = screen.getByRole('button', { name: 'Poništi filter' })
    reset.focus()
    fireEvent.click(reset)
    expect(screen.queryByText('Nema serija za ovaj žanr.')).toBeNull()
    expect(genreSelect()).toHaveValue('')
    expect(screen.getByRole('region', { name: 'Popularno sada' })).toBeInTheDocument()
    expect(document.activeElement).toBe(genreSelect())
  })

  it('a selected genre that disappears after a reload shows all rails again', async () => {
    let onChanged
    const smaller = data({ rails: { ...NONE, season: [it_(1)] } })
    const list = vi.fn().mockResolvedValueOnce(data()).mockResolvedValue(smaller)
    page(makeFakeApi({ discover: { list, onChanged: vi.fn((cb) => { onChanged = cb; return () => {} }) } }))
    await screen.findByRole('button', { name: 'Potraži Title 1' })
    fireEvent.change(genreSelect(), { target: { value: 'Fantasy' } })
    expect(screen.queryByRole('button', { name: 'Potraži Title 1' })).toBeNull()
    await act(async () => { onChanged() })
    expect(await screen.findByRole('button', { name: 'Potraži Title 1' })).toBeInTheDocument()
    expect(genreSelect()).toHaveValue('')
    expect(screen.queryByText('Nema serija za ovaj žanr.')).toBeNull()
  })

  it('shows "nothing to show" without a filter', async () => {
    page(apiWith(data({ rails: NONE })))
    expect(await screen.findByText('AniList trenutno nema ništa za prikaz.')).toBeInTheDocument()
  })

  it('Surprise me searches a title from the pool, never a hidden id or a library item', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { onSearch } = page(apiWith(data({ hiddenIds: [1] })))
    await screen.findByRole('button', { name: 'Potraži Title 2' })
    const btn = screen.getByRole('button', { name: 'Iznenadi me' })
    fireEvent.click(btn)
    // pool = season/movies/trending, releasing or finished, not hidden, not in the library: 2, 6, 7 (1 hidden, 3 unreleased, 4 in the library)
    expect(onSearch).toHaveBeenCalledWith('Romaji 2')
    for (let k = 0; k < 20; k++) fireEvent.click(btn)
    for (const [q] of onSearch.mock.calls) expect(['Romaji 2', 'Romaji 6', 'Romaji 7']).toContain(q)
  })

  it('Surprise me with an empty pool is aria-disabled, does nothing and keeps focus', async () => {
    const { onSearch } = page(apiWith(data({ rails: { ...NONE, season: [it_(4, { entryId: 'e4' })] } })))
    await screen.findByRole('button', { name: /Title 4/ })
    const btn = screen.getByRole('button', { name: 'Iznenadi me' })
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).toHaveAccessibleDescription('Nema serija za nasumičan izbor.')
    btn.focus()
    fireEvent.click(btn)
    expect(onSearch).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(btn)
  })

  it('Surprise me and the cards are blocked until ready', async () => {
    const { onSearch } = page(apiWith(data()), { ready: false })
    await screen.findByRole('region', { name: 'Popularno sada' })
    const btn = screen.getByRole('button', { name: 'Iznenadi me' })
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(btn)
    expect(onSearch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Potraži Title 1' })).toBeDisabled()
  })

  it('shows the error with a countdown retry that does nothing while counting', async () => {
    const list = vi.fn(async () => data({ state: 'error', retryAt: Date.now() + 30000, rails: NONE }))
    page(makeFakeApi({ discover: { list } }))
    expect(await screen.findByText('Otkrij trenutno ne može da učita podatke sa AniList-a.')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Pokušaj ponovo za \d+ s/ })
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(btn)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('retry calls list with force', async () => {
    const list = vi.fn(async () => data({ state: 'error', rails: NONE }))
    page(makeFakeApi({ discover: { list } }))
    fireEvent.click(await screen.findByRole('button', { name: 'Pokušaj ponovo' }))
    expect(list).toHaveBeenLastCalledWith({ force: true })
  })

  it('shows the stale note with rails and a retry', async () => {
    const list = vi.fn(async () => data({ state: 'stale', fetchedAt: new Date(2026, 9, 20, 7, 5).getTime() }))
    page(makeFakeApi({ discover: { list } }))
    expect(await screen.findByText(/Prikazano stanje od .*7:05/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Potraži Title 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(list).toHaveBeenLastCalledWith({ force: true })
  })

  it('moves focus to the heading when the retry block goes away while it had focus', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce(data({ state: 'error', rails: NONE }))
      .mockResolvedValue(data())
    page(makeFakeApi({ discover: { list } }))
    const btn = await screen.findByRole('button', { name: 'Pokušaj ponovo' })
    btn.focus()
    fireEvent.click(btn)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pokušaj ponovo' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(document.activeElement).not.toBe(document.body)
  })

  it('requests posters for the rendered items in chunks of at most 40, one after another', async () => {
    const rails = {
      season: Array.from({ length: 20 }, (_, i) => it_(100 + i)),
      upcoming: Array.from({ length: 20 }, (_, i) => it_(200 + i, { status: 'NOT_YET_RELEASED' })),
      movies: Array.from({ length: 5 }, (_, i) => it_(300 + i)),
      trending: [],
    }
    const posters = vi.fn(async () => ({}))
    page(apiWith(data({ rails }), { posters }))
    await waitFor(() => expect(posters.mock.calls.length).toBe(2))
    expect(posters.mock.calls.map(([ids]) => ids.length)).toEqual([40, 5])
    expect(new Set(posters.mock.calls.flat(2)).size).toBe(45)
  })

  it('asks posters only for the filtered items', async () => {
    const posters = vi.fn(async () => ({}))
    page(apiWith(data(), { posters }))
    await screen.findByRole('button', { name: 'Potraži Title 1' })
    await waitFor(() => expect(posters).toHaveBeenCalled())
    posters.mockClear()
    fireEvent.change(genreSelect(), { target: { value: 'Fantasy' } })
    await waitFor(() => expect(posters).toHaveBeenCalled())
    for (const [ids] of posters.mock.calls) expect(ids.every((id) => id === 5 || id === 6)).toBe(true)
  })

  it('an id missing from the answer gets an empty frame, never an endless skeleton', async () => {
    const posters = vi.fn(async () => ({ 1: 'data:image/png;base64,AAAA' }))
    const { container } = page(apiWith(data({ rails: { ...NONE, season: [it_(1), it_(2)] } }), { posters }))
    await screen.findByRole('button', { name: 'Potraži Title 1' })
    await waitFor(() => expect(container.querySelector('.poster--empty')).not.toBeNull())
    expect(container.querySelectorAll('img.poster')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Potraži Title 2' }).querySelector('.poster--skeleton')).toBeNull()
  })

  it('ignores a stale answer that arrives after a newer one', async () => {
    let onChanged
    let resolveOld
    const old = new Promise((r) => { resolveOld = r })
    const list = vi.fn()
      .mockReturnValueOnce(old)
      .mockResolvedValue(data({ rails: { ...NONE, season: [it_(9)] } }))
    page(makeFakeApi({ discover: { list, onChanged: vi.fn((cb) => { onChanged = cb; return () => {} }) } }))
    await waitFor(() => expect(onChanged).toBeDefined())
    await act(async () => { onChanged() })
    expect(await screen.findByRole('button', { name: 'Potraži Title 9' })).toBeInTheDocument()
    await act(async () => { resolveOld(data()) })
    expect(screen.getByRole('button', { name: 'Potraži Title 9' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Potraži Title 1' })).toBeNull()
  })
})
