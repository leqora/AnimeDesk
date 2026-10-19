import { describe, it, expect, vi } from 'vitest'
import { createHealthCheck, healthState, shouldDailyCheck } from '../../src/main/healthCheck.js'

function setup({ missing = [], online = true, tests = [true], updates = [], version, store, now, isBusy, sleep, onWaitIdle } = {}) {
  const states = []
  const toolManager = {
    missing: () => missing,
    updateAll: vi.fn(async () => updates),
    lastUpdateCheck: vi.fn(() => null),
    markUpdateCheck: vi.fn(),
  }
  if (version) toolManager.version = version
  const aniCli = { selfTest: vi.fn(async () => tests.shift() ?? false) }
  const opts = { toolManager, aniCli, isOnline: async () => online, onState: (s) => states.push(s.pending ? s.reason + '*' : s.reason) }
  if (store) opts.store = store
  if (now) opts.now = now
  if (isBusy) opts.isBusy = isBusy
  if (sleep) opts.sleep = sleep
  if (onWaitIdle) opts.onWaitIdle = onWaitIdle
  const hc = createHealthCheck(opts)
  return { hc, states, toolManager, aniCli }
}

const NOW = Date.parse('2026-10-19T12:00:00Z')
const HOUR = 3600 * 1000
function fakeStore(record = null) {
  const st = { record, read: vi.fn(() => st.record), write: vi.fn((r) => { st.record = r }), clear: vi.fn(() => { st.record = null }) }
  return st
}
const okRecord = (over = {}) => ({ okAt: new Date(NOW - HOUR).toISOString(), tools: { bash: '5.2', 'ani-cli': '4.10' }, ...over })
const ver = (map) => (id) => map[id] ?? null
const V = { bash: '5.2', 'ani-cli': '4.10' }

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

  describe('optimistic start', () => {
    const mk = (record, extra = {}) => {
      const store = fakeStore(record)
      return { store, ...setup({ version: ver(V), store, now: () => NOW, ...extra }) }
    }
    it('shows green+pending first with a valid record, then rewrites it', async () => {
      const { hc, states, store } = mk(okRecord())
      await hc.run({ optimistic: true })
      expect(states).toEqual(['ok*', 'ok'])
      expect(store.write).toHaveBeenCalledWith({ okAt: new Date(NOW).toISOString(), tools: V })
    })
    it('starts with checking for a stale record, no record, or other version', async () => {
      for (const rec of [okRecord({ okAt: new Date(NOW - 72 * HOUR).toISOString() }), null, okRecord({ tools: { bash: '5.2', 'ani-cli': '4.9' } })]) {
        const { hc, states } = mk(rec)
        await hc.run({ optimistic: true })
        expect(states).toEqual(['checking', 'ok'])
      }
    })
    it('normal run never shows pending', async () => {
      const { hc, states } = mk(okRecord())
      await hc.run()
      expect(states).toEqual(['checking', 'ok'])
    })
    it('goes offline after pending without clearing the record', async () => {
      const { hc, states, store } = mk(okRecord(), { online: false })
      await hc.run({ optimistic: true })
      expect(states).toEqual(['ok*', 'offline'])
      expect(store.clear).not.toHaveBeenCalled()
    })
    it('updates after a failed self-test and records versions read after the update', async () => {
      let v = '4.10'
      const store = fakeStore(okRecord())
      const s = setup({ version: (id) => (id === 'ani-cli' ? v : '5.2'), store, now: () => NOW, tests: [false, true], updates: ['ani-cli'] })
      s.toolManager.updateAll.mockImplementation(async () => { v = '4.11'; return ['ani-cli'] })
      await s.hc.run({ optimistic: true })
      expect(s.states).toEqual(['ok*', 'updating', 'ok'])
      expect(store.write).toHaveBeenCalledWith({ okAt: new Date(NOW).toISOString(), tools: { bash: '5.2', 'ani-cli': '4.11' } })
    })
    it('source-down clears the record', async () => {
      const { hc, store, states } = mk(okRecord(), { tests: [false], updates: [] })
      expect((await hc.run({ optimistic: true })).reason).toBe('source-down')
      expect(states).toEqual(['ok*', 'updating', 'source-down'])
      expect(store.clear).toHaveBeenCalledTimes(1)
    })
    it('reads versions before the self-test', async () => {
      let v = '4.10'
      const store = fakeStore()
      const s = setup({ version: (id) => (id === 'ani-cli' ? v : '5.2'), store, now: () => NOW })
      s.aniCli.selfTest.mockImplementation(async () => { v = '4.11'; return true })
      await s.hc.run()
      expect(store.write.mock.calls[0][0].tools['ani-cli']).toBe('4.10')
    })
    it('waits while an ani-cli session is busy before updating', async () => {
      const calls = []
      const seen = []
      let hcRef
      const sleep = vi.fn(async (ms) => { calls.push('sleep' + ms); seen.push(hcRef.get().reason) })
      const s = mk(okRecord(), { tests: [false, true], updates: ['ani-cli'], isBusy: () => calls.length < 3, sleep })
      hcRef = s.hc
      s.toolManager.updateAll.mockImplementation(async () => { calls.push('updateAll'); return ['ani-cli'] })
      const states = s.states
      await s.hc.run({ optimistic: true })
      expect(calls).toEqual(['sleep5000', 'sleep5000', 'sleep5000', 'updateAll'])
      expect(states).toEqual(['ok*', 'updating', 'ok'])
      expect(seen).toEqual(['updating', 'updating', 'updating'])
    })
    it('daily update waits while busy', async () => {
      let polls = 2
      const calls = []
      const sleep = vi.fn(async (ms) => { calls.push('sleep' + ms) })
      const s = setup({ updates: ['yt-dlp'], isBusy: () => polls-- > 0, sleep })
      s.toolManager.updateAll.mockImplementation(async () => { calls.push('updateAll'); return ['yt-dlp'] })
      await s.hc.dailyUpdate({ enabled: true, now: '2026-10-01T00:00:00Z' })
      expect(calls).toEqual(['sleep5000', 'sleep5000', 'updateAll'])
    })
    it('serializes updates: check and dailyUpdate released together never overlap', async () => {
      let busy = true
      let running = 0
      let max = 0
      const s = mk(okRecord(), { tests: [false, true], isBusy: () => busy, sleep: async () => { busy = false } })
      s.toolManager.updateAll.mockImplementation(async () => {
        running++; max = Math.max(max, running)
        await new Promise((r) => setTimeout(r, 5))
        running--
        return ['ani-cli']
      })
      await Promise.all([s.hc.run({ optimistic: true }), s.hc.dailyUpdate({ enabled: true, now: '2026-10-01T00:00:00Z' })])
      expect(s.toolManager.updateAll).toHaveBeenCalledTimes(2)
      expect(max).toBe(1)
    })
    it('a rejected update does not block the next one', async () => {
      const s = setup({})
      s.toolManager.updateAll.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(['yt-dlp'])
      const first = s.hc.updateTools()
      const second = s.hc.updateTools()
      await expect(first).rejects.toThrow('boom')
      expect(await second).toEqual(['yt-dlp'])
    })
    it('retests when versions changed meanwhile even if own update returned nothing', async () => {
      let v = '4.10'
      const store = fakeStore(okRecord())
      const s = setup({ version: (id) => (id === 'ani-cli' ? v : '5.2'), store, now: () => NOW, tests: [false, true], updates: [] })
      s.toolManager.updateAll.mockImplementation(async () => { v = '4.11'; return [] })
      expect((await s.hc.run({ optimistic: true })).reason).toBe('ok')
      expect(store.write).toHaveBeenCalledWith({ okAt: new Date(NOW).toISOString(), tools: { bash: '5.2', 'ani-cli': '4.11' } })
      expect(store.clear).not.toHaveBeenCalled()
    })
    it('updateTools without idle wait runs even when busy', async () => {
      const sleep = vi.fn()
      const s = setup({ isBusy: () => true, sleep, updates: ['ani-cli'] })
      const onProgress = () => {}
      expect(await s.hc.updateTools({ waitForIdle: false, onProgress })).toEqual(['ani-cli'])
      expect(sleep).not.toHaveBeenCalled()
      expect(s.toolManager.updateAll).toHaveBeenCalledWith(['ani-cli', 'yt-dlp'], onProgress)
    })
    it('onWaitIdle fires once when check waits, never when idle or from dailyUpdate', async () => {
      let polls = 2
      const onWaitIdle = vi.fn()
      const s = mk(okRecord(), { tests: [false, true], updates: ['ani-cli'], isBusy: () => polls-- > 0, sleep: async () => {}, onWaitIdle })
      await s.hc.run({ optimistic: true })
      expect(onWaitIdle).toHaveBeenCalledTimes(1)
      const idle = mk(okRecord(), { tests: [false, true], updates: ['ani-cli'], onWaitIdle })
      await idle.hc.run({ optimistic: true })
      expect(onWaitIdle).toHaveBeenCalledTimes(1)
      let p2 = 2
      const d = setup({ updates: ['yt-dlp'], isBusy: () => p2-- > 0, sleep: async () => {}, onWaitIdle })
      await d.hc.dailyUpdate({ enabled: true, now: '2026-10-01T00:00:00Z' })
      expect(onWaitIdle).toHaveBeenCalledTimes(1)
    })
    it('a throwing onWaitIdle does not change the outcome', async () => {
      let polls = 1
      const s = mk(okRecord(), { tests: [false, true], updates: ['ani-cli'], isBusy: () => polls-- > 0, sleep: async () => {}, onWaitIdle: () => { throw new Error('x') } })
      expect((await s.hc.run({ optimistic: true })).reason).toBe('ok')
    })
    it('a no-wait update does not queue behind a waiting dailyUpdate', async () => {
      let busy = true
      const s = setup({ updates: ['yt-dlp'], isBusy: () => busy, sleep: () => new Promise(() => {}) })
      s.hc.dailyUpdate({ enabled: true, now: '2026-10-01T00:00:00Z' }) // parks in the idle wait
      expect(await s.hc.updateTools({ waitForIdle: false })).toEqual(['yt-dlp'])
      expect(s.toolManager.updateAll).toHaveBeenCalledTimes(1)
      busy = false
    })
    it('store failures never change the state', async () => {
      const w = mk(null)
      w.store.write.mockImplementation(() => { throw new Error('disk') })
      expect((await w.hc.run()).reason).toBe('ok')
      const c = mk(null, { tests: [false] })
      c.store.clear.mockImplementation(() => { throw new Error('disk') })
      expect((await c.hc.run()).reason).toBe('source-down')
      const r = mk(null)
      r.store.read.mockImplementation(() => { throw new Error('disk') })
      await r.hc.run({ optimistic: true })
      expect(r.states).toEqual(['checking', 'ok'])
    })
    it('missing tools skip the store entirely', async () => {
      const { hc, states, store } = mk(okRecord(), { missing: ['mpv'] })
      await hc.run({ optimistic: true })
      expect(states).toEqual(['missing-tools'])
      expect(store.read).not.toHaveBeenCalled()
    })
    it('concurrent run returns the in-flight promise regardless of opts', async () => {
      const { hc, aniCli } = mk(okRecord())
      const [a, b] = [hc.run({ optimistic: true }), hc.run()]
      await Promise.all([a, b])
      expect(aniCli.selfTest).toHaveBeenCalledTimes(1)
    })
  })
})
