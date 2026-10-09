import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStreamServer, rewritePlaylist, DEFAULT_USER_AGENT } from '../../src/main/streamServer.js'

let upstream, upBase, seen, streams
const routes = {}
beforeEach(async () => {
  for (const k of Object.keys(routes)) delete routes[k]
  seen = []
  upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers })
    const r = routes[req.url.split('?')[0]]
    if (!r) return res.writeHead(404).end()
    r(req, res)
  })
  await new Promise((ok) => upstream.listen(0, '127.0.0.1', ok))
  upBase = `http://127.0.0.1:${upstream.address().port}`
  streams = createStreamServer({})
  await streams.start()
})
afterEach(async () => { await streams.stop(); await new Promise((ok) => upstream.close(ok)) })

const media = () => `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:10,\n${upBase}/seg/0.ts.jpg\n#EXTINF:10,\nseg/1.ts.jpg\n#EXT-X-ENDLIST\n`

describe('rewritePlaylist', () => {
  it('rewrites URI lines and URI attributes against the playlist url', () => {
    const out = rewritePlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\na/1.ts\n\nhttps://x.example/2.ts\n', 'https://h.example/p/index.m3u8', (u) => `L(${u})`)
    expect(out).toBe('#EXTM3U\n#EXT-X-MAP:URI="L(https://h.example/p/init.mp4)"\n#EXTINF:5,\nL(https://h.example/p/a/1.ts)\n\nL(https://x.example/2.ts)\n')
  })
})

