// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

// tests flip these: crash = PlayerView throws on render; hold = the player module is still loading (Suspense fallback)
const gate = vi.hoisted(() => ({ crash: false, hold: null }))
vi.mock('../../../src/renderer/player/loadPlayer.js', async () => {
  const { PlayerView } = await import('../../../src/renderer/components/PlayerView.jsx')
  const { createElement } = await import('react')
  const Guarded = (props) => { if (gate.crash) throw new Error('boom'); return createElement(PlayerView, props) }
  return { loadPlayer: async () => { if (gate.hold) await gate.hold; return { PlayerView: Guarded } } }
})

const entry = { id: 'a1', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [1], episodeNotes: {}, lastWatchedAt: null, pinnedAt: null }
const ep = (id, episode) => ({ playbackId: id, title: 'Show', episode, kind: 'hls', src: `http://127.0.0.1:9/${id}`, subtitleUrl: null, resumeAt: null, totalEpisodes: 12 })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

async function start({ settings = {}, library = [entry] } = {}) {
  const cb = {}
  // Home's search page registers its own handlers too: keep every subscriber and notify all, like the real event bus
  const ends = new Set()
  const playings = new Set()
  const menus = new Set()
  const titles = new Set()
  const sub = (set) => (f) => { set.add(f); return () => set.delete(f) }
  cb.end = (e) => [...ends].forEach((f) => f(e))
  cb.playing = (e) => [...playings].forEach((f) => f(e))
  cb.menu = (e) => [...menus].forEach((f) => f(e))
  cb.title = (e) => [...titles].forEach((f) => f(e))
  const api = makeFakeApi({
    settings: { get: vi.fn(async () => ({ ...DEFAULT_SETTINGS, ...settings })) },
    library: { list: vi.fn(async () => library) },
    player: { onOpen: vi.fn((f) => { cb.open = f; return () => {} }), onRetry: vi.fn((f) => { cb.retry = f; return () => {} }), onClose: vi.fn((f) => { cb.close = f; return () => {} }) },
    watch: { onSessionEnd: vi.fn(sub(ends)), onPlaying: vi.fn(sub(playings)), onMenu: vi.fn(sub(menus)), onTitle: vi.fn(sub(titles)) },
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
// Home's Search: the episode list of "Show" is the menu of session s1; pick episode 2 and let the player open
async function searchPlay(s, { open = true } = {}) {
  act(() => s.cb.menu({ requestId: 'r1', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
  act(() => s.cb.title({ sessionId: 's1', title: 'Show' }))
  fireEvent.click(await screen.findByRole('button', { name: '2' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Gledaj' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Gledaj' }))
  expect(s.api.watch.answerMenu).toHaveBeenCalledWith('r1', '2')
  if (!open) return
  act(() => s.cb.playing({ title: 'Show', episode: '2', sessionId: 's1' }))
  await s.openPlayer(ep('p1', '2'))
}
const playFromDetail = () => fireEvent.click(screen.getByRole('button', { name: /^Nastavi EP 2/ }))

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(function () { return Promise.resolve() })
  HTMLMediaElement.prototype.pause = vi.fn()
  window.requestIdleCallback = vi.fn(() => 1)
  window.cancelIdleCallback = vi.fn()
})
afterEach(() => { gate.crash = false; gate.hold = null; delete window.requestIdleCallback; delete window.cancelIdleCallback })

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
  it('Back on a failed reconnect forgets the origin', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await s.openPlayer(ep('p1', '2'))
    act(() => s.cb.retry({ title: 'Show', episode: '2', state: 'failed', error: 'unknown', sessionId: null }))
    act(() => s.cb.close())
    fireEvent.click(await screen.findByRole('button', { name: 'Nazad' }))
    expect(s.onDetail()).toBe(false)
    await s.openPlayer(ep('p2', '2')) // started from the Home search box
    clickBack()
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
  })})

describe('Back from a player started in the Search episode list', () => {
  const reopened = { query: 'Show', anime: 'Show' }
  it('back reopens that episode list', async () => {
    const s = await start()
    await searchPlay(s)
    expect(s.api.watch.start).not.toHaveBeenCalled()
    clickBack()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledTimes(1))
    expect(s.api.watch.start).toHaveBeenCalledWith(reopened)
    expect(document.querySelector('.player')).toBeNull()
  })
  it('ended behaves like back for a search start', async () => {
    const s = await start()
    await searchPlay(s, { open: false })
    act(() => s.cb.playing({ title: 'Show', episode: '2', sessionId: 's1' }))
    await s.openPlayer(ep('p1', '12')) // the last episode: the end card offers Back
    act(() => { fireEvent(document.querySelector('.player__video'), new Event('ended')) })
    fireEvent.click(within(document.querySelector('.player__card')).getByRole('button', { name: 'Nazad' }))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledWith(reopened))
  })
  it('the reopened list marks the just-watched episode as watched', async () => {
    const s = await start()
    await searchPlay(s)
    s.api.library.list.mockResolvedValue([{ ...entry, watchedEpisodes: [1, 2] }]) // the player saved its progress
    clickBack()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledWith(reopened))
    act(() => s.cb.menu({ requestId: 'r2', sessionId: 's2', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
    const two = await screen.findByRole('button', { name: '2' })
    await waitFor(() => expect(two.className).toContain('ep--watched'))
  })
  it('the reopened list takes focus once it arrives', async () => {
    const s = await start()
    await searchPlay(s)
    clickBack()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledWith(reopened))
    act(() => s.cb.menu({ requestId: 'r2', sessionId: 's2', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
    const heading = await screen.findByRole('heading', { name: /Izaberi epizodu/ })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })
  it('back after Next still reopens the search list', async () => {
    const s = await start()
    await searchPlay(s)
    act(() => s.cb.playing({ title: 'Show', episode: '2', sessionId: 's1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledTimes(1))
    act(() => s.cb.end({ sessionId: 's1', retry: false, result: { ok: true } }))
    await s.openPlayer(ep('p2', '3'))
    clickBack()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledTimes(2))
    expect(s.api.watch.start).toHaveBeenLastCalledWith(reopened)
  })
  it('a top bar click during a search playback does not reopen the list', async () => {
    const s = await start()
    await searchPlay(s)
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    expect(await screen.findByRole('heading', { name: 'Podešavanja' })).toBeInTheDocument()
    expect(document.querySelector('.player')).toBeNull()
    await flush()
    expect(s.api.watch.start).not.toHaveBeenCalled()
  })
  it('a failed search start does not reopen the list', async () => {
    const s = await start()
    await searchPlay(s, { open: false })
    act(() => s.cb.end({ sessionId: 's1', retry: false, result: { ok: false, error: 'no-sources' } }))
    await s.openPlayer(ep('p1', '2')) // a later start from Home
    clickBack()
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    await flush()
    expect(s.api.watch.start).not.toHaveBeenCalled()
  })
  it('Continue on Home after a search playback stays on Home', async () => {
    const s = await start()
    await searchPlay(s)
    clickBack()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledTimes(1))
    // the old session's late end is ignored (fake sessions share the id s1), the reopened one is cancelled: Home shows its rails again
    act(() => s.cb.end({ sessionId: 's1', retry: false, result: { ok: true } }))
    act(() => s.cb.end({ sessionId: 's1', retry: false, result: { ok: false, error: 'cancelled' } }))
    fireEvent.click(await screen.findByRole('button', { name: /Nastavi EP 2: Show/ }))
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalledTimes(2))
    await s.openPlayer(ep('p2', '2'))
    clickBack()
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
    expect(s.api.watch.start).toHaveBeenCalledTimes(2)
  })
  it('the "episodes" setting wins over a search start', async () => {
    const s = await start({ settings: { returnAfterEpisode: 'episodes' } })
    await searchPlay(s)
    clickBack()
    await waitFor(() => expect(s.onDetail()).toBe(true))
    expect(screen.getByRole('tab', { name: 'Epizode' })).toHaveAttribute('aria-selected', 'true')
    expect(s.api.watch.start).not.toHaveBeenCalled()
  })
})

describe('Closing the player with a reason', () => {
  it('external playback does not return to the origin', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalled())
    await s.openPlayer({ ...ep('p1', '2'), kind: 'file' })
    fireEvent(document.querySelector('.player__video'), new Event('error')) // an undecodable file offers the external player
    fireEvent.click(await screen.findByRole('button', { name: 'Pusti u spoljnom plejeru (mpv)' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
    await s.openPlayer(ep('p2', '2')) // a fresh start from Home: the old origin is gone
    clickBack()
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
  })
  it('ended from the detail returns to the detail', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalled())
    await s.openPlayer(ep('p1', '12'))
    act(() => { fireEvent(document.querySelector('.player__video'), new Event('ended')) })
    fireEvent.click(within(document.querySelector('.player__card')).getByRole('button', { name: 'Nazad' }))
    await waitFor(() => expect(s.onDetail()).toBe(true))
  })
})

describe('Player that never gets going', () => {
  it('closing a crashed player behaves like Back (returns to the origin)', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await waitFor(() => expect(s.api.watch.start).toHaveBeenCalled())
    gate.crash = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => s.cb.open(ep('p1', '2')))
    fireEvent.click(await screen.findByRole('button', { name: 'Zatvori' }))
    await waitFor(() => expect(s.onDetail()).toBe(true))
    expect(s.api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ playbackId: 'p1', reason: 'back' }))
  })
  it('a next/previous with no episode number forgets the origin', async () => {
    const s = await start()
    await s.openDetail()
    playFromDetail()
    await s.openPlayer({ ...ep('p1', '2'), episode: null })
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.api.watch.start).toHaveBeenCalledTimes(1)
    await s.openPlayer(ep('p2', '2')) // a fresh start from Home
    clickBack()
    await waitFor(() => expect(document.querySelector('.player')).toBeNull())
    expect(s.onDetail()).toBe(false)
  })
  it('a top bar click while the player module is still loading is not lost', async () => {
    let release
    gate.hold = new Promise((r) => { release = r })
    const s = await start()
    act(() => s.cb.open(ep('p1', '2')))
    await waitFor(() => expect(document.querySelector('.player__loading')).not.toBeNull())
    expect(document.querySelector('.player__video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    expect(await screen.findByRole('heading', { name: 'Podešavanja' })).toBeInTheDocument()
    expect(document.querySelector('.player')).toBeNull()
    expect(s.api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ playbackId: 'p1' }))
    release()
  })
  it('a top bar click over the crash screen is not lost', async () => {
    const s = await start()
    gate.crash = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => s.cb.open(ep('p1', '2')))
    await screen.findByRole('button', { name: 'Zatvori' })
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    expect(await screen.findByRole('heading', { name: 'Podešavanja' })).toBeInTheDocument()
    expect(document.querySelector('.error-fallback--overlay')).toBeNull()
  })
})
