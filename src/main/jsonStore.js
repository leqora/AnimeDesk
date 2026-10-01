import fs from 'node:fs'
import path from 'node:path'

export function readJson(file, fallback) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { data: structuredClone(fallback), corrupt: false }
    throw err
  }
  try {
    return { data: JSON.parse(raw), corrupt: false }
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = `${file.replace(/\.json$/, '')}.corrupt-${stamp}.json`
    fs.renameSync(file, backup)
    return { data: structuredClone(fallback), corrupt: true, backup }
  }
}

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}
