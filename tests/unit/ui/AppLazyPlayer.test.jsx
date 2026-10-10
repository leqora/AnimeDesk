// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

const loader = vi.hoisted(() => ({ fn: null }))
vi.mock('../../../src/renderer/player/loadPlayer.js', () => ({ loadPlayer: (...a) => loader.fn(...a) }))
const FakePlayer = () => <div className="player" data-testid="fake-player" />
const episode = (id) => ({ playbackId: id, title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 })

const start = async () => {
  let openPlayer
  const api = makeFakeApi({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
  render(<App api={api} />)
  await screen.findByLabelText('Naziv animea…')
  return { api, open: (p) => act(() => openPlayer(p)) }
}

beforeEach(() => {
  loader.fn = vi.fn(async () => ({ PlayerView: FakePlayer }))
  window.requestIdleCallback = vi.fn(() => 1) // never runs unless a test calls it
  window.cancelIdleCallback = vi.fn()
})
afterEach(() => { delete window.requestIdleCallback; delete window.cancelIdleCallback })

describe('App lazy player', () => {
  it('shows the player spinner until the player code has loaded', async () => {
    let done
    loader.fn = vi.fn(() => new Promise((r) => { done = r }))
    const { open } = await start()
    open(episode('p1'))
    expect(screen.getByRole('status', { name: 'Učitavanje' })).toBeInTheDocument()
    await act(async () => done({ PlayerView: FakePlayer }))
    expect(await screen.findByTestId('fake-player')).toBeInTheDocument()
  })
  it('preloads the player code once the app is idle', async () => {
    await start()
    expect(window.requestIdleCallback).toHaveBeenCalled()
    expect(loader.fn).not.toHaveBeenCalled()
    window.requestIdleCallback.mock.calls[0][0]()
    expect(loader.fn).toHaveBeenCalledTimes(1)
  })
  it('opens the next playback normally after the player code failed to load once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loader.fn = vi.fn().mockRejectedValueOnce(new Error('chunk')).mockResolvedValue({ PlayerView: FakePlayer })
    const { open } = await start()
    open(episode('p1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Zatvori' }))
    await waitFor(() => expect(document.querySelector('.error-fallback')).toBeNull())
    open(episode('p2'))
    expect(await screen.findByTestId('fake-player')).toBeInTheDocument()
    console.error.mockRestore()
  })
})
