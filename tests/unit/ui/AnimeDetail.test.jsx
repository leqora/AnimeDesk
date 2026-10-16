// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { AnimeDetail } from '../../../src/renderer/pages/AnimeDetail.jsx'

const entry = (over = {}) => ({
  id: 'a1', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '',
  totalEpisodes: 4, watchedEpisodes: [1], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null, ...over,
})
const mount = (api, props = {}, e = entry()) =>
  renderUi(<AnimeDetail entry={e} ready onBack={() => {}} onRemoved={() => {}} onChanged={() => {}} onContinue={() => {}} {...props} />, { api })

describe('AnimeDetail undo', () => {
  it('removing a series goes back and offers undo', async () => {
    const api = makeFakeApi()
    const onRemoved = vi.fn()
    mount(api, { onRemoved })
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    await waitFor(() => expect(onRemoved).toHaveBeenCalled())
    expect(api.library.remove).toHaveBeenCalledWith('a1')
    expect(await screen.findByText('Uklonjeno iz watchlist-e: Show')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Poništi' })).toBeInTheDocument()
  })
  it('undo restores the series', async () => {
    const api = makeFakeApi()
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Poništi' }))
    await waitFor(() => expect(api.library.restore).toHaveBeenCalledWith('a1'))
    expect(screen.queryByText('Seriju nije moguće vratiti.')).not.toBeInTheDocument()
  })
  it('failed undo shows an error toast', async () => {
    const api = makeFakeApi({ library: { restore: vi.fn(async () => ({ ok: false, error: 'expired' })) } })
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Poništi' }))
    expect(await screen.findByText('Seriju nije moguće vratiti.')).toBeInTheDocument()
  })
  it('marking an episode offers undo with the previous list', async () => {
    const api = makeFakeApi()
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { watchedEpisodes: [1, 2] }))
    expect(await screen.findByText('EP 2 označena kao odgledana')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Poništi' }))
    await waitFor(() => expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [1] }))
  })
  it('unmarking shows the not-watched text', async () => {
    const api = makeFakeApi()
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni oznaku odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { watchedEpisodes: [] }))
    expect(await screen.findByText('EP 1 označena kao neodgledana')).toBeInTheDocument()
  })
  it('toasts never show an episode title', async () => {
    const series = { source: 'ani-cli', meta: 'ok', episodes: ['1', '2', '3', '4'].map((n) => ({ number: n, runtime: null, visibility: 'full', title: n === '2' ? 'Secret' : null })) }
    const api = makeFakeApi({ episodes: { forSeries: vi.fn(async () => series), spoilers: vi.fn(async () => series), thumb: vi.fn(async () => null) } })
    mount(api)
    await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    const toastText = await screen.findByText('EP 2 označena kao odgledana')
    expect(toastText.closest('[role="status"], [role="region"]')?.textContent ?? toastText.textContent).not.toContain('Secret')
  })
})
