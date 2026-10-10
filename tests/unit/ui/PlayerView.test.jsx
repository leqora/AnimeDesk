// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act, within } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { FakeHls } from './fakeHls.js'
import { PlayerView } from '../../../src/renderer/components/PlayerView.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const open = (over = {}) => ({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: 'http://127.0.0.1:9/s/t/p1/sub', resumeAt: null, totalEpisodes: 12, ...over })
beforeEach(() => {
  FakeHls.instances.length = 0
  // jsdom has no media state: play/pause flip the `paused` backing value (see fakeMediaState)
  HTMLMediaElement.prototype.play = vi.fn(function () { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() })
  HTMLMediaElement.prototype.pause = vi.fn(function () { this.paused = true; this.dispatchEvent(new Event('pause')) })
})
// jsdom does not implement media playback state; give the element plain writable properties.
const fakeMediaState = (video) => {
  const state = { currentTime: 0, paused: true, volume: 1, muted: false }
  for (const key of Object.keys(state)) {
    Object.defineProperty(video, key, { configurable: true, get: () => state[key], set: (v) => { state[key] = v } })
  }
}
const view = (o = open(), extra = {}, apiOverrides = {}) => {
  const onClose = vi.fn()
  const api = makeFakeApi(apiOverrides)
  const ui = (props = {}) => <PlayerView open={o} settings={{ ...DEFAULT_SETTINGS }} fullscreen={false} onSettings={vi.fn()} onClose={onClose} HlsImpl={FakeHls} probeSub={async () => 200} {...extra} {...props} />
  const { rerender, unmount } = renderUi(ui(), { api })
  const video = document.querySelector('video')
  fakeMediaState(video)
  const meta = (duration = 1400) => { Object.defineProperty(video, 'duration', { configurable: true, value: duration }); fireEvent(video, new Event('loadedmetadata')) }
  return { api, onClose, video, meta, unmount, rerender: (props) => rerender(ui(props)) }
}

