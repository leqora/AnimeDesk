import { readJson, writeJsonAtomic } from './jsonStore.js'
import { AniListAuthError } from './anilist.js'
import { localProgress, wantsSync, decide, retryDelay, MAX_REJECTED, DEBOUNCE_MS } from '../shared/anilistSync.js'

const FIRST_RUN_MS = 60 * 1000
const MAX_TIMER_MS = 6 * 3600 * 1000
const FILE_VERSION = 1

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const num = (v, d) => (Number.isFinite(v) ? v : d)

// Pushes the watched progress of confirmed series to the user's AniList account: debounced, forward-only,
// one request at a time, queue persisted so offline periods and restarts lose nothing. Only media ids and
// episode numbers are handled here; the token is read from auth per request and never stored or logged.
export function createAniListSync({
  file, library, seriesPrefs, anilist, auth,
  now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
}) {
  let sent = {} // { [mediaId]: { progress, status, at } }
  let pending = {} // { [mediaId]: { progress, status, attempts, rejected, nextAt, error } }
  let flags = {} // { [mediaId]: { kind: 'error' | 'mismatch', progress } } terminal until local progress grows
  let loaded = false
  let stopped = false
  let busy = false
  let gen = 0 // bumped by reset(); a request that started before it must not write back
  let timer = null
  let firstTimer = null
  let offAuth = null
  const listeners = new Set()

  function load() {
    if (loaded) return
    loaded = true
    try {
      const { data } = readJson(file, {})
      if (isObj(data?.sent)) {
        for (const [id, v] of Object.entries(data.sent)) {
          if (isObj(v) && Number.isFinite(v.progress)) sent[id] = { progress: v.progress, status: typeof v.status === 'string' ? v.status : null, at: num(v.at, 0) }
        }
      }
      if (isObj(data?.pending)) {
        for (const [id, v] of Object.entries(data.pending)) {
          if (!isObj(v) || !Number.isFinite(v.progress)) continue
          pending[id] = {
            progress: v.progress, status: typeof v.status === 'string' ? v.status : 'CURRENT',
            attempts: Math.max(0, num(v.attempts, 0)), rejected: Math.max(0, num(v.rejected, 0)),
            nextAt: num(v.nextAt, 0), error: typeof v.error === 'string' ? v.error : null,
          }
        }
      }
      if (isObj(data?.flags)) {
        for (const [id, v] of Object.entries(data.flags)) {
          if (isObj(v) && (v.kind === 'error' || v.kind === 'mismatch') && Number.isFinite(v.progress)) flags[id] = { kind: v.kind, progress: v.progress }
        }
      }
    } catch (err) {
      console.warn('anilistSync: load failed', scrub(err?.message))
      sent = {}; pending = {}; flags = {}
    }
  }

  function persist() {
    try { writeJsonAtomic(file, { version: FILE_VERSION, sent, pending, flags }) } catch (err) {
      console.warn('anilistSync: save failed', scrub(err?.message))
    }
  }

  function notify() {
    for (const fn of [...listeners]) {
      try { fn() } catch { /* a listener must not break the scheduler */ }
    }
  }

  const listEntries = () => {
    try { return library.list() ?? [] } catch (err) {
      console.warn('anilistSync: library failed', scrub(err?.message))
      return []
    }
  }

  function eligible(e) {
    if (!e || e.aniListConfirmed !== true || !e.aniListId) return false
    try { return seriesPrefs.getAniListSync(e.aniCliTitle ?? e.title) === true } catch { return false }
  }

  const targetStatus = (e) => (e.status === 'completed' ? 'COMPLETED' : 'CURRENT')

  // --- timer -------------------------------------------------------------------------------------------

  function clearTimer() {
    if (timer) clearT(timer)
    timer = null
  }

  // One timer, aimed at the earliest queued item. Idle while a request runs (it re-arms when done), while
  // stopped, and while there is no usable token (a token returning resumes).
  function arm() {
    clearTimer()
    if (stopped || busy) return
    const ids = Object.keys(pending)
    if (ids.length === 0 || !auth.token()) return
    const next = Math.min(...ids.map((id) => pending[id].nextAt))
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, next - now()))
    timer = setT(() => { timer = null; pump() }, delay)
  }

  function pump() {
    if (stopped || busy) return
    const t = now()
    let pick = null
    for (const [id, item] of Object.entries(pending)) {
      if (item.nextAt <= t && (!pick || item.nextAt < pick[1].nextAt)) pick = [id, item]
    }
    if (!pick) { arm(); return }
    if (!auth.token()) return
    busy = true
    const [pickId, pickItem] = pick
    run(pickId, pickItem).catch((err) => {
      console.warn('anilistSync: run failed', scrub(err?.message))
      // Whatever escaped must not leave the item due: it would re-fire at 0 ms in a tight loop.
      if (pending[pickId] === pickItem) {
        const attempts = pickItem.attempts + 1
        pending[pickId] = { ...pickItem, attempts, nextAt: now() + retryDelay(attempts) }
        persist(); notify()
      }
    }).finally(() => {
      busy = false
      arm()
    })
  }

  // --- reconcile ---------------------------------------------------------------------------------------

  // Brings the queue in line with one eligible entry. Returns true when something changed.
  function reconcileEntry(e, delay, pull) {
    const id = String(e.aniListId)
    const p = localProgress(e)
    let changed = false
    const flag = flags[id]
    if (flag) {
      if (p <= flag.progress) return false
      delete flags[id]
      changed = true
    }
    if (!wantsSync(e, sent[id])) {
      if (pending[id]) { delete pending[id]; changed = true }
      return changed
    }
    const status = targetStatus(e)
    const cur = pending[id]
    if (cur && cur.progress === p && cur.status === status) {
      // Same target: never push the deadline (an unrelated library change must not starve it or cancel a
      // backoff). An explicit "now" only pulls it forward.
      if (pull && cur.nextAt > now()) { pending[id] = { ...cur, nextAt: now() }; changed = true }
      return changed
    }
    pending[id] = { progress: p, status, attempts: 0, rejected: 0, nextAt: now() + delay, error: null }
    return true
  }

  function reconcile(delay, pull) {
    load()
    let changed = false
    const byMedia = new Map()
    for (const e of listEntries()) {
      if (!eligible(e)) continue
      byMedia.set(String(e.aniListId), e)
      if (reconcileEntry(e, delay, pull)) changed = true
    }
    for (const id of Object.keys(pending)) {
      if (!byMedia.has(id)) { delete pending[id]; changed = true }
    }
    if (changed) { persist(); notify() }
    arm()
  }

  function check() {
    if (stopped) return
    reconcile(DEBOUNCE_MS, false)
  }

  function syncNow(entryId) {
    if (stopped) return
    load()
    let e = null
    try { e = library.get(entryId) } catch { /* treated as missing */ }
    if (!eligible(e)) return
    if (reconcileEntry(e, 0, true)) { persist(); notify() }
    arm()
  }

  // Runs everything queued now (wake from sleep, token back, startup). Backoff is deliberately skipped:
  // the reason for waiting (offline, expired login) is gone.
  function resume() {
    if (stopped) return
    reconcile(0, false)
    const t = now()
    let changed = false
    for (const [id, item] of Object.entries(pending)) {
      if (item.nextAt > t) { pending[id] = { ...item, nextAt: t }; changed = true }
    }
    if (changed) { persist(); notify() }
    arm()
  }

  // --- one request -------------------------------------------------------------------------------------

  const scrub = (msg, token) => String(msg ?? '').split(token ?? '\u0000').join('').slice(0, 200)

  function classify(err) {
    if (err instanceof AniListAuthError) return 'auth'
    const m = /AniList HTTP (4\d\d)/.exec(err?.message ?? '')
    if (m && m[1] !== '429') return 'rejected'
    return 'transient'
  }

  async function run(id, item) {
    const myGen = gen
    const mediaId = Number(id)
    const aborted = () => stopped || myGen !== gen
    const drop = () => {
      if (pending[id] === item) { delete pending[id]; persist(); notify() }
    }

    let token = null
    try {
      let e = library.findConfirmed(mediaId)
      if (!eligible(e) || !wantsSync(e, sent[id])) return drop()
      token = auth.token()
      if (!token) return
      const remote = await anilist.listEntry(mediaId, token)
      if (aborted()) return
      // The series may have been unlinked or opted out while the lookup was in flight.
      e = library.findConfirmed(mediaId)
      if (!eligible(e) || !wantsSync(e, sent[id])) return drop()
      const progress = localProgress(e)
      const d = decide({ progress, completed: e.status === 'completed', remote })

      if (d.action === 'mismatch') {
        flags[id] = { kind: 'mismatch', progress }
        if (pending[id] === item) delete pending[id]
        persist(); notify()
        return
      }
      if (d.action === 'skip') {
        // Remote COMPLETED can sit below the local progress; remember the local number too so the same
        // series is not looked up again until it moves on.
        const rem = d.remember
        sent[id] = { progress: rem.status === 'COMPLETED' ? Math.max(rem.progress, progress) : rem.progress, status: rem.status, at: now() }
        if (pending[id] === item) delete pending[id]
        persist(); notify()
        return
      }

      const payload = { progress: d.progress }
      if (d.status !== undefined) payload.status = d.status
      const res = await anilist.saveProgress(mediaId, payload, token)
      if (myGen !== gen) return // reset() while the request was out: the result belongs to a cleared account
      sent[id] = {
        progress: Number.isFinite(res?.progress) ? res.progress : d.progress,
        status: res?.status ?? d.status ?? remote?.entry?.status ?? 'CURRENT',
        at: now(),
      }
      if (pending[id] === item) delete pending[id]
      persist(); notify()
    } catch (err) {
      if (myGen !== gen) return
      const kind = classify(err)
      if (kind === 'auth') {
        auth.markExpired(token) // the token this request used, so a newer login is never marked expired
        notify()
        return
      }
      if (pending[id] !== item) return // replaced by a newer change meanwhile: it has its own schedule
      const error = scrub(err?.message, token)
      if (kind === 'rejected') {
        const rejected = item.rejected + 1
        if (rejected >= MAX_REJECTED) {
          const cur = library.findConfirmed(mediaId)
          flags[id] = { kind: 'error', progress: cur ? localProgress(cur) : item.progress }
          delete pending[id]
        } else {
          pending[id] = { ...item, rejected, nextAt: now() + retryDelay(rejected), error }
        }
      } else {
        const attempts = item.attempts + 1
        pending[id] = { ...item, attempts, nextAt: now() + retryDelay(attempts), error }
      }
      persist(); notify()
    }
  }

  // --- public ------------------------------------------------------------------------------------------

  function stateFor(entryId) {
    load()
    let e = null
    try { e = library.get(entryId) } catch { /* treated as missing */ }
    if (!eligible(e)) return { state: 'off' }
    const st = auth.status()?.state
    if (st === 'none' || st == null) return { state: 'off' }
    if (st === 'expired') return { state: 'expired' }
    const id = String(e.aniListId)
    const item = pending[id]
    if (item) {
      return item.attempts + item.rejected > 0 ? { state: 'pending', retryAt: item.nextAt } : { state: 'pending' }
    }
    const flag = flags[id]
    if (flag && localProgress(e) <= flag.progress) return { state: flag.kind }
    return { state: 'synced', progress: sent[id]?.progress ?? 0 }
  }

  function onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function start() {
    load()
    stopped = false
    const t = now()
    // Items left from the last session wait for the startup refresh of AniList info before the first request.
    for (const [id, item] of Object.entries(pending)) {
      if (item.nextAt < t + FIRST_RUN_MS) pending[id] = { ...item, nextAt: t + FIRST_RUN_MS }
    }
    if (offAuth) offAuth()
    offAuth = auth.onChange(() => {
      if (stopped) return
      notify()
      if (auth.token()) resume()
    })
    if (firstTimer) clearT(firstTimer)
    firstTimer = setT(() => { firstTimer = null; resume() }, FIRST_RUN_MS)
    arm()
  }

  function stop() {
    stopped = true
    clearTimer()
    if (firstTimer) clearT(firstTimer)
    firstTimer = null
    if (offAuth) offAuth()
    offAuth = null
  }

  function reset() {
    load()
    gen++
    sent = {}; pending = {}; flags = {}
    clearTimer()
    if (firstTimer) clearT(firstTimer)
    firstTimer = null
    persist()
    notify()
  }

  return { check, syncNow, start, resume, stop, stateFor, onChange, reset }
}
