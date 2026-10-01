import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

const ENDPOINT = 'https://graphql.anilist.co'
const FIELDS = 'id title { romaji english native } coverImage { large } genres seasonYear episodes duration description(asHtml: false)'
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

function toInfo(m) {
  return {
    id: m.id,
    title: m.title.english ?? m.title.romaji,
    romaji: m.title.romaji,
    genres: m.genres ?? [],
    year: m.seasonYear ?? null,
    episodes: m.episodes ?? null,
    duration: m.duration ?? null,
    description: cleanDescription(m.description),
    coverUrl: m.coverImage?.large ?? null,
    poster: null,
  }
}

export function createAniList({ cacheDir, fetchImpl = fetch }) {
  async function gql(query, variables) {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
    return (await res.json()).data
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
    return readJson(cacheFile(cacheKey(title, aniListId)), null).data
  }

  async function search(title) {
    const data = await gql(SEARCH, { search: title })
    return data.Page.media.map(toInfo)
  }

  async function getForTitle(title, { aniListId = null } = {}) {
    const file = cacheFile(cacheKey(title, aniListId))
    const cached = readJson(file, null).data
    if (cached) return cached
    try {
      let m
      if (aniListId) m = (await gql(BY_ID, { id: aniListId })).Media
      else m = bestMatch(title, (await gql(SEARCH, { search: title })).Page.media)
      if (!m) return null
      const info = toInfo(m)
      info.poster = await posterDataUrl(info.coverUrl).catch(() => null)
      writeJsonAtomic(file, info)
      return info
    } catch {
      return null
    }
  }

  return { search, getForTitle, getCached }
}
