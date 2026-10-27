// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

vi.mock('../../../src/renderer/player/loadPlayer.js', async () => {
  const { PlayerView } = await import('../../../src/renderer/components/PlayerView.jsx')
  return { loadPlayer: async () => ({ PlayerView }) }
})

const entry = { id: 'a1', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [1], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null }
const ep = (id, episode) => ({ playbackId: id, title: 'Show', episode, kind: 'hls', src: `http://127.0.0.1:9/${id}`, subtitleUrl: null, resumeAt: null, totalEpisodes: 12 })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

async function start({ settings = {}, library = [entry] } = {}) {
  const cb = {}
  const api = makeFakeApi({
    settings: { get: vi.fn(async () => ({ ...DEFAULT_SETTINGS, ...settings })) },
    library: { list: vi.fn(async () => library) },
    player: { onOpen: vi.fn((f) => { cb.open = f; return () => {} }) },
    watch: { onSessionEnd: vi.fn((f) => { cb.end = f; return () => {} }), onPlaying: vi.fn((f) => { cb.playing = f; return () => {} }) },
  })
  api.onOpenAnime = vi.fn((f) => { cb.anime = f; return () => {} })
  render(<App api={api} />)
  await screen.findByLabelText('Naziv animea…')
  await waitFor(() => expect(cb.anime).toBeDefined())
  return {
    api, cb,
    openDetail: async () => { act(() => cb.anime({ animeId: 'a1' })); await waitFor(() => expect(document.querySelector('.detail-hero')).not.toBeNull()) },
    openPlayer: async (p) => { act(() => cb.open(p)); await screen.findByRole('button', { name: 'Podešavanja plejera' }, { timeout: 5000 }); await flush() },
    onDetail: () => document.querySelector('.detail-hero') != null,
  }
}
const clickBack = () => fireEvent.click(screen.getAllByRole('button', { name: 'Nazad' }).find((b) => !b.closest('[aria-hidden="true"]')))
const playFromDetail = () => fireEvent.click(screen.getByRole('button', { name: /^Nastavi EP 2/ }))

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(function () { return Promise.resolve() })
  HTMLMediaElement.prototype.pause = vi.fn()
  window.requestIdleCallback = vi.fn(() => 1)
  window.cancelIdleCallback = vi.fn()
})
afterEach(() => { delete window.requestIdleCallback; delete window.cancelIdleCallback })

describe('Back from the player', () => {
  it('back from a player started on the series detail returns to the detail with its tab', async () => {
    const s = await start()
    await s.openDetail()
    fireEvent.click(screen.getByRole('tab', { name: 'Beleške' }))
    playFromDetail()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalled())
    expect(s.onDetail()).toBe(false)
    await s.openPlayer(ep('p1', '2'))
    clickBack()
    await waitFor(() => expect(s.onDetail()).toBe(true))
    expect(screen.getByRole('tab', { name: 'Beleške' })).toHaveAttribute('aria-selected', 'true')
  })
  it('next episode keeps the origin', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await s.openPlayer(ep('p1', '2'))
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledTimes(2))
    await s.openPlayer(ep('p2', '3'))
    clickBack()
    await waitFor(() => expect(s.onDetail()).toBe(true))
  })
  it('back from a player started on Home stays on Home', async () => {
    const s = await start()
    await s.openPlayer(ep('p1', '2'))
    clickBack()
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
    expect(screen.getByLabelText('Naziv animea…')).toBeInTheDocument()
  })
  it('a failed start forgets the origin', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalled())
    act(() => s.cb.end({ sessionId: 's1', retry: false, result: { ok: false, error: 'unknown' } }))
    expect(s.onDetail()).toBe(false)
    await s.openPlayer(ep('p1', '2')) // started from Home (search box), no origin
    clickBack()
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
  })
  it('the late end of the previous playback does not forget the origin', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await s.openPlayer(ep('p1', '2'))
    act(() => s.cb.playing({ title: 'Show', episode: '2', sessionId: 's1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledTimes(2))
    act(() => s.cb.end({ sessionId: 's1', retry: false, result: { ok: true } }))
    await s.openPlayer(ep('p2', '3'))
    clickBack()
    await waitFor(() => expect(s.onDetail()).toBe(true))
  })
  it('the "episodes" setting returns to the series episodes', async () => {
    const s = await start({ settings: { returnAfterEpisode: 'episodes' } })
    fireEvent.click(await screen.findByRole('button', { name: /Nastavi EP 2: Show/ }))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalled())
    await s.openPlayer(ep('p1', '2'))
    clickBack()
    await waitFor(() => expect(s.onDetail()).toBe(true))
    expect(screen.getByRole('tab', { name: 'Epizode' })).toHaveAttribute('aria-selected', 'true')
  })
  it('topbar navigation during playback does not return to the origin', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await s.openPlayer(ep('p1', '2'))
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
    expect(await screen.findByRole('heading', { name: 'Podešavanja' })).toBeInTheDocument()
  })
})
