// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { RouteStateContext } from '../../../src/renderer/nav/useNavigation.js'
import { AnimeDetail } from '../../../src/renderer/pages/AnimeDetail.jsx'

const entry = (over = {}) => ({
  id: 'a1', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '',
  totalEpisodes: 4, watchedEpisodes: [1], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null, ...over,
})
const sim = (over = {}) => ({
  id: 301, title: 'Similar One', romaji: 'Similar Romaji', format: 'TV', status: 'FINISHED', year: 2015, episodes: 13,
  genres: ['Action', 'Drama'], poster: null, description: 'SECRET PLOT', ...over,
})
const info = (over = {}) => ({ id: 77, title: 'Show', match: 'exact', poster: null, year: 2010, episodes: 4, genres: [], ...over })
const forSeries = (items = [sim()]) => vi.fn(async () => ({ items }))
const mount = (api, e = entry(), props = {}) =>
  renderUi(<AnimeDetail entry={e} ready onBack={() => {}} onRemoved={() => {}} onChanged={() => {}} onContinue={() => {}} onSearch={() => {}} {...props} />, { api })
const section = () => screen.queryByRole('region', { name: 'Slično' })
const openSimilar = async () => { fireEvent.click(await screen.findByRole('tab', { name: 'Slično' })) }

