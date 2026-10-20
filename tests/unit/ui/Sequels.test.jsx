// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { HomePage } from '../../../src/renderer/pages/HomePage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const item = (over = {}) => ({
  id: 101, title: 'Attack on Titan Season 2', romaji: 'Shingeki no Kyojin 2', format: 'TV', status: 'FINISHED', year: 2017, episodes: 12,
  poster: null, fromTitle: 'Attack on Titan', fromId: 16498, description: 'SECRET PLOT', ...over,
})

// Stands in for App, which owns pendingSearch since v0.14.0.
function Shell({ ready }) {
  const [pendingSearch, setPendingSearch] = useState(null)
  return <HomePage ready={ready} settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={() => {}} onOpenAnime={() => {}} pendingSearch={pendingSearch} onPendingSearchHandled={() => setPendingSearch(null)} onSearch={(query) => setPendingSearch({ query })} />
}
const home = (api, ready = true) => renderUi(<Shell ready={ready} />, { api })

const apiWith = (items, extra = {}) => makeFakeApi({ sequels: { list: vi.fn(async () => items), ...extra } })

describe('missed sequels rail', () => {
  it('shows no rail without sequels', async () => {
    const api = apiWith([])
    home(api)
    await waitFor(() => expect(api.sequels.list).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Propušteni nastavci' })).toBeNull()
  })

  it('renders title, meta, after line, releasing badge and no description', async () => {
    const api = apiWith([item({ format: 'TV_SHORT', status: 'RELEASING' })])
    home(api)
    const rail = await screen.findByRole('region', { name: 'Propušteni nastavci' })
    expect(rail).toHaveTextContent('Attack on Titan Season 2')
    expect(rail).toHaveTextContent('Kratka TV · 2017 · 12 ep.')
    expect(rail).toHaveTextContent('Posle: Attack on Titan')
    expect(rail).toHaveTextContent('Emituje se')
    expect(rail).not.toHaveTextContent('SECRET PLOT')
  })

  it('omits unknown meta parts', async () => {
    const api = apiWith([item({ year: null, episodes: null })])
    home(api)
    const rail = await screen.findByRole('region', { name: 'Propušteni nastavci' })
    expect(rail).toHaveTextContent(/TV(?! ·)/)
    expect(rail).not.toHaveTextContent('ep.')
    expect(rail).not.toHaveTextContent('Emituje se')
  })

  it('click starts a search with romaji', async () => {
    const api = apiWith([item()])
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Potraži Attack on Titan Season 2' }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Shingeki no Kyojin 2' }))
  })

  it('falls back to the title when romaji is missing and fills the search input', async () => {
    const api = apiWith([item({ romaji: null })])
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: /Potraži/ }))
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Attack on Titan Season 2' }))
    expect(document.getElementById('search-input').value).toBe('Attack on Titan Season 2')
  })

  it('disables the search when not ready', async () => {
    const api = apiWith([item()])
    home(api, false)
    const open = await screen.findByRole('button', { name: /Potraži/ })
    expect(open).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sakrij Attack on Titan Season 2' })).not.toBeDisabled()
  })

  it('hide calls the api and shows an undo toast', async () => {
    const api = apiWith([item()])
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Sakrij Attack on Titan Season 2' }))
    await waitFor(() => expect(api.sequels.hide).toHaveBeenCalledWith(101))
    expect(await screen.findByText('Sakriveno: Attack on Titan Season 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Poništi' })).toBeInTheDocument()
  })

  it('undo restores the card', async () => {
    let onChanged
    let hidden = false
    const list = vi.fn(async () => (hidden ? [] : [item()]))
    const api = makeFakeApi({ sequels: { list, onChanged: vi.fn((cb) => { onChanged = cb; return () => {} }) } })
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Sakrij Attack on Titan Season 2' }))
    await waitFor(() => expect(api.sequels.hide).toHaveBeenCalledWith(101))
    hidden = true
    await act(async () => { onChanged() })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Propušteni nastavci' })).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Poništi' }))
    await waitFor(() => expect(api.sequels.unhide).toHaveBeenCalledWith(101))
    hidden = false
    await act(async () => { onChanged() })
    expect(await screen.findByRole('button', { name: 'Potraži Attack on Titan Season 2' })).toBeInTheDocument()
  })

  it('onChanged without a payload re-fetches and never crashes', async () => {
    let onChanged
    const list = vi.fn(async () => [item()])
    const api = makeFakeApi({ sequels: { list, onChanged: vi.fn((cb) => { onChanged = cb; return () => {} }) } })
    home(api)
    await screen.findByRole('region', { name: 'Propušteni nastavci' })
    const before = list.mock.calls.length
    await act(async () => { onChanged() })
    await waitFor(() => expect(list.mock.calls.length).toBe(before + 1))
    expect(screen.getByRole('region', { name: 'Propušteni nastavci' })).toBeInTheDocument()
  })

  it('ignores a stale list that resolves after a newer one', async () => {
    let onChanged
    const resolvers = []
    const list = vi.fn(() => new Promise((r) => resolvers.push(r)))
    const api = makeFakeApi({ sequels: { list, onChanged: vi.fn((cb) => { onChanged = cb; return () => {} }) } })
    home(api)
    await waitFor(() => expect(resolvers).toHaveLength(1))
    await act(async () => { onChanged() })
    await waitFor(() => expect(resolvers).toHaveLength(2))
    await act(async () => { resolvers[1]([]) })
    await act(async () => { resolvers[0]([item()]) })
    expect(screen.queryByRole('region', { name: 'Propušteni nastavci' })).toBeNull()
  })

  it('hide button is reachable by Tab and has an accessible name', async () => {
    const api = apiWith([item()])
    home(api)
    const open = await screen.findByRole('button', { name: /Potraži/ })
    open.focus()
    await userEvent.tab()
    const hide = screen.getByRole('button', { name: 'Sakrij Attack on Titan Season 2' })
    expect(hide).toHaveFocus()
  })

  it('formats go through t(), unknown formats fall back to the raw value without underscores', async () => {
    const api = apiWith([item({ id: 1, title: 'A', format: 'MOVIE' }), item({ id: 2, title: 'B', format: 'ONA' }), item({ id: 3, title: 'C', format: 'NEW_KIND' })])
    home(api)
    const rail = await screen.findByRole('region', { name: 'Propušteni nastavci' })
    expect(rail).toHaveTextContent('Film · 2017')
    expect(rail).toHaveTextContent('ONA · 2017')
    expect(rail).toHaveTextContent('NEW KIND · 2017')
    expect(rail).not.toHaveTextContent('MOVIE')
  })

  it('the airing badge is part of the accessible description', async () => {
    const api = apiWith([item({ status: 'RELEASING' })])
    home(api)
    const open = await screen.findByRole('button', { name: /Potraži/ })
    expect(open).toHaveAccessibleDescription(/Emituje se/)
    expect(open).toHaveAccessibleDescription(/Posle: Attack on Titan/)
  })

  it('no airing text in the description for finished sequels', async () => {
    const api = apiWith([item()])
    home(api)
    expect(await screen.findByRole('button', { name: /Potraži/ })).not.toHaveAccessibleDescription(/Emituje se/)
  })

  it('keyboard hide moves focus to the undo action', async () => {
    const api = apiWith([item()])
    home(api)
    const open = await screen.findByRole('button', { name: /Potraži/ })
    open.focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Sakrij Attack on Titan Season 2' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    await waitFor(() => expect(undo).toHaveFocus())
  })

  it('mouse hide does not move focus to the undo action', async () => {
    const api = apiWith([item()])
    home(api)
    await userEvent.click(await screen.findByRole('button', { name: 'Sakrij Attack on Titan Season 2' }))
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    expect(undo).not.toHaveFocus()
  })

  it('a failing hide shows no toast and logs only the message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = apiWith([item()], { hide: vi.fn(async () => { throw new Error('boom') }) })
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Sakrij Attack on Titan Season 2' }))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(warn.mock.calls[0].join(' ')).toContain('boom')
    expect(warn.mock.calls[0].every((a) => typeof a === 'string')).toBe(true)
    expect(screen.queryByText(/Sakriveno/)).toBeNull()
    warn.mockRestore()
  })
})