describe('PlayerView', () => {
  it('loads the hls source and subtitles and starts playing', () => {
    const { video, meta } = view()
    expect(FakeHls.last.src).toBe('http://127.0.0.1:9/s/t/p1/playlist')
    expect(FakeHls.last.media).toBe(video)
    expect(document.querySelector('track').getAttribute('src')).toBe('http://127.0.0.1:9/s/t/p1/sub')
    meta()
    expect(video.play).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /Show/ })).toHaveTextContent('EP 3')
  })
  it('plays local files without hls', () => {
    const { video } = view(open({ kind: 'file', src: 'http://127.0.0.1:9/s/t/f1/file', subtitleUrl: null }))
    expect(FakeHls.instances).toHaveLength(0)
    expect(video.getAttribute('src')).toBe('http://127.0.0.1:9/s/t/f1/file')
  })
  it('closes once with the watched stats', () => {
    const { api, onClose, video, meta } = view()
    meta()
    video.currentTime = 700
    fireEvent(video, new Event('timeupdate'))
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }))
    expect(api.player.closed).toHaveBeenCalledTimes(1)
    expect(api.player.closed).toHaveBeenCalledWith({ playbackId: 'p1', position: 700, duration: 1400, maxPercent: 50, reason: 'back' })
    expect(onClose).toHaveBeenCalledWith('back')
  })
  it('supports keyboard shortcuts', () => {
    const { video, meta, api, onClose } = view()
    meta()
    video.currentTime = 100
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(video.currentTime).toBe(110)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(video.currentTime).toBe(100)
    fireEvent.keyDown(window, { key: 'm' })
    expect(video.muted).toBe(true)
    fireEvent.keyDown(window, { key: 'f' })
    expect(api.window.setFullscreen).toHaveBeenCalledWith(true)
    fireEvent.keyDown(window, { key: ' ' })
    expect(video.pause).toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'n' })
    expect(onClose).toHaveBeenCalledWith('next')
  })
  it('keeps shortcuts working after the seek slider was clicked, without also moving the slider', () => {
    const { video, meta } = view()
    meta()
    video.currentTime = 100
    const seek = screen.getByRole('slider', { name: 'Pozicija u epizodi' })
    seek.focus()
    const notPrevented = fireEvent.keyDown(seek, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(video.currentTime).toBe(110)
    expect(notPrevented).toBe(false)
    fireEvent.keyDown(seek, { key: ' ', code: 'Space' })
    expect(video.pause).toHaveBeenCalled()
  })
  it('matches letter shortcuts by physical key, so they work on a Cyrillic layout', () => {
    const { video, meta, api } = view()
    meta()
    fireEvent.keyDown(window, { key: 'ь', code: 'KeyM' })
    expect(video.muted).toBe(true)
    fireEvent.keyDown(window, { key: 'ф', code: 'KeyF' })
    expect(api.window.setFullscreen).toHaveBeenCalledWith(true)
  })
  it('ignores shortcuts combined with Ctrl, Alt or Meta', () => {
    const { video, meta, api } = view()
    meta()
    fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM', altKey: true })
    expect(api.window.setFullscreen).not.toHaveBeenCalled()
    expect(video.muted).toBe(false)
  })
  it('retries network errors, recovers media errors, then offers mpv', async () => {
    const { onClose } = view()
    for (let i = 0; i < 3; i++) act(() => FakeHls.last.emitError('networkError'))
    expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(3)
    act(() => FakeHls.last.emitError('mediaError'))
    expect(FakeHls.last.recoverMediaError).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Video ne može da se pusti u aplikaciji.')).not.toBeInTheDocument()
    await act(async () => FakeHls.last.emitError('networkError'))
    expect(await screen.findByText('Video ne može da se pusti u aplikaciji.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pusti u spoljnom plejeru (mpv)' }))
    expect(onClose).toHaveBeenCalledWith('external')
  })
  it('reloads the playlist on fatal manifest errors, then offers mpv after the retry budget', async () => {
    view()
    const hls = FakeHls.last
    hls.levels = []
    for (let i = 0; i < 3; i++) act(() => hls.emitError('networkError', true, 'manifestLoadError'))
    expect(hls.loadSource).toHaveBeenCalledTimes(4)
    expect(hls.loadSource).toHaveBeenLastCalledWith('http://127.0.0.1:9/s/t/p1/playlist')
    expect(hls.startLoad).not.toHaveBeenCalled()
    expect(screen.queryByText('Video ne može da se pusti u aplikaciji.')).not.toBeInTheDocument()
    await act(async () => hls.emitError('networkError', true, 'manifestLoadError'))
    expect(await screen.findByText('Video ne može da se pusti u aplikaciji.')).toBeInTheDocument()
  })
  it('treats manifest timeouts as manifest-level even with known levels', () => {
    view()
    act(() => FakeHls.last.emitError('networkError', true, 'manifestLoadTimeOut'))
    expect(FakeHls.last.loadSource).toHaveBeenCalledTimes(2)
    expect(FakeHls.last.startLoad).not.toHaveBeenCalled()
  })
  it('offers mpv when a downloaded file cannot be decoded', () => {
    const { video } = view(open({ kind: 'file', src: 'http://127.0.0.1:9/s/t/f1/file', subtitleUrl: null }))
    fireEvent(video, new Event('error'))
    expect(screen.getByText('Video ne može da se pusti u aplikaciji.')).toBeInTheDocument()
  })
  it('leaves hls media errors to hls.js recovery', () => {
    const { video } = view()
    fireEvent(video, new Event('error'))
    expect(screen.queryByText('Video ne može da se pusti u aplikaciji.')).not.toBeInTheDocument()
  })
  it('reports progress every 5 seconds and hides controls when idle', () => {
    vi.useFakeTimers()
    try {
      const { api, video, meta } = view()
      meta()
      video.currentTime = 50
      act(() => { vi.advanceTimersByTime(5000) })
      expect(api.player.progress).toHaveBeenCalledWith({ playbackId: 'p1', position: 50, duration: 1400, maxPercent: 0 })
      act(() => { vi.advanceTimersByTime(3000) })
      expect(document.querySelector('.player')).toHaveClass('player--idle')
      fireEvent.mouseMove(document.querySelector('.player'))
      expect(document.querySelector('.player')).not.toHaveClass('player--idle')
    } finally { vi.useRealTimers() }
  })
  it('disables previous on episode 1', () => {
    view(open({ episode: '1' }))
    expect(screen.getByRole('button', { name: 'Prethodna epizoda' })).toBeDisabled()
  })
})

