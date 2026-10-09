// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { DownloadsPage, groupByTitle } from '../../../src/renderer/pages/DownloadsPage.jsx'

const downloaded = [
  { id: 'd2', title: 'Show', episode: '2', path: 'D:\\A\\Show\\Show Episode 2.mp4', missing: false },
  { id: 'd1', title: 'Show', episode: '1', path: 'D:\\A\\Show\\Show Episode 1.mp4', missing: false },
  { id: 'd3', title: 'Gone', episode: '1', path: 'D:\\A\\Gone\\Gone Episode 1.mp4', missing: true },
]

describe('groupByTitle', () => {
  it('groups and sorts', () => {
    const g = groupByTitle(downloaded)
    expect(g.map(([title]) => title)).toEqual(['Gone', 'Show'])
    expect(g[1][1].map((i) => i.episode)).toEqual(['1', '2'])
  })
})

describe('DownloadsPage', () => {
  it('shows the queue with progress and controls', async () => {
    let push
    const api = makeFakeApi({
      downloads: {
        queue: vi.fn(async () => [{ id: 'q1', title: 'Show', episode: '3', status: 'downloading', percent: 42.4 }]),
        onChange: vi.fn((cb) => { push = cb; return () => {} }),
      },
    })
    renderUi(<DownloadsPage />, { api })
    await waitFor(() => expect(screen.getByText('Preuzima 42%')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Pauza' }))
    expect(api.downloads.pause).toHaveBeenCalledWith('q1')
    act(() => push([{ id: 'q1', title: 'Show', episode: '3', status: 'paused', percent: 42 }]))
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi' }))
    expect(api.downloads.resume).toHaveBeenCalledWith('q1')
    fireEvent.click(screen.getByRole('button', { name: 'Otkaži' }))
    expect(api.downloads.cancel).toHaveBeenCalledWith('q1')
  })
  it('lists downloaded episodes with play, open folder and delete', async () => {
    const api = makeFakeApi({ downloads: { list: vi.fn(async () => downloaded) } })
    renderUi(<DownloadsPage />, { api })
    await waitFor(() => screen.getByRole('heading', { name: 'Show' }))
    const playButtons = screen.getAllByRole('button', { name: 'Pusti' })
    expect(playButtons).toHaveLength(2)
    fireEvent.click(playButtons[0])
    expect(api.downloads.play).toHaveBeenCalledWith('d1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Otvori folder' })[0])
    expect(api.downloads.openFolder).toHaveBeenCalledWith('d1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Obriši' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(api.downloads.remove).toHaveBeenCalledWith('d1', true))
  })
  it('flags missing files and lets the user remove the entry', async () => {
    const api = makeFakeApi({ downloads: { list: vi.fn(async () => downloaded) } })
    renderUi(<DownloadsPage />, { api })
    await waitFor(() => screen.getByText('Fajl ne postoji'))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni sa liste' }))
    await waitFor(() => expect(api.downloads.remove).toHaveBeenCalledWith('d3', false))
  })
  it('explains why a queued download failed', async () => {
    const api = makeFakeApi({ downloads: { queue: vi.fn(async () => [{ id: 'q1', title: 'Gone', episode: '1', status: 'error', percent: 0, error: 'not-found' }]) } })
    renderUi(<DownloadsPage />, { api })
    await waitFor(() => expect(screen.getByText('Anime više nije pronađen u pretrazi.')).toBeInTheDocument())
  })
  it('retries all failed downloads at once when more than one failed', async () => {
    const failed = (id, episode) => ({ id, title: 'Show', episode, status: 'error', percent: 0, error: 'unknown' })
    const api = makeFakeApi({ downloads: { queue: vi.fn(async () => [failed('q1', '1'), failed('q2', '2')]), retryFailed: vi.fn(async () => {}) } })
    renderUi(<DownloadsPage />, { api })
    fireEvent.click(await screen.findByRole('button', { name: 'Ponovi neuspele (2)' }))
    expect(api.downloads.retryFailed).toHaveBeenCalled()
  })
  it('does not show the retry-all button for a single failure', async () => {
    const api = makeFakeApi({ downloads: { queue: vi.fn(async () => [{ id: 'q1', title: 'Show', episode: '1', status: 'error', percent: 0, error: 'unknown' }]) } })
    renderUi(<DownloadsPage />, { api })
    await screen.findByRole('button', { name: 'Nastavi' })
    expect(screen.queryByRole('button', { name: /Ponovi neuspele/ })).not.toBeInTheDocument()
  })
  it('shows an empty message', async () => {
    renderUi(<DownloadsPage />)
    await waitFor(() => expect(screen.getByText('Nema preuzetih epizoda.')).toBeInTheDocument())
  })
})
