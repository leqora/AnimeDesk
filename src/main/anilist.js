import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { AIRED_GRACE_MS } from '../shared/airing.js'
import { sequelsFromMedia } from '../shared/sequels.js'
import { SEARCH, AIRING_BATCH, RELATIONS_BATCH, VIEWER, LIST_ENTRY, SAVE_PROGRESS, CANDIDATES, BY_ID } from './anilistQueries.js'

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

export function bestMatch(title, results) {
  const n = norm(title)
  return results.find((r) => [r.title.romaji, r.title.english, r.title.native].some((t) => t && norm(t) === n)) ?? results[0] ?? null
}

// ani-cli titles often differ from AniList's ("Naruto: Shippuuden Movie 6: Road to Ninja"), and AniList
// returns nothing for the full string. Retry with the subtitle (after the last ":" or " - "), then with the part before it — never with
// a single word, which would match the wrong show (a wrong poster is worse than none). Last resort: the
// title without "Movie N" / "OVA N" and punctuation ("Naruto: Shippuden the Movie 2 -Bonds-" → "Naruto Shippuden Bonds").
export function searchCandidates(title) {
  const full = String(title ?? '').trim()
  const seps = [...full.matchAll(/:|\s-\s/g)]
  const last = seps.at(-1)
  const words = (s) => s.split(/\s+/).filter(Boolean).length
  const out = [full]
  if (last && last.index > 0) {
    for (const part of [full.slice(last.index + last[0].length).trim(), full.slice(0, last.index).trim()]) {
      if (words(part) >= 2 && !out.includes(part)) out.push(part)
    }
  }
  const cleaned = full
    .replace(/\b(?:the\s+)?movie\s*\d*\b|\bova\s*\d*\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (words(cleaned) >= 2 && cleaned !== full && !out.includes(cleaned)) out.push(cleaned)
  return out
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
// Stored with every "not found" entry. Bump it whenever searchCandidates/bestMatch change, so misses
// remembered by older logic are retried right after an update instead of waiting out the 7 days.
export const SEARCH_VERSION = 2

export class AniListAuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AniListAuthError'
  }
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createAniList({ cacheDir, fetchImpl = fetch, sleep = realSleep, now = Date.now, onRateLimited = null }) {
  // AniList allows ~30 requests a minute; a search result grid asks for 25+ posters at once.
  // Requests go through one queue; a 429 pauses the request itself, an exhausted budget pauses the queue.
  let queue = Promise.resolve()
  const enqueue = (task) => {
    const run = queue.then(task)
    queue = run.catch(() => {})
    return run
  }
  // Called from inside the running task: the result returns at once, the NEXT task waits. A failed sleep must not
  // leave the queue rejected.
  const pauseQueue = (ms) => {
    notifyRateLimited(ms)
    queue = queue.then(() => sleep(ms)).catch(() => {})
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
    for (const query of searchCandidates(title)) {
      try {
        const m = bestMatch(title, (await gql(SEARCH, { search: query })).Page.media)
        if (m) return { m, complete }
      } catch {
        complete = false // one failing query (rate limit, network) should not stop the next one
      }
    }
    return { m: null, complete }
  }

  const refreshAttemptAt = new Map() // file -> start of the in-progress refresh, then the moment of its failure
  const inflight = new Map() // file -> Promise of the lookup currently running

  async function getForTitle(title, { aniListId = null } = {}) {
    const file = cacheFile(cacheKey(title, aniListId))
    const cached = readJson(file, null).data
    if (cached?.notFound) {
      if (cached.searchVersion === SEARCH_VERSION && now() - cached.at < NOT_FOUND_TTL_MS) return null
    } else if (cached && isFresh(cached, now())) return cached
    // Expired, or saved before malId/status/nextAiring existed: refresh it (a failed refresh is retried only after RETRY_AFTER_FAIL_MS), but never lose it.
    const stale = cached && !cached.notFound ? cached : null
    const fallback = () => (stale ? { malId: null, ...stale } : null)
    if (stale) {
      const attemptedAt = refreshAttemptAt.get(file)
      if (attemptedAt != null && now() - attemptedAt < RETRY_AFTER_FAIL_MS) return fallback()
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
        if (aniListId) m = (await gql(BY_ID, { id: aniListId })).Media
        else {
          const found = await findByTitle(title)
          m = found.m
          if (!m && found.complete && !stale) writeJsonAtomic(file, { notFound: true, at: now(), searchVersion: SEARCH_VERSION })
        }
        if (!m) return failed()
        const info = { ...toInfo(m), fetchedAt: now() }
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
