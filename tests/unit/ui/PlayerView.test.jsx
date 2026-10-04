// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
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
const view = (o = open(), extra = {}) => {
  const onClose = vi.fn()
  const api = makeFakeApi()
  renderUi(<PlayerView open={o} settings={{ ...DEFAULT_SETTINGS }} fullscreen={false} onSettings={vi.fn()} onClose={onClose} HlsImpl={FakeHls} {...extra} />, { api })
  const video = document.querySelector('video')
  fakeMediaState(video)
  const meta = (duration = 1400) => { Object.defineProperty(video, 'duration', { configurable: true, value: duration }); fireEvent(video, new Event('loadedmetadata')) }
  return { api, onClose, video, meta }
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
  it('retries network errors, recovers media errors, then offers mpv', () => {
    const { onClose } = view()
    for (let i = 0; i < 3; i++) act(() => FakeHls.last.emitError('networkError'))
    expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(3)
    act(() => FakeHls.last.emitError('mediaError'))
    expect(FakeHls.last.recoverMediaError).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Video ne može da se pusti u aplikaciji.')).not.toBeInTheDocument()
    act(() => FakeHls.last.emitError('networkError'))
    expect(screen.getByText('Video ne može da se pusti u aplikaciji.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pusti u spoljnom plejeru (mpv)' }))
    expect(onClose).toHaveBeenCalledWith('external')
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
  it('disables previous on episode 1 and applies the subtitle size', () => {
    view(open({ episode: '1' }), { settings: { ...DEFAULT_SETTINGS, subtitleSize: 'L' } })
    expect(screen.getByRole('button', { name: 'Prethodna epizoda' })).toBeDisabled()
    expect(document.querySelector('.player')).toHaveClass('player--subs-L')
  })
})
