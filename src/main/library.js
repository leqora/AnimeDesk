import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { STATUSES, normalizeTitle } from '../shared/domain.js'

export const MAX_PINNED = 5

const EDITABLE = ['title', 'aniCliTitle', 'aniListId', 'status', 'rating', 'comment', 'totalEpisodes', 'watchedEpisodes']

function uniqSorted(eps) {
  return [...new Set(eps.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
}

// Every regular episode 1..total is watched; specials such as 12.5 are not required.
function watchedAll(e) {
  if (e.totalEpisodes == null) return false
  const watched = new Set(e.watchedEpisodes.filter(Number.isInteger))
  for (let n = 1; n <= e.totalEpisodes; n++) if (!watched.has(n)) return false
  return true
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

const isIso = (v) => typeof v === 'string' && v !== '' && Number.isFinite(Date.parse(v))
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Titles end up in ani-cli arguments and the UI: no control characters, bounded length.
const MAX_TITLE = 300
const cleanTitle = (v) => [...String(v ?? '')].filter((ch) => { const n = ch.charCodeAt(0); return n > 31 && n !== 127 }).join('').trim().slice(0, MAX_TITLE).trim()

// Validates one imported entry; throws when it is unusable. Unknown fields are dropped.
export function sanitizeEntry(raw, { now }) {
  if (!isPlainObject(raw)) throw new Error('entry must be an object')
  if (typeof raw.id !== 'string' || !raw.id) throw new Error('id required')
  const clean = validatePatch({
    title: cleanTitle(raw.title),
    status: raw.status,
    rating: raw.rating ?? null,
    totalEpisodes: raw.totalEpisodes ?? null,
    comment: raw.comment ?? '',
    watchedEpisodes: raw.watchedEpisodes ?? [],
  })
  const notes = {}
  if (isPlainObject(raw.episodeNotes)) {
    for (const [k, v] of Object.entries(raw.episodeNotes)) {
      if (Number.isFinite(Number(k)) && k.trim() !== '' && typeof v === 'string' && v !== '') notes[k] = v
    }
  }
  const ts = now()
  return {
    id: raw.id,
    title: clean.title,
    aniCliTitle: typeof raw.aniCliTitle === 'string' ? cleanTitle(raw.aniCliTitle) || null : null,
    aniListId: Number.isInteger(raw.aniListId) && raw.aniListId > 0 ? raw.aniListId : null,
    aniListConfirmed: raw.aniListConfirmed === true,
    status: clean.status,
    rating: clean.rating,
    comment: clean.comment,
    totalEpisodes: clean.totalEpisodes,
    watchedEpisodes: clean.watchedEpisodes,
    episodeNotes: notes,
    addedAt: isIso(raw.addedAt) ? raw.addedAt : ts,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : ts,
    lastWatchedAt: isIso(raw.lastWatchedAt) ? raw.lastWatchedAt : null,
    pinnedAt: isIso(raw.pinnedAt) ? raw.pinnedAt : null,
  }
}

// Validates an imported library: bad entries are skipped, then duplicates, shared AniList ids and extra pins are fixed.
export function sanitizeLibrary(raw, { now }) {
  const anime = {}
  let accepted = 0
  let skipped = 0
  const seenTitles = new Set()
  const confirmedIds = new Set()
  const src = isPlainObject(raw) && isPlainObject(raw.anime) ? raw.anime : {}
  for (const [k, value] of Object.entries(src)) {
    let entry
    try {
      entry = sanitizeEntry(value, { now })
      if (entry.id !== k) throw new Error('key must equal id')
    } catch {
      skipped++
      continue
    }
    const titleKey = normalizeTitle(entry.aniCliTitle ?? entry.title).toLowerCase()
    if (seenTitles.has(titleKey)) {
      skipped++
      continue
    }
    seenTitles.add(titleKey)
    if (entry.aniListConfirmed && entry.aniListId !== null) {
      if (confirmedIds.has(entry.aniListId)) entry.aniListConfirmed = false
      else confirmedIds.add(entry.aniListId)
    } else if (entry.aniListConfirmed) {
      entry.aniListConfirmed = false
    }
    anime[k] = entry
    accepted++
  }
  const pinned = Object.values(anime).filter((e) => e.pinnedAt).sort((a, b) => Date.parse(a.pinnedAt) - Date.parse(b.pinnedAt))
  for (const e of pinned.slice(MAX_PINNED)) e.pinnedAt = null
  return { db: { version: 1, anime }, accepted, skipped }
}

export function createLibrary(file, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  const loaded = readJson(file, { version: 1, anime: {} })
  let db = loaded.data
  const save = () => writeJsonAtomic(file, db)
  const copy = (e) => (e ? { ...structuredClone(e), aniListConfirmed: e.aniListConfirmed === true } : null)
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
      id: uuid(), title: '', aniCliTitle, aniListId, aniListConfirmed: false, status, rating: null, comment: '',
      totalEpisodes, watchedEpisodes: [], episodeNotes: {}, addedAt: ts, updatedAt: ts, lastWatchedAt: null, pinnedAt: null,
    }
    Object.assign(entry, validatePatch({ title, status, totalEpisodes }))
    db.anime[entry.id] = entry
    save()
    return copy(entry)
  }

  function update(id, patch) {
    const e = mustGet(id)
    const clean = validatePatch(patch)
    // A different AniList id is an unconfirmed match until the user confirms it again.
    if ('aniListId' in clean && clean.aniListId !== e.aniListId) e.aniListConfirmed = false
    Object.assign(e, clean, { updatedAt: now() })
    save()
    return copy(e)
  }

  // The user confirmed that this entry is AniList media `mediaId`. One media id belongs to one entry.
  function confirmAniList(id, mediaId) {
    const e = mustGet(id)
    if (!Number.isInteger(mediaId) || mediaId <= 0) throw new Error('invalid aniListId')
    const other = Object.values(db.anime).find((x) => x.id !== id && x.aniListConfirmed === true && x.aniListId === mediaId)
    if (other) return { ok: false, error: 'taken', title: other.title }
    e.aniListId = mediaId
    e.aniListConfirmed = true
    e.updatedAt = now()
    save()
    return { ok: true, entry: copy(e) }
  }

  function findConfirmed(mediaId) {
    return copy(Object.values(db.anime).find((x) => x.aniListConfirmed === true && x.aniListId === mediaId) ?? null)
  }

  function remove(id) {
    if (!db.anime[id]) return false
    delete db.anime[id]
    save()
    return true
  }

  // Put a previously removed entry back as-is (same id and fields); used by the undo flow.
  function restore(entry) {
    if (db.anime[entry.id] || findRaw(entry.aniCliTitle ?? entry.title)) throw new Error('conflict')
    const e = structuredClone(entry)
    // Another entry may have confirmed the same media id while this one was removed.
    if (e.aniListConfirmed === true && Object.values(db.anime).some((x) => x.aniListConfirmed === true && x.aniListId === e.aniListId)) {
      e.aniListConfirmed = false
    }
    if (e.pinnedAt) {
      const pinned = Object.values(db.anime).filter((x) => x.pinnedAt).length
      if (pinned >= MAX_PINNED) e.pinnedAt = null
    }
    db.anime[e.id] = e
    save()
    return copy(e)
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
    if (watchedAll(e)) e.status = 'completed'
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
    add, update, confirmAniList, findConfirmed, remove, restore, setEpisodeNote, recordWatched, setPinned,
    snapshot: () => ({ version: 1, anime: structuredClone(db.anime) }),
    // `next` is already sanitized; written first so a failed write leaves the current data untouched.
    replaceAll(next) {
      const fresh = { version: 1, anime: structuredClone(next.anime) }
      writeJsonAtomic(file, fresh)
      db = fresh
    },
  }
}
