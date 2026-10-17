// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'
import { AnimeDetail } from '../../../src/renderer/pages/AnimeDetail.jsx'

const entry = (over = {}) => ({
  id: 'a1', title: 'Show', aniCliTitle: 'Show', aniListId: 21, status: 'watching', rating: null, comment: '',
  totalEpisodes: 4, watchedEpisodes: [1], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null, ...over,
})
const apiWith = ({ downloadDir = 'D:\Anime', auto = false, set } = {}) => makeFakeApi({
  settings: { get: vi.fn(async () => ({ ...DEFAULT_SETTINGS, downloadDir })) },
  seriesPrefs: { get: vi.fn(async () => ({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: auto })) },
  ...(set ? { autoDownload: { set } } : {}),
})
const mount = (api, e = entry()) =>
  renderUi(<AnimeDetail entry={e} ready onBack={() => {}} onRemoved={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
const box = () => screen.findByRole('checkbox', { name: 'Automatski preuzimaj nove epizode' })

describe('AnimeDetail auto-download switch', () => {
  it('starts unchecked and turning it on calls the API and shows the hint', async () => {
    const api = apiWith()
    mount(api)
    const cb = await box()
    await waitFor(() => expect(cb).not.toBeDisabled())
    expect(cb).not.toBeChecked()
    fireEvent.click(cb)
    await waitFor(() => expect(api.autoDownload.set).toHaveBeenCalledWith('a1', true))
    await waitFor(() => expect(cb).toBeChecked())
    expect(screen.getByText(/Nove epizode se preuzimaju same/)).toBeInTheDocument()
  })
  it('reflects a saved on state', async () => {
    mount(apiWith({ auto: true }))
    const cb = await box()
    await waitFor(() => expect(cb).toBeChecked())
  })
  it('is disabled with a hint when no download folder is set', async () => {
    mount(apiWith({ downloadDir: null }))
    const cb = await box()
    expect(await screen.findByText('Prvo izaberi folder za preuzimanja u Podešavanjima.')).toBeInTheDocument()
    expect(cb).toBeDisabled()
  })
  it('warns when on but the series is not being watched', async () => {
    mount(apiWith({ auto: true }), entry({ status: 'planned' }))
    expect(await screen.findByText(/Radi samo dok je serija u/)).toBeInTheDocument()
  })
  it('has no switch without aniCliTitle or aniListId', async () => {
    const api = apiWith()
    mount(api, entry({ aniCliTitle: null }))
    await screen.findByRole('combobox', { name: 'Status' })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.seriesPrefs.get).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox', { name: 'Automatski preuzimaj nove epizode' })).toBeNull()
  })
  it('has no switch without aniListId', async () => {
    const api = apiWith()
    mount(api, entry({ aniListId: null }))
    await screen.findByRole('combobox', { name: 'Status' })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('checkbox', { name: 'Automatski preuzimaj nove epizode' })).toBeNull()
  })
  it('a checked switch can be unchecked even without a download folder', async () => {
    const api = apiWith({ downloadDir: null, auto: true })
    mount(api)
    const cb = await box()
    await waitFor(() => expect(cb).toBeChecked())
    expect(cb).not.toBeDisabled()
    expect(screen.getByText('Prvo izaberi folder za preuzimanja u Podešavanjima.')).toBeInTheDocument()
    fireEvent.click(cb)
    await waitFor(() => expect(api.autoDownload.set).toHaveBeenCalledWith('a1', false))
    await waitFor(() => expect(cb).not.toBeChecked())
  })
  it('a rejected set keeps the state and shows a toast', async () => {
    const set = vi.fn(async () => { throw new Error('boom') })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(apiWith({ set }))
    const cb = await box()
    await waitFor(() => expect(cb).not.toBeDisabled())
    fireEvent.click(cb)
    expect(await screen.findByText('Podešavanje automatskog preuzimanja nije sačuvano.')).toBeInTheDocument()
    expect(cb).not.toBeChecked()
    spy.mockRestore()
  })
  it('stays unchecked when the API refuses', async () => {
    const set = vi.fn(async () => ({ ok: false, error: 'no-dir' }))
    mount(apiWith({ set }))
    const cb = await box()
    await waitFor(() => expect(cb).not.toBeDisabled())
    fireEvent.click(cb)
    await waitFor(() => expect(set).toHaveBeenCalled())
    expect(cb).not.toBeChecked()
  })
})
