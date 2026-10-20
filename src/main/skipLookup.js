const EMPTY = { op: null, ed: null, recap: null }

// findAniListId(title): the watchlist's AniList id for an ani-cli title, so lookups hit the same series as the watchlist.
export function createSkipLookup({ anilist, aniskip, findAniListId = () => null }) {
  return async (title, episode, duration) => {
    const aniListId = findAniListId(title) ?? null
    const info = await anilist.getForTitle(title, { aniListId }).catch(() => null)
    if (!aniListId && info?.match === 'close') return { ...EMPTY } // a fuzzy title guess never drives skip times
    if (!info?.malId) return { ...EMPTY }
    return aniskip.getSkipTimes({ malId: info.malId, episode, duration })
  }
}

export function createTotalEpisodes({ library, anilist }) {
  return (title) => {
    const entry = library.findByAniCliTitle(title)
    if (entry?.totalEpisodes != null) return entry.totalEpisodes
    const info = anilist.getCached(title, { aniListId: entry?.aniListId ?? null })
    return info?.match === 'close' ? null : (info?.episodes ?? null)
  }
}
