// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { HomePage } from '../../../src/renderer/pages/HomePage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const item = (over = {}) => ({
  id: 101, title: 'Attack on Titan Season 2', romaji: 'Shingeki no Kyojin 2', format: 'TV', status: 'FINISHED', year: 2017, episodes: 12,
  poster: null, fromTitle: 'Attack on Titan', fromId: 16498, description: 'SECRET PLOT', ...over,
})

const home = (api, ready = true) => renderUi(<HomePage ready={ready} settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={() => {}} onOpenAnime={() => {}} />, { api })

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
    expect(rail).toHaveTextContent('TV SHORT · 2017 · 12 ep.')
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
    const list = vi.fn(async () => [item()])
    const api = makeFakeApi({ sequels: { list, onChanged: vi.fn((cb) => { onChanged = cb; return () => {} }) } })
    home(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Sakrij Attack on Titan Season 2' }))
    await waitFor(() => expect(api.sequels.hide).toHaveBeenCalledWith(101))
    await act(async () => { onChanged([]) })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Propušteni nastavci' })).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Poništi' }))
    await waitFor(() => expect(api.sequels.unhide).toHaveBeenCalledWith(101))
    await act(async () => { onChanged([item()]) })
    expect(await screen.findByRole('button', { name: 'Potraži Attack on Titan Season 2' })).toBeInTheDocument()
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
})
