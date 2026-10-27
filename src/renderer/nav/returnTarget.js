import { sameRoute } from './history.js'

// Where "Back" from the player goes. origin = the route the episode was started from (or null), behind = the route of the
// history entry just behind the current one (or null), mode = settings.returnAfterEpisode, libraryEntryId = the series' id in the Watchlist.
export function returnTarget({ origin, behind, mode, libraryEntryId }) {
  if (mode === 'episodes' && libraryEntryId) return { kind: 'navigate', route: { page: 'watchlist', animeId: libraryEntryId } }
  if (origin == null || (origin.page === 'home' && !origin.animeId)) return { kind: 'stay' }
  if (behind && sameRoute(behind, origin)) return { kind: 'back' }
  return { kind: 'navigate', route: origin }
}
