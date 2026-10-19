export const FIELDS = 'id idMal status title { romaji english native } coverImage { large } genres seasonYear episodes duration description(asHtml: false) nextAiringEpisode { episode airingAt }'
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
