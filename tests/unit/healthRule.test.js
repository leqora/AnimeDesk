import { describe, it, expect } from 'vitest'
import { HEALTH_MAX_AGE_MS, HEALTH_TOOLS, toolFingerprint, trustLastCheck } from '../../src/shared/health.js'

const okAt = '2026-10-19T10:00:00.000Z'
const t0 = Date.parse(okAt)
const tools = { bash: null, 'ani-cli': '4.10' }
const rec = { okAt, tools }

describe('trustLastCheck', () => {
  it('constants', () => {
    expect(HEALTH_TOOLS).toEqual(['bash', 'ani-cli'])
    expect(HEALTH_MAX_AGE_MS).toBe(72 * 60 * 60 * 1000)
  })
  it('true shortly after', () => {
    expect(trustLastCheck({ record: rec, tools, now: t0 + 60000 })).toBe(true)
  })
  it('true at +72h - 1ms', () => {
    expect(trustLastCheck({ record: rec, tools, now: t0 + HEALTH_MAX_AGE_MS - 1 })).toBe(true)
  })
  it('false at exactly +72h', () => {
    expect(trustLastCheck({ record: rec, tools, now: t0 + HEALTH_MAX_AGE_MS })).toBe(false)
  })
  it('false when now is before okAt', () => {
    expect(trustLastCheck({ record: rec, tools, now: t0 - 60000 })).toBe(false)
  })
  it('false for bad records', () => {
    const now = t0 + 1000
    expect(trustLastCheck({ record: { okAt: 'garbage', tools }, tools, now })).toBe(false)
    expect(trustLastCheck({ record: { tools }, tools, now })).toBe(false)
    expect(trustLastCheck({ record: null, tools, now })).toBe(false)
    expect(trustLastCheck({ record: { okAt }, tools, now })).toBe(false)
  })
  it('false when ani-cli differs or is absent', () => {
    const now = t0 + 1000
    expect(trustLastCheck({ record: rec, tools: { bash: null, 'ani-cli': '4.11' }, now })).toBe(false)
    expect(trustLastCheck({ record: { okAt, tools: { bash: null } }, tools, now })).toBe(false)
  })
  it('null equals null; extra tools ignored', () => {
    const r = { okAt, tools: { bash: null, 'ani-cli': '4.10', mpv: '1' } }
    expect(trustLastCheck({ record: r, tools, now: t0 + 1000 })).toBe(true)
  })
})

describe('toolFingerprint', () => {
  it('maps undefined to null', () => {
    expect(toolFingerprint((id) => ({ 'ani-cli': '4.10' })[id])).toEqual({ bash: null, 'ani-cli': '4.10' })
  })
})
