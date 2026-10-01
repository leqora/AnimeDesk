import http from 'node:http'
import crypto from 'node:crypto'

const MAX_BODY = 1024 * 1024 // menus and player args are a few KB at most

const decodeHex = (hex) => Buffer.from(hex ?? '', 'hex').toString('utf8')

class BodyTooLarge extends Error {}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new BodyTooLarge())
        req.pause()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function tokenMatches(given, token) {
  const a = Buffer.from(String(given ?? ''))
  const b = Buffer.from(token)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function createBridgeServer() {
  const token = crypto.randomBytes(16).toString('hex')
  const sessions = new Map()
  let server = null
  let port = null

  async function handle(req, res) {
    if (req.method !== 'POST' || !tokenMatches(req.headers['x-animedesk-token'], token)) return res.writeHead(403).end()
    const session = sessions.get(req.headers['x-animedesk-session'])
    if (!session) return res.writeHead(404).end()
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return res.writeHead(err instanceof BodyTooLarge ? 413 : 400, { connection: 'close' }).end()
    }
    const lines = body.split(/\r?\n/).filter(Boolean)
    try {
      if (req.url === '/menu') {
        const answer = await session.onMenu({ prompt: decodeHex(req.headers['x-animedesk-prompt']), lines })
        if (answer == null) return res.writeHead(204).end()
        return res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(answer)
      }
      if (req.url === '/play') {
        const code = await session.onPlay({ args: lines })
        return res.writeHead(200, { 'content-type': 'text/plain' }).end(String(code ?? 0))
      }
      return res.writeHead(404).end()
    } catch (err) {
      return res.writeHead(500).end(String(err.message))
    }
  }

  return {
    token,
    get port() { return port },
    start() {
      return new Promise((resolve) => {
        server = http.createServer((req, res) => { handle(req, res) })
        server.requestTimeout = 0 // the user may take minutes to pick an episode
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port
          resolve({ port, token })
        })
      })
    },
    stop() {
      if (!server) return Promise.resolve()
      return new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections() // a menu may still be waiting for the user; don't hang on quit
      })
    },
    registerSession: (id, handlers) => sessions.set(id, handlers),
    unregisterSession: (id) => sessions.delete(id),
  }
}
