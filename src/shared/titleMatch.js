// Pure rule for matching an ani-cli title to an AniList search result (no I/O, no clock).
// Change the constants or regexes here only after re-measuring the recorded corpus
// (tests/fixtures/titleMatch.cases.json), and bump MATCH_VERSION so cached matches are re-checked.
export const MATCH_VERSION = 3

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const loose = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const ROMAN = { ii: '2', iii: '3', iv: '4', vi: '6', second: '2', third: '3' }
const toks = (s) => loose(s).replace(/(\p{L})(\d)/gu, '$1 $2').replace(/\b0*(\d+)(?:st|nd|rd|th)?\b/g, '$1').split(' ').filter(Boolean).map((w) => ROMAN[w] ?? w)
const nums = (s) => new Set(toks(s).filter((w) => /^\d+$/.test(w) && w !== '1'))
const GENERIC = new Set('movie movies film the a an of no to wa ga season part special specials ova ona oad tv recap cour arc episode episodes ep vs x and new version edition uncensored dub sub raw complete series s'.split(' '))
const distinctive = (s) => toks(s).filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w))
const MOVIE = /\b(movie|film|gekijouban)\b/i

function bigrams(s) {
  const out = new Map()
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2)
    out.set(b, (out.get(b) ?? 0) + 1)
  }
  return out
}

// Sorensen-Dice over character pairs, each pair counted as often as it occurs (multiset).
function dice(a, b) {
  const A = bigrams(a)
  const B = bigrams(b)
  let inter = 0
  let na = 0
  let nb = 0
  for (const v of A.values()) na += v
  for (const v of B.values()) nb += v
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0)
  return na + nb ? (2 * inter) / (na + nb) : 0
}

// Sorensen-Dice over the SET of word tokens.
function wdice(a, b) {
  const A = new Set(toks(a))
  const B = new Set(toks(b))
  let i = 0
  for (const x of A) if (B.has(x)) i++
  return A.size + B.size ? (2 * i) / (A.size + B.size) : 0
}

const MAIN = (m) => [m.title?.romaji, m.title?.english, m.title?.native].filter(Boolean)
const namesOf = (m) => [...MAIN(m), ...(m.synonyms ?? [])].filter(Boolean)

// Drops [..] and (..) parts, trailing ";" and a trailing "Arc"; collapses spaces.
export function cleanTitle(title) {
  return String(title ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/;+\s*$/g, '')
    .replace(/\s+arc\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// `title` must already be the cleaned title.
function score(title, m) {
  const tn = nums(title)
  const numOk = (n) => [...nums(n)].every((x) => tn.has(x))
  if (![m.title?.romaji, m.title?.english].filter(Boolean).some(numOk)) return -1
  const names = namesOf(m).filter(numOk)
  const tokSet = new Set(namesOf(m).flatMap(toks))
  const joined = namesOf(m).map(norm).join('|')
  const want = [...new Set(distinctive(title))]
  const missing = want.filter((w) => !tokSet.has(w) && !(w.length >= 3 && joined.includes(w)))
  if (missing.length && missing.length / want.length > 0.25) return -1
  const seps = [...title.matchAll(/:|\s-\s/g)]
  if (seps.length && missing.length) {
    const last = seps.at(-1)
    const sub = new Set(distinctive(title.slice(last.index + last[0].length)))
    if (missing.some((w) => sub.has(w))) return -1
  }
  let best = 0
  for (const n of names) best = Math.max(best, (dice(loose(title), loose(n)) + wdice(title, n)) / 2)
  if (MOVIE.test(title)) best += m.format === 'MOVIE' ? 0.1 : (m.format === 'TV' || m.format === 'TV_SHORT') ? -0.15 : 0
  return best
}

const exactTok = (a, b) => toks(a).join(' ') === toks(b).join(' ')

export function isExactName(title, name) {
  const s = cleanTitle(title)
  return norm(name) === norm(title) || norm(name) === norm(s) || exactTok(title, name) || exactTok(s, name)
}

// results: AniList media { id, format, title: { romaji, english, native }, synonyms }.
export function pickMatch(title, results) {
  const s = cleanTitle(title)
  const isEx = (n) => isExactName(title, n)
  const list = results ?? []
  const ex = list.find((m) => MAIN(m).some(isEx)) ?? list.find((m) => namesOf(m).some(isEx))
  if (ex) return { media: ex, match: 'exact' }
  let best = null
  let bs = -1
  for (const m of list) {
    const sc = score(s, m)
    if (sc > bs) { // equal score keeps the first result
      bs = sc
      best = m
    }
  }
  if (bs >= 0.6 && new Set(distinctive(s)).size >= 2) return { media: best, match: 'close' }
  return null
}

// ani-cli titles often differ from AniList's ("Naruto: Shippuuden Movie 6: Road to Ninja"), and AniList
// returns nothing for the full string. Retry with the subtitle (after the last ":" or " - "), then with the part before it — never with
// a single word, which would match the wrong show (a wrong poster is worse than none). Last resort: the
// title without "Movie N" / "OVA N" and punctuation ("Naruto: Shippuden the Movie 2 -Bonds-" → "Naruto Shippuden Bonds").
export function searchCandidates(title) {
  const full = String(title ?? '').trim()
  const seps = [...full.matchAll(/:|\s-\s/g)]
  const last = seps.at(-1)
  const words = (s) => s.split(/\s+/).filter(Boolean).length
  const out = [full]
  if (last && last.index > 0) {
    for (const part of [full.slice(last.index + last[0].length).trim(), full.slice(0, last.index).trim()]) {
      if (words(part) >= 2 && !out.includes(part)) out.push(part)
    }
  }
  const cleaned = full
    .replace(/\b(?:the\s+)?movie\s*\d*\b|\bova\s*\d*\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (words(cleaned) >= 2 && cleaned !== full && !out.includes(cleaned)) out.push(cleaned)
  return out
}

// The queries to send to AniList, in order: full title, cleaned title, then the fallbacks of the cleaned title.
export function searchQueries(title) {
  const full = String(title ?? '').trim()
  return [...new Set([full, cleanTitle(full), ...searchCandidates(cleanTitle(full))])].filter(Boolean)
}
