// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSubtitleCues } from '../../../src/renderer/player/useSubtitleCues.js'

const cue = (startTime, endTime, text, extra = {}) => ({ startTime, endTime, text, ...extra })
function setup({ cues = [], offset = 0 } = {}) {
  const trackEl = new EventTarget()
  const video = Object.assign(new EventTarget(), { currentTime: 0, paused: true })
  const trackRef = { current: trackEl }
  const videoRef = { current: video }
  const hook = renderHook(({ offset: o, id }) => useSubtitleCues(trackRef, videoRef, o, id), { initialProps: { offset, id: 'p1' } })
  const track = { mode: 'disabled', cues }
  trackEl.track = track
  const at = (t) => act(() => { video.currentTime = t; video.dispatchEvent(new Event('timeupdate')) })
  const load = () => act(() => { trackEl.dispatchEvent(new Event('load')) })
  return { hook, trackEl, track, video, at, load }
}

describe('useSubtitleCues', () => {
  it('reports loading, then ready, and keeps the track hidden', () => {
    const { hook, track, load } = setup()
    expect(hook.result.current.status).toBe('loading')
    load()
    expect(hook.result.current.status).toBe('ready')
    expect(track.mode).toBe('hidden')
  })
  it('shows the cues active at the current time, top ones flagged', () => {
    const { hook, load, at } = setup({ cues: [cue(1, 3, 'A'), cue(2, 5, 'Sign', { line: 0, snapToLines: true }), cue(6, 8, 'C')] })
    load()
    at(2.5)
    expect(hook.result.current.cues.map((c) => [c.text, c.top])).toEqual([['A', false], ['Sign', true]])
    at(7)
    expect(hook.result.current.cues.map((c) => c.text)).toEqual(['C'])
    at(9)
    expect(hook.result.current.cues).toEqual([])
  })
  it('applies the offset (positive = subtitles later)', () => {
    const { hook, load, at } = setup({ cues: [cue(1, 2, 'A'), cue(3, 4, 'B')] })
    load()
    at(3.5)
    expect(hook.result.current.cues.map((c) => c.text)).toEqual(['B'])
    hook.rerender({ offset: 2, id: 'p1' })
    expect(hook.result.current.cues.map((c) => c.text)).toEqual(['A'])
  })
  it('does not re-render when the active set is unchanged', () => {
    const { hook, load, at } = setup({ cues: [cue(1, 5, 'A')] })
    load()
    at(2)
    const first = hook.result.current.cues
    at(3)
    expect(hook.result.current.cues).toBe(first)
  })
  it('reports a failed track', () => {
    const { hook, trackEl } = setup()
    act(() => { trackEl.dispatchEvent(new Event('error')) })
    expect(hook.result.current.status).toBe('error')
  })
  it('clears cues when the playback changes', () => {
    const { hook, load, at } = setup({ cues: [cue(1, 5, 'A')] })
    load()
    at(2)
    expect(hook.result.current.cues).toHaveLength(1)
    hook.rerender({ offset: 0, id: 'p2' })
    expect(hook.result.current.cues).toEqual([])
    expect(hook.result.current.status).toBe('loading')
  })
  it('does not resurrect the previous playback cues before the new track loads', () => {
    const { hook, load, at } = setup({ cues: [cue(1, 5, 'A')] })
    load()
    at(2)
    expect(hook.result.current.cues).toHaveLength(1)
    hook.rerender({ offset: 0, id: 'p2' })
    at(2)
    expect(hook.result.current.cues).toEqual([])
    load()
    expect(hook.result.current.cues.map((c) => c.text)).toEqual(['A'])
  })
  it('is "none" without a track element', () => {
    const video = Object.assign(new EventTarget(), { currentTime: 0, paused: true })
    const { result } = renderHook(() => useSubtitleCues({ current: null }, { current: video }, 0, 'p1'))
    expect(result.current.status).toBe('none')
  })
})