describe('streamServer', () => {
  it('proxies the playlist with the site headers and allow-lists its entries', async () => {
    routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }).end(media())
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/x/', subUrl: null })
    expect(reg.subtitleUrl).toBeNull()
    const res = await fetch(reg.playlistUrl)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const text = await res.text()
    const local = text.split('\n').filter((l) => l.startsWith('http://127.0.0.1'))
    expect(local).toHaveLength(2)
    expect(text).toMatch(/URI="http:\/\/127\.0\.0\.1:\d+\/s\/[0-9a-f]{32}\/[^/]+\/r\/\d+"/)
    expect(seen[0].headers.referer).toBe('https://ref.example/x/')
    expect(seen[0].headers.origin).toBe('https://ref.example')
    expect(seen[0].headers['user-agent']).toBe(DEFAULT_USER_AGENT)
  })
  it('streams allow-listed segments with Range and refuses everything else', async () => {
    routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }).end(media())
    routes['/p/seg/1.ts.jpg'] = (req, res) => res.writeHead(206, { 'Content-Type': 'image/jpeg', 'Content-Range': 'bytes 0-3/10', 'Content-Length': '4', 'Accept-Ranges': 'bytes' }).end(Buffer.from([0x47, 1, 2, 3]))
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: null })
    const text = await (await fetch(reg.playlistUrl)).text()
    const segUrl = text.split('\n').filter((l) => l.startsWith('http://127.0.0.1')).at(-1)
    const seg = await fetch(segUrl, { headers: { Range: 'bytes=0-3' } })
    expect(seg.status).toBe(206)
    expect(seg.headers.get('content-range')).toBe('bytes 0-3/10')
    expect([...new Uint8Array(await seg.arrayBuffer())]).toEqual([0x47, 1, 2, 3])
    expect(seen.at(-1).headers.range).toBe('bytes=0-3')
    expect(seen.at(-1).headers.origin).toBe('https://ref.example')
    const base = reg.playlistUrl.replace(/\/playlist$/, '')
    expect((await fetch(`${base}/r/99`)).status).toBe(404)
    expect((await fetch(reg.playlistUrl.replace(/\/s\/[0-9a-f]{32}\//, `/s/${'0'.repeat(32)}/`))).status).toBe(403)
    expect((await fetch(reg.playlistUrl, { method: 'POST' })).status).toBe(405)
    expect((await fetch(reg.playlistUrl, { method: 'OPTIONS' })).status).toBe(204)
    streams.unregister(reg.id)
    expect((await fetch(segUrl)).status).toBe(404)
  })
  it('rewrites nested variant playlists and serves subtitles as vtt', async () => {
    routes['/master.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' }).end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080\nv/1080.m3u8\n')
    routes['/v/1080.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'text/plain' }).end('#EXTM3U\n#EXTINF:4,\n0.ts\n')
    routes['/subs/a.vtt'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end('WEBVTT\n')
    const reg = streams.register({ url: `${upBase}/master.m3u8`, referrer: 'https://ref.example/', subUrl: `${upBase}/subs/a.vtt` })
    const variant = (await (await fetch(reg.playlistUrl)).text()).split('\n').find((l) => l.startsWith('http://127.0.0.1'))
    const inner = await (await fetch(variant)).text()
    expect(inner).toMatch(/^#EXTM3U\n#EXTINF:4,\nhttp:\/\/127\.0\.0\.1/)
    const sub = await fetch(reg.subtitleUrl)
    expect(sub.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(await sub.text()).toBe('WEBVTT\n')
  })
  it('converts SRT subtitles from the source to VTT', async () => {
    routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }).end(media())
    routes['/subs/a.srt'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/x-subrip' }).end('1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n')
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: `${upBase}/subs/a.srt` })
    const sub = await fetch(reg.subtitleUrl)
    expect(sub.status).toBe(200)
    expect(sub.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(await sub.text()).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHi\n')
  })
  it('answers 415 for subtitle formats the player cannot show, also to HEAD', async () => {
    routes['/subs/a.ass'] = (req, res) => res.writeHead(200).end('[Script Info]\nTitle: x\n')
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: `${upBase}/subs/a.ass` })
    const get = await fetch(reg.subtitleUrl)
    expect(get.status).toBe(415)
    expect(get.headers.get('access-control-allow-origin')).toBe('*')
    expect((await fetch(reg.subtitleUrl, { method: 'HEAD' })).status).toBe(415)
  })
  it('passes upstream subtitle errors through', async () => {
    routes['/subs/gone.vtt'] = (req, res) => res.writeHead(404, { 'Content-Type': 'text/html' }).end('<html>not found</html>')
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: `${upBase}/subs/gone.vtt` })
    expect((await fetch(reg.subtitleUrl)).status).toBe(404)
  })
  it('answers HEAD for a good subtitle without a body', async () => {
    routes['/subs/a.vtt'] = (req, res) => res.writeHead(200).end('WEBVTT\n')
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: `${upBase}/subs/a.vtt` })
    const head = await fetch(reg.subtitleUrl, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(await head.text()).toBe('')
  })
  it('answers 502 when the site is unreachable', async () => {
    const reg = streams.register({ url: 'http://127.0.0.1:1/nothing.m3u8', referrer: 'https://ref.example/', subUrl: null })
    expect((await fetch(reg.playlistUrl)).status).toBe(502)
  })
  it('aborts the upstream request when the player goes away mid-segment', async () => {
    let upstreamClosed = false
    routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }).end('#EXTM3U\n#EXTINF:10,\nslow.ts\n')
    routes['/p/slow.ts'] = (req, res) => { res.writeHead(200, { 'Content-Type': 'video/mp2t' }); res.write(Buffer.alloc(1024)); req.on('close', () => { upstreamClosed = true }) }
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: null })
    const segUrl = (await (await fetch(reg.playlistUrl)).text()).split('\n').find((l) => l.startsWith('http://127.0.0.1'))
    const ac = new AbortController()
    const res = await fetch(segUrl, { signal: ac.signal })
    const reader = res.body.getReader()
    await reader.read()
    ac.abort()
    await new Promise((r) => setTimeout(r, 200))
    expect(upstreamClosed).toBe(true)
    expect((await fetch(reg.playlistUrl)).status).toBe(200)
  })
  it('serves a registered local file with byte ranges', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-ss-')), 'Show Episode 1.mp4')
    fs.writeFileSync(file, Buffer.from('0123456789'))
    const { id, fileUrl } = streams.registerFile(file)
    const full = await fetch(fileUrl)
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toBe('video/mp4')
    expect(full.headers.get('accept-ranges')).toBe('bytes')
    expect(await full.text()).toBe('0123456789')
    const part = await fetch(fileUrl, { headers: { Range: 'bytes=2-5' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await part.text()).toBe('2345')
    const tail = await fetch(fileUrl, { headers: { Range: 'bytes=7-' } })
    expect(tail.status).toBe(206)
    expect(tail.headers.get('content-range')).toBe('bytes 7-9/10')
    expect(await tail.text()).toBe('789')
    expect((await fetch(fileUrl, { headers: { Range: 'bytes=20-' } })).status).toBe(416)
    fs.rmSync(file)
    expect((await fetch(fileUrl)).status).toBe(404)
    streams.unregister(id)
  })
  it('serves the sibling .vtt of a local file as its subtitles', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-ss-'))
    const file = path.join(dir, 'Show Episode 1.mp4')
    fs.writeFileSync(file, Buffer.from('0123456789'))
    fs.writeFileSync(path.join(dir, 'Show Episode 1.vtt'), 'WEBVTT\n\n00:00.000 --> 00:01.000\nČao\n')
    const reg = streams.registerFile(file)
    expect(reg.subtitleUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/s\/[0-9a-f]{32}\/[0-9a-f-]{36}\/sub$/)
    const sub = await fetch(reg.subtitleUrl)
    expect(sub.status).toBe(200)
    expect(sub.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(sub.headers.get('access-control-allow-origin')).toBe('*')
    expect(await sub.text()).toContain('Čao')
    expect((await fetch(reg.subtitleUrl.replace(/\/s\/[0-9a-f]{32}\//, `/s/${'0'.repeat(32)}/`))).status).toBe(403)
    expect((await fetch(reg.subtitleUrl, { method: 'POST' })).status).toBe(405)
    streams.unregister(reg.id)
    expect((await fetch(reg.subtitleUrl)).status).toBe(404)
  })
  it('has no subtitles for a local file without a sibling .vtt', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-ss-')), 'Show Episode 2.mp4')
    fs.writeFileSync(file, Buffer.from('0123456789'))
    const reg = streams.registerFile(file)
    expect(reg.subtitleUrl).toBeNull()
    expect((await fetch(reg.fileUrl.replace(/file$/, 'sub'))).status).toBe(404)
    streams.unregister(reg.id)
  })
  it('finds a sibling .srt of a local file and converts it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-srt-'))
    const video = path.join(dir, 'Show Episode 1.mp4')
    fs.writeFileSync(video, 'x')
    fs.writeFileSync(path.join(dir, 'Show Episode 1.srt'), '1\n00:00:01,000 --> 00:00:02,000\nĆao\n')
    const reg = streams.registerFile(video)
    expect(reg.subtitleUrl).not.toBeNull()
    expect(await (await fetch(reg.subtitleUrl)).text()).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nĆao\n')
  })
  it('prefers .vtt, then .srt, then .en.vtt, then .en.srt next to a local file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-srt-'))
    const video = path.join(dir, 'E 1.mp4')
    fs.writeFileSync(video, 'x')
    fs.writeFileSync(path.join(dir, 'E 1.en.srt'), '1\n00:00:01,000 --> 00:00:02,000\nen-srt\n')
    expect(await (await fetch(streams.registerFile(video).subtitleUrl)).text()).toContain('en-srt')
    fs.writeFileSync(path.join(dir, 'E 1.en.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.000\nen-vtt\n')
    expect(await (await fetch(streams.registerFile(video).subtitleUrl)).text()).toContain('en-vtt')
    fs.writeFileSync(path.join(dir, 'E 1.srt'), '1\n00:00:01,000 --> 00:00:02,000\nsrt\n')
    expect(await (await fetch(streams.registerFile(video).subtitleUrl)).text()).toContain('\nsrt\n')
    fs.writeFileSync(path.join(dir, 'E 1.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.000\nvtt\n')
    expect(await (await fetch(streams.registerFile(video).subtitleUrl)).text()).toContain('\nvtt\n')
  })
  it('answers 415 for a local .srt that is really ASS', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-srt-'))
    const video = path.join(dir, 'A 1.mp4')
    fs.writeFileSync(video, 'x')
    fs.writeFileSync(path.join(dir, 'A 1.srt'), '[Script Info]\n')
    expect((await fetch(streams.registerFile(video).subtitleUrl)).status).toBe(415)
  })
  it('asks upstream for identity encoding', async () => {
    routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }).end('#EXTM3U\n')
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: null })
    await (await fetch(reg.playlistUrl)).text()
    expect(seen[0].headers['accept-encoding']).toBe('identity')
  })
  it('never allow-lists non-http(s) playlist entries', async () => {
    routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
      .end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="data:text/plain,hi"\n#EXTINF:1,\ndata:text/plain,hi\n#EXTINF:1,\nfile:///etc/passwd\n#EXTINF:1,\nok.ts\n')
    routes['/p/ok.ts'] = (req, res) => res.writeHead(200, { 'Content-Type': 'video/mp2t' }).end('x')
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: 'https://ref.example/', subUrl: null })
    const text = await (await fetch(reg.playlistUrl)).text()
    expect(text).toContain('URI="data:text/plain,hi"')
    expect(text).toContain('file:///etc/passwd')
    expect(text.split('\n').filter((l) => l.startsWith('http://127.0.0.1'))).toHaveLength(1)
    const base = reg.playlistUrl.replace(/\/playlist$/, '')
    expect((await fetch(`${base}/r/0`)).status).toBe(200)
    expect((await fetch(`${base}/r/1`)).status).toBe(404)
  })
  it('survives read errors and client aborts while serving a file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-ss-'))
    const bad = streams.registerFile(dir) // stat succeeds, reading a directory fails
    const failed = await fetch(bad.fileUrl).then((r) => r.arrayBuffer().then(() => 'done'), () => 'error')
    expect(['done', 'error']).toContain(failed)
    const big = path.join(dir, 'big.mp4')
    fs.writeFileSync(big, Buffer.alloc(8 * 1024 * 1024))
    const ok = streams.registerFile(big)
    const ac = new AbortController()
    const res = await fetch(ok.fileUrl, { headers: { Range: 'bytes=0-' }, signal: ac.signal })
    await res.body.getReader().read()
    ac.abort()
    await new Promise((r) => setTimeout(r, 100))
    const next = await fetch(ok.fileUrl, { headers: { Range: 'bytes=0-3' } })
    expect(next.status).toBe(206)
    expect((await next.arrayBuffer()).byteLength).toBe(4)
  })
})

