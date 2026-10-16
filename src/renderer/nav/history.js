// Pure, immutable navigation history: a list of entries (route + scroll + per-entry state) and a cursor.
export const MAX_ENTRIES = 50

const entryFor = (route) => ({ route, scroll: 0, state: {} })

export const sameRoute = (a, b) => a.page === b.page && (a.animeId ?? null) === (b.animeId ?? null)

export const createHistory = (route) => ({ entries: [entryFor(route)], index: 0 })
export const current = (h) => h.entries[h.index]
export const canBack = (h) => h.index > 0
export const canForward = (h) => h.index < h.entries.length - 1

export function push(h, route) {
  if (sameRoute(current(h).route, route)) return h
  let entries = [...h.entries.slice(0, h.index + 1), entryFor(route)]
  if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES)
  return { entries, index: entries.length - 1 }
}

const patchCurrent = (h, patch) => ({ ...h, entries: h.entries.map((e, i) => (i === h.index ? { ...e, ...patch } : e)) })

export const replace = (h, route) => patchCurrent(h, { route, scroll: 0, state: {} })
export const back = (h) => (canBack(h) ? { ...h, index: h.index - 1 } : h)
export const forward = (h) => (canForward(h) ? { ...h, index: h.index + 1 } : h)
export const setScroll = (h, y) => patchCurrent(h, { scroll: y })
export const setState = (h, key, value) => patchCurrent(h, { state: { ...current(h).state, [key]: value } })
