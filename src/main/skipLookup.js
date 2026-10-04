const EMPTY = { op: null, ed: null, recap: null }

export function createSkipLookup({ anilist, aniskip }) {
  return async (title, episode, duration) => {
    const info = await anilist.getForTitle(title).catch(() => null)
    if (!info?.malId) return { ...EMPTY }
    return aniskip.getSkipTimes({ malId: info.malId, episode, duration })
  }
}
