const EMPTY = { op: null, ed: null, recap: null }

// findAniListId(title): the watchlist's AniList id for an ani-cli title, so lookups hit the same series as the watchlist.
export function createSkipLookup({ anilist, aniskip, findAniListId = () => null }) {
  return async (title, episode, duration) => {
    const info = await anilist.getForTitle(title, { aniListId: findAniListId(title) ?? null }).catch(() => null)
    if (!info?.malId) return { ...EMPTY }
    return aniskip.getSkipTimes({ malId: info.malId, episode, duration })
  }
}

export function createTotalEpisodes({ library, anilist }) {
  return (title) => {
    const entry = library.findByAniCliTitle(title)
    return entry?.totalEpisodes ?? anilist.getCached(title, { aniListId: entry?.aniListId ?? null })?.episodes ?? null
  }
}
