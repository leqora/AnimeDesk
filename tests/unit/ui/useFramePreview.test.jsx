// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFramePreview } from '../../../src/renderer/player/useFramePreview.js'
import { captureFrame } from '../../../src/renderer/player/captureFrame.js'
import { PREVIEW_DEBOUNCE_MS, PREVIEW_IDLE_MS, PREVIEW_SEEK_TIMEOUT_MS } from '../../../src/shared/framePreview.js'
import { FakeHls } from './fakeHls.js'

const ranges = (...pairs) => ({ length: pairs.length / 2, start: (i) => pairs[i * 2], end: (i) => pairs[i * 2 + 1] })
const capture = (v) => 'data:image/jpeg;base64,F' + v.currentTime

let host
let main
let modeRef
let frontierRef
let statusRef

beforeEach(() => {
  vi.useFakeTimers()
  FakeHls.instances.length = 0
  host = { current: document.createElement('div') }
  document.body.appendChild(host.current)
  main = { current: { paused: false, readyState: 4, currentTime: 10, buffered: ranges(0, 60) } }
  modeRef = { current: 'full' }
  frontierRef = { current: 0 }
  statusRef = { current: { buffering: false, failed: false } }
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  host.current.remove()
})

const hlsOpen = { kind: 'hls', src: 'http://127.0.0.1:1/p.m3u8', playbackId: 1 }
const setup = (over = {}) => renderHook((props) => useFramePreview({
  open: hlsOpen, host, main, modeRef, frontierRef, statusRef, enabled: true, HlsImpl: FakeHls, capture, ...props,
}), { initialProps: over })
const previewVideo = () => host.current.querySelector('video')
const settleDebounce = () => act(() => { vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS) })
const seeked = (v = previewVideo()) => act(() => { v.dispatchEvent(new Event('seeked')); vi.advanceTimersByTime(1) })
const hoverAt = (r, at) => { act(() => r.current.hover(at)); settleDebounce() }

describe('captureFrame', () => {
  it('returns null without a video size or a 2D context', () => {
    expect(captureFrame({ videoWidth: 0 })).toBeNull()
    expect(captureFrame({ videoWidth: 10 })).toBeNull() // jsdom: no 2D context
  })
  it('draws 160x90 and returns a jpeg data url', () => {
    const ctx = { drawImage: vi.fn() }
    const canvas = { getContext: () => ctx, toDataURL: vi.fn(() => 'data:x'), width: 0, height: 0 }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas)
    const v = { videoWidth: 1920 }
    expect(captureFrame(v)).toBe('data:x')
    expect(canvas.width).toBe(160)
    expect(canvas.height).toBe(90)
    expect(ctx.drawImage).toHaveBeenCalledWith(v, 0, 0, 160, 90)
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7)
  })
  it('lets a SecurityError through', () => {
    const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => { throw new DOMException('x', 'SecurityError') } }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas)
    expect(() => captureFrame({ videoWidth: 5 })).toThrow()
  })
})

