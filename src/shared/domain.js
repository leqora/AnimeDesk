export const STATUSES = ['watching', 'completed', 'planned', 'paused', 'dropped']
export const TOOL_IDS = ['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg']

export function normalizeTitle(title) {
  return String(title).replace(/\s*\(\d+\s+episodes?\)\s*$/i, '').trim()
}

// ani-cli shows anime menu lines as "<n> <title>"
export function animeLineTitle(line) {
  return String(line).replace(/^\s*\d+\s+/, '').trim()
}
