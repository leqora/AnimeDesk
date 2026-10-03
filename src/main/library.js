import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { STATUSES, normalizeTitle } from '../shared/domain.js'

export const MAX_PINNED = 5

const EDITABLE = ['title', 'aniCliTitle', 'aniListId', 'status', 'rating', 'comment', 'totalEpisodes', 'watchedEpisodes']

function uniqSorted(eps) {
  return [...new Set(eps.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
}

function validatePatch(patch) {
  const out = {}
  for (const k of EDITABLE) if (k in patch) out[k] = patch[k]
  if ('title' in out) {
    out.title = String(out.title ?? '').trim()
    if (!out.title) throw new Error('title required')
  }
  if ('status' in out && !STATUSES.includes(out.status)) throw new Error(`invalid status: ${out.status}`)
  if ('rating' in out && out.rating !== null && !(Number.isInteger(out.rating) && out.rating >= 1 && out.rating <= 10)) {
    throw new Error('rating must be an integer 1-10 or null')
  }
  if ('totalEpisodes' in out && out.totalEpisodes !== null && !(Number.isInteger(out.totalEpisodes) && out.totalEpisodes > 0)) {
    throw new Error('totalEpisodes must be a positive integer or null')
  }
  if ('comment' in out) out.comment = String(out.comment ?? '')
  if ('watchedEpisodes' in out) out.watchedEpisodes = uniqSorted(out.watchedEpisodes)
  return out
}

export function createLibrary(file, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  const loaded = readJson(file, { version: 1, anime: {} })
  const db = loaded.data
  const save = () => writeJsonAtomic(file, db)
  const copy = (e) => (e ? structuredClone(e) : null)
  const key = (t) => normalizeTitle(t).toLowerCase()

  function findRaw(title) {
    const k = key(title)
    return Object.values(db.anime).find((e) => key(e.aniCliTitle ?? e.title) === k) ?? null
  }

  function mustGet(id) {
    const e = db.anime[id]
    if (!e) throw new Error(`unknown anime id: ${id}`)
    return e
  }

  function add({ title, aniCliTitle = null, aniListId = null, status = 'planned', totalEpisodes = null }) {
    const ts = now()
    const entry = {
      id: uuid(), title: '', aniCliTitle, aniListId, status, rating: null, comment: '',
      totalEpisodes, watchedEpisodes: [], episodeNotes: {}, addedAt: ts, updatedAt: ts, lastWatchedAt: null, pinnedAt: null,
    }
    Object.assign(entry, validatePatch({ title, status, totalEpisodes }))
    db.anime[entry.id] = entry
    save()
    return copy(entry)
  }

  function update(id, patch) {
    const e = mustGet(id)
    Object.assign(e, validatePatch(patch), { updatedAt: now() })
    save()
    return copy(e)
  }

  function remove(id) {
    if (!db.anime[id]) return false
    delete db.anime[id]
    save()
    return true
  }

  function setEpisodeNote(id, episode, text) {
    const e = mustGet(id)
    const k = String(Number(episode))
    const t = String(text ?? '').trim()
    if (t) e.episodeNotes[k] = t
    else delete e.episodeNotes[k]
    e.updatedAt = now()
    save()
    return copy(e)
  }

  function recordWatched({ aniCliTitle, title, episode, totalEpisodes = null }) {
    const ep = Number(episode)
    let e = findRaw(aniCliTitle)
    if (!e) {
      const clean = normalizeTitle(aniCliTitle)
      e = db.anime[add({ title: title ?? clean, aniCliTitle: clean, status: 'watching' }).id]
    }
    if (e.totalEpisodes == null && Number.isInteger(totalEpisodes) && totalEpisodes > 0) e.totalEpisodes = totalEpisodes
    e.watchedEpisodes = uniqSorted([...e.watchedEpisodes, ep])
    if (e.status !== 'completed') e.status = 'watching'
    if (e.totalEpisodes != null && ep >= e.totalEpisodes) e.status = 'completed'
    e.lastWatchedAt = e.updatedAt = now()
    save()
    return copy(e)
  }

  function setPinned(id, pinned) {
    const e = mustGet(id)
    if (!pinned) e.pinnedAt = null
    else if (!e.pinnedAt) {
      const others = Object.values(db.anime).filter((x) => x.pinnedAt && x.id !== id).length
      if (others >= MAX_PINNED) throw new Error('pin-limit')
      e.pinnedAt = now()
    }
    save()
    return copy(e)
  }

  return {
    wasCorrupt: loaded.corrupt,
    list: () => Object.values(db.anime).map(copy),
    get: (id) => copy(db.anime[id]),
    findByAniCliTitle: (title) => copy(findRaw(title)),
    add, update, remove, setEpisodeNote, recordWatched, setPinned,
  }
}
