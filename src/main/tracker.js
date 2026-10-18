// Every watchlist change that affects XP goes through here, so the watch log and level stay in sync.
export const TRASH_TTL_MS = 10 * 60 * 1000
export const TRASH_MAX = 20

export function createTracker({ library, watchLog, progress, now = Date.now }) {
  // In-memory only: removed series that can still be restored (id -> { entry, log, at }).
  const trash = new Map()
  const newlyCompleted = (before, after) => (after.status === 'completed' && before?.status !== 'completed' ? after.title : null)

  function recordWatched(payload, source = 'auto') {
    const before = library.findByAniCliTitle(payload.aniCliTitle)
    const ep = Number(payload.episode)
    const entry = library.recordWatched(payload)
    if (!before?.watchedEpisodes.includes(ep)) watchLog.append({ animeId: entry.id, episode: ep, source })
    progress.check({ completedTitle: newlyCompleted(before, entry) })
    return entry
  }

  function update(id, patch) {
    const before = library.get(id)
    const entry = library.update(id, patch)
    if ('watchedEpisodes' in patch && before) {
      for (const ep of entry.watchedEpisodes) if (!before.watchedEpisodes.includes(ep)) watchLog.append({ animeId: id, episode: ep, source: 'manual' })
      for (const ep of before.watchedEpisodes) if (!entry.watchedEpisodes.includes(ep)) watchLog.removeLatest(id, ep)
    }
    progress.check({ completedTitle: newlyCompleted(before, entry) })
    return entry
  }

  function remove(id) {
    const entry = library.get(id)
    const log = watchLog.list().filter((e) => e.animeId === id)
    const removed = library.remove(id)
    if (removed) {
      watchLog.removeAnime(id)
      trash.delete(id)
      trash.set(id, { entry, log, at: now() })
      while (trash.size > TRASH_MAX) trash.delete(trash.keys().next().value)
      progress.check()
    }
    return removed
  }

  function restore(id) {
    const item = trash.get(id)
    if (!item) return { ok: false, error: 'expired' }
    if (now() - item.at > TRASH_TTL_MS) {
      trash.delete(id)
      return { ok: false, error: 'expired' }
    }
    let entry
    try {
      entry = library.restore(item.entry)
    } catch (err) {
      if (err.message === 'conflict') return { ok: false, error: 'conflict' }
      throw err
    }
    watchLog.restore(item.log)
    trash.delete(id)
    progress.check()
    return { ok: true, entry }
  }

  // After a data import the removed series belong to the old library; undo no longer makes sense.
  const clearTrash = () => { trash.clear() }

  return { recordWatched, update, remove, restore, clearTrash }
}
