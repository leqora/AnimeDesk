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
  }
}

export function toMsysPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p)
  if (!m) return p.replace(/\\/g, '/')
  return `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`
}

export function safeDirName(name) {
  const cleaned = String(name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || 'Anime'
}
