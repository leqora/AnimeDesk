import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createBanners, BANNER_SCHEME } from '../../src/main/banners.js'

const URL1 = 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1-x.jpg'
const hashOf = (u) => crypto.createHash('sha1').update(u).digest('hex')
const reply = (body = 'img', type = 'image/jpeg', headers = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': type, ...headers } })

let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-banners-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('banners', () => {
  it('exposes the scheme name', () => { expect(BANNER_SCHEME).toBe('animedesk-img') })

  it('ensure downloads once and serves the file', async () => {
    const fetchImpl = vi.fn(async () => reply())
    const b = createBanners({ dir: path.join(dir, 'sub'), fetchImpl })
    const out = await b.ensure(URL1)
    expect(out).toMatch(/^animedesk-img:\/\/banner\/[0-9a-f]{40}$/)
    expect(out).toBe(`animedesk-img://banner/${hashOf(URL1)}`)
    expect(fs.existsSync(path.join(dir, 'sub', `${hashOf(URL1)}.jpg`))).toBe(true)
    expect(fs.readdirSync(path.join(dir, 'sub'))).toHaveLength(1)
    expect(await b.ensure(URL1)).toBe(out)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('serves an existing file after a fresh start without fetching', async () => {
    fs.writeFileSync(path.join(dir, `${hashOf(URL1)}.png`), 'x')
    const fetchImpl = vi.fn()
    const b = createBanners({ dir, fetchImpl })
    expect(await b.ensure(URL1)).toBe(`animedesk-img://banner/${hashOf(URL1)}`)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('concurrent ensure shares one download', async () => {
    const fetchImpl = vi.fn(async () => reply())
    const b = createBanners({ dir, fetchImpl })
    const [a, c] = await Promise.all([b.ensure(URL1), b.ensure(URL1)])
    expect(a).toBe(c)
    expect(a).not.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects other hosts and schemes', async () => {
    const fetchImpl = vi.fn(async () => reply())
    const b = createBanners({ dir, fetchImpl })
    for (const u of [
      'http://s4.anilist.co/a.jpg', 'https://evil.example/a.jpg', 'https://s4.anilist.co.evil/a.jpg',
      'https://user@s4.anilist.co/a.jpg', 'https://user:pw@s4.anilist.co/a.jpg', 'https://s4.anilist.co:8443/a.jpg',
      'file:///etc/passwd', 'not a url', '', null, undefined, 5,
    ]) expect(await b.ensure(u)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects wrong type', async () => {
    const b = createBanners({ dir, fetchImpl: async () => reply('<html>', 'text/html') })
    expect(await b.ensure(URL1)).toBeNull()
    expect(fs.readdirSync(dir)).toHaveLength(0)
  })

  it('rejects a declared content-length that is too large', async () => {
    const fetchImpl = vi.fn(async () => reply('x', 'image/jpeg', { 'content-length': String(3 * 1024 * 1024 + 1) }))
    const b = createBanners({ dir, fetchImpl })
    expect(await b.ensure(URL1)).toBeNull()
    expect(fs.readdirSync(dir)).toHaveLength(0)
  })

  it('rejects a body that is too large', async () => {
    const b = createBanners({ dir, fetchImpl: async () => reply(Buffer.alloc(3 * 1024 * 1024 + 1)) })
    expect(await b.ensure(URL1)).toBeNull()
    expect(fs.readdirSync(dir)).toHaveLength(0)
  })

  it('gives up when the download is too slow', async () => {
    const fetchImpl = vi.fn((_u, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => rej(new Error('aborted')))
    }))
    const b = createBanners({ dir, fetchImpl, timeoutMs: 30 })
    expect(await b.ensure(URL1)).toBeNull()
    expect(fs.readdirSync(dir)).toHaveLength(0)
  })

  it('does not retry a failure until forget()', async () => {
    let fail = true
    const fetchImpl = vi.fn(async () => (fail ? reply('x', 'text/html') : reply()))
    const b = createBanners({ dir, fetchImpl })
    expect(await b.ensure(URL1)).toBeNull()
    fail = false
    expect(await b.ensure(URL1)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    b.forget()
    expect(await b.ensure(URL1)).not.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('treats a network error and a non-ok status as failure', async () => {
    const b = createBanners({ dir, fetchImpl: async () => { throw new Error('down') } })
    expect(await b.ensure(URL1)).toBeNull()
    const b2 = createBanners({ dir, fetchImpl: async () => new Response('x', { status: 404, headers: { 'content-type': 'image/jpeg' } }) })
    expect(await b2.ensure(URL1)).toBeNull()
  })

  it('maps png and webp to their extensions', async () => {
    const b = createBanners({ dir, fetchImpl: async () => reply('x', 'image/webp') })
    await b.ensure(URL1)
    expect(fs.existsSync(path.join(dir, `${hashOf(URL1)}.webp`))).toBe(true)
  })

  it('resolve maps only a known hash', async () => {
    const b = createBanners({ dir, fetchImpl: async () => reply() })
    await b.ensure(URL1)
    const h = hashOf(URL1)
    expect(b.resolve(`animedesk-img://banner/${h}`)).toEqual({ path: path.join(dir, `${h}.jpg`), type: 'image/jpeg' })
    expect(b.resolve(`animedesk-img://banner/${'a'.repeat(40)}`)).toBeNull()
    expect(b.resolve(`animedesk-img://banner/../${h}`)).toBeNull()
    expect(b.resolve(`animedesk-img://banner/${h.toUpperCase()}`)).toBeNull()
    expect(b.resolve(`animedesk-img://x/${h}`)).toBeNull()
    expect(b.resolve(`https://banner/${h}`)).toBeNull()
    expect(b.resolve(`animedesk-img://banner/${h}/extra`)).toBeNull()
    expect(b.resolve(`animedesk-img://banner/${h}.jpg`)).toBeNull()
    expect(b.resolve('garbage')).toBeNull()
    expect(b.resolve(undefined)).toBeNull()
  })
})
