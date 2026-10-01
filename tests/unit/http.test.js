import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getJson, download } from '../../src/main/http.js'

let server, base
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/json') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
    if (req.url === '/file') return res.writeHead(200, { 'content-length': '10' }).end('0123456789')
    res.writeHead(404).end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => server.close())

describe('http', () => {
  it('gets JSON', async () => {
    expect(await getJson(`${base}/json`)).toEqual({ ok: true })
  })
  it('downloads with progress and no leftover .part file', async () => {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-dl-')), 'sub', 'f.bin')
    const progress = []
    await download(`${base}/file`, dest, (p) => progress.push(p))
    expect(fs.readFileSync(dest, 'utf8')).toBe('0123456789')
    expect(fs.existsSync(`${dest}.part`)).toBe(false)
    expect(progress.at(-1)).toEqual({ received: 10, total: 10 })
  })
  it('throws on HTTP errors and leaves no file', async () => {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-dl-')), 'f.bin')
    await expect(download(`${base}/missing`, dest)).rejects.toThrow(/404/)
    expect(fs.existsSync(dest)).toBe(false)
    await expect(getJson(`${base}/missing`)).rejects.toThrow(/404/)
  })
})
