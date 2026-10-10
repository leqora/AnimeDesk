// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLatest } from '../../../src/renderer/player/useLatest.js'
import { useFlash } from '../../../src/renderer/player/useFlash.js'
import { useIdle } from '../../../src/renderer/player/useIdle.js'
import { usePlayerVolume } from '../../../src/renderer/player/usePlayerVolume.js'
import { usePlayerSubtitles } from '../../../src/renderer/player/usePlayerSubtitles.js'
import { useEpisodeEnd } from '../../../src/renderer/player/useEpisodeEnd.js'
import { renderHookUi } from './helpers.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useLatest', () => {
  it('always holds the value from the latest render', () => {
    const { result, rerender } = renderHook(({ v }) => useLatest(v), { initialProps: { v: 1 } })
    const ref = result.current
    rerender({ v: 2 })
    expect(result.current).toBe(ref)
    expect(ref.current).toBe(2)
  })
})

describe('useFlash', () => {
  it('shows a message for the given time with a stable show()', () => {
    const { result, rerender } = renderHook(() => useFlash())
    const show = result.current.show
    act(() => show('Hi', 1000))
    expect(result.current.text).toBe('Hi')
    rerender()
    expect(result.current.show).toBe(show)
    act(() => vi.advanceTimersByTime(999))
    expect(result.current.text).toBe('Hi')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.text).toBeNull()
  })
  it('restarts the timer for a new message', () => {
    const { result } = renderHook(() => useFlash())
    act(() => result.current.show('A'))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.show('B'))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.text).toBe('B')
  })
})

describe('useIdle', () => {
  it('hides after 3 s of playback, wakes on poke', () => {
    const video = { current: { paused: false } }
    const { result } = renderHook(() => useIdle({ video, hold: false }))
    expect(result.current.idle).toBe(false)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.idle).toBe(true)
    act(() => result.current.poke())
    expect(result.current.idle).toBe(false)
  })
  it('never hides while paused or held', () => {
    const video = { current: { paused: true } }
    const { result, rerender } = renderHook(({ hold }) => useIdle({ video, hold }), { initialProps: { hold: false } })
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.idle).toBe(false)
    video.current.paused = false
    rerender({ hold: true })
    act(() => { result.current.poke(); vi.advanceTimersByTime(3000) })
    expect(result.current.idle).toBe(false)
    rerender({ hold: false }) // releasing the hold pokes again
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.idle).toBe(true)
    act(() => result.current.show())
    expect(result.current.idle).toBe(false)
  })
})

describe('usePlayerVolume', () => {
  const setup = (settings = { playerVolume: 0.3, playerMuted: true }) => {
    const video = { current: { volume: 1, muted: false } }
    const onSettings = vi.fn()
    const hook = renderHook(() => usePlayerVolume({ video, settings, onSettings }))
    return { video, onSettings, ...hook }
  }
  it('applies the saved volume on mount', () => {
    const { video, result } = setup()
    expect(video.current.volume).toBe(0.3)
    expect(video.current.muted).toBe(true)
    expect(result.current.volume).toBe(0.3)
    expect(result.current.muted).toBe(true)
  })
  it('saves 500 ms after the last change', () => {
    const { video, result, onSettings } = setup()
    act(() => { video.current.volume = 0.5; video.current.muted = false; result.current.onVolumeChange() })
    expect(result.current.volume).toBe(0.5)
    act(() => vi.advanceTimersByTime(499))
    expect(onSettings).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSettings).toHaveBeenCalledWith({ playerVolume: 0.5, playerMuted: false })
  })
  it('flushes a pending change on unmount and skips unchanged values', () => {
    const a = setup()
    act(() => { a.video.current.volume = 0.8; a.result.current.onVolumeChange() })
    a.unmount()
    expect(a.onSettings).toHaveBeenCalledWith({ playerVolume: 0.8, playerMuted: true })
    const b = setup()
    act(() => { b.result.current.onVolumeChange() }) // same values as settings
    b.unmount()
    expect(b.onSettings).not.toHaveBeenCalled()
  })
  it('toggles mute, unmutes on setVolume and clamps nudges', () => {
    const { video, result } = setup()
    act(() => result.current.toggleMute())
    expect(video.current.muted).toBe(false)
    act(() => result.current.setVolume(0.95))
    expect(video.current.volume).toBe(0.95)
    act(() => result.current.nudge(0.1))
    expect(video.current.volume).toBe(1)
    act(() => { video.current.volume = 0.05; result.current.nudge(-0.1) })
    expect(video.current.volume).toBe(0)
  })
})

