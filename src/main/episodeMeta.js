import fs from 'node:fs'
import path from 'node:path'
import { readJson, writeJsonAtomic } from './jsonStore.js'

export const ANIZIP_URL = 'https://api.ani.zip/mappings'
const HOUR = 3600 * 1000
export const AIRING_TTL_MS = 12 * HOUR
export const TTL_MS = 7 * 24 * HOUR
export const MISSING_TTL_MS = 7 * 24 * HOUR
export const TIMEOUT_MS = 15000
// After a failed refresh the stale cache is served for this long before ani.zip is asked again.
export const RETRY_AFTER_MS = 15 * 60 * 1000
export const MAX_THUMB_BYTES = 2 * 1024 * 1024
// Raster formats only: an SVG data URL could carry markup.
const THUMB_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
// Image URLs come from a third-party API, so only these hosts are ever fetched by the main process.
export const THUMB_HOSTS = ['artworks.thetvdb.com']

export function isAllowedImage(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && THUMB_HOSTS.includes(u.hostname) && !u.username && !u.password && u.port === ''
  } catch { return false }
}

const MAIN_KEY = /^[1-9]\d*$/
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
export const validId = (id) => Number.isInteger(id) && id > 0

// Keep only what the app shows, so no other ani.zip field can ever reach the renderer.
export function slimAniZip(raw) {
  const episodes = {}
  const src = raw?.episodes !== null && typeof raw?.episodes === 'object' ? raw.episodes : {}
  for (const [k, e] of Object.entries(src)) {
    if (!MAIN_KEY.test(k) || e === null || typeof e !== 'object') continue
    const titles = {}
    for (const [lang, v] of Object.entries(e.title !== null && typeof e.title === 'object' ? e.title : {})) {
      if (text(v)) titles[lang] = text(v)
    }
    const runtime = Number(e.runtime ?? e.length)
    episodes[k] = {
      titles,
      image: isAllowedImage(e.image) ? e.image : null,
      overview: text(e.overview) ?? text(e.summary),
      runtime: Number.isFinite(runtime) && runtime > 0 ? Math.round(runtime) : null,
    }
  }
  const count = Number(raw?.episodeCount)
  return { episodeCount: Number.isInteger(count) && count > 0 ? count : Object.keys(episodes).length, episodes }
}

export function createEpisodeMeta({ cacheDir, fetchImpl = fetch, now = Date.now }) {
  const file = (id) => path.join(cacheDir, `${id}.json`)
  const inflight = new Map()
  const thumbInflight = new Map()
  const failedAt = new Map()
  const parsed = new Map() // id -> { sig, data }: the cache file is parsed again only when it changed on disk

  // The abort timer also covers reading the body (read), so a stalled body cannot hang callers.
  async function fetchWithTimeout(url, read = (res) => res, options = {}) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try { return await read(await fetchImpl(url, { ...options, signal: ctrl.signal })) } finally { clearTimeout(timer) }
  }

  function readCache(id) {
    try {
      const st = fs.statSync(file(id))
      const sig = `${st.mtimeMs}:${st.size}`
      const hit = parsed.get(id)
      if (hit?.sig === sig) return hit.data
      const d = readJson(file(id), null).data
      const data = d && Number.isFinite(d.fetchedAt) ? d : null
      parsed.set(id, { sig, data })
      return data
    } catch {
      parsed.delete(id)
      return null
    }
  }

  async function load(id, airing) {
    const cached = readCache(id)
    const ttl = cached?.missing ? MISSING_TTL_MS : airing ? AIRING_TTL_MS : TTL_MS
    if (cached && now() - cached.fetchedAt < ttl) return cached.missing ? null : cached
    const stale = cached && !cached.missing ? cached : null
    if (now() - (failedAt.get(id) ?? -Infinity) < RETRY_AFTER_MS) return stale
    try {
      const res = await fetchWithTimeout(`${ANIZIP_URL}?anilist_id=${id}`, async (r) => ({
        status: r.status,
        ok: r.ok,
        body: r.ok ? await r.json() : null,
      }))
      if (res.status === 404) {
        writeJsonAtomic(file(id), { missing: true, fetchedAt: now() })
        failedAt.delete(id)
        return null
      }
      if (!res.ok) throw new Error(`ani.zip HTTP ${res.status}`)
      const slim = slimAniZip(res.body)
      // An empty answer must not replace a good cache.
      if (stale && Object.keys(slim.episodes).length === 0) { failedAt.set(id, now()); return stale }
      const data = { ...slim, fetchedAt: now() }
      writeJsonAtomic(file(id), data)
      failedAt.delete(id)
      return data
    } catch (err) {
      console.warn('episodeMeta: ani.zip request failed', err?.message)
      failedAt.set(id, now())
      return stale
    }
  }

  // cachedOnly: never asks ani.zip, answers from the cache file (stale is fine) or null.
  function get(aniListId, { airing = false, cachedOnly = false } = {}) {
    if (!validId(aniListId)) return Promise.resolve(null)
    if (cachedOnly) {
      const cached = readCache(aniListId)
      return Promise.resolve(cached && !cached.missing ? cached : null)
    }
    if (!inflight.has(aniListId)) {
      inflight.set(aniListId, load(aniListId, airing).finally(() => inflight.delete(aniListId)))
    }
    return inflight.get(aniListId)
  }

  const thumbFile = (id, key) => path.join(cacheDir, 'thumbs', `${id}-${key}.txt`)

  // The caller has already decided the episode may be shown; this only fetches and caches the picture.
  function thumb(aniListId, key) {
    if (!validId(aniListId) || !MAIN_KEY.test(String(key))) return Promise.resolve(null)
    const k = thumbFile(aniListId, key)
    if (!thumbInflight.has(k)) thumbInflight.set(k, loadThumb(aniListId, key).finally(() => thumbInflight.delete(k)))
    return thumbInflight.get(k)
  }

  async function loadThumb(aniListId, key) {
    const f = thumbFile(aniListId, key)
    try {
      const cached = fs.readFileSync(f, 'utf8')
      if (cached.startsWith('data:image/')) return cached
    } catch { /* not cached yet */ }
    const url = readCache(aniListId)?.episodes?.[key]?.image
    if (!isAllowedImage(url)) return null
    try {
      const got = await fetchWithTimeout(url, async (res) => {
        const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        if (!res.ok || !THUMB_TYPES.has(type)) return null
        if (Number(res.headers.get('content-length')) > MAX_THUMB_BYTES) return null
        if (!res.body?.getReader) return { type, buf: Buffer.from(await res.arrayBuffer()) }
        const reader = res.body.getReader()
        const chunks = []
        let size = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.length
          if (size > MAX_THUMB_BYTES) { await reader.cancel(); return null }
          chunks.push(value)
        }
        return { type, buf: Buffer.concat(chunks) }
      }, { redirect: 'error' })
      if (!got || got.buf.length === 0 || got.buf.length > MAX_THUMB_BYTES) return null
      const dataUrl = `data:${got.type};base64,${got.buf.toString('base64')}`
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(`${f}.tmp`, dataUrl)
      fs.renameSync(`${f}.tmp`, f)
      return dataUrl
    } catch (err) {
      console.warn('episodeMeta: thumbnail failed', err?.message)
      return null
    }
  }

  return { get, readCache, thumb }
}
