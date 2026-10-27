import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const BANNER_SCHEME = 'animedesk-img'
const HOST = 's4.anilist.co'
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const HASH = /^[0-9a-f]{40}$/

function allowed(url) {
  if (typeof url !== 'string') return false
  let u
  try { u = new URL(url) } catch { return false }
  return u.protocol === 'https:' && u.hostname === HOST && !u.username && !u.password && !u.port
}

// AniList banners as files in `dir`, served to the renderer through the animedesk-img: protocol,
// so hundreds of kB never travel through IPC as data URLs.
export function createBanners({ dir, fetchImpl = fetch, timeoutMs = 10_000, maxBytes = 3 * 1024 * 1024 }) {
  const failed = new Set()
  const inflight = new Map()
  let generation = 0

  const hashOf = (url) => crypto.createHash('sha1').update(url).digest('hex')
  const publicUrl = (hash) => `${BANNER_SCHEME}://banner/${hash}`

  function findFile(hash) {
    for (const ext of Object.keys(MIME)) {
      const file = path.join(dir, `${hash}.${ext}`)
      if (fs.existsSync(file)) return { path: file, type: MIME[ext] }
    }
    return null
  }

  async function download(url, hash) {
    const controller = new AbortController()
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')) }, timeoutMs)
    })
    const work = (async () => {
      const res = await fetchImpl(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const type = String(res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      const ext = TYPES[type]
      if (!ext) throw new Error('bad type')
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error('too large')
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > maxBytes) throw new Error('too large')
      return { buf, ext }
    })()
    work.catch(() => {})
    try {
      const { buf, ext } = await Promise.race([work, timeout])
      await fs.promises.mkdir(dir, { recursive: true })
      const tmp = path.join(dir, `${hash}.${process.pid}.${Date.now()}.tmp`)
      try {
        await fs.promises.writeFile(tmp, buf, { flag: 'wx' })
        await fs.promises.rename(tmp, path.join(dir, `${hash}.${ext}`))
      } catch (err) {
        await fs.promises.rm(tmp, { force: true }).catch(() => {})
        throw err
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async function ensure(url) {
    if (!allowed(url)) return null
    const hash = hashOf(url)
    if (findFile(hash)) return publicUrl(hash)
    if (failed.has(url)) return null
    let job = inflight.get(url)
    if (!job) {
      const gen = generation
      job = download(url, hash)
        .then(() => true, () => { if (gen === generation) failed.add(url); return false })
        .finally(() => { if (inflight.get(url) === job) inflight.delete(url) })
      inflight.set(url, job)
    }
    return (await job) ? publicUrl(hash) : null
  }

  function resolve(requestUrl) {
    if (typeof requestUrl !== 'string') return null
    const m = new RegExp(`^${BANNER_SCHEME}://banner/([0-9a-f]{40})/?$`).exec(requestUrl)
    if (!m || !HASH.test(m[1])) return null
    return findFile(m[1])
  }

  function forget() {
    generation += 1
    failed.clear()
    inflight.clear()
  }

  return { ensure, resolve, forget }
}
