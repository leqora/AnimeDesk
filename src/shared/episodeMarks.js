import { metaKey } from './episodeMap.js'

// An airing series can list a few episodes more than the source (Jikan) knows yet.
export const AIRING_TOLERANCE = 5

const EMPTY = { filler: 0, recap: 0 }

// Decides whether Jikan's filler/recap lists can be trusted for this episode list and which rows they mark.
// Only whole episodes from 1 are ever marked ("0", "12.5" and "SP" never are). More whole episodes than the source
// counts means the numbering does not match (several seasons, or the wrong entry): then nothing is marked.
export function markEpisodes(list, data, { airing = false } = {}) {
  if (!data || data.missing) return { marks: 'none', kinds: {}, counts: { ...EMPTY } }
  const labels = Array.isArray(list) ? list : []
  const whole = labels.filter((l) => metaKey(l) != null).length
  if (whole > (Number(data.count) || 0) + (airing ? AIRING_TOLERANCE : 0)) return { marks: 'unreliable', kinds: {}, counts: { ...EMPTY } }
  const filler = new Set(data.filler ?? [])
  const recap = new Set(data.recap ?? [])
  const kinds = {}
  const counts = { ...EMPTY }
  for (const label of labels) {
    const key = metaKey(label)
    if (key == null) continue
    const n = Number(key)
    const kind = filler.has(n) ? 'filler' : recap.has(n) ? 'recap' : null
    if (!kind) continue
    kinds[label] = kind
    counts[kind] += 1
  }
  return { marks: 'ok', kinds, counts }
}
