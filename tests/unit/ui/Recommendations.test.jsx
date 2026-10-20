// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { HomePage } from '../../../src/renderer/pages/HomePage.jsx'
import { RecommendationCard } from '../../../src/renderer/components/RecommendationCard.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const rec = (over = {}) => ({
  id: 201, title: 'Steins;Gate', romaji: 'Steins;Gate (romaji)', format: 'TV', status: 'FINISHED', year: 2011, episodes: 24,
  genres: ['Sci-Fi', 'Thriller', 'Drama'], poster: null, fromTitle: 'Death Note', fromId: 1535, description: 'SECRET PLOT', ...over,
})
const payload = (items, mode = 'personal', hint = false) => ({ mode, hint, items })

// Stands in for App: it owns pendingSearch and hands the callbacks to HomePage.
function Shell({ ready = true }) {
  const [pendingSearch, setPendingSearch] = useState(null)
  return (
    <HomePage
      ready={ready} settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}}
      onContinue={() => {}} onOpenAnime={() => {}} pendingSearch={pendingSearch} onPendingSearchHandled={() => setPendingSearch(null)} onSearch={(query) => setPendingSearch({ query })}
    />
  )
}
const home = (api, ready = true) => renderUi(<Shell ready={ready} />, { api })
const apiWith = (data, extra = {}, sequels = []) =>
  makeFakeApi({ recommendations: { list: vi.fn(async () => data), ...extra }, sequels: { list: vi.fn(async () => sequels) } })

