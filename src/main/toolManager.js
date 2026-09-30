import fs from 'node:fs'
import path from 'node:path'
import { TOOL_IDS } from '../shared/domain.js'
import { SOURCES, AUTO_UPDATE_TOOLS, resolveDownload, systemBashCandidates } from './toolSources.js'
import { readJson, writeJsonAtomic } from './jsonStore.js'

export function findSystemBash(env = process.env, exists = fs.existsSync) {
  return systemBashCandidates(env).find((p) => exists(p)) ?? null
}

export function findFile(dir, name) {
  const want = name.toLowerCase()
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === want) return full
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    }
  }
  return null
}

export function createToolManager({ paths, http, extractZip, runExe, env = process.env, exists = fs.existsSync }) {
  const load = () => readJson(paths.manifest, { tools: {}, lastUpdateCheck: null }).data
  const save = (m) => writeJsonAtomic(paths.manifest, m)

  function exePath(id) {
    const m = load().tools[id]
    if (m && exists(m.path)) return m.path
    if (id === 'bash') return findSystemBash(env, exists)
    return null
  }

  function status() {
    const tools = load().tools
    return Object.fromEntries(TOOL_IDS.map((id) => {
      const p = exePath(id)
      const version = p ? (tools[id] && tools[id].path === p ? tools[id].version : 'system') : null
      return [id, { installed: !!p, path: p, version }]
    }))
  }

  const missing = () => TOOL_IDS.filter((id) => !exePath(id))
  const latest = (id) => http.getJson(`https://api.github.com/repos/${SOURCES[id].repo}/releases/latest`)

  async function install(id, onProgress = () => {}) {
    const src = SOURCES[id]
    const { url, name, version } = resolveDownload(id, await latest(id))
    const dir = path.join(paths.tools, id)
    const staging = `${dir}.new`
    fs.rmSync(staging, { recursive: true, force: true })
    fs.mkdirSync(staging, { recursive: true })
    const file = path.join(staging, name)
    await http.download(url, file, ({ received, total }) => onProgress({ id, phase: 'download', received, total }))
    if (src.kind === 'zip' || src.kind === 'sfx') {
      onProgress({ id, phase: 'extract' })
      if (src.kind === 'zip') await extractZip(file, staging)
      else {
        const r = await runExe(file, [`-o${staging}`, '-y'])
        if (r.code !== 0) throw new Error(`${id}: extraction failed (${r.stderr})`)
      }
      fs.rmSync(file, { force: true })
    }
    fs.rmSync(dir, { recursive: true, force: true })
    fs.renameSync(staging, dir)
    const exe = src.kind === 'zip' ? findFile(dir, src.exe)
      : src.kind === 'sfx' ? path.join(dir, src.exe)
      : path.join(dir, name)
    if (!exe || !exists(exe)) throw new Error(`${id}: executable not found after install`)
    const m = load()
    m.tools[id] = { version, path: exe, installedAt: new Date().toISOString() }
    save(m)
    onProgress({ id, phase: 'done' })
  }

  async function installMissing(onProgress = () => {}) {
    const errors = {}
    for (const id of missing()) {
      try {
        await install(id, onProgress)
      } catch (err) {
        errors[id] = err.message
        onProgress({ id, phase: 'error', message: err.message })
      }
    }
    return errors
  }

  async function updatesAvailable(ids = AUTO_UPDATE_TOOLS) {
    const out = []
    for (const id of ids) {
      const m = load().tools[id]
      if (!m) continue
      if ((await latest(id)).tag_name !== m.version) out.push(id)
    }
    return out
  }

  async function updateAll(ids = AUTO_UPDATE_TOOLS, onProgress = () => {}) {
    const ids2 = await updatesAvailable(ids)
    for (const id of ids2) await install(id, onProgress)
    return ids2
  }

  function toolPaths() {
    const bash = exePath('bash')
    return {
      bash,
      aniCli: exePath('ani-cli'),
      mpv: exePath('mpv'),
      ytDlp: exePath('yt-dlp'),
      ffmpeg: exePath('ffmpeg'),
      gitRoot: bash ? path.resolve(path.dirname(bash), '..') : null,
    }
  }

  return {
    status, missing, install, installMissing, updatesAvailable, updateAll, toolPaths,
    lastUpdateCheck: () => load().lastUpdateCheck ?? null,
    markUpdateCheck: (iso) => { const m = load(); m.lastUpdateCheck = iso; save(m) },
  }
}
