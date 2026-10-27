export const FIELDS = 'id idMal status title { romaji english native } synonyms coverImage { large } genres seasonYear episodes duration format bannerImage description(asHtml: false) nextAiringEpisode { episode airingAt }'
export const SEARCH = `query ($search: String) { Page(perPage: 10) { media(search: $search, type: ANIME) { ${FIELDS} } } }`
export const AIRING_BATCH = 'query ($ids: [Int], $page: Int) { Page(page: $page, perPage: 50) { media(id_in: $ids, type: ANIME) { id status episodes nextAiringEpisode { episode airingAt } } } }'
export const RELATIONS_BATCH = 'query ($ids: [Int], $page: Int) { Page(page: $page, perPage: 50) { media(id_in: $ids, type: ANIME) { id relations { edges { relationType node { id type format status seasonYear episodes title { romaji english } coverImage { large } } } } } } }'
export const VIEWER = 'query { Viewer { id name } }'
export const LIST_ENTRY = 'query ($id: Int) { Media(id: $id, type: ANIME) { episodes mediaListEntry { progress status } } }'
export const SAVE_PROGRESS = 'mutation ($id: Int, $progress: Int, $status: MediaListStatus) { SaveMediaListEntry(mediaId: $id, progress: $progress, status: $status) { progress status } }'
export const CANDIDATES = 'query ($search: String) { Page(perPage: 8) { media(search: $search, type: ANIME) { id title { romaji english } seasonYear format episodes coverImage { large } } } }'
export const BY_ID = `query ($id: Int) { Media(id: $id, type: ANIME) { ${FIELDS} } }`

export const ID_BATCH = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${FIELDS} } } }`

// One query with n aliased searches (s0..s{n-1}); the text only ever travels through the variables $s0..$s{n-1}.
export function searchBatchQuery(n) {
  const vars = Array.from({ length: n }, (_, i) => `$s${i}: String`).join(', ')
  const body = Array.from({ length: n }, (_, i) => `s${i}: Page(perPage: 10) { media(search: $s${i}, type: ANIME) { ${FIELDS} } }`).join(' ')
  return `query (${vars}) { ${body} }`
}

// Fields of a recommended series (spec point 7), shared by RECS_BATCH and TRENDING.
export const REC_MEDIA_FIELDS = 'id isAdult format status seasonYear episodes genres title { romaji english } coverImage { large } bannerImage relations { edges { relationType(version: 2) node { id type format seasonYear } } }'
export const RECS_BATCH = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id recommendations(perPage: 10, sort: RATING_DESC) { nodes { rating mediaRecommendation { ${REC_MEDIA_FIELDS} } } } } } }`
export const TRENDING = `query { Page(perPage: 50) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${REC_MEDIA_FIELDS} } } }`

// Weekly airing schedule (spec point 7): the window travels only through variables.
export const SCHEDULE = 'query ($page: Int, $from: Int, $to: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) { airingAt episode media { id isAdult format status seasonYear title { romaji english } coverImage { medium } relations { edges { relationType(version: 2) node { id type format seasonYear } } } } } } }'

// Discover page (spec point 6): one query, four aliases; season/year only through variables.
export const DISCOVER_FIELDS = `${REC_MEDIA_FIELDS} startDate { year month }`
const discoverAlias = (alias, args) => `${alias}: Page(perPage: 50) { media(type: ANIME, isAdult: false, ${args}) { ${DISCOVER_FIELDS} } }`
export const DISCOVER = `query ($season: MediaSeason, $year: Int, $nextSeason: MediaSeason, $nextYear: Int) { ${[
  discoverAlias('season', 'season: $season, seasonYear: $year, sort: POPULARITY_DESC'),
  discoverAlias('upcoming', 'season: $nextSeason, seasonYear: $nextYear, sort: POPULARITY_DESC'),
  discoverAlias('movies', 'format: MOVIE, sort: TRENDING_DESC'),
  discoverAlias('trending', 'sort: TRENDING_DESC'),
].join(' ')} }`
