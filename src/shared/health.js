// Rule for trusting the last successful ani-cli self-test at startup.
export const HEALTH_TOOLS = ['bash', 'ani-cli']
export const HEALTH_MAX_AGE_MS = 72 * 60 * 60 * 1000

export function toolFingerprint(versionOf) {
  const out = {}
  for (const id of HEALTH_TOOLS) out[id] = versionOf(id) ?? null
  return out
}

export function trustLastCheck({ record, tools, now, maxAgeMs = HEALTH_MAX_AGE_MS }) {
  if (!record || typeof record.okAt !== 'string' || !record.tools || typeof record.tools !== 'object') return false
  const at = Date.parse(record.okAt)
  if (!Number.isFinite(at)) return false
  const age = now - at
  if (!(age >= 0 && age < maxAgeMs)) return false
  for (const id of HEALTH_TOOLS) {
    if (!(id in record.tools)) return false
    if ((record.tools[id] ?? null) !== ((tools && tools[id]) ?? null)) return false
  }
  return true
}
