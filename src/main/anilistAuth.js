// Encrypted AniList account store. The token lives only here (main process); everything else
// gets the non-secret status(). crypt is a thin adapter over Electron safeStorage.
import fs from 'node:fs'
import path from 'node:path'
import { AniListAuthError } from './anilist.js'
import { tokenExpiry, EXPIRY_WARN_MS } from '../shared/anilistAuth.js'

function writeBufferAtomic(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, file)
}

function validAccount(a) {
  return (
    a && typeof a === 'object' && typeof a.token === 'string' && a.token !== '' &&
    typeof a.name === 'string' && (a.expiresAt === null || typeof a.expiresAt === 'number')
  )
}

export function createAniListAuth({ file, crypt, anilist, now = Date.now }) {
  let account = null // { token, userId, name, expiresAt }
  let expired = false
  const listeners = new Set()

  function load() {
    try {
      if (!crypt.isAvailable()) return
      const a = JSON.parse(crypt.decrypt(fs.readFileSync(file)))
      if (validAccount(a)) account = { token: a.token, userId: a.userId ?? null, name: a.name, expiresAt: a.expiresAt }
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

  async function connect(raw) {
    const token = typeof raw === 'string' ? raw.trim() : ''
    if (!token) return { ok: false, error: 'empty' }
    if (!crypt.isAvailable()) return { ok: false, error: 'unavailable' }
    let viewer
    try {
      viewer = await anilist.viewer(token)
    } catch (err) {
      return { ok: false, error: err instanceof AniListAuthError ? 'rejected' : 'network' }
    }
    const next = { token, userId: viewer.id, name: viewer.name, expiresAt: tokenExpiry(token) }
    try {
      writeBufferAtomic(file, crypt.encrypt(JSON.stringify(next)))
    } catch {
      return { ok: false, error: 'unavailable' } // could not store securely; old account unchanged
    }
    account = next
    expired = false
    emit()
    return { ok: true, status: status() }
  }

  function markExpired() {
    if (!account || expired) return
    expired = true
    emit()
  }

  function disconnect() {
    try { fs.rmSync(file, { force: true }) } catch { /* nothing to remove */ }
    account = null
    expired = false
    emit()
  }

  function onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  load()
  return {
    connect,
    status,
    token: () => (account && !isExpired() ? account.token : null),
    markExpired,
    disconnect,
    onChange,
  }
}