describe('useFramePreview', () => {
  it('does no work before the first hover', () => {
    setup()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(FakeHls.instances.length).toBe(0)
    expect(host.current.querySelector('video')).toBeNull()
  })

  it('first hover creates one preview instance on a hidden muted video', () => {
    const { result } = setup()
    expect(result.current.frame).toBeNull()
    hoverAt(result, 30)
    expect(FakeHls.instances.length).toBe(1)
    const h = FakeHls.last
    expect(h.config.autoStartLoad).toBe(false)
    expect(h.loadSource).toHaveBeenCalledWith(hlsOpen.src)
    expect(h.media).toBe(previewVideo())
    expect(previewVideo().muted).toBe(true)
    expect(previewVideo().className).toBe('player__preview-src')
    expect(host.current.querySelectorAll('video').length).toBe(1)
  })

  it('debounces to the last position', () => {
    const { result } = setup()
    act(() => result.current.hover(10))
    act(() => { vi.advanceTimersByTime(50) })
    act(() => result.current.hover(20))
    act(() => { vi.advanceTimersByTime(50) })
    act(() => result.current.hover(30))
    settleDebounce()
    expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(1)
    expect(FakeHls.last.startLoad).toHaveBeenCalledWith(30)
    expect(previewVideo().currentTime).toBe(30)
  })

  it('keeps one seek in flight and starts the newest target after it settles', () => {
    const { result } = setup()
    hoverAt(result, 30)
    const h = FakeHls.last
    h.stopLoad.mockClear()
    hoverAt(result, 60)
    expect(h.stopLoad).toHaveBeenCalled()
    expect(h.startLoad).toHaveBeenCalledTimes(1)
    expect(previewVideo().currentTime).toBe(30)
    seeked()
    expect(h.startLoad).toHaveBeenCalledTimes(2)
    expect(h.startLoad).toHaveBeenLastCalledWith(60)
    expect(previewVideo().currentTime).toBe(60)
    seeked()
    expect(result.current.frame).toEqual({ allowed: true, src: 'data:image/jpeg;base64,F60', exact: true })
  })

  it('serves a cache hit without a new fetch', () => {
    const { result } = setup()
    hoverAt(result, 30)
    seeked()
    expect(result.current.frame.src).toBe('data:image/jpeg;base64,F30')
    act(() => result.current.leave())
    const h = FakeHls.last
    act(() => result.current.hover(31))
    expect(result.current.frame).toEqual({ allowed: true, src: 'data:image/jpeg;base64,F30', exact: true })
    settleDebounce()
    expect(h.startLoad).toHaveBeenCalledTimes(1)
  })

  it('does not count cache hits against the fetch window', () => {
    const { result } = setup()
    hoverAt(result, 30); seeked()
    for (let i = 0; i < 20; i++) { act(() => result.current.hover(31)); settleDebounce() }
    // 11 more distinct buckets still fit into 12 fetches
    for (let b = 7; b < 18; b++) { hoverAt(result, b * 5); seeked() }
    expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(12)
  })

  it('shows the nearest cached bucket, not exact, while loading', () => {
    const { result } = setup()
    hoverAt(result, 30); seeked()
    hoverAt(result, 35)
    expect(result.current.frame).toEqual({ allowed: true, src: 'data:image/jpeg;base64,F30', exact: false })
    seeked()
    expect(result.current.frame).toEqual({ allowed: true, src: 'data:image/jpeg;base64,F35', exact: true })
  })

  it('reached mode only allows up to the frontier', () => {
    modeRef.current = 'reached'
    frontierRef.current = 20
    const { result } = setup()
    hoverAt(result, 25)
    expect(result.current.frame.allowed).toBe(false)
    expect(FakeHls.instances.length).toBe(0)
    frontierRef.current = 30
    hoverAt(result, 25)
    expect(result.current.frame.allowed).toBe(true)
    expect(FakeHls.last.startLoad).toHaveBeenCalledWith(25)
  })

  it('off mode creates nothing', () => {
    modeRef.current = 'off'
    const { result } = setup()
    hoverAt(result, 25)
    expect(result.current.frame).toEqual({ allowed: false, src: null, exact: false })
    expect(FakeHls.instances.length).toBe(0)
  })

  describe('network guard', () => {
    it('needs 15 s of buffer ahead unless the main video is paused', () => {
      main.current.buffered = ranges(0, 20)
      const { result } = setup()
      hoverAt(result, 30)
      expect(FakeHls.last.startLoad).not.toHaveBeenCalled()
      expect(result.current.frame).toEqual({ allowed: true, src: null, exact: false })
      main.current.paused = true
      hoverAt(result, 30)
      expect(FakeHls.last.startLoad).toHaveBeenCalledWith(30)
    })

    it('does not fetch while the main player buffers', () => {
      statusRef.current.buffering = true
      const { result } = setup()
      hoverAt(result, 30)
      expect(FakeHls.instances.length === 0 || FakeHls.last.startLoad.mock.calls.length === 0).toBe(true)
    })

    it('allows 12 fetches per 60 s', () => {
      const { result } = setup()
      for (let b = 0; b < 12; b++) { hoverAt(result, b * 5); seeked() }
      expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(12)
      hoverAt(result, 100)
      expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(12)
      act(() => { vi.advanceTimersByTime(60000) })
      hoverAt(result, 100)
      expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(13)
    })
  })

  it('file kind uses a plain video and ignores the main buffer', () => {
    main.current.buffered = ranges()
    const open = { kind: 'file', src: 'file:///a.mp4', playbackId: 2 }
    const { result } = setup({ open })
    hoverAt(result, 30)
    expect(FakeHls.instances.length).toBe(0)
    const v = previewVideo()
    expect(v.getAttribute('src')).toBe(open.src)
    expect(v.preload).toBe('metadata')
    expect(v.crossOrigin).toBe('anonymous')
    expect(v.currentTime).toBe(30)
    seeked()
    expect(result.current.frame.src).toBe('data:image/jpeg;base64,F30')
  })

  it('leave stops loading and clears the frame', () => {
    const { result } = setup()
    hoverAt(result, 30)
    FakeHls.last.stopLoad.mockClear()
    act(() => result.current.leave())
    expect(FakeHls.last.stopLoad).toHaveBeenCalled()
    expect(result.current.frame).toBeNull()
  })

  it('destroys everything after the idle time', () => {
    const { result } = setup()
    hoverAt(result, 30); seeked()
    const first = FakeHls.last
    act(() => result.current.leave())
    act(() => { vi.advanceTimersByTime(PREVIEW_IDLE_MS) })
    expect(first.destroy).toHaveBeenCalled()
    expect(previewVideo()).toBeNull()
    hoverAt(result, 30)
    expect(FakeHls.instances.length).toBe(2)
    expect(result.current.frame.exact).toBe(false)
  })

  it('a new hover cancels the idle timer', () => {
    const { result } = setup()
    hoverAt(result, 30)
    act(() => result.current.leave())
    act(() => { vi.advanceTimersByTime(PREVIEW_IDLE_MS - 1000) })
    act(() => result.current.hover(40))
    act(() => { vi.advanceTimersByTime(PREVIEW_IDLE_MS) })
    expect(FakeHls.last.destroy).not.toHaveBeenCalled()
  })

  it('enabled false destroys the instance', () => {
    const { result, rerender } = setup()
    hoverAt(result, 30)
    const h = FakeHls.last
    rerender({ enabled: false })
    expect(h.destroy).toHaveBeenCalled()
    expect(previewVideo()).toBeNull()
    hoverAt(result, 30)
    expect(FakeHls.instances.length).toBe(1)
  })

  it('a new playbackId destroys the instance and clears the cache', () => {
    const { result, rerender } = setup()
    hoverAt(result, 30); seeked()
    const h = FakeHls.last
    rerender({ open: { ...hlsOpen, playbackId: 2 } })
    expect(h.destroy).toHaveBeenCalled()
    act(() => result.current.hover(30))
    expect(result.current.frame.src).toBeNull()
  })

  it('unmount destroys; a late seeked does not capture', () => {
    const cap = vi.fn(capture)
    const { result, unmount } = setup({ capture: cap })
    hoverAt(result, 30)
    const v = previewVideo()
    const h = FakeHls.last
    unmount()
    expect(h.destroy).toHaveBeenCalled()
    expect(previewVideo()).toBeNull()
    act(() => { v.dispatchEvent(new Event('seeked')); vi.advanceTimersByTime(PREVIEW_SEEK_TIMEOUT_MS) })
    expect(cap).not.toHaveBeenCalled()
  })

  it('a fatal preview error is silent and turns the preview off', () => {
    const { result } = setup()
    hoverAt(result, 30)
    const h = FakeHls.last
    act(() => h.emitError(FakeHls.ErrorTypes.NETWORK_ERROR, true))
    expect(h.destroy).toHaveBeenCalled()
    expect(previewVideo()).toBeNull()
    expect(result.current.frame.allowed).toBe(false)
    hoverAt(result, 50)
    expect(result.current.frame.allowed).toBe(false)
    expect(FakeHls.instances.length).toBe(1)
  })

  it('ignores non-fatal preview errors', () => {
    const { result } = setup()
    hoverAt(result, 30)
    act(() => FakeHls.last.emitError(FakeHls.ErrorTypes.NETWORK_ERROR, false))
    expect(FakeHls.last.destroy).not.toHaveBeenCalled()
  })

  it('a SecurityError from capture turns the preview off', () => {
    const cap = () => { throw new DOMException('tainted', 'SecurityError') }
    const { result } = setup({ capture: cap })
    hoverAt(result, 30)
    const h = FakeHls.last
    seeked()
    expect(h.destroy).toHaveBeenCalled()
    expect(result.current.frame.allowed).toBe(false)
    hoverAt(result, 60)
    expect(FakeHls.instances.length).toBe(1)
  })

  it('a null capture leaves an empty box', () => {
    const { result } = setup({ capture: () => null })
    hoverAt(result, 30); seeked()
    expect(result.current.frame).toEqual({ allowed: true, src: null, exact: false })
  })

  it('releases the in-flight seek after the timeout', () => {
    const { result } = setup()
    hoverAt(result, 30)
    act(() => { vi.advanceTimersByTime(PREVIEW_SEEK_TIMEOUT_MS) })
    hoverAt(result, 60)
    expect(FakeHls.last.startLoad).toHaveBeenLastCalledWith(60)
    expect(FakeHls.last.startLoad).toHaveBeenCalledTimes(2)
  })

  it('defers startLoad until the manifest is parsed', () => {
    class Lazy extends FakeHls { constructor(c) { super(c); this.levels = [] } }
    const { result } = setup({ HlsImpl: Lazy })
    hoverAt(result, 30)
    const h = FakeHls.last
    expect(h.startLoad).not.toHaveBeenCalled()
    h.levels = [{}, {}]
    act(() => h.emit(FakeHls.Events.MANIFEST_PARSED))
    expect(h.currentLevel).toBe(0)
    expect(h.startLoad).toHaveBeenCalledWith(30)
  })
})