describe('recommendations rail', () => {
  it('shows no rail without items', async () => {
    const api = apiWith(payload([], 'trending'))
    home(api)
    await waitFor(() => expect(api.recommendations.list).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Preporuke za tebe' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Popularno sada' })).toBeNull()
  })

  it('title follows the mode', async () => {
    const a = apiWith(payload([rec()], 'personal'))
    const { unmount } = home(a)
    expect(await screen.findByRole('region', { name: 'Preporuke za tebe' })).toBeInTheDocument()
    unmount()
    const b = apiWith(payload([rec()], 'trending'))
    home(b)
    expect(await screen.findByRole('region', { name: 'Popularno sada' })).toBeInTheDocument()
  })

  it('hint paragraph only with hint, wired by aria-describedby', async () => {
    const a = apiWith(payload([rec({ fromTitle: undefined })], 'trending', true))
    const { unmount } = home(a)
    const rail = await screen.findByRole('region', { name: 'Popularno sada' })
    const hint = 'Oceni seriju sa 7 ili više ili je završi da dobiješ preporuke za tebe.'
    expect(rail).toHaveAccessibleDescription(hint)
    expect(screen.getByText(hint).tagName).toBe('P')
    unmount()
    const b = apiWith(payload([rec({ fromTitle: undefined })], 'trending', false))
    home(b)
    const rail2 = await screen.findByRole('region', { name: 'Popularno sada' })
    expect(rail2).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText(/Oceni seriju/)).toBeNull()
  })

  it('card shows meta, up to 3 genres, the because line and never a description', async () => {
    const api = apiWith(payload([rec({ status: 'RELEASING', genres: ['Ga', 'Gb', 'Gc', 'Gd'] })]))
    home(api)
    const rail = await screen.findByRole('region', { name: 'Preporuke za tebe' })
    expect(rail).toHaveTextContent('Steins;Gate')
    expect(rail).toHaveTextContent('TV · 2011 · 24 ep.')
    expect(rail).toHaveTextContent('Ga · Gb · Gc')
    expect(rail).not.toHaveTextContent('Gd')
    expect(rail).toHaveTextContent('Zbog: Death Note')
    expect(rail).toHaveTextContent('Emituje se')
    expect(rail).not.toHaveTextContent('SECRET PLOT')
    const open = screen.getByRole('button', { name: 'Potraži Steins;Gate' })
    expect(open).toHaveAccessibleDescription(/Zbog: Death Note/)
    expect(open).toHaveAccessibleDescription(/Ga · Gb · Gc/)
    expect(open).toHaveAccessibleDescription(/Emituje se/)
  })

  it('trending items have no because line', async () => {
    const api = apiWith(payload([rec({ fromTitle: undefined, fromId: undefined })], 'trending'))
    home(api)
    const rail = await screen.findByRole('region', { name: 'Popularno sada' })
    expect(rail).not.toHaveTextContent('Zbog')
  })

  it('click starts a search with romaji, falling back to the title', async () => {
    const api = apiWith(payload([rec()]))
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Potraži Steins;Gate' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Steins;Gate (romaji)' }))
  })

  it('falls back to the title and fills the search input', async () => {
    const api = apiWith(payload([rec({ romaji: null })]))
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: /Potraži/ }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Steins;Gate' }))
    expect(document.getElementById('search-input').value).toBe('Steins;Gate')
  })

  it('Enter on the focused card starts the search', async () => {
    const api = apiWith(payload([rec()]))
    home(api)
    const open = await screen.findByRole('button', { name: /Potraži/ })
    open.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Steins;Gate (romaji)' }))
  })

  it('the sequels card still searches through onSearch', async () => {
    const api = makeFakeApi({ sequels: { list: vi.fn(async () => [{ id: 9, title: 'AoT 2', romaji: 'SnK 2', format: 'TV', status: 'FINISHED', year: 2017, episodes: 12, poster: null, fromTitle: 'AoT', fromId: 1 }]) } })
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Potraži AoT 2' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'SnK 2' }))
  })

  it('disables the search when not ready but keeps the hide button', async () => {
    const api = apiWith(payload([rec()]))
    home(api, false)
    expect(await screen.findByRole('button', { name: /Potraži/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ne preporučuj Steins;Gate' })).not.toBeDisabled()
  })

  it('hide calls the api and shows an undo toast; undo unhides', async () => {
    const api = apiWith(payload([rec()]))
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Ne preporučuj Steins;Gate' }))
    await waitFor(() => expect(api.recommendations.hide).toHaveBeenCalledWith(201))
    expect(await screen.findByText('Sakriveno: Steins;Gate')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Poništi' }))
    await waitFor(() => expect(api.recommendations.unhide).toHaveBeenCalledWith(201))
  })

  it('mouse hide does not move focus to the undo action', async () => {
    const api = apiWith(payload([rec()]))
    home(api)
    await userEvent.click(await screen.findByRole('button', { name: 'Ne preporučuj Steins;Gate' }))
    expect(await screen.findByRole('button', { name: 'Poništi' })).not.toHaveFocus()
  })

  it('keyboard hide moves focus to the undo action', async () => {
    const api = apiWith(payload([rec()]))
    home(api)
    const open = await screen.findByRole('button', { name: /Potraži/ })
    open.focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Ne preporučuj Steins;Gate' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    await waitFor(() => expect(undo).toHaveFocus())
  })

  it('a failing hide shows no toast', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = apiWith(payload([rec()]), { hide: vi.fn(async () => { throw new Error('boom') }) })
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Ne preporučuj Steins;Gate' }))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(warn.mock.calls[0].join(' ')).toContain('boom')
    expect(screen.queryByText(/Sakriveno/)).toBeNull()
    warn.mockRestore()
  })

  it('does not render an item that is already in the sequels list', async () => {
    const api = apiWith(payload([rec({ id: 9, title: 'Dup' }), rec({ id: 202, title: 'Other' })]), {}, [
      { id: 9, title: 'Dup', romaji: null, format: 'TV', status: 'FINISHED', year: 2017, episodes: 12, poster: null, fromTitle: 'X', fromId: 1 },
    ])
    home(api)
    await screen.findByRole('button', { name: 'Potraži Other' })
    const rail = screen.getByRole('region', { name: 'Preporuke za tebe' })
    expect(rail).not.toHaveTextContent('Dup')
    expect(screen.getAllByRole('button', { name: 'Potraži Dup' })).toHaveLength(1) // only the sequels card
  })

  it('no rail when every item is a sequel', async () => {
    const api = apiWith(payload([rec({ id: 9, title: 'Dup' })]), {}, [
      { id: 9, title: 'Dup', romaji: null, format: 'TV', status: 'FINISHED', year: 2017, episodes: 12, poster: null, fromTitle: 'X', fromId: 1 },
    ])
    home(api)
    await screen.findByRole('region', { name: 'Propušteni nastavci' })
    expect(screen.queryByRole('region', { name: 'Preporuke za tebe' })).toBeNull()
  })

  it('re-fetches on the change event and ignores a stale answer', async () => {
    let onChanged
    const resolvers = []
    const list = vi.fn(() => new Promise((r) => resolvers.push(r)))
    const api = makeFakeApi({ recommendations: { list, onChanged: vi.fn((cb) => { onChanged = cb; return () => {} }) } })
    home(api)
    await waitFor(() => expect(resolvers).toHaveLength(1))
    await act(async () => { onChanged() })
    await waitFor(() => expect(resolvers).toHaveLength(2))
    await act(async () => { resolvers[1](payload([], 'trending')) })
    await act(async () => { resolvers[0](payload([rec()])) })
    expect(screen.queryByRole('region', { name: 'Preporuke za tebe' })).toBeNull()
  })

  it('a rejected list never crashes the page', async () => {
    const api = apiWith(null, { list: vi.fn(async () => { throw new Error('x') }) })
    home(api)
    await waitFor(() => expect(api.recommendations.list).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Preporuke za tebe' })).toBeNull()
  })
})

describe('RecommendationCard', () => {
  it('without onHide there is no hide button and no because line', () => {
    renderUi(<RecommendationCard item={rec({ fromTitle: undefined })} ready onSearch={() => {}} />, { api: makeFakeApi() })
    expect(screen.queryByRole('button', { name: /Ne preporučuj/ })).toBeNull()
    expect(screen.queryByText(/Zbog/)).toBeNull()
  })
})
