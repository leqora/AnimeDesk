import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { createStreamServer, rewritePlaylist, DEFAULT_USER_AGENT } from '../../src/main/streamServer.js'

let upstream, upBase, seen, server, streams
const routes = {}
beforeEach(async () => {
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
  server = await streams.start()
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
})