describe('AnimeDetail "Slično"', () => {
  it('uses entry.aniListId', async () => {
    const api = makeFakeApi({ recommendations: { forSeries: forSeries() } })
    mount(api, entry({ aniListId: 42 }))
    await openSimilar()
    expect(await screen.findByRole('region', { name: 'Slično' })).toBeInTheDocument()
    expect(api.recommendations.forSeries).toHaveBeenCalledWith(42)
  })

  it('falls back to an exact AniList match', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info()) }, recommendations: { forSeries: forSeries() } })
    mount(api)
    await openSimilar()
    expect(await screen.findByRole('region', { name: 'Slično' })).toBeInTheDocument()
    expect(api.recommendations.forSeries).toHaveBeenCalledWith(77)
  })

  it('never asks for a close match', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info({ match: 'close' })) }, recommendations: { forSeries: forSeries() } })
    mount(api)
    await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalled())
    await act(async () => {})
    expect(api.recommendations.forSeries).not.toHaveBeenCalled()
    expect(section()).toBeNull()
  })

  it('never asks without an id', async () => {
    const api = makeFakeApi({ recommendations: { forSeries: forSeries() } })
    mount(api)
    await act(async () => {})
    expect(api.recommendations.forSeries).not.toHaveBeenCalled()
    expect(section()).toBeNull()
  })

  it('empty items render no section', async () => {
    const api = makeFakeApi({ recommendations: { forSeries: forSeries([]) } })
    mount(api, entry({ aniListId: 42 }))
    await waitFor(() => expect(api.recommendations.forSeries).toHaveBeenCalled())
    await act(async () => {})
    expect(section()).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Slično' })).toBeNull()
  })

  it('is a labelled section without a duplicate heading, cards without hide or because, and no description', async () => {
    const api = makeFakeApi({ recommendations: { forSeries: forSeries([sim()]) } })
    mount(api, entry({ aniListId: 42 }))
    await openSimilar()
    const sec = await screen.findByRole('region', { name: 'Slično' })
    expect(sec.tagName).toBe('SECTION')
    expect(sec.querySelector('h3')).toBeNull()
    expect(sec).toHaveTextContent('Similar One')
    expect(sec).toHaveTextContent('TV · 2015 · 13 ep.')
    expect(sec).toHaveTextContent('Action · Drama')
    expect(sec).not.toHaveTextContent('SECRET PLOT')
    expect(sec).not.toHaveTextContent('Zbog')
    expect(screen.queryByRole('button', { name: /Ne preporučuj/ })).toBeNull()
  })

  it('removal lives in the more menu, not at the bottom of the page', async () => {
    const api = makeFakeApi({ recommendations: { forSeries: forSeries() } })
    mount(api, entry({ aniListId: 42 }))
    await openSimilar()
    await screen.findByRole('region', { name: 'Slično' })
    expect(screen.queryByRole('button', { name: 'Ukloni iz Watchlist-e' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Još' }))
    expect(screen.getByRole('menuitem', { name: 'Ukloni iz Watchlist-e' })).toBeInTheDocument()
  })

  it('click calls onSearch with romaji, else the title', async () => {
    const onSearch = vi.fn()
    const api = makeFakeApi({ recommendations: { forSeries: forSeries([sim(), sim({ id: 302, title: 'No Romaji', romaji: null })]) } })
    mount(api, entry({ aniListId: 42 }), { onSearch })
    await openSimilar()
    fireEvent.click(await screen.findByRole('button', { name: 'Potraži Similar One' }))
    expect(onSearch).toHaveBeenLastCalledWith('Similar Romaji')
    fireEvent.click(screen.getByRole('button', { name: 'Potraži No Romaji' }))
    expect(onSearch).toHaveBeenLastCalledWith('No Romaji')
  })

  it('an id change clears the list at once and ignores the late answer for the old id', async () => {
    const resolvers = {}
    const fs = vi.fn((id) => new Promise((r) => { resolvers[id] = r }))
    const api = makeFakeApi({ recommendations: { forSeries: fs } })
    const { rerender } = mount(api, entry({ aniListId: 1 }))
    await waitFor(() => expect(resolvers[1]).toBeDefined())
    await act(async () => { resolvers[1]({ items: [sim({ title: 'Old One' })] }) })
    await openSimilar()
    expect(await screen.findByText('Old One')).toBeInTheDocument()
    rerender(<AnimeDetail entry={entry({ aniListId: 2 })} ready onBack={() => {}} onRemoved={() => {}} onChanged={() => {}} onContinue={() => {}} onSearch={() => {}} />)
    expect(screen.queryByText('Old One')).toBeNull()
    expect(section()).toBeNull()
    await waitFor(() => expect(resolvers[2]).toBeDefined())
    await act(async () => { resolvers[2]({ items: [sim({ id: 303, title: 'New One' })] }) })
    await openSimilar()
    expect(await screen.findByText('New One')).toBeInTheDocument()
  })

  it('a late answer for the old id is ignored', async () => {
    const resolvers = {}
    const fs = vi.fn((id) => new Promise((r) => { resolvers[id] = r }))
    const api = makeFakeApi({ recommendations: { forSeries: fs } })
    const { rerender } = mount(api, entry({ aniListId: 1 }))
    await waitFor(() => expect(resolvers[1]).toBeDefined())
    rerender(<AnimeDetail entry={entry({ aniListId: 2 })} ready onBack={() => {}} onRemoved={() => {}} onChanged={() => {}} onContinue={() => {}} onSearch={() => {}} />)
    await waitFor(() => expect(resolvers[2]).toBeDefined())
    await act(async () => { resolvers[1]({ items: [sim({ title: 'Stale One' })] }) })
    expect(screen.queryByText('Stale One')).toBeNull()
    expect(section()).toBeNull()
  })

  it('has no Slično tab without items, and offers it with items', async () => {
    const none = makeFakeApi({ recommendations: { forSeries: forSeries([]) } })
    const { unmount } = mount(none, entry({ aniListId: 42 }))
    await waitFor(() => expect(none.recommendations.forSeries).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('tab', { name: 'Slično' })).toBeNull()
    unmount()
    mount(makeFakeApi({ recommendations: { forSeries: forSeries() } }), entry({ aniListId: 42 }))
    await openSimilar()
    expect(await screen.findByRole('button', { name: 'Potraži Similar One' })).toBeVisible()
  })

  it('a remembered similar tab without items shows the episodes tab', async () => {
    const api = makeFakeApi({ recommendations: { forSeries: forSeries([]) } })
    const value = { state: { tab: 'similar' }, set: () => {} }
    renderUi(
      <RouteStateContext.Provider value={value}>
        <AnimeDetail entry={entry({ aniListId: 42 })} ready onBack={() => {}} onRemoved={() => {}} onChanged={() => {}} onContinue={() => {}} onSearch={() => {}} />
      </RouteStateContext.Provider>, { api })
    await waitFor(() => expect(api.recommendations.forSeries).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByRole('tab', { name: 'Epizode' })).toHaveAttribute('aria-selected', 'true')
    expect(value.state.tab).toBe('similar')
  })

  it('a rejected call shows no section', async () => {
    const api = makeFakeApi({ recommendations: { forSeries: vi.fn(async () => { throw new Error('x') }) } })
    mount(api, entry({ aniListId: 42 }))
    await waitFor(() => expect(api.recommendations.forSeries).toHaveBeenCalled())
    await act(async () => {})
    expect(section()).toBeNull()
  })
})
