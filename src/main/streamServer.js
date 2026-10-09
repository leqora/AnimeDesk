import http from 'node:http'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { Readable, pipeline } from 'node:stream'
import { toVtt } from '../shared/subtitles.js'

export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CORS = { 'Access-Control-Allow-Origin': '*' }
const VTT_HEAD = { ...CORS, 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' }
// Every subtitle reaches the player as WebVTT; formats it cannot show get 415 so the player can say so.
function sendSubtitle(req, res, status, text) {
  const { vtt } = toVtt(text)
  if (vtt == null) return res.writeHead(415, { ...CORS, 'Cache-Control': 'no-store' }).end()
  res.writeHead(status, VTT_HEAD)
  return req.method === 'HEAD' ? res.end() : res.end(vtt)
}
const SUB_SUFFIXES = ['.vtt', '.srt', '.en.vtt', '.en.srt']

// Every non-comment line and every URI="…" attribute becomes a local, allow-listed URL (toLocal returning null leaves the entry untouched).
export function rewritePlaylist(text, baseUrl, toLocal) {
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim()
    if (!t) return line
    if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (m, uri) => { const l = toLocal(new URL(uri, baseUrl).href); return l == null ? m : `URI="${l}"` })
    return toLocal(new URL(t, baseUrl).href) ?? line
  }).join('\n')
}

// pipeline destroys the read stream on client abort and swallows read errors (no fd leak, no uncaught 'error').
function sendFile(res, file, range) {
  pipeline(fs.createReadStream(file, range), res, () => {})
}

const looksLikePlaylist = (type, url) => /mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(url)

