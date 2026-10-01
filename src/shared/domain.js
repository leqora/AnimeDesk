export const STATUSES = ['watching', 'completed', 'planned', 'paused', 'dropped']
export const TOOL_IDS = ['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg']

export function normalizeTitle(title) {
  return String(title).replace(/\s*\(\d+\s+episodes?\)\s*$/i, '').trim()
}

// ani-cli shows anime menu lines as "<n> <title>"
export function animeLineTitle(line) {
  return String(line).replace(/^\s*\d+\s+/, '').trim()
}

// First episode not yet watched among 1..max(totalEpisodes, highest watched); 1 when all are watched.
export function nextEpisode(entry) {
  const max = Math.max(entry.totalEpisodes ?? 0, ...entry.watchedEpisodes.map(Math.ceil), 1)
  for (let ep = 1; ep <= max; ep++) if (!entry.watchedEpisodes.includes(ep)) return ep
  return 1
}
