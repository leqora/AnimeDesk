// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
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
    const onChanged = vi.fn()
    mount(api, { onChanged })
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    await screen.findByRole('button', { name: 'Poništi' })
    onChanged.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Poništi' }))
    await waitFor(() => expect(api.library.restore).toHaveBeenCalledWith('a1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
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
  it('a rejected restore shows the error toast', async () => {
    const api = makeFakeApi({ library: { restore: vi.fn(async () => { throw new Error('ipc') }) } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Poništi' }))
    expect(await screen.findByText('Seriju nije moguće vratiti.')).toBeInTheDocument()
  })
  it('a rejected remove stays on the page without a toast', async () => {
    const api = makeFakeApi({ library: { remove: vi.fn(async () => { throw new Error('ipc') }) } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onRemoved = vi.fn()
    mount(api, { onRemoved })
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    await waitFor(() => expect(api.library.remove).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(onRemoved).not.toHaveBeenCalled()
    expect(screen.queryByText(/Uklonjeno iz watchlist-e/)).not.toBeInTheDocument()
  })
  it('rapid marks accumulate and each undo touches only its episode', async () => {
    const api = makeFakeApi()
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [1, 2, 3] }))
    const undo = await screen.findAllByRole('button', { name: 'Poništi' })
    fireEvent.click(undo[0])
    await waitFor(() => expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [1, 3] }))
  })
  it('a rejected undo of a mark does not throw', async () => {
    const api = makeFakeApi()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    api.library.update.mockImplementationOnce(async () => { throw new Error('ipc') })
    fireEvent.click(undo)
    await waitFor(() => expect(console.error).toHaveBeenCalled())
  })
  it('a rejected save rolls the latest watched list back', async () => {
    const api = makeFakeApi()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(api)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    api.library.update.mockImplementationOnce(async () => { throw new Error('ipc') })
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [1, 3] }))
  })
  // Leaves the detail (the toast provider stays mounted, as in the app) and returns the Undo button.
  const markEp3AndLeave = async (api, e = entry({ watchedEpisodes: [1, 2] })) => {
    const { rerender } = mount(api, {}, e)
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [1, 2, 3] })
    rerender(<div />)
    return undo
  }
  it('undo after unmount reads the fresh entry', async () => {
    const api = makeFakeApi()
    const undo = await markEp3AndLeave(api)
    api.library.list.mockImplementation(async () => [entry({ watchedEpisodes: [1, 2, 3, 4] })])
    fireEvent.click(undo)
    await waitFor(() => expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [1, 2, 4] }))
  })
  it('undo after unmount when the series is gone does nothing', async () => {
    const api = makeFakeApi()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const undo = await markEp3AndLeave(api)
    api.library.update.mockClear()
    api.library.list.mockImplementation(async () => [])
    fireEvent.click(undo)
    await waitFor(() => expect(api.library.list).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(api.library.update).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
  })
  it('failed save does not drop a newer optimistic mark', async () => {
    const api = makeFakeApi()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(api, {}, entry({ watchedEpisodes: [1, 2] }))
    let rejectFirst
    api.library.update.mockImplementationOnce(() => new Promise((_, rej) => { rejectFirst = rej }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [1, 2, 3, 4] }))
    rejectFirst(new Error('ipc'))
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    // a following change still sees EP 4 (the stale rollback must not have restored [1, 2])
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni oznaku odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenLastCalledWith('a1', { watchedEpisodes: [2, 3, 4] }))
  })
})

describe('AnimeDetail marks', () => {
  const marked = (meta, marks) => ({ source: 'ani-cli', meta, marks, markCounts: { filler: 1, recap: 0 }, episodes: ['1', '2', '3', '4'].map((n) => ({ number: n, runtime: null, visibility: 'hidden', ...(n === '2' ? { kind: 'filler' } : {}) })) })
  const OFF = 'Isključi metapodatke za ovu seriju'
  it('shows the metadata switch row when marks are available even without metadata', async () => {
    const s = marked('none', 'ok')
    mount(makeFakeApi({ episodes: { forSeries: vi.fn(async () => s) } }))
    expect(await screen.findByLabelText(OFF)).toBeInTheDocument()
  })
  it.each([['none', 'none'], ['none', 'off']])('hides the row when meta is %s and marks is %s', async (meta, marks) => {
    const api = makeFakeApi({ episodes: { forSeries: vi.fn(async () => marked(meta, marks)) } })
    mount(api)
    await waitFor(() => expect(api.episodes.forSeries).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByLabelText(OFF)).not.toBeInTheDocument()
  })
  it('toggling hide saves hideFiller for the series and hides marked episodes', async () => {
    const api = makeFakeApi({ episodes: { forSeries: vi.fn(async () => marked('none', 'ok')) } })
    mount(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Sakrij filler i recap' }))
    await waitFor(() => expect(api.seriesPrefs.set).toHaveBeenCalledWith('Show', { hideFiller: true }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '2, filler' })).not.toBeInTheDocument())
  })
})

describe('AnimeDetail fuzzy AniList match', () => {
  const now = Date.now()
  const closeInfo = {
    id: 777, match: 'close', title: 'Other Show', year: 2011, genres: ['Drama'], description: 'Opis serije',
    episodes: 24, duration: 24, status: 'RELEASING', poster: null,
    nextAiring: { episode: 5, airingAt: now + 3 * 3600_000 },
  }
  it('shows only poster-level data: no id/episodes patch, no description, no episode meta, no airing line', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => closeInfo) } })
    mount(api, {}, entry({ totalEpisodes: null }))
    await screen.findByText('Drama')
    await act(async () => {})
    expect(api.library.update).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Prikaži opis' })).not.toBeInTheDocument()
    expect(screen.queryByText(/24 EP/)).not.toBeInTheDocument()
    expect(screen.queryByText(/24 min/)).not.toBeInTheDocument()
    expect(screen.queryByText(/izlazi/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/novih|nova|nove/)).not.toBeInTheDocument()
    expect(screen.getByText(/2011/)).toBeInTheDocument()
  })
  it('a skipped close info does not consume the patch: a later exact info patches the same entry', async () => {
    const forTitle = vi.fn(async (title) => (title === 'Show'
      ? closeInfo
      : { id: 5, match: 'exact', title: 'Show Two', episodes: 12, genres: [], poster: null }))
    const api = makeFakeApi({ anilist: { forTitle } })
    const e = entry({ totalEpisodes: null })
    const { rerender } = mount(api, {}, e)
    await screen.findByText('Drama')
    await act(async () => {})
    expect(api.library.update).not.toHaveBeenCalled()
    rerender(<AnimeDetail entry={{ ...e, title: 'Show Two' }} ready onBack={() => {}} onRemoved={() => {}} onChanged={() => {}} onContinue={() => {}} />)
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { aniListId: 5, totalEpisodes: 12 }))
  })
  it('an entry that already has an aniListId keeps the totalEpisodes patch as before', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ id: 5, match: 'id', episodes: 12, genres: [], poster: null })) } })
    mount(api, {}, entry({ aniListId: 5, totalEpisodes: null }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { totalEpisodes: 12 }))
  })
})
