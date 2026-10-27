// @vitest-environment jsdom
import { useState } from 'react'
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
    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: /^Odustao/ }))
    expect(screen.queryByText('Frieren')).not.toBeInTheDocument()
    expect(screen.getByText('Naruto')).toBeInTheDocument()
  })
  it('pins from the detail page and explains the limit', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Show' })]) } })
    api.library.setPinned.mockResolvedValueOnce({ ok: false, error: 'pin-limit' })
    renderUi(<WatchlistPage ready onContinue={() => {}} animeId="a" />, { api })
    fireEvent.click(await screen.findByRole('button', { name: /Dodaj u omiljene/ }))
    expect(await screen.findByText('Možeš zakačiti najviše 5 serija. Otkači neku pa pokušaj ponovo.')).toBeInTheDocument()
    expect(api.library.setPinned).toHaveBeenCalledWith('a', true)
  })
  it('pin limit shows a toast', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Show' })]) } })
    api.library.setPinned.mockResolvedValueOnce({ ok: false, error: 'pin-limit' })
    renderUi(<WatchlistPage ready onContinue={() => {}} />, { api })
    fireEvent.click(await screen.findByRole('button', { name: 'Dodaj u omiljene: Show' }))
    await waitFor(() => expect(document.querySelector('.toast')).not.toBeNull())
    const toast = document.querySelector('.toast')
    expect(toast).toHaveTextContent('Možeš zakačiti najviše 5 serija. Otkači neku pa pokušaj ponovo.')
    expect(toast.closest('.toast-stack')).not.toBeNull()
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
    renderUi(<WatchlistPage ready onContinue={() => {}} animeId="a" />, { api })
    expect(await screen.findByRole('group', { name: 'Grupe epizoda' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    expect(screen.getByLabelText('Beleška za epizodu 7')).toBeInTheDocument()
  })
  it('shows media cards with score, play and the pin limit message', async () => {
    const onContinue = vi.fn()
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Show', aniCliTitle: 'Show', rating: 8 })]) } })
    api.library.setPinned.mockResolvedValueOnce({ ok: false, error: 'pin-limit' })
    const { container } = renderUi(<WatchlistPage ready onContinue={onContinue} />, { api })
    await screen.findByRole('button', { name: 'Show — 2/4, Gledam' })
    expect(container.querySelector('.badge--score')).toHaveTextContent('★ 8')
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi EP 3' }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '3' })
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj u omiljene: Show' }))
    expect(await screen.findByText('Možeš zakačiti najviše 5 serija. Otkači neku pa pokušaj ponovo.')).toBeInTheDocument()
  })
})

