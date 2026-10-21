import fs from 'node:fs'
import path from 'node:path'
import { readJson, writeJsonAtomic } from './jsonStore.js'

// The public Jikan API was discontinued on 2026-10-01. Two mirrors answer in the same shape and are merged:
// Tenrai and jikan-edge (a Jikan-parity mirror, fresher for some long series).
export const SOURCES = [
  { id: 'tenrai', url: 'https://api.tenrai.org/v1/anime' },
  { id: 'edge', url: 'https://jikan.lucashdo.com/v1/anime' },
]
const HOUR = 3600 * 1000
const DAY = 24 * HOUR
export const TTL_MS = 30 * DAY
export const AIRING_TTL_MS = 7 * DAY
export const MISSING_TTL_MS = 7 * DAY
// After a failed refresh Jikan is left alone for this long.
export const RETRY_AFTER_MS = HOUR
// jikan-edge allows 60 requests per minute per IP (30 per 10 s burst); a 1.1 s gap is about 54 per minute.
export const GAP_MS = 1100
// A source that fails as a whole (no answer, 403, 5xx, 429 after retries) is left alone for this long, for every series.
export const SOURCE_PAUSE_MS = 10 * 60 * 1000
// A record that lacks one source is refreshed after a day, so the absent source fills in soon.
export const PARTIAL_TTL_MS = DAY
export const RATE_PAUSE_MS = 60000
export const MAX_RATE_RETRIES = 2
const MAX_RETRY_AFTER_MS = 5 * 60 * 1000
export const MAX_PAGES = 30
const MAX_EPISODE_NUMBER = 5000
const MAX_ITEMS_PER_PAGE = 200
export const TIMEOUT_MS = 15000

const validId = (id) => Number.isInteger(id) && id > 0
// kind 'down': the whole source is unusable (pause it); 'series': only this series gets nothing from it; 'paused': not asked.
const sourceError = (kind, message) => Object.assign(new Error(message), { kind })
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Keep only the episode number and its kind, so no other Jikan field (titles, scores, dates) is ever stored.
export function slimJikanPage(raw) {
  const episodes = []
  for (const e of (Array.isArray(raw?.data) ? raw.data : []).slice(0, MAX_ITEMS_PER_PAGE)) {
    if (e === null || typeof e !== 'object') continue
    const n = e.number ?? e.mal_id
    if (!Number.isInteger(n) || n < 1 || n > MAX_EPISODE_NUMBER) continue
    episodes.push({ n, kind: e.recap === true ? 'recap' : e.filler === true ? 'filler' : null })
  }
  return { episodes, hasNext: raw?.meta?.pagination?.hasNextPage === true || raw?.pagination?.has_next_page === true }
}

const ascending = (a, b) => a - b
const sourceOrder = (id) => { const i = SOURCES.findIndex((s) => s.id === id); return i < 0 ? SOURCES.length : i }

// Merges the per-source results (and, for a partial result, the record already on disk) into what gets stored.
// With an existing good record a "missing" answer counts as a failure: a mirror may break, and "no data" never wipes marks.
export function mergeSources(results, existing = null) {
  const out = results.map((r) => (existing && r.outcome === 'missing' ? { ...r, outcome: 'failed' } : r))
  const data = out.filter((r) => r.outcome === 'data')
  if (data.length === 0) {
    if (out.length > 0 && out.every((r) => r.outcome === 'missing')) return { kind: 'missing' }
    return { kind: 'none', markFailed: out.length > 0 && !out.some((r) => r.outcome === 'skipped') }
  }
  const partial = out.some((r) => r.outcome === 'failed' || r.outcome === 'skipped')
  const inputs = data.map((r) => ({ ...r, sources: [r.id] }))
  if (partial && existing) inputs.push(existing)
  const filler = new Set()
  const recap = new Set()
  const ids = []
  let count = 0
  for (const r of inputs) {
    for (const n of r.filler ?? []) filler.add(n)
    for (const n of r.recap ?? []) recap.add(n)
    count = Math.max(count, r.count ?? 0)
    for (const id of r.sources ?? []) if (!ids.includes(id)) ids.push(id)
  }
  return {
    kind: 'data',
    filler: [...filler].filter((n) => !recap.has(n)).sort(ascending),
    recap: [...recap].sort(ascending),
    count,
    sources: ids.sort((a, b) => sourceOrder(a) - sourceOrder(b)),
    partial,
  }
}