export function createStreamServer({ fetchImpl = fetch, userAgent = DEFAULT_USER_AGENT, headerTimeoutMs = 20000 } = {}) {
  const token = crypto.randomBytes(16).toString('hex')
  const playbacks = new Map()
  let server = null
  let port = 0
  const base = (id) => `http://127.0.0.1:${port}/s/${token}/${id}`

  function allow(pb, id, url) {
    if (!/^https?:\/\//i.test(url)) return null
    let n = pb.index.get(url)
    if (n == null) { n = pb.urls.push(url) - 1; pb.index.set(url, n) }
    return `${base(id)}/r/${n}`
  }

  // ani-cli downloads soft subs next to the video ("<same name>.vtt"); a hand-added .srt works too (the in-app player gets /sub).
  function siblingSubtitle(filePath) {
    const { dir, name } = path.parse(filePath)
    for (const suffix of SUB_SUFFIXES) {
      const f = path.join(dir, name + suffix)
      try { if (fs.statSync(f).isFile()) return f } catch { /* not there */ }
    }
    return null
  }

  function registerFile(filePath) {
    const id = crypto.randomUUID()
    const subFile = siblingSubtitle(filePath)
    playbacks.set(id, { file: filePath, subFile, urls: [], index: new Map() })
    return { id, fileUrl: `${base(id)}/file`, subtitleUrl: subFile ? `${base(id)}/sub` : null }
  }

  function serveSubFile(req, res, file) {
    fs.readFile(file, 'utf8', (err, text) => {
      if (err) return res.writeHead(404, CORS).end()
      return sendSubtitle(req, res, 200, text)
    })
  }

  function serveFile(req, res, file) {
    let size
    try { size = fs.statSync(file).size } catch { return res.writeHead(404, CORS).end() }
    const head = { ...CORS, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' }
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
    if (!m) {
      res.writeHead(200, { ...head, 'Content-Length': size })
      return req.method === 'HEAD' ? res.end() : sendFile(res, file)
    }
    const start = Number(m[1])
    const end = Math.min(m[2] ? Number(m[2]) : size - 1, size - 1)
    if (start >= size || start > end) return res.writeHead(416, { ...CORS, 'Content-Range': `bytes */${size}` }).end()
    res.writeHead(206, { ...head, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` })
    return req.method === 'HEAD' ? res.end() : sendFile(res, file, { start, end })
  }

  function register({ url, referrer = null, subUrl = null }) {
    const id = crypto.randomUUID()
    playbacks.set(id, { playlist: url, sub: subUrl, referrer, origin: referrer ? new URL(referrer).origin : null, urls: [], index: new Map() })
    return { id, playlistUrl: `${base(id)}/playlist`, subtitleUrl: subUrl ? `${base(id)}/sub` : null }
  }

  // Deadline for the response headers only: a long segment body may keep streaming past it.
  async function fetchUpstream(url, headers, parent) {
    const ac = new AbortController()
    parent.addEventListener('abort', () => ac.abort(), { once: true })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; ac.abort() }, headerTimeoutMs)
    try {
      return { up: await fetchImpl(url, { headers, signal: ac.signal }) }
    } catch {
      return { error: timedOut ? 'timeout' : 'network' }
    } finally {
      clearTimeout(timer)
    }
  }

  async function proxy(req, res, pb, id, url, kind) {
    const ac = new AbortController()
    res.on('close', () => ac.abort())
    const headers = { 'User-Agent': userAgent, 'Accept-Encoding': 'identity' }
    if (pb.referrer) { headers.Referer = pb.referrer; headers.Origin = pb.origin }
    if (req.headers.range) headers.Range = req.headers.range
    // Segments get one more try (CDN hiccups); playlists and subtitles are re-requested by hls.js itself.
    const attempts = kind === 'r' ? 2 : 1
    let up = null
    let failure = 'network'
    for (let i = 0; i < attempts && !ac.signal.aborted; i++) {
      const r = await fetchUpstream(url, headers, ac.signal)
      if (r.up && (r.up.status < 500 || i === attempts - 1)) { up = r.up; break }
      if (r.up) { try { await r.up.body?.cancel() } catch { /* already closed */ } } else failure = r.error
    }
    if (!up) {
      if (!res.headersSent) res.writeHead(failure === 'timeout' ? 504 : 502, CORS).end()
      return
    }
    const type = up.headers.get('content-type') ?? ''
    try {
      if (kind === 'sub') {
        // an error page from the source is not "unsupported format": pass its status through
        if (up.status >= 400) { try { await up.body?.cancel() } catch { /* already closed */ } return res.writeHead(up.status, CORS).end() }
        return sendSubtitle(req, res, up.status, await up.text())
      }
      if (kind === 'playlist' || looksLikePlaylist(type, url)) {
        const text = await up.text()
        if (text.trimStart().startsWith('#EXTM3U')) {
          return res.writeHead(up.status, { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' })
            .end(rewritePlaylist(text, up.url || url, (u) => allow(pb, id, u)))
        }
        return res.writeHead(up.status, { ...CORS, 'Content-Type': type || 'application/octet-stream' }).end(text)
      }
      const out = { ...CORS, 'Content-Type': type || 'application/octet-stream' }
      for (const h of ['content-length', 'content-range', 'accept-ranges']) { const v = up.headers.get(h); if (v) out[h] = v }
      res.writeHead(up.status, out)
      if (req.method === 'HEAD' || !up.body) return res.end()
      Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res)
    } catch {
      if (!res.headersSent) res.writeHead(502, CORS).end()
      else res.destroy()
    }
  }

  function tokenOk(given) {
    const a = Buffer.from(given)
    const b = Buffer.from(token)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  function handle(req, res) {
    const m = /^\/s\/([0-9a-f]{32})\/([0-9a-f-]{36})\/(playlist|sub|file|r\/(\d+))$/.exec(new URL(req.url, 'http://local').pathname)
    if (!m) return res.writeHead(404, CORS).end()
    if (!tokenOk(m[1])) return res.writeHead(403, CORS).end()
    if (req.method === 'OPTIONS') return res.writeHead(204, { ...CORS, 'Access-Control-Allow-Headers': 'Range' }).end()
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, CORS).end()
    const pb = playbacks.get(m[2])
    if (!pb) return res.writeHead(404, CORS).end()
    if (pb.file) {
      if (m[3] === 'file') return serveFile(req, res, pb.file)
      if (m[3] === 'sub' && pb.subFile) return serveSubFile(req, res, pb.subFile)
      return res.writeHead(404, CORS).end()
    }
    if (m[3] === 'file') return res.writeHead(404, CORS).end()
    if (m[3] === 'playlist') return proxy(req, res, pb, m[2], pb.playlist, 'playlist')
    if (m[3] === 'sub') return pb.sub ? proxy(req, res, pb, m[2], pb.sub, 'sub') : res.writeHead(404, CORS).end()
    const url = pb.urls[Number(m[4])]
    return url ? proxy(req, res, pb, m[2], url, 'r') : res.writeHead(404, CORS).end()
  }

  return {
    start: () => new Promise((resolve, reject) => {
      server = http.createServer(handle)
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve({ port }) })
    }),
    stop: () => new Promise((resolve) => { if (!server) return resolve(); server.closeAllConnections?.(); server.close(() => resolve()) }),
    register,
    registerFile,
    unregister: (id) => { playbacks.delete(id) },
  }
}
