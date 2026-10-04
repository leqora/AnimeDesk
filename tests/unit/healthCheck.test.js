import { describe, it, expect, vi } from 'vitest'
import { createHealthCheck, healthState, shouldDailyCheck } from '../../src/main/healthCheck.js'

function setup({ missing = [], online = true, tests = [true], updates = [] } = {}) {
  const states = []
  const toolManager = {
    missing: () => missing,
    updateAll: vi.fn(async () => updates),
    lastUpdateCheck: vi.fn(() => null),
    markUpdateCheck: vi.fn(),
  }
  const aniCli = { selfTest: vi.fn(async () => tests.shift() ?? false) }
  const hc = createHealthCheck({ toolManager, aniCli, isOnline: async () => online, onState: (s) => states.push(s.reason) })
  return { hc, states, toolManager, aniCli }
}

describe('healthState', () => {
  it('maps reasons to lights', () => {
    expect(healthState('ok').light).toBe('green')
    expect(healthState('checking').light).toBe('yellow')
    expect(healthState('updating').light).toBe('yellow')
    expect(healthState('missing-tools', { missing: ['mpv'] })).toEqual({ light: 'red', reason: 'missing-tools', missing: ['mpv'] })
    expect(healthState('source-down').light).toBe('red')
    expect(healthState('offline').light).toBe('red')
  })
})

describe('healthCheck', () => {
  it('is red with the list when tools are missing, without touching the network', async () => {
    const { hc, aniCli } = setup({ missing: ['mpv', 'ffmpeg'] })
    expect(await hc.run()).toEqual({ light: 'red', reason: 'missing-tools', missing: ['mpv', 'ffmpeg'] })
    expect(aniCli.selfTest).not.toHaveBeenCalled()
  })
  it('is red when offline', async () => {
    const { hc } = setup({ online: false })
    expect((await hc.run()).reason).toBe('offline')
  })
  it('is green when the self-test passes', async () => {
    const { hc, states } = setup()
    expect((await hc.run()).light).toBe('green')
    expect(states).toEqual(['checking', 'ok'])
  })
  it('updates ani-cli/yt-dlp and retests when the self-test fails', async () => {
    const { hc, states, toolManager } = setup({ tests: [false, true], updates: ['ani-cli'] })
    expect((await hc.run()).reason).toBe('ok')
    expect(toolManager.updateAll).toHaveBeenCalledWith(['ani-cli', 'yt-dlp'])
    expect(states).toEqual(['checking', 'updating', 'ok'])
  })
  it('is source-down when there is no update or it does not help', async () => {
    expect((await setup({ tests: [false], updates: [] }).hc.run()).reason).toBe('source-down')
    expect((await setup({ tests: [false, false], updates: ['ani-cli'] }).hc.run()).reason).toBe('source-down')
  })
  it('is source-down when updating throws', async () => {
    const s = setup({ tests: [false] })
    s.toolManager.updateAll.mockRejectedValue(new Error('rate limited'))
    expect((await s.hc.run()).reason).toBe('source-down')
  })
  it('shares one run between concurrent callers', async () => {
    const { hc, aniCli } = setup()
    await Promise.all([hc.run(), hc.run()])
    expect(aniCli.selfTest).toHaveBeenCalledTimes(1)
  })
  it('daily update runs at most once per 24h and only when enabled', async () => {
    expect(shouldDailyCheck(null, '2026-10-01T00:00:00Z')).toBe(true)
    expect(shouldDailyCheck('2026-10-01T00:00:00Z', '2026-10-01T23:59:00Z')).toBe(false)
    expect(shouldDailyCheck('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z')).toBe(true)
    const { hc, toolManager } = setup({ updates: ['yt-dlp'] })
    expect(await hc.dailyUpdate({ enabled: false, now: '2026-10-01T00:00:00Z' })).toEqual([])
    expect(await hc.dailyUpdate({ enabled: true, now: '2026-10-01T00:00:00Z' })).toEqual(['yt-dlp'])
    expect(toolManager.markUpdateCheck).toHaveBeenCalledWith('2026-10-01T00:00:00Z')
  })
})
