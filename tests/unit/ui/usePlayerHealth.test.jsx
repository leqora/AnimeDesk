// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayerHealth } from '../../../src/renderer/player/usePlayerHealth.js'

const fakeVideo = (over = {}) => ({ current: { paused: false, currentTime: 5, ...over } })
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('usePlayerHealth', () => {
  it('starts buffering, clears on ready, and flags slow loading after 8 s', () => {
    const { result } = renderHook(() => usePlayerHealth({ video: fakeVideo(), active: false }))
    expect(result.current.buffering).toBe(true)
    act(() => vi.advanceTimersByTime(7999))
    expect(result.current.slow).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.slow).toBe(true)
    act(() => result.current.onReady())
    expect(result.current.buffering).toBe(false)
    expect(result.current.slow).toBe(false)
  })
  it('ignores waiting while paused', () => {
    const video = fakeVideo({ paused: true })
    const { result } = renderHook(() => usePlayerHealth({ video, active: false }))
    act(() => result.current.onReady())
    act(() => result.current.onWaiting())
    expect(result.current.buffering).toBe(false)
    video.current.paused = false
    act(() => result.current.onWaiting())
    expect(result.current.buffering).toBe(true)
  })
  it('reports a stall once after 12 s without progress while playing', () => {
    const onStall = vi.fn()
    renderHook(() => usePlayerHealth({ video: fakeVideo(), active: true, onStall }))
    act(() => vi.advanceTimersByTime(12000))
    expect(onStall).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    expect(onStall).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(30000))
    expect(onStall).toHaveBeenCalledTimes(1)
  })
  it('does not report a stall within 2 s of the end of the video', () => {
    const onStall = vi.fn()
    renderHook(() => usePlayerHealth({ video: fakeVideo({ currentTime: 1398.5, duration: 1400 }), active: true, onStall }))
    act(() => vi.advanceTimersByTime(30000))
    expect(onStall).not.toHaveBeenCalled()
  })
  it('does not report a stall while paused, inactive, or advancing', () => {
    const onStall = vi.fn()
    const video = fakeVideo({ paused: true })
    const { rerender } = renderHook(({ active }) => usePlayerHealth({ video, active, onStall }), { initialProps: { active: true } })
    act(() => vi.advanceTimersByTime(20000))
    video.current.paused = false
    rerender({ active: false })
    act(() => vi.advanceTimersByTime(20000))
    rerender({ active: true })
    for (let i = 0; i < 20; i++) { video.current.currentTime += 1; act(() => vi.advanceTimersByTime(1000)) }
    expect(onStall).not.toHaveBeenCalled()
  })
})
