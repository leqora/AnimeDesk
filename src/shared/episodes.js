// Groups are cut by position in ani-cli's list, not by episode number: the list can contain "0", "12.5" or gaps,
// and a group must always hold exactly GROUP_SIZE buttons. Labels show the real first/last episode numbers.
export const GROUP_SIZE = 100

export function episodeGroups(list, size = GROUP_SIZE) {
  const groups = []
  for (let from = 0; from < list.length; from += size) {
    const to = Math.min(from + size, list.length) - 1
    groups.push({ label: `${list[from]}–${list[to]}`, from, to })
  }
  return groups
}

export function findEpisodeIndex(list, ep) {
  const s = String(ep ?? '').trim()
  if (!s) return -1
  const exact = list.indexOf(s)
  if (exact >= 0) return exact
  const n = Number(s)
  return Number.isFinite(n) ? list.findIndex((x) => Number(x) === n) : -1
}

export function groupIndexOf(list, ep, size = GROUP_SIZE) {
  const i = findEpisodeIndex(list, ep)
  return i < 0 ? -1 : Math.floor(i / size)
}

export function firstUnwatchedIndex(list, watched) {
  const seen = new Set(watched.map(Number))
  const i = list.findIndex((x) => !seen.has(Number(x)))
  return i < 0 ? 0 : i
}
