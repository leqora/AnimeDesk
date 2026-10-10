// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLatest } from '../../../src/renderer/player/useLatest.js'
import { useFlash } from '../../../src/renderer/player/useFlash.js'
import { useIdle } from '../../../src/renderer/player/useIdle.js'

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
