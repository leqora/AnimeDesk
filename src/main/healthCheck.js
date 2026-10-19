import { AUTO_UPDATE_TOOLS } from './toolSources.js'
import { toolFingerprint, trustLastCheck } from '../shared/health.js'

const LIGHT = {
  ok: 'green',
  checking: 'yellow',
  updating: 'yellow',
  'missing-tools': 'red',
  'source-down': 'red',
  offline: 'red',
}

export function healthState(reason, extra = {}) {
  return { light: LIGHT[reason], reason, ...extra }
}

export function shouldDailyCheck(last, now) {
  return !last || Date.parse(now) - Date.parse(last) >= 24 * 60 * 60 * 1000
}

export const BUSY_POLL_MS = 5000
const NOOP_STORE = { read: () => null, write() {}, clear() {} }

export function createHealthCheck({
  toolManager,
  aniCli,
  isOnline,
  onState = () => {},
  store = NOOP_STORE,
  now = () => Date.now(),
  isBusy = () => false,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  let state = healthState('checking')
  let running = null

  const set = (s) => { state = s; onState(s); return s }
  const safeTest = async () => { try { return await aniCli.selfTest() } catch { return false } }
  const versionOf = (id) => (typeof toolManager.version === 'function' ? toolManager.version(id) : null)
  const fingerprint = () => toolFingerprint(versionOf)
  const warn = (what, e) => console.warn(`[health] ${what} failed:`, e?.message ?? e)

  const readRecord = () => {
    try { return store.read() } catch (e) { warn('record read', e); return null }
  }
  const writeRecord = (tools) => {
    try { store.write({ okAt: new Date(now()).toISOString(), tools }) } catch (e) { warn('record write', e) }
  }
  const clearRecord = () => {
    try { store.clear() } catch (e) { warn('record clear', e) }
  }
  // Never update tools while an ani-cli session is alive.
  const waitIdle = async () => { while (isBusy()) await sleep(BUSY_POLL_MS) }

  async function check(optimistic) {
    const missing = toolManager.missing()
    if (missing.length) return set(healthState('missing-tools', { missing }))
    const trusted = optimistic && trustLastCheck({ record: readRecord(), tools: fingerprint(), now: now() })
    set(trusted ? healthState('ok', { pending: true }) : healthState('checking'))
    if (!(await isOnline())) return set(healthState('offline'))
    const before = fingerprint()
    if (await safeTest()) {
      writeRecord(before)
      return set(healthState('ok'))
    }
    set(healthState('updating'))
    try {
      await waitIdle()
      const updated = await toolManager.updateAll(AUTO_UPDATE_TOOLS)
      if (updated.length) {
        const after = fingerprint()
        if (await safeTest()) {
          writeRecord(after)
          return set(healthState('ok'))
        }
      }
    } catch {
      // fall through to source-down
    }
    clearRecord()
    return set(healthState('source-down'))
  }

  function run({ optimistic = false } = {}) {
    if (!running) running = check(optimistic).finally(() => { running = null })
    return running
  }

  async function dailyUpdate({ enabled, now: at }) {
    if (!enabled || !shouldDailyCheck(toolManager.lastUpdateCheck(), at)) return []
    toolManager.markUpdateCheck(at)
    try {
      await waitIdle()
      return await toolManager.updateAll(AUTO_UPDATE_TOOLS)
    } catch {
      return []
    }
  }

  return { run, get: () => state, dailyUpdate }
}
