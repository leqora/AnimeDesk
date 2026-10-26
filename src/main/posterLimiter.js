// Download limiter shared by the schedule and discover services: at most `concurrency` downloads run at once across all
// callers. A slot is freed when the download really settles, not when a caller gave up on it; the same key requested twice
// shares one download. The caller gets null once `timeoutMs` has passed since the download actually started (waiting for a
// slot does not count), while the download itself keeps its slot. `task` is run when the slot is obtained; it returns the
// value (or null) and any rejection counts as null. Cancellation (stop/forget) stays with the caller, inside `task`.
export function createPosterLimiter({
  concurrency = 4, timeoutMs = 8000,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
} = {}) {
  let active = 0
  const waiters = []
  const acquire = () => {
    if (active < concurrency) { active++; return Promise.resolve() }
    return new Promise((resolve) => waiters.push(resolve))
  }
  const release = () => {
    const next = waiters.shift()
    if (next) next() // the slot passes straight on
    else active--
  }
  const downloads = new Map() // key -> { started, done }

  function start(key, task) {
    let d = downloads.get(key)
    if (d) return d
    let markStarted
    const started = new Promise((resolve) => { markStarted = resolve })
    const done = (async () => {
      await acquire()
      markStarted()
      try {
        return await Promise.resolve().then(task).catch(() => null)
      } finally {
        release()
        downloads.delete(key)
      }
    })()
    d = { started, done }
    downloads.set(key, d)
    return d
  }

  async function download(key, task) {
    const d = start(key, task)
    await d.started
    let timer
    const timeout = new Promise((resolve) => { timer = setT(() => resolve(null), timeoutMs) })
    try {
      return await Promise.race([d.done, timeout])
    } finally {
      clearT(timer)
    }
  }

  return { download }
}
