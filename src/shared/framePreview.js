// Pure rules for the seek-bar frame preview.
// The frontier (furthest point reached by real playback) only moves on small forward steps, never on seeks or jumps,
// so scrubbing ahead cannot reveal frames the viewer has not watched yet (mode 'reached').
// The network guard (canFetch, hls) keeps the hidden preview video from competing with the main stream:
// it needs a buffer margin, a ready main player, and a cap on fetches per time window.

export const PREVIEW_MIN_AHEAD_S = 15
export const PREVIEW_WINDOW_MS = 60000
export const PREVIEW_MAX_FETCHES = 12
export const PREVIEW_BUCKET_S = 5
export const PREVIEW_CACHE_MAX = 120
export const PREVIEW_DEBOUNCE_MS = 120
export const PREVIEW_IDLE_MS = 60000
export const PREVIEW_SEEK_TIMEOUT_MS = 8000
export const FRONTIER_MAX_STEP_S = 3

export function advanceFrontier(frontier, lastTime, time, seeking) {
  if (seeking) return frontier
  const step = time - lastTime
  if (step > 0 && step <= FRONTIER_MAX_STEP_S) return Math.max(frontier, time)
  return frontier
}

export function previewAllowed(mode, at, frontier) {
  if (mode === 'off') return false
  if (mode === 'full') return true
  return at <= frontier
}

export const bucketOf = (t) => Math.floor(t / PREVIEW_BUCKET_S)

export function bufferedAhead(ranges, time) {
  for (const r of ranges || []) {
    if (r.start <= time + 0.5 && r.end > time) return r.end - time
  }
  return 0
}

export function pruneRecent(recent, now) {
  return recent.filter((t) => now - t < PREVIEW_WINDOW_MS)
}

export function canFetch({ kind, inFlight, mainPaused, ahead, buffering, failed, readyState, recent, now }) {
  if (inFlight) return false
  if (kind !== 'hls') return true
  if (failed || buffering || readyState < 3) return false
  if (!mainPaused && ahead < PREVIEW_MIN_AHEAD_S) return false
  return pruneRecent(recent, now).length < PREVIEW_MAX_FETCHES
}

export function createFrameCache(max = PREVIEW_CACHE_MAX) {
  const map = new Map()
  return {
    get(bucket) {
      if (!map.has(bucket)) return undefined
      const src = map.get(bucket)
      map.delete(bucket)
      map.set(bucket, src)
      return src
    },
    set(bucket, src) {
      map.delete(bucket)
      map.set(bucket, src)
      while (map.size > max) map.delete(map.keys().next().value)
    },
    nearest(bucket) {
      for (const b of [bucket, bucket - 1, bucket + 1]) if (map.has(b)) return { bucket: b, src: map.get(b) }
      return null
    },
    clear() {
      map.clear()
    },
    get size() {
      return map.size
    },
  }
}