describe('WatchlistPage toolbar', () => {
  const lib = () => [
    entry({ id: 'a', title: 'Frieren', aniCliTitle: 'Frieren', status: 'watching', addedAt: '2026-01-01T00:00:00Z' }),
    entry({ id: 'b', title: 'Naruto', aniCliTitle: 'Naruto', status: 'dropped', addedAt: '2026-03-01T00:00:00Z' }),
    entry({ id: 'c', title: 'Šaman Kralj', aniCliTitle: 'Shaman King', status: 'watching', addedAt: '2026-02-01T00:00:00Z' }),
  ]
  const facets = {
    a: { romaji: 'Sousou no Frieren', genres: ['Fantasy', 'Adventure'] },
    b: { romaji: null, genres: ['Action'] },
    c: { romaji: 'Shaman King Romaji', genres: ['Action'] },
  }
  const setup = (over = {}) => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => lib()), facets: vi.fn(async () => facets), ...over } })
    const utils = renderUi(<WatchlistPage ready onContinue={() => {}} />, { api })
    return { api, ...utils }
  }
  const search = () => screen.getByRole('searchbox', { name: 'Pretraži watchlist…' })
  const chip = (name) => within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: new RegExp('^' + name) })

  it('search filters by aniCliTitle and romaji without diacritics', async () => {
    setup()
    await screen.findByText('Naruto')
    fireEvent.change(search(), { target: { value: 'saman' } })
    expect(screen.queryByText('Naruto')).not.toBeInTheDocument()
    expect(screen.getByText('Šaman Kralj')).toBeInTheDocument()
    fireEvent.change(search(), { target: { value: 'sousou' } })
    expect(screen.getByText('Frieren')).toBeInTheDocument()
    expect(screen.queryByText('Šaman Kralj')).not.toBeInTheDocument()
    fireEvent.change(search(), { target: { value: 'shaman king' } })
    expect(screen.getByText('Šaman Kralj')).toBeInTheDocument()
  })
  it('status chips show counts and aria-pressed, clicking filters, counts follow search', async () => {
    setup()
    await screen.findByText('Naruto')
    expect(chip('Sve')).toHaveTextContent('3')
    expect(chip('Sve')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Gledam')).toHaveTextContent('2')
    expect(chip('Gledam')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip('Gledam'))
    expect(chip('Gledam')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Naruto')).not.toBeInTheDocument()
    fireEvent.change(search(), { target: { value: 'frieren' } })
    expect(chip('Gledam')).toHaveTextContent('1')
    expect(chip('Sve')).toHaveTextContent('1')
  })
  it('genre select lists only library genres and hides when none known', async () => {
    const { unmount } = setup()
    const select = await screen.findByLabelText('Žanr')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Svi žanrovi', 'Action', 'Adventure', 'Fantasy'])
    fireEvent.change(select, { target: { value: 'Action' } })
    expect(screen.queryByText('Frieren')).not.toBeInTheDocument()
    expect(screen.getByText('Naruto')).toBeInTheDocument()
    unmount()
    setup({ facets: vi.fn(async () => ({})) })
    await screen.findByText('Naruto')
    expect(screen.queryByLabelText('Žanr')).not.toBeInTheDocument()
  })
  it('sort Poslednje dodato orders by addedAt', async () => {
    const { container } = setup()
    await screen.findByText('Naruto')
    fireEvent.change(screen.getByLabelText('Sortiraj'), { target: { value: 'added' } })
    const text = container.querySelector('.card-grid').textContent
    expect(text.indexOf('Naruto')).toBeLessThan(text.indexOf('Šaman Kralj'))
    expect(text.indexOf('Šaman Kralj')).toBeLessThan(text.indexOf('Frieren'))
  })
  it('filtered empty state resets query/status/genre and focuses search', async () => {
    setup()
    await screen.findByText('Naruto')
    fireEvent.click(chip('Gledam'))
    fireEvent.change(screen.getByLabelText('Žanr'), { target: { value: 'Action' } })
    fireEvent.change(search(), { target: { value: 'nothing-here' } })
    expect(screen.getByText('Nema serija za ovaj filter')).toBeInTheDocument()
    expect(screen.queryByText('Watchlist je prazna.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Poništi filtere' }))
    expect(search()).toHaveValue('')
    expect(chip('Sve')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Žanr')).toHaveValue('all')
    expect(search()).toHaveFocus()
    expect(screen.getByText('Naruto')).toBeInTheDocument()
  })
  it('empty library still shows the empty message', async () => {
    renderUi(<WatchlistPage ready onContinue={() => {}} />)
    expect(await screen.findByText('Watchlist je prazna.')).toBeInTheDocument()
    expect(screen.queryByText('Nema serija za ovaj filter')).not.toBeInTheDocument()
  })
  it('slash and Ctrl+F focus the search', async () => {
    setup()
    await screen.findByText('Naruto')
    fireEvent.keyDown(window, { key: '/' })
    expect(search()).toHaveFocus()
    search().blur()
    const notPrevented = fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(notPrevented).toBe(false)
    expect(search()).toHaveFocus()
  })
  it('slash inside an input types normally', async () => {
    setup()
    await screen.findByText('Naruto')
    const manual = screen.getByLabelText('Naziv animea')
    manual.focus()
    expect(fireEvent.keyDown(manual, { key: '/' })).toBe(true)
    fireEvent.change(manual, { target: { value: '/' } })
    expect(manual).toHaveValue('/')
    expect(search()).not.toHaveFocus()
    expect(manual).toHaveFocus()
  })
  it('Esc clears the query and is defaultPrevented; Esc on an empty field blurs', async () => {
    setup()
    await screen.findByText('Naruto')
    search().focus()
    fireEvent.change(search(), { target: { value: 'nar' } })
    const notPrevented = fireEvent.keyDown(search(), { key: 'Escape' })
    expect(notPrevented).toBe(false)
    expect(search()).toHaveValue('')
    expect(search()).toHaveFocus()
    fireEvent.keyDown(search(), { key: 'Escape' })
    expect(search()).not.toHaveFocus()
  })
  it('shortcuts are inactive while a dialog is open', async () => {
    setup()
    await screen.findByText('Naruto')
    const dlg = document.createElement('div')
    dlg.setAttribute('role', 'dialog')
    document.body.appendChild(dlg)
    try {
      fireEvent.keyDown(window, { key: '/' })
      expect(search()).not.toHaveFocus()
      const notPrevented = fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
      expect(notPrevented).toBe(true)
      expect(search()).not.toHaveFocus()
    } finally {
      dlg.remove()
    }
  })
  it('shortcuts do nothing while the app shell is inert (player open)', async () => {
    const { container } = setup()
    await screen.findByText('Naruto')
    container.setAttribute('inert', '')
    expect(fireEvent.keyDown(window, { key: '/' })).toBe(true)
    expect(search()).not.toHaveFocus()
    expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true })).toBe(true)
    expect(search()).not.toHaveFocus()
    container.removeAttribute('inert')
    expect(fireEvent.keyDown(window, { key: '/' })).toBe(false)
    expect(search()).toHaveFocus()
  })
  it('ignores auto-repeat', async () => {
    setup()
    await screen.findByText('Naruto')
    expect(fireEvent.keyDown(window, { key: '/', repeat: true })).toBe(true)
    expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true, repeat: true })).toBe(true)
    expect(search()).not.toHaveFocus()
  })
  it('slash is left alone in a textarea, a select and a contenteditable', async () => {
    setup()
    await screen.findByText('Naruto')
    const ta = document.createElement('textarea')
    const sel = document.createElement('select')
    const ce = document.createElement('div')
    ce.setAttribute('contenteditable', 'true')
    const inner = document.createElement('span')
    ce.appendChild(inner)
    document.body.append(ta, sel, ce)
    try {
      for (const el of [ta, sel, ce, inner]) {
        expect(fireEvent.keyDown(el, { key: '/' })).toBe(true)
        expect(search()).not.toHaveFocus()
      }
    } finally {
      ta.remove(); sel.remove(); ce.remove()
    }
  })
  it('shortcuts are off in the detail view and the listener is removed on unmount', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => lib()), facets: vi.fn(async () => facets) } })
    const detail = renderUi(<WatchlistPage ready onContinue={() => {}} animeId="a" />, { api })
    await screen.findByRole('button', { name: /Nazad/ })
    expect(fireEvent.keyDown(window, { key: '/' })).toBe(true)
    expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true })).toBe(true)
    detail.unmount()
    const grid = setup()
    await screen.findByText('Naruto')
    expect(fireEvent.keyDown(window, { key: '/' })).toBe(false)
    grid.unmount()
    expect(fireEvent.keyDown(window, { key: '/' })).toBe(true)
    expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true })).toBe(true)
  })
  it('sort keeps a visible caption', async () => {
    const { container } = setup()
    await screen.findByText('Naruto')
    expect(container.querySelector('label.field > span')).toHaveTextContent('Sortiraj')
    expect(screen.getByLabelText('Sortiraj').tagName).toBe('SELECT')
  })
  it('facets reload on library change', async () => {
    const { api } = setup()
    await screen.findByText('Naruto')
    const calls = api.library.facets.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    api.onLibraryChanged.mock.calls[0][0]()
    await waitFor(() => expect(api.library.facets.mock.calls.length).toBeGreaterThan(calls))
  })
})

