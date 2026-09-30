import http from 'node:http'
import crypto from 'node:crypto'

const decodeHex = (hex) => Buffer.from(hex ?? '', 'hex').toString('utf8')

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function createBridgeServer() {
  const token = crypto.randomBytes(16).toString('hex')
  const sessions = new Map()
  let server = null
  let port = null

  async function handle(req, res) {
    if (req.method !== 'POST' || req.headers['x-animedesk-token'] !== token) return res.writeHead(403).end()
    const session = sessions.get(req.headers['x-animedesk-session'])
    if (!session) return res.writeHead(404).end()
    const lines = (await readBody(req)).split(/\r?\n/).filter(Boolean)
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
      return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()))
    },
    registerSession: (id, handlers) => sessions.set(id, handlers),
    unregisterSession: (id) => sessions.delete(id),
  }
}
