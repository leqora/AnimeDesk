import { sameRoute } from './history.js'

// Where "Back" from the player goes. origin = the route the episode was started from (or null; a Search start also carries
// `search`, the series title), behind = the route of the history entry just behind the current one (or null),
// mode = settings.returnAfterEpisode, libraryEntryId = the series' id in the Watchlist.
// tab: 'episodes' is set only when the "episodes" setting was applied.
export function returnTarget({ origin, behind, mode, libraryEntryId }) {
  if (mode === 'episodes' && libraryEntryId) {
    const detail = { page: 'watchlist', animeId: libraryEntryId }
    if (behind && sameRoute(behind, detail)) return { kind: 'back', tab: 'episodes' }
    return { kind: 'navigate', route: detail, tab: 'episodes' }
  }
  if (origin?.search) return { kind: 'search', series: origin.search }
  if (origin == null || (origin.page === 'home' && !origin.animeId)) return { kind: 'stay' }
  if (behind && sameRoute(behind, origin)) return { kind: 'back' }
  return { kind: 'navigate', route: origin }
}
