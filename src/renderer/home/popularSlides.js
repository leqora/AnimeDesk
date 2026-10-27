import { seasonOf } from '../../shared/discover.js'

const FIELDS = (item) => ({ id: item.id, title: item.title, romaji: item.romaji ?? null, year: item.year ?? null, format: item.format ?? null, genres: Array.isArray(item.genres) ? item.genres : [], poster: item.poster ?? null })

// The first source with at least one series outside the library: the cached Discover season rail (only while it is
// the current season, so a stale rail is never labeled "this season"), then trending, then personal recommendations.
// Only card facts leave here — never a description.
export function popularSlides({ peek, recs, now = Date.now() } = {}, max = 5) {
  const cur = seasonOf(now)
  const thisSeason = peek?.season && peek.season.season === cur.season && peek.season.year === cur.year
  const sources = [
    { kind: 'discover', labelKey: 'hero.popularSeason', items: thisSeason && Array.isArray(peek.items) ? peek.items : [] },
    { kind: 'rec', labelKey: 'hero.popularNow', items: recs?.mode === 'trending' && Array.isArray(recs.items) ? recs.items : [] },
    { kind: 'rec', labelKey: 'hero.personal', items: recs?.mode === 'personal' && Array.isArray(recs.items) ? recs.items : [] },
  ]
  for (const src of sources) {
    const free = src.items.filter((i) => i && !i.entryId).slice(0, max)
    if (free.length > 0) return free.map((item, n) => ({ ...FIELDS(item), kind: src.kind, labelKey: src.labelKey, rank: n + 1 }))
  }
  return []
}
