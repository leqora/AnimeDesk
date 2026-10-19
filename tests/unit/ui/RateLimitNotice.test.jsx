// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const TEXT = 'AniList privremeno ograničava zahteve — slike i podaci stižu za oko 42 s'

function setup() {
  const state = { handler: null, unsub: vi.fn() }
  const api = makeFakeApi({ anilist: { onRateLimited: vi.fn((cb) => { state.handler = cb; return state.unsub }) } })
  api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, language: 'sr' })
  const view = render(<App api={api} sound={{ play: vi.fn(() => true) }} />)
  return { api, state, view }
}
afterEach(() => { vi.restoreAllMocks() })

describe('RateLimitNotice', () => {
  it('shows the rate-limit toast with the seconds', async () => {
    const { state } = setup()
    await waitFor(() => expect(state.handler).toBeTruthy())
    act(() => state.handler({ seconds: 42, until: Date.now() + 42000 }))
    expect(await screen.findByText(TEXT)).toBeInTheDocument()
  })

  it('ignores the event while the window is hidden', async () => {
    const { state } = setup()
    await waitFor(() => expect(state.handler).toBeTruthy())
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => state.handler({ seconds: 42, until: Date.now() + 42000 }))
    expect(screen.queryByText(TEXT)).toBeNull()
  })

  it('ignores an event whose until has passed', async () => {
    const { state } = setup()
    await waitFor(() => expect(state.handler).toBeTruthy())
    act(() => state.handler({ seconds: 42, until: Date.now() - 1 }))
    expect(screen.queryByText(TEXT)).toBeNull()
  })

  it('stays silent while the player overlay is open and does not resubscribe', async () => {
    let openPlayer
    let closePlayer
    const state = { handler: null, unsub: vi.fn() }
    const api = makeFakeApi({ anilist: { onRateLimited: vi.fn((cb) => { state.handler = cb; return state.unsub }) }, player: {
      onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }),
      onClose: vi.fn((cb) => { closePlayer = cb; return () => {} }),
    } })
    api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, language: 'sr' })
    render(<App api={api} sound={{ play: vi.fn(() => true) }} />)
    await waitFor(() => expect(state.handler && openPlayer).toBeTruthy())
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/x', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    expect(document.querySelector('.player')).toBeInTheDocument()
    act(() => state.handler({ seconds: 42, until: Date.now() + 42000 }))
    expect(screen.queryByText(TEXT)).toBeNull()
    act(() => closePlayer())
    act(() => state.handler({ seconds: 42, until: Date.now() + 42000 }))
    expect(await screen.findByText(TEXT)).toBeInTheDocument()
    expect(api.anilist.onRateLimited).toHaveBeenCalledTimes(1)
    expect(state.unsub).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', async () => {
    const { state, view } = setup()
    await waitFor(() => expect(state.handler).toBeTruthy())
    view.unmount()
    expect(state.unsub).toHaveBeenCalled()
  })
})
