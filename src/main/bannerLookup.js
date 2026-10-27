const validId = (id) => Number.isInteger(id) && id > 0

// Which banner the renderer may see: a library series (poster rule is applied inside anilist.bannerUrlFor,
// which refuses 'close' matches) or an item currently shown in Discover / recommendations.
// Input is validated here; every failure is null and never reaches IPC as an exception.
export function createBannerLookup({ library, anilist, discover, recommendations, banners }) {
  async function urlFor(req) {
    if (!req || typeof req !== 'object') return null
    if (req.kind === 'series') {
      if (typeof req.entryId !== 'string') return null
      const entry = library.list().find((e) => e.id === req.entryId)
      if (!entry) return null
      const opts = { aniListId: entry.aniListId ?? null }
      // bannerUrlFor reads only the disk cache; after "clear cache" the renderer may not refetch, so warm it
      // (answers from a fresh cache without a request; result/errors are irrelevant here).
      await anilist.getForTitle(entry.title, opts).catch(() => null)
      const hit = await anilist.bannerUrlFor(entry.title, opts)
      return hit?.bannerUrl ?? null
    }
    if (req.kind === 'discover') return validId(req.id) ? discover.bannerUrlOf(req.id) : null
    if (req.kind === 'rec') return validId(req.id) ? recommendations.bannerUrlOf(req.id) : null
    return null
  }

  async function banner(req) {
    try {
      const url = await urlFor(req)
      if (!url) return null
      return (await banners.ensure(url)) ?? null
    } catch {
      return null
    }
  }

  return { banner }
}