describe('PlayerView skip / next / resume', () => {
  const skips = { op: { start: 3, end: 93 }, ed: { start: 1300, end: 1390 }, recap: null }
  const at = async (video, sec) => { video.currentTime = sec; await act(async () => { fireEvent(video, new Event('timeupdate')) }) }

  it('asks for skip times once the duration is known and offers "Preskoči uvod"', async () => {
    const { api, video, meta } = view(open(), {}, { skip: { get: vi.fn(async () => skips) } })
    await act(async () => meta(1400))
    expect(api.skip.get).toHaveBeenCalledWith('Show', '3', 1400)
    await at(video, 10)
    fireEvent.click(screen.getByRole('button', { name: 'Preskoči uvod' }))
    expect(video.currentTime).toBe(93)
    await at(video, 200)
    expect(screen.queryByRole('button', { name: 'Preskoči uvod' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('.player__segment')).toHaveLength(2)
  })
  it('auto-skips the intro only once', async () => {
    const { video, meta } = view(open(), { settings: { ...DEFAULT_SETTINGS, autoSkip: true } }, { skip: { get: vi.fn(async () => skips) } })
    await act(async () => meta(1400))
    await at(video, 5)
    expect(video.currentTime).toBe(93)
    expect(screen.getByText('Preskočen uvod')).toBeInTheDocument()
    await at(video, 20)
    expect(video.currentTime).toBe(20)
  })
  it('shows "Sledeća epizoda" during the ending and counts down at the end', async () => {
    vi.useFakeTimers()
    try {
      const { video, meta, onClose } = view(open(), {}, { skip: { get: vi.fn(async () => skips) } })
      await act(async () => meta(1400))
      await at(video, 1310)
      expect(document.querySelector('.player__next')).toBeInTheDocument()
      act(() => { fireEvent(video, new Event('ended')) })
      expect(screen.getByText('Sledeća epizoda za 10 s')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(3000) })
      expect(screen.getByText('Sledeća epizoda za 7 s')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Otkaži' }))
      act(() => { vi.advanceTimersByTime(10000) })
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.click(within(document.querySelector('.player__card')).getByRole('button', { name: 'Sledeća epizoda' }))
      expect(onClose).toHaveBeenCalledWith('next')
    } finally { vi.useRealTimers() }
  })
  it('plays the next episode when the countdown ends', async () => {
    vi.useFakeTimers()
    try {
      const { video, meta, onClose } = view()
      await act(async () => meta(1400))
      act(() => { fireEvent(video, new Event('ended')) })
      act(() => { vi.advanceTimersByTime(10000) })
      expect(onClose).toHaveBeenCalledWith('next')
    } finally { vi.useRealTimers() }
  })
  it('does not count down without autoNext and offers manual next / back in the card', async () => {
    const a = view(open(), { settings: { ...DEFAULT_SETTINGS, autoNext: false } })
    await act(async () => a.meta(1400))
    act(() => { fireEvent(a.video, new Event('ended')) })
    expect(screen.queryByText(/Sledeća epizoda za/)).not.toBeInTheDocument()
    const card = within(document.querySelector('.player__card'))
    expect(card.getByRole('button', { name: 'Sledeća epizoda' })).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Nazad' })).toBeInTheDocument()
    fireEvent.click(card.getByRole('button', { name: 'Nazad' }))
    expect(a.onClose).toHaveBeenCalledWith('ended')
  })
  it('after Cancel the card offers manual next and back', async () => {
    vi.useFakeTimers()
    try {
      const { video, meta } = view()
      await act(async () => meta(1400))
      act(() => { fireEvent(video, new Event('ended')) })
      fireEvent.click(screen.getByRole('button', { name: 'Otkaži' }))
      const card = within(document.querySelector('.player__card'))
      expect(card.getByRole('button', { name: 'Sledeća epizoda' })).toBeInTheDocument()
      expect(card.getByRole('button', { name: 'Nazad' })).toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })
  it('"Pusti sada" plays the next episode immediately', async () => {
    const { video, meta, onClose } = view()
    await act(async () => meta(1400))
    act(() => { fireEvent(video, new Event('ended')) })
    fireEvent.click(screen.getByRole('button', { name: 'Pusti sada' }))
    expect(onClose).toHaveBeenCalledWith('next')
  })
  it('auto-skip into the ending finishes the episode once', async () => {
    const { video, meta, onClose } = view(open(), { settings: { ...DEFAULT_SETTINGS, autoSkip: true } }, { skip: { get: vi.fn(async () => skips) } })
    await act(async () => meta(1400))
    await at(video, 1310)
    expect(video.pause).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sledeća epizoda za 10 s')).toBeInTheDocument()
    await at(video, 1320)
    await at(video, 1330)
    expect(video.pause).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
  it('counts an episode finished by auto-skipping into the ending as fully watched', async () => {
    const { video, meta, api } = view(open(), { settings: { ...DEFAULT_SETTINGS, autoSkip: true } }, { skip: { get: vi.fn(async () => skips) } })
    await act(async () => meta(1400))
    await at(video, 1300)
    fireEvent.click(screen.getByRole('button', { name: 'Pusti sada' }))
    expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'next', maxPercent: 100 }))
  })
  it('counts "Sledeća epizoda" during the ending as fully watched', async () => {
    const { video, meta, api } = view(open(), {}, { skip: { get: vi.fn(async () => skips) } })
    await act(async () => meta(1400))
    await at(video, 1310)
    fireEvent.click(document.querySelector('.player__next'))
    expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'next', maxPercent: 100 }))
  })
  it('keeps the real percent when skipping ahead mid-episode', async () => {
    const { video, meta, api } = view(open(), {}, { skip: { get: vi.fn(async () => skips) } })
    await act(async () => meta(1400))
    await at(video, 700)
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'next', maxPercent: 50 }))
  })
  it('disables next episode (button and N key) on the last known episode', async () => {
    const { meta, onClose } = view(open({ episode: '12', totalEpisodes: 12 }))
    await act(async () => meta(1400))
    expect(screen.getByRole('button', { name: 'Sledeća epizoda' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'n' })
    expect(onClose).not.toHaveBeenCalled()
  })
  it('auto-skipping a recap flashes "Preskočen rezime"', async () => {
    const recapSkips = { op: null, ed: null, recap: { start: 0, end: 60 } }
    const { video, meta } = view(open(), { settings: { ...DEFAULT_SETTINGS, autoSkip: true } }, { skip: { get: vi.fn(async () => recapSkips) } })
    await act(async () => meta(1400))
    await at(video, 5)
    expect(video.currentTime).toBe(60)
    expect(screen.getByText('Preskočen rezime')).toBeInTheDocument()
  })
  it('hides skip controls under the resume prompt and dismisses it when playback starts otherwise', async () => {
    const { video, meta } = view(open({ resumeAt: 754 }), {}, { skip: { get: vi.fn(async () => ({ op: { start: 0, end: 90 }, ed: null, recap: null })) } })
    await act(async () => meta(1400))
    await at(video, 0)
    expect(screen.queryByRole('button', { name: 'Preskoči uvod' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('congratulates after the last episode', async () => {
    const { video, meta, onClose } = view(open({ episode: '12', totalEpisodes: 12 }))
    await act(async () => meta(1400))
    act(() => { fireEvent(video, new Event('ended')) })
    expect(screen.getByText('Završio si seriju 🎉')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
  it('asks where to resume before playing', async () => {
    const { video, meta } = view(open({ resumeAt: 754 }))
    await act(async () => meta(1400))
    expect(video.play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi od 12:34' }))
    expect(video.currentTime).toBe(754)
    expect(video.play).toHaveBeenCalled()
  })
  it('can start from the beginning instead', async () => {
    const { video, meta } = view(open({ resumeAt: 754 }))
    await act(async () => meta(1400))
    fireEvent.click(screen.getByRole('button', { name: 'Od početka' }))
    expect(video.currentTime).toBe(0)
    expect(video.play).toHaveBeenCalled()
  })
  it('shows no skip controls when AniSkip has nothing or fails', async () => {
    const { video, meta } = view(open(), {}, { skip: { get: vi.fn(async () => { throw new Error('offline') }) } })
    await act(async () => meta(1400))
    await at(video, 10)
    expect(screen.queryByRole('button', { name: /Preskoči/ })).not.toBeInTheDocument()
    expect(document.querySelectorAll('.player__segment')).toHaveLength(0)
  })

  it('uses the latest onClose inside long-lived handlers', () => {
    const { meta, rerender } = view()
    meta()
    const later = vi.fn()
    rerender({ onClose: later })
    fireEvent.keyDown(window, { key: 'n' })
    expect(later).toHaveBeenCalledWith('next')
  })
  it('tries swapAudioCodec on the second media error and resets the counters when fragments advance', async () => {
    view()
    const hls = FakeHls.last
    act(() => hls.emitError('mediaError'))
    act(() => hls.emitError('mediaError'))
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(2)
    expect(hls.swapAudioCodec).toHaveBeenCalledTimes(1)
    act(() => hls.emit(FakeHls.Events.FRAG_CHANGED))
    act(() => hls.emitError('mediaError'))
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('asks main to recover when hls.js gives up; main closes the player for the automatic retry', async () => {
    const recover = vi.fn(async () => ({ ok: true }))
    const { api } = view(open(), {}, { player: { recover } })
    for (let i = 0; i < 4; i++) await act(async () => FakeHls.last.emitError('networkError'))
    expect(recover).toHaveBeenCalledTimes(1)
    expect(recover).toHaveBeenCalledWith({ playbackId: 'p1', position: 0, duration: 0, maxPercent: 0 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.player.closed).not.toHaveBeenCalled()
  })
  it('offers try again, mpv and back once the automatic retry is used up', async () => {
    const { api, onClose } = view()
    for (let i = 0; i < 4; i++) await act(async () => FakeHls.last.emitError('networkError'))
    const alert = await screen.findByRole('alert')
    fireEvent.click(within(alert).getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(api.player.recover).toHaveBeenLastCalledWith(expect.objectContaining({ playbackId: 'p1' }), { manual: true })
    fireEvent.click(within(alert).getByRole('button', { name: 'Pusti u spoljnom plejeru (mpv)' }))
    expect(onClose).toHaveBeenCalledWith('external')
  })
  it('recovers after 12 s without progress while playing, but not while paused', async () => {
    vi.useFakeTimers()
    try {
      const { api, video, meta } = view()
      meta()
      video.paused = true
      await act(async () => vi.advanceTimersByTime(20000))
      expect(api.player.recover).not.toHaveBeenCalled()
      video.paused = false
      await act(async () => vi.advanceTimersByTime(13000))
      expect(api.player.recover).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
  it('does not watch for stalls while the resume prompt is open', async () => {
    vi.useFakeTimers()
    try {
      const { api, video, meta } = view(open({ resumeAt: 754 }))
      meta()
      video.paused = false
      await act(async () => vi.advanceTimersByTime(20000))
      expect(api.player.recover).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
  it('jumps straight to the position after a recovery, without the resume prompt', () => {
    const { video, meta } = view(open({ resumeAt: 754, autoResume: true }))
    expect(screen.queryByRole('button', { name: /Nastavi od/ })).not.toBeInTheDocument()
    meta()
    expect(video.currentTime).toBe(754)
    expect(video.play).toHaveBeenCalled()
  })
  it('a broken local file only offers mpv and back', () => {
    const { video, api } = view(open({ kind: 'file', src: 'http://127.0.0.1:9/s/t/f1/file', subtitleUrl: null }))
    fireEvent(video, new Event('error'))
    const alert = screen.getByRole('alert')
    expect(within(alert).queryByRole('button', { name: 'Pokušaj ponovo' })).not.toBeInTheDocument()
    expect(api.player.recover).not.toHaveBeenCalled()
  })
  it('hides the spinner when time advances while playing, even if the browser reported a stall', () => {
    const { video, meta } = view()
    meta()
    video.paused = false
    fireEvent(video, new Event('timeupdate'))
    fireEvent(video, new Event('waiting'))
    expect(screen.getByRole('status', { name: 'Učitavanje' })).toBeInTheDocument()
    video.currentTime = 5
    fireEvent(video, new Event('timeupdate'))
    expect(screen.queryByRole('status', { name: 'Učitavanje' })).not.toBeInTheDocument()
  })
  it('hides the controls again after playback resumes without mouse movement', () => {
    vi.useFakeTimers()
    try {
      const { video, meta } = view()
      meta()
      act(() => { vi.advanceTimersByTime(3000) })
      act(() => { video.pause() })
      expect(document.querySelector('.player')).not.toHaveClass('player--idle')
      act(() => { video.play() })
      act(() => { vi.advanceTimersByTime(3000) })
      expect(document.querySelector('.player')).toHaveClass('player--idle')
    } finally { vi.useRealTimers() }
  })
  it('swallows a rejected play() call', async () => {
    const { video, meta } = view()
    video.play = vi.fn(() => Promise.reject(new Error('AbortError')))
    const seen = vi.fn()
    process.on('unhandledRejection', seen)
    try {
      meta()
      await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
      expect(video.play).toHaveBeenCalled()
      expect(seen).not.toHaveBeenCalled()
    } finally { process.off('unhandledRejection', seen) }
  })
  it('shows a spinner until playback starts, and a slow note after 8 s', () => {
    vi.useFakeTimers()
    try {
      const { video } = view()
      expect(screen.getByRole('status', { name: 'Učitavanje' })).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(8000))
      expect(screen.getByText('Sporo učitavanje…')).toBeInTheDocument()
      fireEvent(video, new Event('playing'))
      expect(screen.queryByRole('status', { name: 'Učitavanje' })).not.toBeInTheDocument()
      video.paused = false
      fireEvent(video, new Event('waiting'))
      expect(screen.getByRole('status', { name: 'Učitavanje' })).toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })
  it('applies the remembered volume and mute', () => {
    renderUi(<PlayerView open={open()} settings={{ ...DEFAULT_SETTINGS, playerVolume: 0.4, playerMuted: true }} fullscreen={false} onSettings={vi.fn()} onClose={vi.fn()} HlsImpl={FakeHls} />)
    const video = document.querySelector('video')
    expect(video.volume).toBeCloseTo(0.4)
    expect(video.muted).toBe(true)
  })
  it('saves volume changes once, 500 ms after the last change, and on close', () => {
    vi.useFakeTimers()
    try {
      const onSettings = vi.fn()
      const { video, unmount } = view(open(), { onSettings })
      video.volume = 0.3
      fireEvent(video, new Event('volumechange'))
      video.volume = 0.2
      fireEvent(video, new Event('volumechange'))
      act(() => vi.advanceTimersByTime(499))
      expect(onSettings).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(onSettings).toHaveBeenCalledTimes(1)
      expect(onSettings).toHaveBeenCalledWith({ playerVolume: 0.2, playerMuted: false })
      video.muted = true
      fireEvent(video, new Event('volumechange'))
      unmount()
      expect(onSettings).toHaveBeenLastCalledWith({ playerVolume: 0.2, playerMuted: true })
    } finally { vi.useRealTimers() }
  })
  it('double click toggles fullscreen without pausing; a single click pauses after 220 ms', () => {
    vi.useFakeTimers()
    try {
      const { video, meta, api } = view()
      meta()
      fireEvent.click(video)
      fireEvent.click(video)
      fireEvent.doubleClick(video)
      act(() => vi.advanceTimersByTime(300))
      expect(api.window.setFullscreen).toHaveBeenCalledWith(true)
      expect(video.pause).not.toHaveBeenCalled()
      fireEvent.click(video)
      act(() => vi.advanceTimersByTime(219))
      expect(video.pause).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(video.pause).toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
})

it('shows the real resolution and follows level switches', () => {
  const { video, meta } = view()
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1072 })
  meta()
  expect(document.querySelector('.player__quality')).toHaveTextContent('1080p')
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 })
  fireEvent(video, new Event('resize'))
  expect(document.querySelector('.player__quality')).toHaveTextContent('720p')
})
it('says once that the asked quality was not available', () => {
  vi.useFakeTimers()
  try {
    const { video, meta } = view(open({ qualityFallback: '720' }))
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    meta()
    expect(screen.getByText('720p nije dostupan, pušta se 1080p')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByText('720p nije dostupan, pušta se 1080p')).not.toBeInTheDocument()
    fireEvent(video, new Event('resize'))
    expect(screen.queryByText(/nije dostupan/)).not.toBeInTheDocument()
  } finally { vi.useRealTimers() }
})

describe('PlayerView subtitles', () => {
  const loadTrack = (cues) => {
    const el = document.querySelector('track')
    el.track = { mode: 'disabled', cues }
    act(() => { el.dispatchEvent(new Event('load')) })
    return el
  }
  const at = (video, t) => act(() => { video.currentTime = t; video.dispatchEvent(new Event('timeupdate')) })

  it('keeps the track hidden and draws the cue itself', () => {
    const { video } = view()
    const el = loadTrack([{ startTime: 1, endTime: 3, text: 'Hello' }])
    expect(el.hasAttribute('default')).toBe(false)
    at(video, 2)
    expect(el.track.mode).toBe('hidden')
    expect(document.querySelector('.subs__group--bottom')).toHaveTextContent('Hello')
  })
  it('starts dub episodes without subtitles and remembers the choice per mode', () => {
    const onSettings = vi.fn()
    const { video } = view(open({ mode: 'dub' }), { onSettings })
    loadTrack([{ startTime: 1, endTime: 3, text: 'Hello' }])
    at(video, 2)
    expect(document.querySelector('.subs')).toBeNull()
    fireEvent.keyDown(window, { key: 's', code: 'KeyS' })
    expect(onSettings).toHaveBeenLastCalledWith({ subtitles: { enabled: { dub: true } } })
    expect(document.querySelector('.subs')).toHaveTextContent('Hello')
  })
  it('shifts subtitles with G/H, shows the value and saves it per series and mode', async () => {
    vi.useFakeTimers()
    try {
      const { video, api } = view(open({ mode: 'dub', subOffset: 0.5 }), { settings: { ...DEFAULT_SETTINGS, subtitles: { ...DEFAULT_SETTINGS.subtitles, enabled: { sub: true, dub: true } } } })
      loadTrack([{ startTime: 1, endTime: 2, text: 'A' }, { startTime: 3, endTime: 4, text: 'B' }])
      at(video, 3.5)
      expect(document.querySelector('.subs')).toHaveTextContent('B') // 3.5 − 0.5 = 3
      fireEvent.keyDown(window, { key: 'h', code: 'KeyH' })
      expect(screen.getByText('Titl: +0,6 s')).toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'H', code: 'KeyH', shiftKey: true })
      expect(screen.getByText('Titl: +1,6 s')).toBeInTheDocument()
      expect(document.querySelector('.subs')).toHaveTextContent('A') // 3.5 − 1.6 = 1.9
      fireEvent.keyDown(window, { key: 'g', code: 'KeyG' })
      expect(screen.getByText('Titl: +1,5 s')).toBeInTheDocument()
      expect(api.seriesPrefs.set).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(500))
      expect(api.seriesPrefs.set).toHaveBeenCalledTimes(1)
      expect(api.seriesPrefs.set).toHaveBeenCalledWith('Show', { subOffset: { dub: 1.5 } })
    } finally { vi.useRealTimers() }
  })
  it('debounces offset saves and flushes on close', () => {
    vi.useFakeTimers()
    try {
      const { api } = view()
      loadTrack([])
      for (let i = 0; i < 20; i++) fireEvent.keyDown(window, { key: 'h', code: 'KeyH' })
      fireEvent.click(screen.getByRole('button', { name: 'Nazad' }))
      expect(api.seriesPrefs.set).toHaveBeenCalledTimes(1)
      expect(api.seriesPrefs.set).toHaveBeenCalledWith('Show', { subOffset: { sub: 2 } })
    } finally { vi.useRealTimers() }
  })
  it('ignores subtitle shortcuts when the episode has no subtitles', () => {
    const onSettings = vi.fn()
    const { api } = view(open({ subtitleUrl: null }), { onSettings })
    fireEvent.keyDown(window, { key: 'h', code: 'KeyH' })
    fireEvent.keyDown(window, { key: 's', code: 'KeyS' })
    expect(screen.queryByText(/Titl:/)).toBeNull()
    expect(onSettings).not.toHaveBeenCalled()
    expect(api.seriesPrefs.set).not.toHaveBeenCalled()
  })
  it('says once when the subtitle format is not supported', async () => {
    const probeSub = vi.fn(async () => 415)
    view(open(), { probeSub })
    expect(await screen.findByText('Format titla nije podržan u ugrađenom plejeru — probaj spoljni plejer (mpv)')).toBeInTheDocument()
    expect(probeSub).toHaveBeenCalledTimes(1)
    expect(probeSub).toHaveBeenCalledWith('http://127.0.0.1:9/s/t/p1/sub')
    fireEvent.keyDown(window, { key: 'h', code: 'KeyH' })
    expect(screen.queryByText(/Titl:/)).toBeNull()
  })
  it('does not flash the unsupported-format note when subtitles are off (dub)', async () => {
    const probeSub = vi.fn(async () => 415)
    view(open({ mode: 'dub' }), { probeSub })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(probeSub).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Format titla nije podr/)).toBeNull()
  })
  it('keeps the player shortcuts out of the subtitle menu (slider arrows do not seek)', () => {
    const { video } = view(open({ subOffset: 0 }))
    video.currentTime = 100
    document.querySelector('track').track = { mode: 'disabled', cues: [] }
    act(() => { document.querySelector('track').dispatchEvent(new Event('load')) })
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja plejera' }))
    fireEvent.keyDown(screen.getByLabelText('Veličina titlova'), { key: 'ArrowRight', code: 'ArrowRight' })
    expect(video.currentTime).toBe(100)
  })
  it('raises the subtitles while the controls are visible', () => {
    const { video } = view()
    loadTrack([{ startTime: 1, endTime: 3, text: 'Hi' }])
    at(video, 2)
    expect(document.querySelector('.subs')).toHaveClass('subs--raised')
  })
  it('opens a subtitle menu with toggle, offset and size', () => {
    const onSettings = vi.fn()
    view(open({ subOffset: 0 }), { onSettings })
    document.querySelector('track').track = { mode: 'disabled', cues: [] }
    act(() => { document.querySelector('track').dispatchEvent(new Event('load')) })
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja plejera' }))
    const menu = screen.getByRole('dialog', { name: 'Podešavanja plejera' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Titl kasnije' }))
    expect(within(menu).getByText('+0,1 s')).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('button', { name: 'Resetuj' }))
    expect(within(menu).getByText('0,0 s')).toBeInTheDocument()
    fireEvent.change(within(menu).getByLabelText('Veličina titlova'), { target: { value: '70' } })
    expect(onSettings).toHaveBeenLastCalledWith({ subtitles: { size: 70 } })
    fireEvent.click(within(menu).getByLabelText('Titlovi'))
    expect(onSettings).toHaveBeenLastCalledWith({ subtitles: { enabled: { sub: false } } })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Podešavanja plejera' })).toBeNull()
  })
  it('closes the subtitle menu on an outside click and keeps controls visible while open', () => {
    vi.useFakeTimers()
    try {
      const { video } = view()
      fireEvent.click(screen.getByRole('button', { name: 'Podešavanja plejera' }))
      act(() => { video.paused = false; vi.advanceTimersByTime(4000) })
      expect(document.querySelector('.player')).not.toHaveClass('player--idle')
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('dialog', { name: 'Podešavanja plejera' })).toBeNull()
    } finally { vi.useRealTimers() }
  })
  it('keeps the gear enabled without subtitles and explains the disabled subtitle controls', () => {
    view(open({ subtitleUrl: null }))
    expect(screen.getByRole('button', { name: 'Titlovi' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Titlovi' })).toHaveAttribute('title', 'Nema titla za ovu epizodu')
    const gear = screen.getByRole('button', { name: 'Podešavanja plejera' })
    expect(gear).toBeEnabled()
    fireEvent.click(gear)
    const menu = screen.getByRole('dialog', { name: 'Podešavanja plejera' })
    expect(within(menu).getByLabelText('Titlovi')).toBeDisabled()
    expect(within(menu).getByRole('button', { name: 'Titl kasnije' })).toBeDisabled()
    expect(within(menu).getByLabelText('Veličina titlova')).toBeDisabled()
    expect(within(menu).getByText('Nema titla za ovu epizodu')).toBeInTheDocument()
  })
  it('closes the subtitle menu with Escape while focus is on the gear button', () => {
    view()
    const gear = screen.getByRole('button', { name: 'Podešavanja plejera' })
    fireEvent.click(gear)
    expect(screen.getByRole('dialog', { name: 'Podešavanja plejera' })).toBeInTheDocument()
    fireEvent.keyDown(gear, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Podešavanja plejera' })).toBeNull()
  })
  it('keeps player shortcuts working after clicking the menu checkbox', () => {
    const { api } = view()
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja plejera' }))
    const box = within(screen.getByRole('dialog')).getByLabelText('Titlovi')
    fireEvent.click(box)
    box.focus()
    fireEvent.keyDown(box, { key: 'f', code: 'KeyF' })
    expect(api.window.setFullscreen).toHaveBeenCalledWith(true)
  })
})
