import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { AIRED_GRACE_MS } from '../shared/airing.js'
import { sequelsFromMedia } from '../shared/sequels.js'
import { SEARCH, AIRING_BATCH, RELATIONS_BATCH, VIEWER, LIST_ENTRY, SAVE_PROGRESS, CANDIDATES } from './anilistQueries.js'
import { createAniListBatcher } from './anilistBatch.js'
import { MATCH_VERSION, searchQueries, pickMatch, isExactName } from '../shared/titleMatch.js'

const ENDPOINT = 'https://graphql.anilist.co'
const AIRING_CHUNK = 50
const CANDIDATE_LIMIT = 8

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export function cleanDescription(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Only the episode number and air time (AniList gives seconds) — fail closed on anything odd.
export function toNextAiring(raw) {
  const episode = raw?.episode
  const at = raw?.airingAt
  if (!Number.isInteger(episode) || episode < 1 || typeof at !== 'number' || !Number.isFinite(at)) return null
  return { episode, airingAt: at * 1000 }
}

function toInfo(m) {
  return {
    id: m.id,
    malId: m.idMal ?? null,
    title: m.title.english ?? m.title.romaji,
    romaji: m.title.romaji,
    genres: m.genres ?? [],
    year: m.seasonYear ?? null,
    episodes: m.episodes ?? null,
    duration: m.duration ?? null,
    description: cleanDescription(m.description),
    coverUrl: m.coverImage?.large ?? null,
    status: m.status ?? null,
    nextAiring: toNextAiring(m.nextAiringEpisode),
    poster: null,
  }
}

// Airing shows gain episodes (and a final count), so their cache entry expires; finished ones never change.
const RETRY_AFTER_FAIL_MS = 3600 * 1000
const AIRING_TTL_MS = 24 * 3600 * 1000
const AIRING = new Set(['RELEASING', 'NOT_YET_RELEASED'])
// Airing shows expire after a day, when their next episode aired after the entry was fetched, or when the entry predates
// nextAiring. An airingAt already past at fetch time (lagging schedule) falls back to the TTL, so it cannot refetch in a loop.
export function isFresh(info, nowMs) {
  if (!('malId' in info) || info.fetchedAt == null) return false
  if (!AIRING.has(info.status)) return true
  if (!('nextAiring' in info)) return false
  const airedBy = info.nextAiring ? info.nextAiring.airingAt + AIRED_GRACE_MS : null
  if (airedBy != null && info.fetchedAt < airedBy && nowMs >= airedBy) return false
  return nowMs - info.fetchedAt < AIRING_TTL_MS
}

const MAX_ATTEMPTS = 3
const MAX_WAIT_MS = 65_000
const NOTIFY_MIN_WAIT_MS = 3000
const NOTIFY_EVERY_MS = 30_000
const NOT_FOUND_TTL_MS = 7 * 24 * 3600 * 1000
// Stored with every "not found" entry and every title-keyed hit. It is MATCH_VERSION, so it changes whenever titleMatch
// changes: misses and hits remembered by older matching logic are rechecked right after an update.
export const SEARCH_VERSION = MATCH_VERSION

export class AniListAuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AniListAuthError'
  }
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createAniList({
  cacheDir,
  fetchImpl = fetch,
  sleep = realSleep,
  now = Date.now,
  onRateLimited = null,
  batchWindowMs = 40,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  // AniList allows ~30 requests a minute; a search result grid asks for 25+ posters at once.
  // Requests go through one queue; a 429 pauses the request itself, an exhausted budget pauses the queue.
  let queue = Promise.resolve()
  // Gate every task reads when it STARTS, so a pause also holds tasks that were already queued behind the one that
  // saw the exhausted budget. A new pause combines with an active one (waits for the longer, never stacks).
  let pause = Promise.resolve()
  const enqueue = (task) => {
    const run = queue.then(() => pause).then(task)
    queue = run.catch(() => {})
    return run
  }
  // Called from inside the running task: the result returns at once, the NEXT tasks wait. A failed sleep never
  // rejects the gate, so it cannot leave the queue rejected.
  const pauseQueue = (ms) => {
    notifyRateLimited(ms)
    pause = Promise.all([pause, Promise.resolve().then(() => sleep(ms))]).catch(() => {})
  }

  const clampWait = (ms) => Math.min(MAX_WAIT_MS, Math.max(1000, ms))
  const resetWait = (res) => {
    const reset = Number(res.headers.get('X-RateLimit-Reset'))
    return Number.isFinite(reset) && reset > 0 ? clampWait(reset * 1000 - now()) : MAX_WAIT_MS
  }
  const retryWait = (res) => {
    const after = Number(res.headers.get('Retry-After'))
    return Number.isFinite(after) && after > 0 ? clampWait(after * 1000) : resetWait(res)
  }

  // Tells the UI about a noticeable pause, at most once per NOTIFY_EVERY_MS.
  let lastNotified = null
  function notifyRateLimited(waitMs) {
    if (!onRateLimited || waitMs < NOTIFY_MIN_WAIT_MS) return
    const t = now()
    if (lastNotified != null && t - lastNotified < NOTIFY_EVERY_MS) return
    lastNotified = t
    try {
      onRateLimited({ waitMs, until: t + waitMs })
    } catch { /* a broken listener must not break requests */ }
  }

  const httpError = (status) => Object.assign(new Error(`AniList HTTP ${status}`), { status })
  const graphqlError = (message) => Object.assign(new Error(message), { graphql: true })

  // One HTTP request (429 is retried after its wait), no queue. Error messages never carry the token or the request body.
  async function request(query, variables, { token } = {}) {
    for (let attempt = 1; ; attempt++) {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetchImpl(ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ query, variables }) })
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const wait = retryWait(res)
        notifyRateLimited(wait)
        await sleep(wait)
        continue
      }
      const body = await res.json().catch(() => null)
      const errors = Array.isArray(body?.errors) ? body.errors : []
      if (res.status === 401 || errors.some((e) => e?.status === 401 || /invalid token/i.test(String(e?.message ?? '')))) {
        throw new AniListAuthError(`AniList rejected the login (HTTP ${res.status})`)
      }
      if (!res.ok) throw httpError(res.status)
      if (body?.data == null) throw graphqlError(errors.length ? 'AniList returned a GraphQL error' : 'AniList returned no data')
      if (res.headers.get('X-RateLimit-Remaining') === '0') pauseQueue(resetWait(res))
      return body.data
    }
  }

  const gql = (query, variables, opts) => enqueue(() => request(query, variables, opts))

  // Title and id lookups made within a short window go out together (id_in / aliased searches).
  const batcher = createAniListBatcher({ enqueue, request, setTimeoutFn, clearTimeoutFn, windowMs: batchWindowMs, waitGate: () => pause })

  async function posterDataUrl(url) {
    if (!url) return null
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  }

  const cacheFile = (key) => path.join(cacheDir, `${crypto.createHash('sha1').update(key).digest('hex')}.json`)

  const cacheKey = (title, aniListId) => (aniListId ? `id:${aniListId}` : `t:${norm(title)}`)

  // Synchronous, offline: used by the profile statistics so opening it never hits the network.
  function getCached(title, { aniListId = null } = {}) {
    try {
      const data = readJson(cacheFile(cacheKey(title, aniListId)), null).data
      return data?.notFound ? null : data
    } catch {
      return null
    }
  }

  async function search(title) {
    const data = await gql(SEARCH, { search: title })
    return data.Page.media.map(toInfo)
  }

  // `complete` is true only when every query got an answer, so a miss caused by errors is never remembered.
  async function findByTitle(title) {
    let complete = true
    for (const query of searchQueries(title)) {
      try {
        const hit = pickMatch(title, await batcher.search(query))
        if (hit) return { m: hit.media, match: hit.match, complete }
      } catch (err) {
        complete = false // one failing query (network, server error) should not stop the next one
        if (err?.status === 429) break // rate-limited for good: more candidates would only add load
      }
    }
    return { m: null, match: null, complete }
  }

  const refreshAttemptAt = new Map() // file -> start of the in-progress refresh, then the moment of its failure
  const inflight = new Map() // file -> Promise of the lookup currently running

  async function getForTitle(title, { aniListId = null } = {}) {
    const file = cacheFile(cacheKey(title, aniListId))
    let cached = readJson(file, null).data
    // A title-keyed hit made by older matching logic (no/other matchVersion) may be the wrong series: it is rechecked.
    let oldMatch = false
    if (cached?.notFound) {
      if (cached.searchVersion === SEARCH_VERSION && now() - cached.at < NOT_FOUND_TTL_MS) return null
    } else if (cached) {
      oldMatch = !aniListId && cached.matchVersion !== SEARCH_VERSION
      // Offline upgrade: an old hit whose names equal the title is certainly right, so no request is needed.
      if (oldMatch && (isExactName(title, cached.title) || isExactName(title, cached.romaji))) {
        cached = { ...cached, match: 'exact', matchVersion: SEARCH_VERSION }
        try { writeJsonAtomic(file, cached) } catch { /* keep serving the upgraded entry from memory; the next call retries the write */ }
        oldMatch = false
      }
      if (!oldMatch && isFresh(cached, now())) return cached
    }
    // Expired, or saved before malId/status/nextAiring existed: refresh it (a failed refresh is retried only after RETRY_AFTER_FAIL_MS), but never lose it.
    const stale = cached && !cached.notFound ? cached : null
    const fallback = () => (stale ? { malId: null, ...stale } : null)
    if (stale) {
      const attemptedAt = refreshAttemptAt.get(file)
      if (attemptedAt != null && now() - attemptedAt < RETRY_AFTER_FAIL_MS) {
        // An old (possibly wrong) hit is never handed out while its recheck is still running: join that lookup instead.
        if (oldMatch && inflight.has(file)) return inflight.get(file)
        return fallback()
      }
      refreshAttemptAt.set(file, now()) // set before the first await so concurrent calls are deduped
    }
    // Share one lookup per cache file; the retry pause is measured from the moment of failure, not from the start.
    const pending = inflight.get(file)
    if (pending) return pending
    const failed = () => {
      if (stale) refreshAttemptAt.set(file, now())
      return fallback()
    }
    const run = (async () => {
      try {
        let m
        let found = null
        if (aniListId) m = await batcher.byId(aniListId)
        else {
          found = await findByTitle(title)
          m = found.m
          if (!m && found.complete && (!stale || oldMatch)) writeJsonAtomic(file, { notFound: true, at: now(), searchVersion: SEARCH_VERSION })
        }
        if (!m) {
          // A complete search that finds nothing replaces an old (probably wrong) hit; never hand it back.
          if (oldMatch && found?.complete) {
            refreshAttemptAt.delete(file)
            return null
          }
          return failed()
        }
        const info = { ...toInfo(m), ...(found ? { match: found.match, matchVersion: SEARCH_VERSION } : { match: 'id' }), fetchedAt: now() }
        info.poster = stale?.poster && stale.coverUrl === info.coverUrl
          ? stale.poster
          : await posterDataUrl(info.coverUrl).catch(() => null)
        writeJsonAtomic(file, info)
        refreshAttemptAt.delete(file) // the guard is for failures; a later expiry may refresh again
        return info
      } catch {
        return failed()
      } finally {
        inflight.delete(file)
      }
    })()
    inflight.set(file, run)
    return run
  }

  // One batched query per 50 ids. Returns every series AniList answered for; those with a cache entry also get it updated
  // (read -> merge -> write in one synchronous step, so poster etc. are kept). A failed chunk rejects the whole call.
  async function refreshAiring(ids) {
    const result = new Map()
    const unique = [...new Set(ids)]
    for (let i = 0; i < unique.length; i += AIRING_CHUNK) {
      const data = await gql(AIRING_BATCH, { ids: unique.slice(i, i + AIRING_CHUNK), page: 1 })
      for (const m of data.Page.media) {
        const entry = { status: m.status ?? null, episodes: m.episodes ?? null, nextAiring: toNextAiring(m.nextAiringEpisode) }
        result.set(m.id, entry)
        const file = cacheFile(cacheKey(null, m.id))
        const cached = readJson(file, null).data
        // a null count from AniList must not wipe a count we already know
        if (cached && !cached.notFound) writeJsonAtomic(file, { ...cached, ...entry, episodes: m.episodes ?? cached.episodes ?? null, fetchedAt: now() })
      }
    }
    return result
  }

  async function viewer(token) {
    const v = (await gql(VIEWER, {}, { token })).Viewer
    return { id: v.id, name: v.name }
  }

  async function listEntry(mediaId, token) {
    const m = (await gql(LIST_ENTRY, { id: mediaId }, { token })).Media
    const e = m?.mediaListEntry
    return { episodes: m?.episodes ?? null, entry: e ? { progress: e.progress, status: e.status } : null }
  }

  async function saveProgress(mediaId, { progress, status }, token) {
    const variables = { id: mediaId, progress }
    if (status !== undefined) variables.status = status
    const r = (await gql(SAVE_PROGRESS, variables, { token })).SaveMediaListEntry
    return { progress: r.progress, status: r.status }
  }

  // Candidates for the manual "link to AniList" picker: no description (no spoilers), posters best-effort.
  async function candidates(searchText) {
    const media = (await gql(CANDIDATES, { search: searchText })).Page.media.slice(0, CANDIDATE_LIMIT)
    return Promise.all(media.map(async (m) => ({
      id: m.id,
      title: m.title.english ?? m.title.romaji,
      romaji: m.title.romaji,
      year: m.seasonYear ?? null,
      format: m.format ?? null,
      episodes: m.episodes ?? null,
      poster: await posterDataUrl(m.coverImage?.large).catch(() => null),
    })))
  }

  // One batched query per 50 unique ids; never touches the cache dir. Every answered id is a key (empty array = no sequel).
  // A failed chunk rejects the whole call.
  async function relations(ids) {
    const result = new Map()
    const unique = [...new Set(ids)]
    for (let i = 0; i < unique.length; i += AIRING_CHUNK) {
      const data = await gql(RELATIONS_BATCH, { ids: unique.slice(i, i + AIRING_CHUNK), page: 1 })
      for (const m of data?.Page?.media ?? []) result.set(m.id, sequelsFromMedia(m))
    }
    return result
  }

  const poster = (url) => posterDataUrl(url).catch(() => null)

  return { search, getForTitle, getCached, refreshAiring, relations, poster, viewer, listEntry, saveProgress, candidates }
}
