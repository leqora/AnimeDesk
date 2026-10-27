// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRotation } from '../../../src/renderer/home/useRotation.js'

const setHidden = (value) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
  document.dispatchEvent(new Event('visibilitychange'))
}
const mockReduced = (matches) => {
  window.matchMedia = vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

describe('useRotation', () => {
  beforeEach(() => { vi.useFakeTimers(); mockReduced(false); setHidden(false) })
  afterEach(() => { vi.useRealTimers(); delete window.matchMedia })

  it('advances every 8000 ms and wraps around', () => {
    const { result } = renderHook(() => useRotation({ count: 3 }))
    expect(result.current[0]).toBe(0)
    act(() => { vi.advanceTimersByTime(7999) })
    expect(result.current[0]).toBe(0)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current[0]).toBe(1)
    act(() => { vi.advanceTimersByTime(8000) })
    act(() => { vi.advanceTimersByTime(8000) })
    expect(result.current[0]).toBe(0)
  })
  it('stops while paused and resumes after', () => {
    const { result, rerender } = renderHook((p) => useRotation(p), { initialProps: { count: 3, paused: true } })
    act(() => { vi.advanceTimersByTime(30000) })
    expect(result.current[0]).toBe(0)
    rerender({ count: 3, paused: false })
    act(() => { vi.advanceTimersByTime(8000) })
    expect(result.current[0]).toBe(1)
  })
  it('never changes with a single slide', () => {
    const { result } = renderHook(() => useRotation({ count: 1 }))
    act(() => { vi.advanceTimersByTime(40000) })
    expect(result.current[0]).toBe(0)
  })
  it('never changes with reduced motion (OS, or the in-app setting from the very first render)', () => {
    mockReduced(true)
    const a = renderHook(() => useRotation({ count: 3 }))
    act(() => { vi.advanceTimersByTime(40000) })
    expect(a.result.current[0]).toBe(0)
    a.unmount()
    mockReduced(false)
    const b = renderHook(() => useRotation({ count: 3, reduced: true }))
    act(() => { vi.advanceTimersByTime(40000) })
    expect(b.result.current[0]).toBe(0)
  })
  it('stops and starts when the in-app setting flips after mount', () => {
    const { result, rerender } = renderHook((p) => useRotation(p), { initialProps: { count: 3, reduced: false } })
    rerender({ count: 3, reduced: true })
    act(() => { vi.advanceTimersByTime(40000) })
    expect(result.current[0]).toBe(0)
    rerender({ count: 3, reduced: false })
    act(() => { vi.advanceTimersByTime(8000) })
    expect(result.current[0]).toBe(1)
  })
  it('stops while the document is hidden', () => {
    const { result } = renderHook(() => useRotation({ count: 3 }))
    act(() => setHidden(true))
    act(() => { vi.advanceTimersByTime(30000) })
    expect(result.current[0]).toBe(0)
    act(() => setHidden(false))
    act(() => { vi.advanceTimersByTime(8000) })
    expect(result.current[0]).toBe(1)
  })
  it('a manual choice restarts the timer and survives a shrinking list', () => {
    const { result, rerender } = renderHook((p) => useRotation(p), { initialProps: { count: 5 } })
    act(() => { vi.advanceTimersByTime(7000) })
    act(() => result.current[1](3))
    act(() => { vi.advanceTimersByTime(7000) })
    expect(result.current[0]).toBe(3)
    rerender({ count: 2 })
    expect(result.current[0]).toBe(1)
  })
})
