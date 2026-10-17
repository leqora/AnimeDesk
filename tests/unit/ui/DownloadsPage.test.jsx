// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

describe('DownloadsPage waiting items', () => {
  const retryAt = new Date(2026, 9, 17, 14, 35).getTime()
  const waiting = { id: 'q9', title: 'Show', episode: '5', status: 'waiting', percent: 0, retryAt, auto: true, attempts: 1, error: 'no-sources' }
  const mount = (item = waiting) => {
    const api = makeFakeApi({ downloads: { queue: vi.fn(async () => [item]) } })
    renderUi(<DownloadsPage />, { api })
    return api
  }
  // "today" is fixed to the retryAt day so the time format does not depend on when the tests run
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 17, 10, 0)) })
  afterEach(() => { vi.useRealTimers() })
  it('shows the next try time, the Auto tag and no error text', async () => {
    mount()
    const time = new Date(retryAt).toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })
    expect(await screen.findByText(`Čeka izvor · sledeći pokušaj u ${time}`)).toBeInTheDocument()
    expect(screen.getByText('Auto')).toBeInTheDocument()
    expect(screen.queryByText('Epizoda je izašla, ali trenutno nema ispravnih izvora.')).toBeNull()
  })
  it('adds the short weekday when the next try is not today', async () => {
    const tomorrow = new Date(2026, 9, 18, 9, 5).getTime()
    mount({ ...waiting, retryAt: tomorrow })
    const when = new Date(tomorrow).toLocaleString('sr-Latn', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    expect(when).not.toBe(new Date(tomorrow).toLocaleTimeString('sr-Latn', { hour: '2-digit', minute: '2-digit' }))
    expect(await screen.findByText(`Čeka izvor · sledeći pokušaj u ${when}`)).toBeInTheDocument()
  })
  it('Try now resumes, Cancel cancels, there is no Pause', async () => {
    const api = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Pokušaj sada' }))
    expect(api.downloads.resume).toHaveBeenCalledWith('q9')
    fireEvent.click(screen.getByRole('button', { name: 'Otkaži' }))
    expect(api.downloads.cancel).toHaveBeenCalledWith('q9')
    expect(screen.queryByRole('button', { name: 'Pauza' })).toBeNull()
  })
  it('manual items have no Auto tag', async () => {
    const api = makeFakeApi({ downloads: { queue: vi.fn(async () => [{ ...waiting, status: 'downloading', auto: false, percent: 10 }]) } })
    renderUi(<DownloadsPage />, { api })
    await screen.findByText('Preuzima 10%')
    expect(screen.queryByText('Auto')).toBeNull()
  })
})
