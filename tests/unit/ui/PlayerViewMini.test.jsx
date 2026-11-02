// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { FakeHls } from './fakeHls.js'
import { PlayerView } from '../../../src/renderer/components/PlayerView.jsx'
import { PlayerReconnecting } from '../../../src/renderer/components/PlayerReconnecting.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const open = (over = {}) => ({ playbackId: 'p1', title: 'Naruto', episode: '130', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: 'http://127.0.0.1:9/s/t/p1/sub', resumeAt: null, totalEpisodes: 220, ...over })
beforeEach(() => {
  FakeHls.instances.length = 0
  window.innerWidth = 1280
  window.innerHeight = 800
  HTMLMediaElement.prototype.play = vi.fn(function () { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() })
  HTMLMediaElement.prototype.pause = vi.fn(function () { this.paused = true; this.dispatchEvent(new Event('pause')) })
})
afterEach(() => { vi.useRealTimers() })
const fakeMediaState = (video) => {
  const state = { currentTime: 0, paused: true, volume: 1, muted: false, playbackRate: 1 }
  for (const key of Object.keys(state)) Object.defineProperty(video, key, { configurable: true, get: () => state[key], set: (v) => { state[key] = v } })
}
const view = (props = {}, apiOverrides = {}) => {
  const onClose = vi.fn(); const onExpand = vi.fn(); const onMinimize = vi.fn(); const onMiniCorner = vi.fn()
  const api = makeFakeApi(apiOverrides)
  const ui = (extra = {}) => (
    <PlayerView open={open()} settings={{ ...DEFAULT_SETTINGS }} fullscreen={false} onSettings={vi.fn()} onClose={onClose}
      onExpand={onExpand} onMinimize={onMinimize} onMiniCorner={onMiniCorner} HlsImpl={FakeHls} probeSub={async () => 200} {...props} {...extra} />
  )
  const { rerender, unmount } = renderUi(ui(), { api })
  const video = document.querySelector('video')
  fakeMediaState(video)
  const meta = (duration = 1400) => { Object.defineProperty(video, 'duration', { configurable: true, value: duration }); fireEvent(video, new Event('loadedmetadata')) }
  return { api, onClose, onExpand, onMinimize, onMiniCorner, video, meta, unmount, rerender: (extra) => rerender(ui(extra)) }
}
const pointer = (target, type, x, y) => act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })) })

