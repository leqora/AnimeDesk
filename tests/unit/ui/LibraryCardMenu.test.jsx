// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { MediaCard } from '../../../src/renderer/components/MediaCard.jsx'
import { ContinueCard } from '../../../src/renderer/components/ContinueCard.jsx'
import { WatchlistPage } from '../../../src/renderer/pages/WatchlistPage.jsx'

const entry = (over = {}) => ({ id: 'a', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null, ...over })

function setup(props = {}, api = makeFakeApi()) {
  const onOpen = vi.fn()
  const onContinue = vi.fn()
  const view = renderUi(
    <main className="content" tabIndex={-1}><MediaCard entry={entry()} ready onOpen={onOpen} onContinue={onContinue} {...props} /></main>,
    { api },
  )
  return { ...view, api, onOpen, onContinue }
}
const openMenu = (container) => fireEvent.contextMenu(container.querySelector('.media-card__open'))

describe('LibraryCardMenu on MediaCard', () => {
  it('lists continue, details, status group, favorite and remove in order', async () => {
    const { container } = setup()
    openMenu(container)
    const menu = await screen.findByRole('menu', { name: 'Show' })
    const labels = Array.from(menu.querySelectorAll('[role^="menuitem"]')).map((n) => n.textContent.replace('✓', '').trim())
    expect(labels).toEqual(['Nastavi EP 1', 'Detalji', 'Gledam', 'Završeno', 'Planiram', 'Pauzirano', 'Odustao', 'Dodaj u omiljene', 'Ukloni iz Watchlist-e'])
    expect(within(menu).getByRole('group', { name: 'Status' })).toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(5)
    expect(within(menu).getByRole('menuitemradio', { name: /Gledam/ })).toHaveAttribute('aria-checked', 'true')
  })
  it('has no continue for a completed series', async () => {
    const { container } = setup({ entry: entry({ status: 'completed' }) })
    openMenu(container)
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: /Nastavi/ })).toBeNull()
  })
  it('disables continue when not ready', async () => {
    const { container, onContinue } = setup({ ready: false })
    openMenu(container)
    const item = await screen.findByRole('menuitem', { name: 'Nastavi EP 1' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
    expect(onContinue).not.toHaveBeenCalled()
  })
  it('continue calls onContinue with the next episode', async () => {
    const { container, onContinue } = setup()
    openMenu(container)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Nastavi EP 1' }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '1' })
  })
  it('changes status, closes and returns focus to the card; the current status does nothing', async () => {
    const { container, api } = setup()
    openMenu(container)
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Planiram/ }))
    expect(api.library.update).toHaveBeenCalledWith('a', { status: 'planned' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(container.querySelector('.media-card__open')).toHaveFocus()
    api.library.update.mockClear()
    openMenu(container)
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Gledam/ }))
    expect(api.library.update).not.toHaveBeenCalled()
  })
  it('details opens the entry and does not return focus to the card', async () => {
    const { container, onOpen } = setup()
    openMenu(container)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Detalji' }))
    expect(onOpen).toHaveBeenCalledWith('a')
    expect(container.querySelector('.media-card__open')).not.toHaveFocus()
  })
  it('explains the pin limit', async () => {
    const api = makeFakeApi()
    api.library.setPinned.mockResolvedValueOnce({ ok: false, error: 'pin-limit' })
    const { container } = setup({}, api)
    openMenu(container)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Dodaj u omiljene' }))
    expect(await screen.findByText(/Možeš zakačiti najviše 5 serija/)).toBeInTheDocument()
    expect(api.library.setPinned).toHaveBeenCalledWith('a', true)
  })
  it('remove releases focus to the undo toast', async () => {
    const { container, api } = setup()
    openMenu(container)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ukloni iz Watchlist-e' }))
    await waitFor(() => expect(api.library.remove).toHaveBeenCalledWith('a'))
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    await waitFor(() => expect(undo).toHaveFocus())
  })
  it('main button advertises Shift+F10, which opens the menu from the play button', async () => {
    const { container } = setup()
    expect(container.querySelector('.media-card__open')).toHaveAttribute('aria-keyshortcuts', 'Shift+F10')
    fireEvent.keyDown(await screen.findByRole('button', { name: /Nastavi EP 1/ }), { key: 'F10', shiftKey: true })
    expect(await screen.findByRole('menu', { name: 'Show' })).toBeInTheDocument()
  })
})

describe('LibraryCardMenu on ContinueCard', () => {
  it('offers the same menu with continue always present', async () => {
    const onContinue = vi.fn()
    const { container } = renderUi(<main className="content" tabIndex={-1}><ContinueCard entry={entry({ status: 'completed' })} ready onContinue={onContinue} onOpen={() => {}} /></main>)
    expect(container.querySelector('.continue-card__open')).toHaveAttribute('aria-keyshortcuts', 'Shift+F10')
    fireEvent.contextMenu(container.querySelector('.continue-card__open'))
    expect(await screen.findByRole('menuitem', { name: 'Nastavi EP 1' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(5)
  })
  it('opens while the card button is disabled (positions not loaded); continue is disabled', async () => {
    const api = makeFakeApi({ positions: { forSeries: vi.fn(() => new Promise(() => {})) } })
    const { container } = renderUi(<main className="content" tabIndex={-1}><ContinueCard entry={entry()} ready onContinue={() => {}} onOpen={() => {}} /></main>, { api })
    expect(container.querySelector('.continue-card__open')).toBeDisabled()
    fireEvent.contextMenu(container.querySelector('.continue-card'))
    expect(await screen.findByRole('menuitem', { name: /Nastavi/ })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('status change on a filtered Watchlist', () => {
  it('moves focus to main.content when the card disappears', async () => {
    let list = [entry()]
    let changed = () => {}
    const api = makeFakeApi({ library: { list: vi.fn(async () => list), update: vi.fn(async (id, p) => { list = [entry(p)]; return list[0] }) } })
    api.onLibraryChanged = vi.fn((cb) => { changed = cb; return () => {} })
    const { container } = renderUi(<main className="content" tabIndex={-1}><WatchlistPage ready onContinue={() => {}} /></main>, { api })
    await screen.findByText('Show')
    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: /^Gledam/ }))
    openMenu(container)
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Planiram/ }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalled())
    changed()
    await waitFor(() => expect(container.querySelector('.media-card')).toBeNull())
    await waitFor(() => expect(document.querySelector('main.content')).toHaveFocus())
  })
})
