// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLatest } from '../../../src/renderer/player/useLatest.js'
import { useFlash } from '../../../src/renderer/player/useFlash.js'
import { useIdle } from '../../../src/renderer/player/useIdle.js'
import { usePlayerVolume } from '../../../src/renderer/player/usePlayerVolume.js'

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