describe('streamServer upstream resilience', () => {
  const onePiece = () => `#EXTM3U\n#EXTINF:10,\n${upBase}/seg/a.ts\n#EXT-X-ENDLIST\n`
  const segmentUrl = async () => {
    routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }).end(onePiece())
    const reg = streams.register({ url: `${upBase}/p/index.m3u8`, referrer: null, subUrl: null })
    const text = await (await fetch(reg.playlistUrl)).text()
    return text.split('\n').find((l) => l.startsWith('http://127.0.0.1'))
  }
  it('retries a segment once after a 5xx', async () => {
    let n = 0
    routes['/seg/a.ts'] = (req, res) => (++n === 1 ? res.writeHead(502).end() : res.writeHead(200, { 'Content-Type': 'video/mp2t' }).end('ok'))
    const res = await fetch(await segmentUrl())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(n).toBe(2)
  })
  it('gives up on a segment after the second failure', async () => {
    let n = 0
    routes['/seg/a.ts'] = (req, res) => { n++; res.writeHead(503).end() }
    const res = await fetch(await segmentUrl())
    expect(res.status).toBe(503)
    expect(n).toBe(2)
  })
  it('does not retry playlists', async () => {
    let n = 0
    routes['/p/bad.m3u8'] = (req, res) => { n++; res.writeHead(503).end() }
    const reg = streams.register({ url: `${upBase}/p/bad.m3u8`, referrer: null, subUrl: null })
    expect((await fetch(reg.playlistUrl)).status).toBe(503)
    expect(n).toBe(1)
  })
  it('answers 504 when upstream headers never arrive', async () => {
    const hanging = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    const slow = createStreamServer({ fetchImpl: hanging, headerTimeoutMs: 50 })
    await slow.start()
    try {
      const reg = slow.register({ url: 'https://cdn.example/p.m3u8', referrer: null, subUrl: null })
      expect((await fetch(reg.playlistUrl)).status).toBe(504)
    } finally { await slow.stop() }
  })
  it('keeps streaming a segment body past the header deadline', async () => {
    routes['/seg/a.ts'] = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'video/mp2t' })
      res.write('he')
      setTimeout(() => res.end('llo'), 120)
    }
    const slow = createStreamServer({ headerTimeoutMs: 50 })
    await slow.start()
    try {
      const reg = slow.register({ url: `${upBase}/p/index.m3u8`, referrer: null, subUrl: null })
      routes['/p/index.m3u8'] = (req, res) => res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }).end(onePiece())
      const text = await (await fetch(reg.playlistUrl)).text()
      const res = await fetch(text.split('\n').find((l) => l.startsWith('http://127.0.0.1')))
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('hello')
    } finally { await slow.stop() }
  })
})