describe('PlayerView mini', () => {
  it('mini keeps the same video element', () => {
    const { rerender } = view()
    const video = document.querySelector('video')
    rerender({ mini: true })
    expect(document.querySelector('video')).toBe(video)
    rerender({ mini: false })
    expect(document.querySelector('video')).toBe(video)
    expect(FakeHls.instances).toHaveLength(1)
    expect(FakeHls.last.destroy).not.toHaveBeenCalled()
  })
  it('mini hides the full controls and subtitles', () => {
    const { rerender, video } = view()
    const track = document.querySelector('track')
    track.track = { mode: 'disabled', cues: [{ startTime: 1, endTime: 3, text: 'Hello' }] }
    act(() => { track.dispatchEvent(new Event('load')) })
    act(() => { video.currentTime = 2; video.dispatchEvent(new Event('timeupdate')) })
    expect(document.querySelector('.subs')).toHaveTextContent('Hello')
    expect(document.querySelector('.player__top')).toBeInTheDocument()
    expect(document.querySelector('.player__bar')).toBeInTheDocument()
    rerender({ mini: true })
    expect(document.querySelector('.subs')).toBeNull()
    expect(document.querySelector('.player__top')).toBeNull()
    expect(document.querySelector('.player__bar')).toBeNull()
    expect(document.querySelector('.mini__title')).toBeNull()
    expect(screen.getByRole('region', { name: 'Mini plejer: Naruto EP 130' })).toBeInTheDocument()
  })
  it('full mode has a minimize button', () => {
    const { onMinimize } = view()
    fireEvent.click(screen.getByRole('button', { name: 'Mini plejer' }))
    expect(onMinimize).toHaveBeenCalled()
  })
  it('mini buttons', () => {
    const { api, onClose, onExpand, video, meta } = view({ mini: true })
    meta()
    expect(video.play).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Pauza' }))
    expect(video.paused).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Uvećaj' }))
    expect(onExpand).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(api.player.closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'nav' }))
    expect(onClose).toHaveBeenCalledWith('nav')
  })
  it('player shortcuts are off in mini', () => {
    const { rerender, video, onClose, meta } = view({ mini: true })
    meta()
    HTMLMediaElement.prototype.pause.mockClear()
    HTMLMediaElement.prototype.play.mockClear()
    for (const init of [{ key: ' ', code: 'Space' }, { key: 'ArrowRight', code: 'ArrowRight' }, { key: 'f', code: 'KeyF' }, { key: 'n', code: 'KeyN' }]) {
      fireEvent.keyDown(document.body, init)
    }
    expect(video.currentTime).toBe(0)
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    rerender({ mini: false })
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })
  it('miniCancelsCountdown', () => {
    vi.useFakeTimers()
    const { rerender, video, onClose, meta } = view({ settings: { ...DEFAULT_SETTINGS, autoNext: true } })
    act(() => meta(1400))
    act(() => { fireEvent(video, new Event('ended')) })
    expect(screen.getByText('Sledeća epizoda za 10 s')).toBeInTheDocument()
    rerender({ mini: true, settings: { ...DEFAULT_SETTINGS, autoNext: true } })
    act(() => { vi.advanceTimersByTime(11000) })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sledeća epizoda' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zatvori' })).toBeInTheDocument()
  })
  it('ending in mini does not auto-next', () => {
    vi.useFakeTimers()
    const { video, onClose, meta } = view({ mini: true, settings: { ...DEFAULT_SETTINGS, autoNext: true } })
    act(() => meta(1400))
    act(() => { fireEvent(video, new Event('ended')) })
    expect(screen.queryByText(/Sledeća epizoda za/)).toBeNull()
    act(() => { vi.advanceTimersByTime(15000) })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sledeća epizoda' }))
    expect(onClose).toHaveBeenCalledWith('next')
  })
  it('mini error', async () => {
    const recover = vi.fn(async () => ({ ok: true, auto: false }))
    const { onClose } = view({ mini: true, open: open({ kind: 'file', src: 'http://127.0.0.1:9/s/t/f1/file', subtitleUrl: null }) }, { player: { recover } })
    // a downloaded file the browser cannot decode fails straight away
    // (hls errors go through hls.js recovery first)
    await act(async () => { fireEvent(document.querySelector('video'), new Event('error')) })
    expect(await screen.findByText('Greška')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pokušaj ponovo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).toHaveBeenCalledWith('nav')
  })
  it('mini retryable error offers retry', async () => {
    const recover = vi.fn(async () => ({ ok: true, auto: false }))
    view({ mini: true }, { player: { recover } })
    for (let i = 0; i < 8; i++) await act(async () => { FakeHls.last.emitError('mediaError', true) })
    expect(await screen.findByText('Greška')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(recover).toHaveBeenLastCalledWith(expect.anything(), { manual: true })
  })
  it('quietMount does not take focus', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    view({ quietMount: true, mini: true })
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
  it('a normal mount still takes focus', () => {
    view()
    expect(document.activeElement).toBe(document.querySelector('.player'))
  })
  it('drag snaps to the nearest corner; a short move is a click', () => {
    const { onExpand, onMiniCorner } = view({ mini: true, miniCorner: 'br' })
    const region = screen.getByRole('region')
    expect(region.style.left).toBe('860px')
    expect(region.style.top).toBe('555px')
    pointer(region, 'pointerdown', 900, 600)
    pointer(window, 'pointermove', 905, 600)
    pointer(window, 'pointerup', 905, 600)
    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(onMiniCorner).not.toHaveBeenCalled()
    pointer(region, 'pointerdown', 900, 600)
    pointer(window, 'pointermove', 300, 300)
    pointer(window, 'pointermove', 100, 100)
    pointer(window, 'pointerup', 100, 100)
    expect(onMiniCorner).toHaveBeenCalledWith('tl')
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
  it('does not start a drag from a button', () => {
    const { onExpand, onMiniCorner } = view({ mini: true })
    const btn = screen.getByRole('button', { name: 'Pusti' })
    pointer(btn, 'pointerdown', 900, 600)
    pointer(window, 'pointermove', 100, 100)
    pointer(window, 'pointerup', 100, 100)
    expect(onMiniCorner).not.toHaveBeenCalled()
    expect(onExpand).not.toHaveBeenCalled()
  })
  it('follows the corner prop and recomputes on resize', () => {
    const { rerender } = view({ mini: true, miniCorner: 'tl' })
    const region = screen.getByRole('region')
    expect([region.style.left, region.style.top]).toEqual(['20px', '76px'])
    rerender({ mini: true, miniCorner: 'br' })
    act(() => { window.innerWidth = 800; window.innerHeight = 600; window.dispatchEvent(new Event('resize')) })
    expect([region.style.left, region.style.top]).toEqual(['480px', '411.25px'])
  })
  it('double-click on the mini does not call setFullscreen and does not toggle play', () => {
    vi.useFakeTimers()
    const { api, video, rerender, onExpand, meta } = view({ mini: true })
    act(() => meta())
    HTMLMediaElement.prototype.pause.mockClear()
    HTMLMediaElement.prototype.play.mockClear()
    const region = screen.getByRole('region')
    pointer(region, 'pointerdown', 900, 600)
    pointer(window, 'pointerup', 900, 600)
    expect(onExpand).toHaveBeenCalledTimes(1)
    rerender({ mini: false })
    fireEvent.click(video)
    fireEvent.click(video)
    fireEvent.doubleClick(video)
    act(() => { vi.advanceTimersByTime(300) })
    expect(api.window.setFullscreen).not.toHaveBeenCalled()
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    // later clicks work again
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.doubleClick(video)
    expect(api.window.setFullscreen).toHaveBeenCalled()
  })
  it('expanding moves focus into the player', () => {
    const { rerender } = view({ mini: true, quietMount: true })
    const expand = screen.getByRole('button', { name: 'Uvećaj' })
    expand.focus()
    fireEvent.click(expand)
    rerender({ mini: false })
    expect(document.activeElement).toBe(document.querySelector('.player'))
  })
  it('expanding from the surface moves focus into the player', () => {
    const { rerender } = view({ mini: true, quietMount: true })
    expect(document.activeElement).toBe(document.body)
    rerender({ mini: false })
    expect(document.activeElement).toBe(document.querySelector('.player'))
  })
  it('expanding leaves focus in an open dialog', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    const inner = document.createElement('button')
    dialog.appendChild(inner)
    document.body.appendChild(dialog)
    const { rerender } = view({ mini: true, quietMount: true })
    inner.focus()
    rerender({ mini: false })
    expect(document.activeElement).toBe(inner)
    dialog.remove()
  })
  it('a window resize during a drag does not reset the position', () => {
    view({ mini: true, miniCorner: 'br' })
    const region = screen.getByRole('region')
    pointer(region, 'pointerdown', 900, 600)
    pointer(window, 'pointermove', 500, 400)
    const before = [region.style.left, region.style.top]
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect([region.style.left, region.style.top]).toEqual(before)
  })
  it('ignores non-primary pointers', () => {
    const { onExpand, onMiniCorner } = view({ mini: true })
    const region = screen.getByRole('region')
    const ev = new MouseEvent('pointerdown', { bubbles: true, clientX: 900, clientY: 600 })
    Object.defineProperty(ev, 'isPrimary', { value: false })
    act(() => { region.dispatchEvent(ev) })
    pointer(window, 'pointermove', 100, 100)
    pointer(window, 'pointerup', 100, 100)
    expect(onMiniCorner).not.toHaveBeenCalled()
    expect(onExpand).not.toHaveBeenCalled()
  })
  it('leaves no inline position in full mode', () => {
    const { rerender } = view({ mini: true })
    rerender({ mini: false })
    expect(document.querySelector('.player').style.left).toBe('')
  })
})

describe('PlayerReconnecting mini', () => {
  it('shows the reconnecting text, a close button and does not take focus', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const onBack = vi.fn(); const onExpand = vi.fn()
    renderUi(<PlayerReconnecting mini miniCorner="br" state="reconnecting" title="Naruto" episode="130" onBack={onBack} onExpand={onExpand} onMiniCorner={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByText('Ponovno povezivanje…')).toBeInTheDocument()
    expect(document.activeElement).toBe(outside)
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onBack).toHaveBeenCalled()
    outside.remove()
  })
})
