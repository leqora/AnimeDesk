import { watchedMax, episodeVisibility, redactEpisode } from '../shared/spoilers.js'
import { normalizeTitle } from '../shared/domain.js'
import { metaKey, metaReliability, mapEpisode } from '../shared/episodeMap.js'

const AIRING = new Set(['RELEASING', 'NOT_YET_RELEASED'])
const NO_SPOILERS = { reveal: { all: false, episodes: [] }, metaOff: false }

// The one place that decides what the renderer may know about a series' episodes: every episode goes through
// redactEpisode here, so a hidden episode's title, picture or summary never leaves the main process.
export function createSeriesEpisodes({ library, seriesPrefs, settings, anilist, episodeMeta, episodeLists }) {
  async function resolve({ title = '', aniListId = null, mode = null, list = null } = {}) {
    const t = String(title ?? '').trim()
    const s = settings.get()
    const entry = t ? library.findByAniCliTitle(t) : null
    const watched = entry?.watchedEpisodes ?? []
    const listMode = mode === 'sub' || mode === 'dub' ? mode : t ? seriesPrefs.resolve(t, s).mode : s.mode

    let episodes
    let source
    const menu = Array.isArray(list) ? list.map((x) => String(x ?? '').trim()).filter(Boolean) : []
    if (menu.length) { episodes = menu; source = 'menu' } else {
      const cached = t ? episodeLists.get(t, listMode) : null
      if (cached?.length) { episodes = cached; source = 'ani-cli' } else {
        const max = Math.max(entry?.totalEpisodes ?? 0, ...watched.map(Math.ceil), 1)
        episodes = Array.from({ length: max }, (_, i) => String(i + 1))
        source = 'synthetic'
      }
    }

    const spoilers = t ? seriesPrefs.getSpoilers(t) : NO_SPOILERS
    const rule = { enabled: s.hideSpoilers, watchedMax: watchedMax(watched), revealAll: spoilers.reveal.all, revealed: spoilers.reveal.episodes }

    let meta = 'none'
    let anizip = null
    let id = null
    if (spoilers.metaOff) meta = 'off'
    else if (t || aniListId) {
      const knownId = aniListId ?? entry?.aniListId ?? null
      const at = normalizeTitle(t)
      // With a known id only the cached AniList record is read (for the airing status): per-row thumbnail
      // requests must never queue network calls behind AniList's rate limit.
      const info = knownId
        ? (anilist.getCached(at, { aniListId: knownId }) ?? null)
        : await anilist.getForTitle(at, { aniListId: null }).catch(() => null)
      id = knownId ?? info?.id ?? null
      anizip = id ? await episodeMeta.get(id, { airing: AIRING.has(info?.status) }) : null
      if (anizip && Object.keys(anizip.episodes ?? {}).length) meta = metaReliability(episodes, anizip)
    }
    return { episodes, source, meta, anizip, id, rule }
  }

  async function forSeries(args = {}) {
    const r = await resolve(args)
    return {
      source: r.source,
      meta: r.meta,
      episodes: r.episodes.map((n) => redactEpisode(n, r.meta === 'ok' ? mapEpisode(n, r.anizip) : null, episodeVisibility(n, r.rule))),
    }
  }

  // Checked again here, not trusted from the renderer: a hidden episode's picture is never even downloaded.
  async function thumb({ episode, ...args } = {}) {
    const n = String(episode ?? '').trim()
    const key = metaKey(n)
    if (!key) return null
    const r = await resolve(args)
    if (r.meta !== 'ok' || !r.episodes.includes(n)) return null
    if (episodeVisibility(n, r.rule) === 'hidden') return null
    return episodeMeta.thumb(r.id, key)
  }

  async function spoilers(args = {}, action = {}) {
    const t = String(args?.title ?? '').trim()
    if (t) seriesPrefs.setSpoilers(t, action)
    return forSeries(args)
  }

  return { forSeries, thumb, spoilers }
}
