import fs from 'node:fs'
import path from 'node:path'

// AnimeDesk's own mpv config folder: uosc skin + the two options it needs.
export function ensureMpvConfig({ dir, uoscRoot, version }) {
  if (!uoscRoot || !fs.existsSync(uoscRoot)) return null
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'mpv.conf'), 'osc=no\nosd-bar=no\n')
  const marker = path.join(dir, '.uosc-version')
  const have = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : null
  if (have !== String(version)) {
    for (const sub of ['scripts', 'fonts']) {
      fs.rmSync(path.join(dir, sub), { recursive: true, force: true })
      const from = path.join(uoscRoot, sub)
      if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, sub), { recursive: true })
    }
    fs.writeFileSync(marker, String(version))
  }
  return dir
}
