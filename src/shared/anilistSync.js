// Pure AniList progress-sync decisions. Only episode numbers and statuses — nothing story related.

export const RETRY_DELAYS_MS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3]
export const RETRY_LATER_MS = 6 * 3600e3
export const MAX_REJECTED = 5
export const DEBOUNCE_MS = 30e3

// attempts = number of failures so far (1-based).
export function retryDelay(attempts) {
  return RETRY_DELAYS_MS[attempts - 1] ?? RETRY_LATER_MS
}

export function localProgress(entry) {
  let max = 0
  for (const n of entry?.watchedEpisodes ?? []) if (Number.isInteger(n) && n > max) max = n
  return max
}

export function wantsSync(entry, sent) {
  const p = localProgress(entry)
  if (p > (sent?.progress ?? 0)) return true
  return entry?.status === 'completed' && sent?.status !== 'COMPLETED' && p > 0
}

// remote = { episodes, entry: { progress, status } | null }
export function decide({ progress, completed, remote }) {
  const e = remote?.entry ?? null
  if (e?.status === 'COMPLETED') return { action: 'skip', remember: { progress: e.progress, status: e.status } }
  if (remote?.episodes != null && progress > remote.episodes) return { action: 'mismatch' }
  if (completed) return { action: 'send', progress: Math.max(progress, e?.progress ?? 0), status: 'COMPLETED' }
  if (!e) return { action: 'send', progress, status: 'CURRENT' }
  if (e.progress >= progress) return { action: 'skip', remember: { progress: e.progress, status: e.status } }
  return e.status === 'PLANNING' ? { action: 'send', progress, status: 'CURRENT' } : { action: 'send', progress }
}
