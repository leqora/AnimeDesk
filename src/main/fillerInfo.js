import fs from 'node:fs'
import path from 'node:path'
import { readJson, writeJsonAtomic } from './jsonStore.js'

export const JIKAN_URL = 'https://api.jikan.moe/v4/anime'
const HOUR = 3600 * 1000
const DAY = 24 * HOUR
export const TTL_MS = 30 * DAY
export const AIRING_TTL_MS = 7 * DAY
export const MISSING_TTL_MS = 7 * DAY
// After a failed refresh Jikan is left alone for this long.
export const RETRY_AFTER_MS = HOUR
// Jikan allows about 3 requests per second and 60 per minute; one request every 1.1 s stays well below.
export const GAP_MS = 1100
export const RATE_PAUSE_MS = 60000
export const MAX_RATE_RETRIES = 2
export const MAX_PAGES = 30
export const TIMEOUT_MS = 15000

const validId = (id) => Number.isInteger(id) && id > 0
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Keep only the episode number and its kind, so no other Jikan field (titles, scores, dates) is ever stored.
export function slimJikanPage(raw) {
  const episodes = []
  for (const e of Array.isArray(raw?.data) ? raw.data : []) {
    if (e === null || typeof e !== 'object' || !Number.isInteger(e.mal_id) || e.mal_id < 1) continue
    episodes.push({ n: e.mal_id, kind: e.recap === true ? 'recap' : e.filler === true ? 'filler' : null })
  }
  return { episodes, hasNext: raw?.pagination?.has_next_page === true }
}

export function createFillerInfo({ cacheDir, fetchImpl = fetch, now = Date.now, sleep = defaultSleep }) {
  const file = (id) => path.join(cacheDir, `${id}.json`)
  const inflight = new Map()
  const failedAt = new Map()
  const parsed = new Map() // malId -> { sig, data }: the cache file is parsed again only when it changed on disk

  // One queue for every malId: a single request in flight, each start at least GAP_MS after the previous start.
  let tail = Promise.resolve()
  let lastStart = -Infinity
  function enqueue(task) {
    const run = tail.then(async () => {
      const wait = lastStart + GAP_MS - now()
      if (wait > 0) await sleep(wait)
      lastStart = now()
      return task()
    })
    tail = run.catch(() => {})
    return run
  }

  // The abort timer also covers reading the body, so a stalled body cannot hang the queue.
  async function requestOnce(url) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const r = await fetchImpl(url, { signal: ctrl.signal })
      return { status: r.status, ok: r.ok, body: r.ok ? await r.json() : null }
    } finally { clearTimeout(timer) }
  }

  // A 429 pauses the whole queue (the pause happens inside the task, so nothing else starts) and retries the same page.
  function request(url) {
    return enqueue(async () => {
      for (let attempt = 0; ; attempt++) {
        const out = await requestOnce(url)
        if (out.status !== 429) return out
        if (attempt >= MAX_RATE_RETRIES) throw new Error('Jikan HTTP 429')
        await sleep(RATE_PAUSE_MS)
        lastStart = now()
      }
    })
  }

  function readCache(id) {
    try {
      const st = fs.statSync(file(id))
      const sig = `${st.mtimeMs}:${st.size}`
      const hit = parsed.get(id)
      if (hit?.sig === sig) return hit.data
      const d = readJson(file(id), null).data
      const data = d !== null && typeof d === 'object' && Number.isFinite(d.fetchedAt) ? d : null
      parsed.set(id, { sig, data })
      return data
    } catch {
      parsed.delete(id)
      return null
    }
  }

  const ttlFor = (rec, airing) => (rec.missing ? MISSING_TTL_MS : airing ? AIRING_TTL_MS : TTL_MS)
  const numbers = (a) => (Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n > 0) : [])

  function cached(malId, { airing = false } = {}) {
    if (!validId(malId)) return null
    const rec = readCache(malId)
    if (!rec) return null
    const out = {
      filler: numbers(rec.filler),
      recap: numbers(rec.recap),
      count: Number.isInteger(rec.count) && rec.count > 0 ? rec.count : 0,
      fetchedAt: rec.fetchedAt,
    }
    if (rec.missing === true) out.missing = true
    out.expired = now() - rec.fetchedAt >= ttlFor(rec, airing)
    return out
  }

  async function load(id, airing) {
    const rec = readCache(id)
    if (rec && now() - rec.fetchedAt < ttlFor(rec, airing)) return false
    if (now() - (failedAt.get(id) ?? -Infinity) < RETRY_AFTER_MS) return false
    const good = rec && !rec.missing
    try {
      const filler = []
      const recap = []
      let count = 0
      let seen = 0
      for (let p = 1; p <= MAX_PAGES; p++) {
        const res = await request(`${JIKAN_URL}/${id}/episodes?page=${p}`)
        if (res.status === 404 && p === 1) {
          // Never let a "not found" replace a record that holds real data.
          if (good) { failedAt.set(id, now()); return false }
          writeJsonAtomic(file(id), { missing: true, fetchedAt: now() })
          failedAt.delete(id)
          return false
        }
        if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`)
        const slim = slimJikanPage(res.body)
        for (const e of slim.episodes) {
          seen++
          if (e.n > count) count = e.n
          if (e.kind === 'filler') filler.push(e.n)
          else if (e.kind === 'recap') recap.push(e.n)
        }
        if (!slim.hasNext) break
      }
      if (seen === 0) {
        // An empty answer must not replace a good cache.
        if (good) { failedAt.set(id, now()); return false }
        writeJsonAtomic(file(id), { missing: true, fetchedAt: now() })
        failedAt.delete(id)
        return false
      }
      const asc = (a, b) => a - b
      writeJsonAtomic(file(id), { filler: filler.sort(asc), recap: recap.sort(asc), count, fetchedAt: now() })
      failedAt.delete(id)
      return true
    } catch (err) {
      console.warn('fillerInfo: Jikan request failed', err?.message)
      failedAt.set(id, now())
      return false
    }
  }

  function ensure(malId, { airing = false } = {}) {
    if (!validId(malId)) return Promise.resolve(false)
    if (!inflight.has(malId)) {
      inflight.set(malId, load(malId, airing).catch(() => false).finally(() => inflight.delete(malId)))
    }
    return inflight.get(malId)
  }

  function forget() {
    parsed.clear()
    failedAt.clear()
  }

  return { cached, ensure, forget }
}
