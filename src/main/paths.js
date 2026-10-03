import path from 'node:path'

export function createPaths(baseDir) {
  return {
    base: baseDir,
    tools: path.join(baseDir, 'tools'),
    manifest: path.join(baseDir, 'tools', 'manifest.json'),
    cache: path.join(baseDir, 'cache', 'anilist'),
    aniCliHistory: path.join(baseDir, 'ani-cli-history'),
    library: path.join(baseDir, 'library.json'),
    settings: path.join(baseDir, 'settings.json'),
    downloads: path.join(baseDir, 'downloads.json'),
    watchLog: path.join(baseDir, 'watchlog.json'),
    profile: path.join(baseDir, 'profile.json'),
    seriesPrefs: path.join(baseDir, 'series-prefs.json'),
    positions: path.join(baseDir, 'positions.json'),
  }
}

export function toMsysPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p)
  if (!m) return p.replace(/\\/g, '/')
  return `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i
const MAX_NAME = 100

export function safeDirName(name) {
  const cleaned = String(name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
    .replace(/[. ]+$/, '')
  if (!cleaned) return 'Anime'
  // Windows refuses device names (CON, NUL, COM1…) as folder names, even with an extension.
  return cleaned.replace(RESERVED, (_, base, dot) => `${base}_${dot}`)
}