describe('AnimeDetail', () => {
  it('shows saved positions on the detail page pills', async () => {
    const api = makeFakeApi({
      library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Show', aniCliTitle: 'Show' })]) },
      positions: { forSeries: vi.fn(async () => ({ 3: { position: 600, duration: 1440 } })) },
    })
    renderUi(<WatchlistPage ready onContinue={() => {}} animeId="a" />, { api })
    await waitFor(() => expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('title', 'ostalo 14 min'))
    expect(api.positions.forSeries).toHaveBeenCalledWith('Show')
  })
  const info = { id: 154587, match: 'exact', genres: ['Adventure'], year: 2023, episodes: 28, description: 'Tajna radnja', poster: null }

  it('puts meta, genres, airing and the main actions in the banner', async () => {
    const AT = Date.now() + (2 * 24 + 4) * 3600 * 1000 + 30_000
    const airing = { ...info, status: 'RELEASING', duration: 24, nextAiring: { episode: 4, airingAt: AT } }
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => airing) } })
    const onContinue = vi.fn()
    const { container } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={onContinue} />, { api })
    const banner = container.querySelector('.detail-hero')
    await waitFor(() => expect(within(banner).getByText('2023 · 4 EP · 24 min · Emituje se')).toBeInTheDocument())
    expect(within(banner).getByText(/^EP 4 izlazi za 2 d 4 h · /)).toBeInTheDocument()
    expect(within(banner).getByText('1 nova')).toBeInTheDocument() // aired 3, watched up to 2
    expect(within(banner).getByRole('list', { name: 'Žanrovi' })).toHaveTextContent('Adventure')
    fireEvent.click(within(banner).getByRole('button', { name: /Nastavi EP 3/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Frieren', anime: 'Frieren', episode: '3' })
    expect(within(banner).getByRole('button', { name: /Dodaj u omiljene/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button', { name: /Nastavi/ })).toHaveLength(1) // moved, not duplicated
    expect(screen.queryByText(/Godina:/)).not.toBeInTheDocument()
  })
  it('offers to watch again instead of continue for a completed series', async () => {
    const onContinue = vi.fn()
    const done = entry({ status: 'completed', totalEpisodes: 4, watchedEpisodes: [1, 2, 3, 4] })
    const { container } = renderUi(<AnimeDetail entry={done} ready onBack={() => {}} onChanged={() => {}} onContinue={onContinue} />)
    const banner = container.querySelector('.detail-hero')
    fireEvent.click(within(banner).getByRole('button', { name: /Gledaj ponovo/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Frieren', anime: 'Frieren', episode: '1' })
    expect(screen.queryByRole('button', { name: /Nastavi EP/ })).not.toBeInTheDocument()
  })
  it('continues from the saved position in the banner', async () => {
    const api = makeFakeApi({ positions: { forSeries: vi.fn(async () => ({ 3: { position: 495, duration: 1440 } })) } })
    const { container } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    expect(await within(container.querySelector('.detail-hero')).findByRole('button', { name: /Nastavi EP 3 od 8:15/ })).toBeInTheDocument()
  })
  it('keeps the banner usable without AniList info', () => {
    const { container } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />)
    const banner = container.querySelector('.detail-hero')
    expect(within(banner).getByRole('heading', { name: 'Frieren' })).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: /Nastavi EP 3/ })).toBeInTheDocument()
    expect(banner.querySelector('.detail-hero__meta')).toBeNull()
    expect(banner.querySelector('.chips')).toBeNull()
  })

  it('uses the episode list from main and offers the spoiler actions', async () => {
    const series = { source: 'ani-cli', meta: 'ok', episodes: ['0', '1', '2', '3'].map((n) => ({ number: n, runtime: null, visibility: n === '3' ? 'hidden' : 'full' })) }
    const api = makeFakeApi({ episodes: { forSeries: vi.fn(async () => series), spoilers: vi.fn(async () => series), thumb: vi.fn(async () => null) } })
    renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => expect(screen.getByRole('button', { name: '0' })).toBeInTheDocument())
    expect(api.episodes.forSeries).toHaveBeenCalledWith({ title: entry().aniCliTitle ?? entry().title, aniListId: entry().aniListId ?? null, mode: null, list: null })
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži sve epizode ove serije' }))
    expect(api.episodes.spoilers).toHaveBeenLastCalledWith(expect.objectContaining({ list: null }), { all: true })
    fireEvent.click(screen.getByRole('button', { name: 'Ponovo sakrij otkrivene' }))
    expect(api.episodes.spoilers).toHaveBeenLastCalledWith(expect.anything(), { reset: true })
    fireEvent.click(screen.getByRole('button', { name: 'Još' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Isključi metapodatke za ovu seriju' }))
    expect(api.episodes.spoilers).toHaveBeenLastCalledWith(expect.anything(), { metaOff: true })
  })
  it('explains unreliable metadata and keeps the synthetic list without main', async () => {
    const api = makeFakeApi({ episodes: { forSeries: vi.fn(async () => ({ source: 'synthetic', meta: 'unreliable', episodes: [] })), spoilers: vi.fn(), thumb: vi.fn() } })
    renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    expect(await screen.findByText('Naslovi epizoda nisu prikazani: brojevi epizoda kod izvora se ne poklapaju.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(4) // totalEpisodes 4 from entry()
    expect(screen.queryByRole('button', { name: 'Prikaži sve epizode ove serije' })).not.toBeInTheDocument()
  })

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
    expect(screen.getByText('2 / 4 odgledano')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByLabelText('Beleška za epizodu 2')).toHaveValue('lepo')
    fireEvent.change(screen.getByLabelText('Beleška za epizodu 2'), { target: { value: 'najbolja' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.library.setEpisodeNote).toHaveBeenCalledWith('a1', 2, 'najbolja'))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni oznaku odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { watchedEpisodes: [1] }))
  })
  it('continues with the first unwatched episode and removes the series', async () => {
    const onContinue = vi.fn()
    const onBack = vi.fn()
    const { api } = renderUi(<AnimeDetail entry={entry()} ready onBack={onBack} onChanged={() => {}} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /Nastavi EP 3/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Frieren', anime: 'Frieren', episode: '3' })
    { fireEvent.click(screen.getByRole('button', { name: 'Još' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Ukloni iz Watchlist-e' })) }
    await waitFor(() => expect(api.library.remove).toHaveBeenCalledWith('a1'))
    expect(onBack).toHaveBeenCalled()
  })
  it('disables continue when components are not ready', () => {
    renderUi(<AnimeDetail entry={entry()} ready={false} onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />)
    expect(screen.getByRole('button', { name: /Nastavi EP 3/ })).toBeDisabled()
  })
  it('shows a banner with the blurred poster', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ ...info, poster: 'data:image/png;base64,AA' })) } })
    const { container } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => expect(container.querySelector('.detail-hero .hero__bg')).not.toBeNull())
    expect(container.querySelector('.detail-hero .hero__bg').style.backgroundImage).toContain('data:image/png;base64,AA')
    expect(within(container.querySelector('.detail-hero')).getByRole('heading', { name: 'Frieren' })).toBeInTheDocument()
  })
  it('reopens the episode group once the total episode count arrives', () => {
    const watched = Array.from({ length: 100 }, (_, i) => i + 1)
    const props = { ready: true, onBack: () => {}, onChanged: () => {}, onContinue: () => {} }
    const { rerender } = renderUi(<AnimeDetail entry={entry({ totalEpisodes: null, watchedEpisodes: watched, episodeNotes: {} })} {...props} />)
    rerender(<AnimeDetail entry={entry({ totalEpisodes: 300, watchedEpisodes: watched, episodeNotes: {} })} {...props} />)
    expect(screen.getByRole('button', { name: '101–200' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('WatchlistPage info cache', () => {
  it('returning to the watchlist does not request posters again', async () => {
    const entries = [entry({ id: 'a', title: 'Alpha', aniListId: 11 }), entry({ id: 'b', title: 'Beta', aniListId: 12 })]
    const api = makeFakeApi({
      library: { list: vi.fn(async () => entries) },
      anilist: { forTitle: vi.fn(async (title, id) => ({ id, poster: `https://img/${title}.jpg`, episodes: 4 })) },
    })
    // the route (open id) lives in App now; a small host stands in for it
    function Host() {
      const [id, setId] = useState(null)
      return <WatchlistPage ready onContinue={() => {}} animeId={id} onOpen={setId} onBack={() => setId(null)} />
    }
    renderUi(<Host />, { api })
    await screen.findByText('Alpha')
    await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalledTimes(2))
    const count = (title) => api.anilist.forTitle.mock.calls.filter((c) => c[0] === title).length
    const before = { Alpha: count('Alpha'), Beta: count('Beta') }
    fireEvent.click(screen.getByText('Alpha'))
    fireEvent.click(await screen.findByRole('button', { name: /Nazad/ }))
    await screen.findByText('Beta')
    expect({ Alpha: count('Alpha'), Beta: count('Beta') }).toEqual(before)
  })
  it('detail patches aniListId once without a second request or a poster flash', async () => {
    const info = { id: 99, match: 'exact', poster: 'https://img/Solo.jpg', episodes: 4, genres: [] }
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info) } })
    const props = { ready: true, onBack: () => {}, onChanged: () => {}, onContinue: () => {} }
    const { container, rerender } = renderUi(<AnimeDetail entry={entry({ id: 's', title: 'Solo' })} {...props} />, { api })
    await waitFor(() => expect(container.querySelector('.detail-hero .hero__bg')).not.toBeNull())
    await waitFor(() => expect(api.library.update).toHaveBeenCalledTimes(1))
    expect(api.library.update).toHaveBeenCalledWith('s', { aniListId: 99 })
    // the library now carries the linked id
    rerender(<AnimeDetail entry={entry({ id: 's', title: 'Solo', aniListId: 99 })} {...props} />)
    expect(container.querySelector('.detail-hero .hero__bg')).not.toBeNull()
    expect(api.anilist.forTitle).toHaveBeenCalledTimes(1)
    expect(api.library.update).toHaveBeenCalledTimes(1)
  })
})

describe('Watchlist page header (v0.19.0)', () => {
  it('has the page header with a subtitle on the list', async () => {
    const { container } = renderUi(<WatchlistPage ready onContinue={() => {}} />)
    await waitFor(() => screen.getByText('Watchlist je prazna.'))
    const head = container.querySelector('header.page__head')
    expect(within(head).getByRole('heading', { level: 2, name: 'Watchlist' })).toBeInTheDocument()
    expect(within(head).getByText('Sve serije koje pratiš')).toBeInTheDocument()
  })
  it('has no page header while a series detail is open', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry({ id: 'a', title: 'Show' })]) } })
    const { container } = renderUi(<WatchlistPage ready onContinue={() => {}} animeId="a" />, { api })
    await screen.findByRole('heading', { name: 'Show' })
    expect(container.querySelector('.page__head')).toBeNull()
  })
})
