import { describe, it, expect, vi } from 'vitest'
import { createSound } from '../../src/renderer/sound.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

function fakeContext() {
  const param = () => ({ value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() })
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
  const ctx = {
    currentTime: 0,
    destination: {},
    gains: [],
    oscillators: 0,
    createGain() { const g = { ...node(), gain: param() }; ctx.gains.push(g); return g },
    createOscillator() { ctx.oscillators++; return { ...node(), type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn() } },
  }
  return ctx
}
const setup = (over = {}) => {
  const ctx = fakeContext()
  const factory = vi.fn(() => ctx)
  const sound = createSound({ getSettings: () => ({ ...DEFAULT_SETTINGS, ...over }), audioContextFactory: factory })
  return { ctx, factory, sound }
}

describe('sound', () => {
  it('plays key sounds by default at the configured volume', () => {
    const { ctx, sound } = setup({ soundVolume: 60 })
    expect(sound.play('downloadDone')).toBe(true)
    expect(ctx.gains[0].gain.value).toBe(0.6)
    expect(ctx.oscillators).toBeGreaterThan(0)
  })
  it('keeps interface sounds off by default', () => {
    const { factory, sound } = setup()
    expect(sound.play('click')).toBe(false)
    expect(factory).not.toHaveBeenCalled()
  })
  it('respects the switches', () => {
    expect(setup({ soundKey: false }).sound.play('levelUp')).toBe(false)
    expect(setup({ soundUi: true }).sound.play('navigate')).toBe(true)
  })
  it('levelUp is not interrupted by lower priority sounds', () => {
    const { ctx, sound } = setup({ soundUi: true })
    expect(sound.play('levelUp')).toBe(true)
    expect(sound.play('seriesCompleted')).toBe(false)
    expect(sound.play('click')).toBe(false)
    ctx.currentTime = 5
    expect(sound.play('click')).toBe(true)
  })
  it('a key sound replaces a playing interface sound', () => {
    const { ctx, sound } = setup({ soundUi: true })
    sound.play('navigate')
    const uiGain = ctx.gains[0]
    expect(sound.play('levelUp')).toBe(true)
    expect(uiGain.disconnect).toHaveBeenCalled()
  })
  it('ignores unknown names', () => {
    expect(setup().sound.play('boom')).toBe(false)
  })
})
