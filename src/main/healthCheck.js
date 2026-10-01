import { AUTO_UPDATE_TOOLS } from './toolSources.js'

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

export function createHealthCheck({ toolManager, aniCli, isOnline, onState = () => {} }) {
  let state = healthState('checking')
  let running = null

  const set = (s) => { state = s; onState(s); return s }
  const safeTest = async () => { try { return await aniCli.selfTest() } catch { return false } }

  async function check() {
    const missing = toolManager.missing()
    if (missing.length) return set(healthState('missing-tools', { missing }))
    set(healthState('checking'))
    if (!(await isOnline())) return set(healthState('offline'))
    if (await safeTest()) return set(healthState('ok'))
    set(healthState('updating'))
    try {
      const updated = await toolManager.updateAll(AUTO_UPDATE_TOOLS)
      if (updated.length && (await safeTest())) return set(healthState('ok'))
    } catch {
      // fall through to source-down
    }
    return set(healthState('source-down'))
  }

  function run() {
    if (!running) running = check().finally(() => { running = null })
    return running
  }

  async function dailyUpdate({ enabled, now }) {
    if (!enabled || !shouldDailyCheck(toolManager.lastUpdateCheck(), now)) return []
    toolManager.markUpdateCheck(now)
    try {
      return await toolManager.updateAll(AUTO_UPDATE_TOOLS)
    } catch {
      return []
    }
  }

  return { run, get: () => state, dailyUpdate }
}