export function createFillerInfo({ cacheDir, fetchImpl = fetch, now = Date.now, sleep = defaultSleep, sources = SOURCES }) {
  const file = (id) => path.join(cacheDir, `${id}.json`)
  const inflight = new Map()
  const failedAt = new Map()
  const parsed = new Map() // malId -> { sig, data }: the cache file is parsed again only when it changed on disk
  // Each source has its own queue (one request in flight, starts at least GAP_MS apart) and its own pause.
  const queues = sources.map((s) => ({ ...s, tail: Promise.resolve(), lastStart: -Infinity, downAt: -Infinity }))
  const isDown = (q) => now() - q.downAt < SOURCE_PAUSE_MS

  function enqueue(q, task) {
    const run = q.tail.then(async () => {
      if (isDown(q)) throw sourceError('paused', 'paused')
      const wait = q.lastStart + GAP_MS - now()
      if (wait > 0) await sleep(wait)
      if (isDown(q)) throw sourceError('paused', 'paused')
      q.lastStart = now()
      return task()
    })
    q.tail = run.catch(() => {})
    return run
  }

  // The abort timer also covers reading the body, so a stalled body cannot hang the queue.
  // Only an unparsable body (SyntaxError) spoils just this series; any other error means the source is down.
  async function requestOnce(url) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const r = await fetchImpl(url, { signal: ctrl.signal })
      const retryAfter = Number(r.headers?.get?.('retry-after'))
      if (r.status !== 200) {
        try { await r.body?.cancel?.() } catch { /* body already gone */ }
        return { status: r.status, body: null, retryAfter }
      }
      return { status: 200, body: await r.json(), retryAfter }
    } catch (err) {
      throw sourceError(err instanceof SyntaxError ? 'series' : 'down', err?.message ?? 'request failed')
    } finally { clearTimeout(timer) }
  }

  // A 429 pauses this source's queue (inside the task, so nothing else of this source starts) and retries the same page.
  function request(q, url) {
    return enqueue(q, async () => {
      for (let attempt = 0; ; attempt++) {
        const out = await requestOnce(url)
        if (out.status !== 429) return out
        if (attempt >= MAX_RATE_RETRIES) throw sourceError('down', 'HTTP 429')
        const pause = Number.isFinite(out.retryAfter) && out.retryAfter > 0
          ? Math.min(MAX_RETRY_AFTER_MS, Math.max(RATE_PAUSE_MS, out.retryAfter * 1000))
          : RATE_PAUSE_MS
        await sleep(pause)
        if (isDown(q)) throw sourceError('paused', 'paused')
        q.lastStart = now()
      }
    })
  }

  // All pages of one series from one source as one result; a failure on any page discards the pages already read.
  async function fetchSource(q, id) {
    const filler = []
    const recap = []
    let count = 0
    let seen = 0
    let p = 1
    try {
      for (; p <= MAX_PAGES; p++) {
        const res = await request(q, `${q.url}/${id}/episodes?page=${p}`)
        if (res.status === 404 && p === 1) return { id: q.id, outcome: 'missing' }
        if (res.status === 403 || res.status >= 500) throw sourceError('down', `HTTP ${res.status}`)
        if (res.status !== 200) throw sourceError('series', `HTTP ${res.status}`)
        const slim = slimJikanPage(res.body)
        for (const e of slim.episodes) {
          seen++
          if (e.n > count) count = e.n
          if (e.kind === 'filler') filler.push(e.n)
          else if (e.kind === 'recap') recap.push(e.n)
        }
        if (!slim.hasNext) break
      }
    } catch (err) {
      // Paused before the first page: nothing was asked, which is not the same as a failure.
      if (err?.kind === 'paused') return { id: q.id, outcome: p === 1 ? 'skipped' : 'failed' }
      if (err?.kind === 'down') q.downAt = now()
      console.warn(`fillerInfo: ${q.id} request failed`, err?.message)
      return { id: q.id, outcome: 'failed' }
    }
    if (seen === 0) return { id: q.id, outcome: 'missing' }
    return { id: q.id, outcome: 'data', filler: filler.sort(ascending), recap: recap.sort(ascending), count }
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

  const write = (id, data) => { writeJsonAtomic(file(id), data); parsed.delete(id) }

  const ttlFor = (rec, airing) => (rec.missing ? MISSING_TTL_MS : rec.partial === true ? PARTIAL_TTL_MS : airing ? AIRING_TTL_MS : TTL_MS)
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

  const sameMarks = (a, b) => a.count === b.count && a.filler.join() === b.filler.join() && a.recap.join() === b.recap.join()

  // Resolves true when the final write changed what the user last saw (the fast first write counts as seen).
  async function load(id, airing, onPartial) {
    const rec = readCache(id)
    if (rec && now() - rec.fetchedAt < ttlFor(rec, airing)) return false
    if (now() - (failedAt.get(id) ?? -Infinity) < RETRY_AFTER_MS) return false
    if (queues.every(isDown)) return false
    const existing = rec && !rec.missing
      ? { filler: numbers(rec.filler), recap: numbers(rec.recap), count: Number.isInteger(rec.count) ? rec.count : 0, sources: Array.isArray(rec.sources) ? rec.sources : [] }
      : null
    let fast = null // with nothing usable cached (and someone listening), the first source with data is written at once
    const results = await Promise.all(queues.map(async (q) => {
      const r = await fetchSource(q, id)
      if (!existing && !fast && typeof onPartial === 'function' && r.outcome === 'data') {
        fast = { filler: r.filler, recap: r.recap, count: r.count }
        write(id, { ...fast, fetchedAt: now(), sources: [r.id], partial: true })
        try { onPartial() } catch { /* a listener must not break the load */ }
      }
      return r
    }))
    const m = mergeSources(results, existing)
    if (m.kind === 'data') {
      write(id, { filler: m.filler, recap: m.recap, count: m.count, fetchedAt: now(), sources: m.sources, ...(m.partial ? { partial: true } : {}) })
      failedAt.delete(id)
      return fast ? !sameMarks(fast, m) : true
    }
    if (m.kind === 'missing') {
      write(id, { missing: true, fetchedAt: now() })
      failedAt.delete(id)
    } else if (m.markFailed) failedAt.set(id, now())
    return false
  }

  function ensure(malId, { airing = false, onPartial } = {}) {
    if (!validId(malId)) return Promise.resolve(false)
    if (!inflight.has(malId)) {
      inflight.set(malId, load(malId, airing, onPartial).catch(() => false).finally(() => inflight.delete(malId)))
    }
    return inflight.get(malId)
  }

  function forget() {
    parsed.clear()
    failedAt.clear()
    for (const q of queues) q.downAt = -Infinity
  }

  return { cached, ensure, forget }
}
