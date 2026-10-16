// Pure helpers for the toast queue: a plain array, oldest first.
export const MAX_VISIBLE = 3
export const DEFAULT_MS = 3000
export const ACTION_MS = 6000

export const add = (queue, toast) => [...queue, toast]
export const remove = (queue, id) => queue.filter((x) => x.id !== id)
export const visible = (queue) => queue.slice(0, MAX_VISIBLE)
