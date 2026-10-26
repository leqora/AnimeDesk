import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniListAuth, waitAtMost, AUTH_READY_TIMEOUT_MS } from '../../src/main/anilistAuth.js'
import { AniListAuthError } from '../../src/main/anilist.js'

const DAY = 24 * 3600 * 1000
const NOW = 1_800_000_000_000

function jwt(expMs) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(expMs / 1000) })}.sig`
}

// Reversible fake: prefix + reversed bytes, so the plaintext never appears verbatim.
// Async like Electron's safeStorage async API: decrypt resolves { result, shouldReEncrypt } and rejects on a bad blob.
const fakeCrypt = (available = true) => ({
  isAvailable: async () => available,
  encrypt: async (s) => Buffer.concat([Buffer.from('ENC:'), Buffer.from(s, 'utf8').reverse()]),
  decrypt: async (b) => {
    if (b.subarray(0, 4).toString() !== 'ENC:') throw new Error('bad blob')
    return { result: Buffer.from(b.subarray(4)).reverse().toString('utf8'), shouldReEncrypt: false }
  },
})

function deferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

// Wraps one crypt method so a test can hold every call back until it releases it.
function gate(crypt, which) {
  const real = crypt[which]
  const gates = []
  crypt[which] = vi.fn(async (...args) => {
    const d = deferred()
    gates.push(d)
    await d.promise
    return real(...args)
  })
  return { gates, release: (i = 0) => gates[i].resolve() }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

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

  it('starts as none', async () => {
    const a = make()
    await a.ready
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
    await b.ready
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
    await b.ready
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
    const reloaded = make()
    await reloaded.ready
    expect(reloaded.status().state).toBe('ok')
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
    const b = make()
    await b.ready
    expect(b.token()).toBe(old)
  })

  it('connect while connected replaces the account', async () => {
    const a = make()
    await a.connect(jwt(NOW + 30 * DAY))
    anilist.viewer = vi.fn(async () => ({ id: 9, name: 'other' }))
    const t2 = jwt(NOW + 50 * DAY)
    await a.connect(t2)
    expect(a.status().name).toBe('other')
    const b = make()
    await b.ready
    expect(b.token()).toBe(t2)
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

  it('corrupt file means not connected and is left in place', async () => {
    fs.writeFileSync(file, Buffer.from('garbage'))
    const a = make()
    await a.ready
    expect(a.status().connected).toBe(false)
    expect(fs.readFileSync(file).toString()).toBe('garbage')
  })

  it('a decryptable payload of the wrong shape means not connected', async () => {
    fs.writeFileSync(file, await crypt.encrypt(JSON.stringify({ nope: 1 })))
    const a = make()
    await a.ready
    expect(a.status().connected).toBe(false)
  })

  it('file is not read when encryption is unavailable', async () => {
    await make().connect(jwt(NOW + 30 * DAY))
    crypt = fakeCrypt(false)
    const b = make()
    await b.ready
    expect(b.status().connected).toBe(false)
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
    await tick() // the expired marker is written asynchronously
    const b = make()
    await b.ready
    expect(b.status()).toMatchObject({ connected: true, state: 'expired' })
    expect(b.token()).toBeNull()
    const fresh = jwt(NOW + 40 * DAY)
    expect((await b.connect(fresh)).ok).toBe(true)
    expect(b.status().state).toBe('ok')
    const c = make()
    await c.ready
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
    crypt.encrypt = async () => { throw new Error('dpapi') }
    expect(await a.connect(jwt(NOW + 50 * DAY))).toEqual({ ok: false, error: 'unavailable' })
    expect(a.token()).toBe(old)
    crypt = fakeCrypt()
    const b = make()
    await b.ready
    expect(b.token()).toBe(old)
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
    await vi.waitFor(() => expect(anilist.viewer).toHaveBeenCalled())
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
    await vi.waitFor(() => expect(releases.length).toBe(1))
    const p2 = a.connect(t2)
    await vi.waitFor(() => expect(releases.length).toBe(2))
    releases[0]({ id: 1, name: 'one' })
    releases[1]({ id: 2, name: 'two' })
    expect(await p1).toEqual({ ok: false, error: 'cancelled' })
    expect((await p2).ok).toBe(true)
    expect(a.token()).toBe(t2)
  })

  describe('async storage', () => {
    const writeAccount = async (token) => {
      const a = make()
      await a.connect(token)
      a.dispose()
    }

    it('ready resolves and loads the account written earlier', async () => {
      const token = jwt(NOW + 30 * DAY)
      await writeAccount(token)
      const b = make()
      await b.ready
      expect(b.status().connected).toBe(true)
      expect(b.token()).toBe(token)
    })

    it('before ready the store reports none', async () => {
      const token = jwt(NOW + 30 * DAY)
      await writeAccount(token)
      const g = gate(crypt, 'decrypt')
      const b = make()
      await tick()
      expect(b.status().state).toBe('none')
      expect(b.token()).toBeNull()
      g.release()
      await b.ready
      expect(b.status().connected).toBe(true)
      expect(b.token()).toBe(token)
    })

    it('undecryptable file: ready resolves, status none, file kept', async () => {
      fs.writeFileSync(file, Buffer.from('garbage'))
      const a = make()
      await a.ready
      expect(a.status().state).toBe('none')
      expect(fs.existsSync(file)).toBe(true)
    })

    it('async isAvailable false: load leaves none and connect returns unavailable without writing', async () => {
      await writeAccount(jwt(NOW + 30 * DAY))
      const before = fs.readFileSync(file)
      anilist.viewer.mockClear()
      crypt = fakeCrypt(false)
      const a = make()
      await a.ready
      expect(a.status().state).toBe('none')
      expect(await a.connect('tok')).toEqual({ ok: false, error: 'unavailable' })
      expect(anilist.viewer).not.toHaveBeenCalled()
      expect(fs.readFileSync(file).equals(before)).toBe(true)
    })

    it('a throwing isAvailable counts as unavailable', async () => {
      crypt.isAvailable = async () => { throw new Error('boom') }
      const a = make()
      await a.ready
      expect(await a.connect('tok')).toEqual({ ok: false, error: 'unavailable' })
    })

    it('shouldReEncrypt true rewrites the file with fresh ciphertext', async () => {
      const token = jwt(NOW + 30 * DAY)
      await writeAccount(token)
      const plain = (await crypt.decrypt(fs.readFileSync(file))).result
      const realDecrypt = crypt.decrypt
      crypt.decrypt = vi.fn(async (b) => ({ ...(await realDecrypt(b)), shouldReEncrypt: true }))
      const realEncrypt = crypt.encrypt
      crypt.encrypt = vi.fn(async (s) => Buffer.concat([await realEncrypt(s), Buffer.from('v2')]))
      const b = make()
      await b.ready
      expect(b.token()).toBe(token)
      await vi.waitFor(() => expect(fs.readFileSync(file).subarray(-2).toString()).toBe('v2'))
      expect(crypt.encrypt).toHaveBeenCalledWith(plain)
      expect(fs.existsSync(`${file}.tmp`)).toBe(false)
      expect(b.status().connected).toBe(true)
    })

    it('failed re-encrypt keeps the account loaded', async () => {
      const token = jwt(NOW + 30 * DAY)
      await writeAccount(token)
      const original = fs.readFileSync(file)
      const realDecrypt = crypt.decrypt
      crypt.decrypt = async (b) => ({ ...(await realDecrypt(b)), shouldReEncrypt: true })
      const encrypt = vi.fn(async () => { throw new Error('dpapi') })
      crypt.encrypt = encrypt
      const b = make()
      await b.ready
      await vi.waitFor(() => expect(encrypt).toHaveBeenCalled())
      await tick()
      expect(b.status().connected).toBe(true)
      expect(b.token()).toBe(token)
      expect(fs.readFileSync(file).equals(original)).toBe(true)
    })

    it('disconnect during connect encryption leaves no file', async () => {
      const g = gate(crypt, 'encrypt')
      const a = make()
      const p = a.connect(jwt(NOW + 30 * DAY))
      await vi.waitFor(() => expect(g.gates.length).toBe(1))
      expect(a.disconnect()).toEqual({ ok: true })
      g.release()
      expect(await p).toEqual({ ok: false, error: 'cancelled' })
      expect(fs.existsSync(file)).toBe(false)
      expect(fs.existsSync(`${file}.tmp`)).toBe(false)
      expect(a.status().state).toBe('none')
    })

    it('markExpired with slow encryption then a new connect: disk holds the new account', async () => {
      const tokenA = jwt(NOW + 30 * DAY)
      const tokenB = jwt(NOW + 40 * DAY)
      const a = make()
      await a.connect(tokenA)
      const g = gate(crypt, 'encrypt')
      a.markExpired(tokenA)
      expect(a.status().state).toBe('expired')
      anilist.viewer = vi.fn(async () => ({ id: 9, name: 'second' }))
      const p = a.connect(tokenB)
      await vi.waitFor(() => expect(g.gates.length).toBe(1))
      g.release(0) // the slow expired-marker write finishes; connect's own encrypt is queued behind it
      await vi.waitFor(() => expect(g.gates.length).toBe(2))
      g.release(1)
      expect((await p).ok).toBe(true)
      const fresh = make()
      await fresh.ready
      expect(fresh.status()).toMatchObject({ connected: true, name: 'second', state: 'ok' })
      expect(fresh.token()).toBe(tokenB)
    })

    it('writes land in request order', async () => {
      const tokenA = jwt(NOW + 30 * DAY)
      const a = make()
      await a.connect(tokenA)
      const real = crypt.encrypt
      const slow = deferred()
      let n = 0
      crypt.encrypt = vi.fn(async (s) => {
        if (n++ === 0) await slow.promise // the first (markExpired) write is the slower one
        return real(s)
      })
      a.markExpired(tokenA)
      const tokenB = jwt(NOW + 40 * DAY)
      const p = a.connect(tokenB)
      await tick()
      slow.resolve()
      expect((await p).ok).toBe(true)
      const b = make()
      await b.ready
      expect(b.token()).toBe(tokenB)
    })

    it('markExpired then disconnect: the pending write does not recreate the file', async () => {
      const tokenA = jwt(NOW + 30 * DAY)
      const a = make()
      await a.connect(tokenA)
      const g = gate(crypt, 'encrypt')
      a.markExpired(tokenA)
      await vi.waitFor(() => expect(g.gates.length).toBe(1))
      expect(a.disconnect()).toEqual({ ok: true })
      g.release()
      await tick()
      await tick()
      expect(fs.existsSync(file)).toBe(false)
      expect(fs.existsSync(`${file}.tmp`)).toBe(false)
      expect(a.status().state).toBe('none')
    })

    it('a disconnect before ready wins over the late load', async () => {
      await writeAccount(jwt(NOW + 30 * DAY))
      const g = gate(crypt, 'decrypt')
      const b = make()
      await tick()
      expect(b.disconnect()).toEqual({ ok: true })
      g.release()
      await b.ready
      expect(b.status().state).toBe('none')
      expect(fs.existsSync(file)).toBe(false)
    })
  })

  describe('expiry timer', () => {
    let timers, seq
    const setT = (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: clock + ms }); return id }
    const clearT = (id) => { timers.delete(id) }
    // Moves the clock to `to`, firing due timers in order (a fired timer may arm another).
    const advanceTo = (to) => {
      for (;;) {
        let best = null
        for (const [id, t] of timers) if (t.at <= to && (!best || t.at < best[1].at)) best = [id, t]
        if (!best) break
        timers.delete(best[0])
        clock = Math.max(clock, best[1].at)
        best[1].fn()
      }
      clock = to
    }
    const makeT = () => createAniListAuth({ file, crypt, anilist, now: () => clock, setTimeout: setT, clearTimeout: clearT })
    beforeEach(() => { timers = new Map(); seq = 0 })

    it('emits when the warning window opens and again at expiry, with the new state', async () => {
      const a = makeT()
      const exp = NOW + 20 * DAY
      await a.connect(jwt(exp))
      const fn = vi.fn()
      a.onChange(fn)
      advanceTo(exp - 14 * DAY - 1)
      expect(fn).not.toHaveBeenCalled()
      advanceTo(exp - 14 * DAY + 1000)
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn.mock.calls[0][0].state).toBe('expiring')
      advanceTo(exp + 1000)
      expect(fn).toHaveBeenCalledTimes(2)
      expect(fn.mock.calls[1][0].state).toBe('expired')
      expect(timers.size).toBe(0)
    })

    it('caps a single wait at 24 h and re-arms without emitting early', async () => {
      const a = makeT()
      await a.connect(jwt(NOW + 40 * DAY))
      const fn = vi.fn()
      a.onChange(fn)
      const delays = [...timers.values()].map((t) => t.at - clock)
      expect(delays).toEqual([DAY])
      advanceTo(NOW + 5 * DAY)
      expect(fn).not.toHaveBeenCalled()
      expect(timers.size).toBe(1)
    })

    it('arms from a stored account on startup, not for a token without expiry', async () => {
      const a = makeT()
      await a.connect(jwt(NOW + 20 * DAY))
      a.dispose()
      timers.clear()
      const b = makeT()
      await b.ready
      expect(timers.size).toBe(1)
      b.dispose()
      await b.disconnect()
      anilist.viewer = vi.fn(async () => ({ id: 7, name: 'leqora' }))
      const c = makeT()
      await c.ready
      await c.connect('opaque-token-no-exp')
      expect(timers.size).toBe(0)
    })

    it('disconnect, a new connect and dispose clear the previous timer', async () => {
      const a = makeT()
      await a.connect(jwt(NOW + 20 * DAY))
      expect(timers.size).toBe(1)
      a.disconnect()
      expect(timers.size).toBe(0)
      await a.connect(jwt(NOW + 20 * DAY))
      await a.connect(jwt(NOW + 30 * DAY))
      expect(timers.size).toBe(1)
      a.dispose()
      expect(timers.size).toBe(0)
    })
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
  describe('waitAtMost / late load', () => {
    it('exports a 5 s timeout', () => { expect(AUTH_READY_TIMEOUT_MS).toBe(5000) })

    it('resolves true for a settled promise and clears the timer', async () => {
      const clearTimeout = vi.fn()
      expect(await waitAtMost(Promise.resolve(), 5000, { setTimeout: () => 42, clearTimeout })).toBe(true)
      expect(clearTimeout).toHaveBeenCalledWith(42)
    })

    it('resolves false when the timer fires first, and clears the timer too', async () => {
      let fire
      const clearTimeout = vi.fn()
      const p = waitAtMost(new Promise(() => {}), 5000, { setTimeout: (fn) => { fire = fn; return 1 }, clearTimeout })
      fire()
      expect(await p).toBe(false)
      expect(clearTimeout).toHaveBeenCalledWith(1)
    })

    it('resolves true for a rejecting promise', async () => {
      expect(await waitAtMost(Promise.reject(new Error('x')), 5000)).toBe(true)
    })

    it('a late load still reaches listeners after the cap', async () => {
      const token = jwt(NOW + 30 * DAY)
      const first = make()
      await first.ready
      expect((await first.connect(token)).ok).toBe(true)
      const g = gate(crypt, 'decrypt')
      const a = make()
      const listener = vi.fn()
      a.onChange(listener)
      vi.useFakeTimers()
      try {
        const p = waitAtMost(a.ready, AUTH_READY_TIMEOUT_MS)
        await vi.advanceTimersByTimeAsync(AUTH_READY_TIMEOUT_MS)
        expect(await p).toBe(false)
      } finally { vi.useRealTimers() }
      expect(a.status().connected).toBe(false)
      while (!g.gates.length) await tick()
      g.release()
      await a.ready
      expect(a.status().connected).toBe(true)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener.mock.calls[0][0].state).toBe('ok')
    })
  })
})
