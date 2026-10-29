export const STATUSES = ['watching', 'completed', 'planned', 'paused', 'dropped']
export const TOOL_IDS = ['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg']
export const OPTIONAL_TOOL_IDS = ['uosc']

export function normalizeTitle(title) {
  return String(title).replace(/\s*\(\d+\s+episodes?\)\s*$/i, '').trim()
}

// ani-cli shows anime menu lines as "<n> <title>"
export function animeLineTitle(line) {
  return String(line).replace(/^\s*\d+\s+/, '').trim()
}

// The episode "Continue" offers: the one after the highest watched whole episode, or the latest started one beyond it
// (a saved position in `progress`, keyed by episode number). Past a known total: the first unwatched, or 1 when all are watched.
export function nextEpisode(entry, progress = {}) {
  const watched = entry.watchedEpisodes
  const total = entry.totalEpisodes ?? null
  const h = watched.reduce((m, n) => Math.max(m, Math.floor(n)), 0)
  let c = h + 1
  for (const key of Object.keys(progress ?? {})) {
    const n = /^\d+$/.test(key) ? Number(key) : NaN
    if (n > h && (total == null || n <= total) && !watched.includes(n)) c = Math.max(c, n)
  }
  if (total != null && c > total) {
    for (let ep = 1; ep <= total; ep++) if (!watched.includes(ep)) return ep
    return 1
  }
  return c
}