describe('usePlayerSubtitles', () => {
  const props = (over = {}) => ({
    video: { current: null }, trackEl: { current: null },
    open: { playbackId: 'p1', title: 'Show', subtitleUrl: 'http://127.0.0.1:9/sub', subOffset: 0 },
    mode: 'sub', settings: { ...DEFAULT_SETTINGS }, onSettings: vi.fn(), probeSub: vi.fn(async () => 200), flash: vi.fn(), ...over,
  })
  it('shifts the offset with a flash and saves it once after the keys settle', () => {
    const p = props()
    const { result, api } = renderHookUi(() => usePlayerSubtitles(p))
    act(() => result.current.shift(0.1))
    act(() => result.current.shift(0.1))
    expect(result.current.offset).toBeCloseTo(0.2)
    expect(result.current.offsetLabel).toBe('+0,2')
    expect(p.flash).toHaveBeenLastCalledWith('Titl: +0,2 s')
    expect(api.seriesPrefs.set).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(api.seriesPrefs.set).toHaveBeenCalledTimes(1)
    const [title, patch] = api.seriesPrefs.set.mock.calls[0]
    expect(title).toBe('Show')
    expect(patch.subOffset.sub).toBeCloseTo(0.2)
  })
  it('flushes a pending offset on unmount and on flush()', () => {
    const p = props()
    const a = renderHookUi(() => usePlayerSubtitles(p))
    act(() => a.result.current.shift(-0.1))
    act(() => a.result.current.flush())
    expect(a.api.seriesPrefs.set).toHaveBeenCalledTimes(1)
    act(() => a.result.current.shift(-0.1))
    a.unmount()
    expect(a.api.seriesPrefs.set).toHaveBeenCalledTimes(2)
  })
  it('toggles and saves the per-mode switch', () => {
    const p = props()
    const { result } = renderHookUi(() => usePlayerSubtitles(p))
    expect(result.current.on).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.on).toBe(false)
    expect(p.onSettings).toHaveBeenCalledWith({ subtitles: { enabled: { sub: false } } })
  })
  it('does nothing without subtitles and explains why', () => {
    const p = props({ open: { playbackId: 'p1', title: 'Show', subtitleUrl: null } })
    const { result, api } = renderHookUi(() => usePlayerSubtitles(p))
    expect(result.current.available).toBe(false)
    expect(result.current.hint).toBe('Nema titla za ovu epizodu')
    act(() => { result.current.toggle(); result.current.shift(0.1) })
    expect(p.onSettings).not.toHaveBeenCalled()
    expect(p.flash).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(api.seriesPrefs.set).not.toHaveBeenCalled()
  })
  it('marks a 415 subtitle unsupported and flashes only when subtitles are on', async () => {
    const on = props({ probeSub: vi.fn(async () => 415) })
    const a = renderHookUi(() => usePlayerSubtitles(on))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(a.result.current.available).toBe(false)
    expect(on.flash).toHaveBeenCalledWith('Format titla nije podržan u ugrađenom plejeru — probaj spoljni plejer (mpv)', 6000)
    const off = props({ mode: 'dub', probeSub: vi.fn(async () => 415) })
    renderHookUi(() => usePlayerSubtitles(off))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(off.flash).not.toHaveBeenCalled()
  })
})

describe('useEpisodeEnd', () => {
  it('counts down from 10 and then asks for the next episode', () => {
    const onNext = vi.fn()
    const { result } = renderHook(() => useEpisodeEnd({ autoNext: true, lastEpisode: false, onNext }))
    expect(result.current.end).toBeNull()
    act(() => result.current.finish())
    expect(result.current.end).toBe('countdown')
    expect(result.current.left).toBe(10)
    act(() => vi.advanceTimersByTime(9000))
    expect(onNext).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    expect(onNext).toHaveBeenCalled()
  })
  it('waits for the user without autoNext and after cancel', () => {
    const onNext = vi.fn()
    const manual = renderHook(() => useEpisodeEnd({ autoNext: false, lastEpisode: false, onNext }))
    act(() => manual.result.current.finish())
    expect(manual.result.current.end).toBe('manual')
    const auto = renderHook(() => useEpisodeEnd({ autoNext: true, lastEpisode: false, onNext }))
    act(() => auto.result.current.finish())
    act(() => auto.result.current.cancel())
    expect(auto.result.current.end).toBe('manual')
    act(() => vi.advanceTimersByTime(20000))
    expect(onNext).not.toHaveBeenCalled()
  })
  it('ends the series on the last episode', () => {
    const { result } = renderHook(() => useEpisodeEnd({ autoNext: true, lastEpisode: true, onNext: vi.fn() }))
    act(() => result.current.finish())
    expect(result.current.end).toBe('done')
  })
})
