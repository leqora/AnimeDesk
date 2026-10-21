// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, fireEvent } from '@testing-library/react'
import { useVolumeBoost, __resetVolumeBoostForTests } from '../../../src/renderer/player/useVolumeBoost.js'

const makeNode = (name) => ({ name, targets: [], connect(t) { this.targets.push(t) }, disconnect() { this.targets = [] } })
function makeFakeContext() {
  const instances = []
  class FakeContext {
    constructor() {
      this.state = 'suspended'
      this.currentTime = 5
      this.destination = makeNode('destination')
      this.sources = []
      this.gains = []
      this.limiters = []
      this.resume = vi.fn(() => { this.state = 'running'; return Promise.resolve() })
      instances.push(this)
    }
    createMediaElementSource(el) { const n = makeNode('source'); n.el = el; this.sources.push(n); return n }
    createGain() {
      const n = makeNode('gain')
      n.gain = { value: 1, setTargetAtTime: vi.fn() }
      this.gains.push(n)
      return n
    }
    createDynamicsCompressor() {
      const p = () => ({ value: 0 })
      const n = makeNode('limiter')
      Object.assign(n, { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() })
      this.limiters.push(n)
      return n
    }
  }
  return { FakeContext, instances }
}

const setup = (initial) => {
  const { FakeContext, instances } = makeFakeContext()
  const els = [document.createElement('video'), document.createElement('video')]
  const refs = els.map((current) => ({ current }))
  const hook = renderHook(({ ref, boost }) => useVolumeBoost(ref, boost, { AudioContextImpl: FakeContext }), { initialProps: { ref: refs[0], boost: initial } })
  return { ...hook, instances, els, refs, ctx: () => instances[0] }
}

beforeEach(() => { __resetVolumeBoostForTests(); vi.restoreAllMocks() })

describe('useVolumeBoost', () => {
  it('creates nothing while boost is 1', () => {
    const { instances } = setup(1)
    expect(instances).toHaveLength(0)
  })
  it('routes gain through the limiter above 1', () => {
    const { rerender, ctx, refs } = setup(1)
    rerender({ ref: refs[0], boost: 2 })
    const c = ctx()
    expect(c.sources).toHaveLength(1)
    const [source] = c.sources
    const [gain] = c.gains
    const [limiter] = c.limiters
    expect(source.targets).toEqual([gain])
    expect(gain.targets).toEqual([limiter])
    expect(limiter.targets).toEqual([c.destination])
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(2, 5, 0.02)
    expect(limiter.threshold.value).toBe(-1)
    expect(limiter.ratio.value).toBe(20)
    expect(limiter.attack.value).toBe(0.003)
    expect(limiter.release.value).toBe(0.25)
    expect(limiter.knee.value).toBe(0)
  })
  it('bypasses the limiter back at 1 and keeps one source', () => {
    const { rerender, ctx, refs } = setup(2)
    rerender({ ref: refs[0], boost: 1 })
    const c = ctx()
    expect(c.sources).toHaveLength(1)
    expect(c.gains[0].targets).toEqual([c.destination])
    expect(c.limiters[0].targets).toEqual([])
    expect(c.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 5, 0.02)
  })
  it('wraps the same element only once across 3 -> 1 -> 3', () => {
    const { rerender, ctx, refs } = setup(3)
    rerender({ ref: refs[0], boost: 1 })
    rerender({ ref: refs[0], boost: 3 })
    const c = ctx()
    expect(c.sources).toHaveLength(1)
    expect(c.gains[0].targets).toEqual([c.limiters[0]])
    expect(c.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(3, 5, 0.02)
  })
  it('builds a graph for a new element on the same context and drops old listeners', () => {
    const { rerender, instances, els, refs } = setup(2)
    const removed = vi.spyOn(els[0], 'removeEventListener')
    rerender({ ref: refs[1], boost: 2 })
    expect(instances).toHaveLength(1)
    expect(instances[0].sources.map((s) => s.el)).toEqual([els[0], els[1]])
    expect(removed).toHaveBeenCalledWith('play', expect.any(Function))
    instances[0].state = 'suspended'
    els[0].dispatchEvent(new Event('play'))
    expect(instances[0].resume).not.toHaveBeenCalled()
    els[1].dispatchEvent(new Event('play'))
    expect(instances[0].resume).toHaveBeenCalledTimes(1)
  })
  it('resumes a suspended context on play, keydown and pointerdown', () => {
    const { els, ctx } = setup(2)
    els[0].dispatchEvent(new Event('play'))
    expect(ctx().resume).toHaveBeenCalledTimes(1)
    ctx().state = 'suspended'
    fireEvent.keyDown(window, { key: 'a' })
    expect(ctx().resume).toHaveBeenCalledTimes(2)
    ctx().state = 'suspended'
    fireEvent.pointerDown(window)
    expect(ctx().resume).toHaveBeenCalledTimes(3)
  })
  it('removes listeners and disconnects on unmount', () => {
    const { unmount, els, ctx } = setup(2)
    unmount()
    expect(ctx().gains[0].targets).toEqual([])
    ctx().state = 'suspended'
    els[0].dispatchEvent(new Event('play'))
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.pointerDown(window)
    expect(ctx().resume).not.toHaveBeenCalled()
  })
  it('does nothing and warns once when the context cannot be created', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Boom = class { constructor() { throw new Error('nope') } }
    const el = document.createElement('video')
    const { rerender } = renderHook(({ boost }) => useVolumeBoost({ current: el }, boost, { AudioContextImpl: Boom }), { initialProps: { boost: 2 } })
    rerender({ boost: 3 })
    expect(warn).toHaveBeenCalledTimes(1)
  })
  it('does nothing when createMediaElementSource throws', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { FakeContext } = makeFakeContext()
    FakeContext.prototype.createMediaElementSource = () => { throw new Error('InvalidStateError') }
    const el = document.createElement('video')
    expect(() => renderHook(() => useVolumeBoost({ current: el }, 2, { AudioContextImpl: FakeContext }))).not.toThrow()
  })
  it('does nothing without an AudioContext implementation', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('video')
    expect(() => renderHook(() => useVolumeBoost({ current: el }, 2, { AudioContextImpl: undefined }))).not.toThrow()
  })
})
