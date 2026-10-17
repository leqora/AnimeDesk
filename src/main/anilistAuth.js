// Encrypted AniList account store. The token lives only here (main process); everything else
// gets the non-secret status(). crypt is a thin adapter over Electron safeStorage.
import fs from 'node:fs'
import path from 'node:path'
import { AniListAuthError } from './anilist.js'
import { tokenExpiry, EXPIRY_WARN_MS } from '../shared/anilistAuth.js'

function writeBufferAtomic(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  try {
    fs.writeFileSync(tmp, buf)
    fs.renameSync(tmp, file)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* best effort: do not leave the token behind */ }
    throw err
  }
}

function validAccount(a) {
  return (
    a && typeof a === 'object' && typeof a.token === 'string' && a.token !== '' &&
    typeof a.name === 'string' && (a.expiresAt === null || typeof a.expiresAt === 'number')
  )
}

const MAX_TIMER_MS = 24 * 3600 * 1000

export function createAniListAuth({
  file, crypt, anilist, now = Date.now,
  setTimeout: setT = globalThis.setTimeout,
  clearTimeout: clearT = globalThis.clearTimeout,
}) {
  let account = null // { token, userId, name, expiresAt }
  let expired = false
  let expiryTimer = null
  let generation = 0 // bumped by connect/disconnect so an in-flight connect can tell it was superseded
  const listeners = new Set()

  function load() {
    try {
      if (!crypt.isAvailable()) return
      const a = JSON.parse(crypt.decrypt(fs.readFileSync(file)))
      if (validAccount(a)) {
        account = { token: a.token, userId: a.userId ?? null, name: a.name, expiresAt: a.expiresAt }
        expired = a.invalid === true
      }
    } catch {
      account = null // missing, unreadable or undecryptable: not connected, file left in place
    }
  }

  function isExpired() {
    return expired || (account?.expiresAt != null && account.expiresAt <= now())
  }

  function status() {
    if (!account) return { connected: false, name: null, expiresAt: null, state: 'none' }
    let state = 'ok'
    if (isExpired()) state = 'expired'
    else if (account.expiresAt != null && account.expiresAt - now() < EXPIRY_WARN_MS) state = 'expiring'
    return { connected: true, name: account.name, expiresAt: account.expiresAt, state }
  }

  function emit() {
    const s = status()
    for (const fn of [...listeners]) {
      try { fn(s) } catch { /* a listener must not break the store */ }
    }
  }

  function clearExpiryTimer() {
    if (expiryTimer) clearT(expiryTimer)
    expiryTimer = null
  }

  // Nothing else notices time passing, so listeners (UI, sync) are told when the 14-day warning window
  // opens and when the token expires. Waits are capped at 24 h (timer limits, clock changes) and re-armed.
  function armExpiry() {
    clearExpiryTimer()
    if (!account || expired || account.expiresAt == null) return
    const t = now()
    const warnAt = account.expiresAt - EXPIRY_WARN_MS + 1 // status() turns 'expiring' just after this
    const target = t < warnAt ? warnAt : account.expiresAt
    if (target <= t) return
    expiryTimer = setT(() => {
      expiryTimer = null
      const fired = now() >= target
      armExpiry()
      if (fired) emit()
    }, Math.min(MAX_TIMER_MS, target - t))
    expiryTimer?.unref?.()
  }

  async function connect(raw) {
    const token = typeof raw === 'string' ? raw.trim() : ''
    if (!token) return { ok: false, error: 'empty' }
    if (!crypt.isAvailable()) return { ok: false, error: 'unavailable' }
    const mine = ++generation
    let viewer
    try {
      viewer = await anilist.viewer(token)
    } catch (err) {
      if (mine !== generation) return { ok: false, error: 'cancelled' }
      return { ok: false, error: err instanceof AniListAuthError ? 'rejected' : 'network' }
    }
    if (mine !== generation) return { ok: false, error: 'cancelled' }
    const next = { token, userId: viewer.id, name: viewer.name, expiresAt: tokenExpiry(token) }
    try {
      writeBufferAtomic(file, crypt.encrypt(JSON.stringify(next)))
    } catch {
      return { ok: false, error: 'unavailable' } // could not store securely; old account unchanged
    }
    account = next
    expired = false
    armExpiry()
    emit()
    return { ok: true, status: status() }
  }

  function markExpired(token) {
    // A late 401 from a request made with an older token must not invalidate a newer login.
    if (!account || expired || token !== account.token) return
    expired = true
    clearExpiryTimer()
    // Persist so a revoked token stays unusable after a restart.
    try {
      writeBufferAtomic(file, crypt.encrypt(JSON.stringify({ ...account, invalid: true })))
    } catch { /* still expired in memory; a later 401 will mark it again */ }
    emit()
  }

  function disconnect() {
    generation++
    try {
      fs.rmSync(file, { force: true })
      fs.rmSync(`${file}.tmp`, { force: true })
    } catch {
      return { ok: false } // credential may still be on disk: keep state unchanged
    }
    account = null
    expired = false
    clearExpiryTimer()
    emit()
    return { ok: true }
  }

  function dispose() {
    clearExpiryTimer()
    listeners.clear()
  }

  function onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  load()
  armExpiry()
  return {
    dispose,
    connect,
    status,
    token: () => (account && !isExpired() ? account.token : null),
    markExpired,
    disconnect,
    onChange,
  }
}
