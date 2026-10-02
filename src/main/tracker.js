// Every watchlist change that affects XP goes through here, so the watch log and level stay in sync.
export function createTracker({ library, watchLog, progress }) {
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
    const removed = library.remove(id)
    if (removed) {
      watchLog.removeAnime(id)
      progress.check()
    }
    return removed
  }

  return { recordWatched, update, remove }
}
