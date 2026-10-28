// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, act } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { FakeHls } from './fakeHls.js'
import { PlayerView } from '../../../src/renderer/components/PlayerView.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const open = { playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }

const view = (props = {}) => {
  const ui = (p = {}) => <PlayerView open={open} settings={{ ...DEFAULT_SETTINGS }} fullscreen={false} onSettings={vi.fn()} onClose={vi.fn()} HlsImpl={FakeHls} probeSub={async () => 200} {...props} {...p} />
  const r = renderUi(ui())
  const video = document.querySelector('video')
  let paused = true
  Object.defineProperty(video, 'paused', { configurable: true, get: () => paused })
  Object.defineProperty(video, 'duration', { configurable: true, value: 1400 })
  fireEvent(video, new Event('loadedmetadata'))
  paused = false
  fireEvent(video, new Event('play'))
  return { ...r, root: document.querySelector('.player') }
}

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('PlayerView top bar hooks', () => {
  it('reports idle changes', () => {
    const onIdleChange = vi.fn()
    const { root } = view({ onIdleChange })
    expect(onIdleChange).toHaveBeenLastCalledWith(false)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onIdleChange).toHaveBeenLastCalledWith(true)
    fireEvent.mouseMove(root)
    expect(onIdleChange).toHaveBeenLastCalledWith(false)
  })
  it('holdControls keeps controls visible', () => {
    const { root } = view({ holdControls: true })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(root).not.toHaveClass('player--idle')
  })
  it('marks fullscreen', () => {
    const { root } = view({ fullscreen: true })
    expect(root).toHaveClass('player--fullscreen')
  })
  it('is not marked fullscreen in a window', () => {
    const { root } = view()
    expect(root).not.toHaveClass('player--fullscreen')
  })
})
