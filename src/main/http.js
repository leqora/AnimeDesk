import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'

const UA = 'AnimeDesk'

export async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

export async function download(url, dest, onProgress = () => {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const part = `${dest}.part`
  const out = fs.createWriteStream(part)
  let received = 0
  try {
    for await (const chunk of res.body) {
      received += chunk.length
      if (!out.write(chunk)) await once(out, 'drain')
      onProgress({ received, total })
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
  } catch (err) {
    out.destroy()
    fs.rmSync(part, { force: true })
    throw err
  }
  fs.renameSync(part, dest)
}

export async function isOnline(timeoutMs = 5000) {
  try {
    const res = await fetch('https://api.github.com', { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
    return res.status < 500
  } catch {
    return false
  }
}
