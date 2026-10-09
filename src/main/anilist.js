import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

const ENDPOINT = 'https://graphql.anilist.co'
const FIELDS = 'id idMal status title { romaji english native } coverImage { large } genres seasonYear episodes duration description(asHtml: false)'
const SEARCH = `query ($search: String) { Page(perPage: 10) { media(search: $search, type: ANIME) { ${FIELDS} } } }`
const BY_ID = `query ($id: Int) { Media(id: $id, type: ANIME) { ${FIELDS} } }`

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
    poster: null,
  }
}

// Airing shows gain episodes (and a final count), so their cache entry expires; finished ones never change.
const AIRING_TTL_MS = 24 * 3600 * 1000
const AIRING = new Set(['RELEASING', 'NOT_YET_RELEASED'])
const isFresh = (info, nowMs) =>
  'malId' in info && info.fetchedAt != null && (!AIRING.has(info.status) || nowMs - info.fetchedAt < AIRING_TTL_MS)

const MAX_ATTEMPTS = 3
const MAX_WAIT_MS = 65_000
const NOT_FOUND_TTL_MS = 7 * 24 * 3600 * 1000
// Stored with every "not found" entry. Bump it whenever searchCandidates/bestMatch change, so misses
// remembered by older logic are retried right after an update instead of waiting out the 7 days.
export const SEARCH_VERSION = 2

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createAniList({ cacheDir, fetchImpl = fetch, sleep = realSleep, now = Date.now }) {
  // AniList allows ~30 requests a minute; a search result grid asks for 25+ posters at once.
  // Requests go through one queue, and a 429 or an exhausted budget pauses the whole queue.
  let queue = Promise.resolve()
  const enqueue = (task) => {
    const run = queue.then(task)
    queue = run.catch(() => {})
    return run
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

  function gql(query, variables) {
    return enqueue(async () => {
      for (let attempt = 1; ; attempt++) {
        const res = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
        })
        if (res.status === 429 && attempt < MAX_ATTEMPTS) {
          await sleep(retryWait(res))
          continue
        }
        if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
        const data = (await res.json()).data
        if (res.headers.get('X-RateLimit-Remaining') === '0') await sleep(resetWait(res))
        return data
      }
    })
  }

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

  const refreshed = new Set()

  async function getForTitle(title, { aniListId = null } = {}) {
    const file = cacheFile(cacheKey(title, aniListId))
    const cached = readJson(file, null).data
    if (cached?.notFound) {
      if (cached.searchVersion === SEARCH_VERSION && now() - cached.at < NOT_FOUND_TTL_MS) return null
    } else if (cached && isFresh(cached, now())) return cached
    // Expired, or saved before malId/status existed: refresh it once per run, but never lose it if the refresh fails.
    const stale = cached && !cached.notFound ? cached : null
    const fallback = () => (stale ? { malId: null, ...stale } : null)
    if (stale) {
      if (refreshed.has(file)) return fallback()
      refreshed.add(file)
    }
    try {
      let m
      if (aniListId) m = (await gql(BY_ID, { id: aniListId })).Media
      else {
        const found = await findByTitle(title)
        m = found.m
        if (!m && found.complete && !stale) writeJsonAtomic(file, { notFound: true, at: now(), searchVersion: SEARCH_VERSION })
      }
      if (!m) return fallback()
      const info = { ...toInfo(m), fetchedAt: now() }
      info.poster = stale?.poster && stale.coverUrl === info.coverUrl
        ? stale.poster
        : await posterDataUrl(info.coverUrl).catch(() => null)
      writeJsonAtomic(file, info)
      return info
    } catch {
      return fallback()
    }
  }

  return { search, getForTitle, getCached }
}
