import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniListAuth } from '../../src/main/anilistAuth.js'
import { AniListAuthError } from '../../src/main/anilist.js'

const DAY = 24 * 3600 * 1000
const NOW = 1_800_000_000_000

function jwt(expMs) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(expMs / 1000) })}.sig`
}

// Reversible fake: prefix + reversed bytes, so the plaintext never appears verbatim.
const fakeCrypt = (available = true) => ({
  isAvailable: () => available,
  encrypt: (s) => Buffer.concat([Buffer.from('ENC:'), Buffer.from(s, 'utf8').reverse()]),
  decrypt: (b) => {
    if (b.subarray(0, 4).toString() !== 'ENC:') throw new Error('bad blob')
    return Buffer.from(b.subarray(4)).reverse().toString('utf8')
  },
})

describe('anilistAuth main', () => {
  let dir, file, clock, anilist, crypt

  const make = () => createAniListAuth({ file, crypt, anilist, now: () => clock })

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anilist-auth-'))
    file = path.join(dir, 'anilist-auth.bin')
    clock = NOW
    crypt = fakeCrypt()
    anilist = { viewer: vi.fn(async () => ({ id: 7, name: 'leqora' })) }
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('starts as none', () => {
    const a = make()
    expect(a.status()).toEqual({ connected: false, name: null, expiresAt: null, state: 'none' })
    expect(a.token()).toBeNull()
  })

  it('connect ok stores an encrypted file without the plaintext token', async () => {
    const token = jwt(NOW + 30 * DAY)
    const a = make()
    const res = await a.connect(`  ${token}\n`)
    expect(anilist.viewer).toHaveBeenCalledWith(token)
    expect(res).toEqual({ ok: true, status: { connected: true, name: 'leqora', expiresAt: NOW + 30 * DAY, state: 'ok' } })
    const raw = fs.readFileSync(file)
    expect(raw.toString('latin1')).not.toContain(token)
    expect(raw.toString('utf8')).not.toContain('leqora')
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
    expect(a.token()).toBe(token)
  })

  it('status survives a reload from the same file', async () => {
    const token = jwt(NOW + 30 * DAY)
    await make().connect(token)
    const b = make()
    expect(b.status()).toEqual({ connected: true, name: 'leqora', expiresAt: NOW + 30 * DAY, state: 'ok' })
    expect(b.token()).toBe(token)
  })

  it('status never includes the token', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    expect(Object.keys(a.status()).sort()).toEqual(['connected', 'expiresAt', 'name', 'state'])
  })

  it.each([
    ['rejected', () => { anilist.viewer = vi.fn(async () => { throw new AniListAuthError('no') }) }],
    ['network', () => { anilist.viewer = vi.fn(async () => { throw new Error('boom') }) }],
  ])('%s writes nothing', async (error, setup) => {
    setup()
    const a = make()
    expect(await a.connect('tok')).toEqual({ ok: false, error })
    expect(fs.existsSync(file)).toBe(false)
    expect(a.status().state).toBe('none')
  })

  it('unavailable encryption skips AniList and writes nothing', async () => {
    crypt = fakeCrypt(false)
    const a = make()
    expect(await a.connect('tok')).toEqual({ ok: false, error: 'unavailable' })
    expect(anilist.viewer).not.toHaveBeenCalled()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('empty token is refused', async () => {
    const a = make()
    expect(await a.connect('   ')).toEqual({ ok: false, error: 'empty' })
    expect(await a.connect(undefined)).toEqual({ ok: false, error: 'empty' })
    expect(anilist.viewer).not.toHaveBeenCalled()
  })

  it('unreadable expiry means expiresAt null and state ok', async () => {
    const a = make()
    const res = await a.connect('opaque-token')
    expect(res.status).toEqual({ connected: true, name: 'leqora', expiresAt: null, state: 'ok' })
  })

  it('is expiring 13 days before expiry and ok at 15', async () => {
    const a = make()
    await a.connect(jwt(NOW + 13 * DAY))
    expect(a.status().state).toBe('expiring')
    const b = make()
    await b.connect(jwt(NOW + 15 * DAY))
    expect(b.status().state).toBe('ok')
  })

  it('becomes expired when time passes expiry', async () => {
    const a = make()
    await a.connect(jwt(NOW + 5 * DAY))
    clock = NOW + 6 * DAY
    expect(a.status()).toMatchObject({ connected: true, state: 'expired' })
    expect(a.token()).toBeNull()
  })

  it('loads as expired when expiresAt is already in the past', async () => {
    await make().connect(jwt(NOW + 1 * DAY))
    clock = NOW + 2 * DAY
    const b = make()
    expect(b.status()).toMatchObject({ connected: true, name: 'leqora', state: 'expired' })
    expect(b.token()).toBeNull()
  })

  it('markExpired hides the token, then a new connect recovers', async () => {
    const a = make()
    const old = jwt(NOW + 30 * DAY)
    await a.connect(old)
    a.markExpired(old)
    expect(a.status()).toMatchObject({ connected: true, state: 'expired' })
    expect(a.token()).toBeNull()
    const fresh = jwt(NOW + 40 * DAY)
    const res = await a.connect(fresh)
    expect(res.ok).toBe(true)
    expect(a.status().state).toBe('ok')
    expect(a.token()).toBe(fresh)
  })

  it('markExpired with a stale token is a no-op (a late 401 must not invalidate a newer login)', async () => {
    const old = jwt(NOW + 30 * DAY)
    const fresh = jwt(NOW + 40 * DAY)
    const a = make()
    await a.connect(old)
    await a.connect(fresh)
    const fn = vi.fn()
    a.onChange(fn)
    a.markExpired(old)
    a.markExpired(undefined)
    expect(fn).not.toHaveBeenCalled()
    expect(a.status().state).toBe('ok')
    expect(a.token()).toBe(fresh)
    expect(make().status().state).toBe('ok')
    a.markExpired(fresh)
    expect(a.status().state).toBe('expired')
  })

  it('markExpired when not connected is a no-op', () => {
    const a = make()
    const fn = vi.fn()
    a.onChange(fn)
    a.markExpired('whatever')
    expect(fn).not.toHaveBeenCalled()
    expect(a.status().state).toBe('none')
  })

  it('failed connect while connected keeps the old account', async () => {
    const old = jwt(NOW + 30 * DAY)
    const a = make()
    await a.connect(old)
    anilist.viewer = vi.fn(async () => { throw new AniListAuthError('no') })
    expect(await a.connect('bad')).toEqual({ ok: false, error: 'rejected' })
    expect(a.token()).toBe(old)
    expect(make().token()).toBe(old)
  })

  it('connect while connected replaces the account', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    anilist.viewer = vi.fn(async () => ({ id: 9, name: 'other' }))
    const t2 = jwt(NOW + 50 * DAY)
    await a.connect(t2)
    expect(a.status().name).toBe('other')
    expect(make().token()).toBe(t2)
  })

  it('disconnect removes the file', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    a.disconnect()
    expect(fs.existsSync(file)).toBe(false)
    expect(a.status().state).toBe('none')
    expect(a.token()).toBeNull()
    a.disconnect() // idempotent
  })

  it('corrupt file means not connected and is left in place', () => {
    fs.writeFileSync(file, Buffer.from('garbage'))
    const a = make()
    expect(a.status().connected).toBe(false)
    expect(fs.readFileSync(file).toString()).toBe('garbage')
  })

  it('a decryptable payload of the wrong shape means not connected', () => {
    fs.writeFileSync(file, crypt.encrypt(JSON.stringify({ nope: 1 })))
    expect(make().status().connected).toBe(false)
  })

  it('file is not read when encryption is unavailable', async () => {
    await make().connect(jwt(NOW + 30 * DAY))
    crypt = fakeCrypt(false)
    expect(make().status().connected).toBe(false)
  })

  it('onChange fires on connect, markExpired, disconnect and can unsubscribe', async () => {
    const a = make()
    const fn = vi.fn()
    const off = a.onChange(fn)
    const tok = jwt(NOW + 30 * DAY)
    await a.connect(tok)
    expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'ok' }))
    a.markExpired(tok)
    expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'expired' }))
    a.disconnect()
    expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'none' }))
    expect(fn).toHaveBeenCalledTimes(3)
    off()
    await a.connect(jwt(NOW + 30 * DAY))
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('expired state survives a restart and a new connect clears it', async () => {
    const a = make()
    const tok = jwt(NOW + 30 * DAY)
    await a.connect(tok)
    a.markExpired(tok)
    const b = make()
    expect(b.status()).toMatchObject({ connected: true, state: 'expired' })
    expect(b.token()).toBeNull()
    const fresh = jwt(NOW + 40 * DAY)
    expect((await b.connect(fresh)).ok).toBe(true)
    expect(b.status().state).toBe('ok')
    const c = make()
    expect(c.status().state).toBe('ok')
    expect(c.token()).toBe(fresh)
  })

  it('disconnect returns ok true on success', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    expect(a.disconnect()).toEqual({ ok: true })
  })

  it('disconnect that cannot delete returns ok false and keeps state', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    const fn = vi.fn()
    a.onChange(fn)
    fs.rmSync(file)
    fs.mkdirSync(file)
    fs.writeFileSync(path.join(file, 'x'), 'x') // non-empty directory: rmSync without recursive fails
    expect(a.disconnect()).toEqual({ ok: false })
    expect(a.status().connected).toBe(true)
    expect(a.token()).not.toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })

  it('disconnect also removes a leftover tmp file', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    fs.writeFileSync(`${file}.tmp`, 'leftover')
    a.disconnect()
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })

  it('encrypt failure during connect returns unavailable and keeps the old account', async () => {
    const old = jwt(NOW + 30 * DAY)
    const a = make()
    await a.connect(old)
    crypt.encrypt = () => { throw new Error('dpapi') }
    expect(await a.connect(jwt(NOW + 50 * DAY))).toEqual({ ok: false, error: 'unavailable' })
    expect(a.token()).toBe(old)
    crypt = fakeCrypt()
    expect(make().token()).toBe(old)
  })

  it('failed rename removes the tmp file holding the new token', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    fs.rmSync(file)
    fs.mkdirSync(file) // rename onto a directory fails
    expect(await a.connect(jwt(NOW + 50 * DAY))).toEqual({ ok: false, error: 'unavailable' })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })

  it('a disconnect during an in-flight connect cancels it', async () => {
    let release
    anilist.viewer = vi.fn(() => new Promise((r) => { release = () => r({ id: 7, name: 'leqora' }) }))
    const a = make()
    const p = a.connect(jwt(NOW + 30 * DAY))
    a.disconnect()
    release()
    expect(await p).toEqual({ ok: false, error: 'cancelled' })
    expect(fs.existsSync(file)).toBe(false)
    expect(a.status().state).toBe('none')
  })

  it('an older connect is cancelled by a newer one', async () => {
    const releases = []
    anilist.viewer = vi.fn(() => new Promise((r) => releases.push(r)))
    const a = make()
    const t1 = jwt(NOW + 30 * DAY)
    const t2 = jwt(NOW + 40 * DAY)
    const p1 = a.connect(t1)
    const p2 = a.connect(t2)
    releases[0]({ id: 1, name: 'one' })
    releases[1]({ id: 2, name: 'two' })
    expect(await p1).toEqual({ ok: false, error: 'cancelled' })
    expect((await p2).ok).toBe(true)
    expect(a.token()).toBe(t2)
  })

  it('does not log anything while connecting or failing', async () => {
    const spies = ['log', 'warn', 'error', 'info', 'debug'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    anilist.viewer = vi.fn(async () => { throw new Error('x') })
    await a.connect('t')
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    spies.forEach((s) => s.mockRestore())
  })
})
