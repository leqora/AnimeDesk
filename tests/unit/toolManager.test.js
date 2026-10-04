import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPaths } from '../../src/main/paths.js'
import { createToolManager, findSystemBash } from '../../src/main/toolManager.js'

const RELEASES = {
  'git-for-windows/git': { tag_name: 'v2.56.0.windows.1', assets: [{ name: 'PortableGit-2.56.0-64-bit.7z.exe', browser_download_url: 'u/git' }] },
  'pystardust/ani-cli': { tag_name: 'v5.1', assets: [{ name: 'ani-cli', browser_download_url: 'u/ani' }] },
  'mpv-player/mpv': { tag_name: 'v0.41.0', assets: [{ name: 'mpv-v0.41.0-x86_64-pc-windows-msvc.zip', browser_download_url: 'u/mpv' }] },
  'yt-dlp/yt-dlp': { tag_name: '2026.08.19', assets: [{ name: 'yt-dlp.exe', browser_download_url: 'u/ytdlp' }] },
  'tomasklaen/uosc': { tag_name: '5.13.0', assets: [{ name: 'uosc.zip', browser_download_url: 'u/uosc' }] },
  'GyanD/codexffmpeg': { tag_name: '9.0.2', assets: [{ name: 'ffmpeg-9.0.2-essentials_build.zip', browser_download_url: 'u/ffmpeg' }] },
}

let base, paths, releases, tm, events
function make(extra = {}) {
  return createToolManager({
    paths,
    env: { ProgramFiles: path.join(base, 'no-pf'), 'ProgramFiles(x86)': path.join(base, 'no-pf') },
    http: {
      getJson: async (url) => structuredClone(releases[url.match(/repos\/(.+)\/releases/)[1]]),
      download: async (url, dest, onProgress) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, url); onProgress({ received: 5, total: 10 }) },
    },
    extractZip: async (file, dir) => {
      if (file.includes('uosc')) {
        fs.mkdirSync(path.join(dir, 'scripts', 'uosc'), { recursive: true })
        fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'scripts', 'uosc', 'main.lua'), 'lua')
        fs.writeFileSync(path.join(dir, 'fonts', 'uosc_icons.otf'), 'f')
        return
      }
      const inner = path.join(dir, 'pkg', 'bin')
      fs.mkdirSync(inner, { recursive: true })
      const exe = file.includes('mpv') ? 'mpv.exe' : 'ffmpeg.exe'
      fs.writeFileSync(path.join(inner, exe), 'exe')
    },
    runExe: async (file, args) => {
      const out = args.find((a) => a.startsWith('-o')).slice(2)
      fs.mkdirSync(path.join(out, 'bin'), { recursive: true })
      fs.writeFileSync(path.join(out, 'bin', 'bash.exe'), 'bash')
      return { code: 0, stderr: '' }
    },
    ...extra,
  })
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-tm-'))
  paths = createPaths(base)
  releases = structuredClone(RELEASES)
  events = []
  tm = make()
})

describe('toolManager', () => {
  it('treats uosc as optional: not missing, installable, reported with a root path', async () => {
    expect(tm.missing()).not.toContain('uosc')
    expect(tm.status().uosc).toMatchObject({ installed: false, optional: true })
    expect(tm.toolPaths().uoscRoot).toBeNull()
    await tm.installOptional()
    expect(tm.status().uosc.installed).toBe(true)
    expect(tm.toolPaths().uoscRoot).toBe(path.join(paths.tools, 'uosc'))
    expect(tm.version('uosc')).toBe('5.13.0')
  })
  it('never throws when the optional install fails', async () => {
    const t = make({ http: { getJson: async () => { throw new Error('offline') }, download: async () => {} } })
    const evs = []
    await expect(t.installOptional((e) => evs.push(e))).resolves.toBeUndefined()
    expect(evs.at(-1)).toMatchObject({ id: 'uosc', phase: 'error' })
  })
  it('reports everything missing on a clean machine', () => {
    expect(tm.missing()).toEqual(['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg'])
    expect(tm.status().mpv).toEqual({ installed: false, path: null, version: null, optional: false })
  })
  it('installs all tools, records versions and exposes paths', async () => {
    const errors = await tm.installMissing((e) => events.push(e))
    expect(errors).toEqual({})
    expect(tm.missing()).toEqual([])
    const p = tm.toolPaths()
    expect(p.bash).toBe(path.join(paths.tools, 'bash', 'bin', 'bash.exe'))
    expect(p.gitRoot).toBe(path.join(paths.tools, 'bash'))
    expect(p.aniCli).toBe(path.join(paths.tools, 'ani-cli', 'ani-cli'))
    expect(p.mpv).toBe(path.join(paths.tools, 'mpv', 'pkg', 'bin', 'mpv.exe'))
    expect(p.ytDlp).toBe(path.join(paths.tools, 'yt-dlp', 'yt-dlp.exe'))
    expect(fs.existsSync(p.ffmpeg)).toBe(true)
    expect(tm.status()['ani-cli'].version).toBe('v5.1')
    expect(events).toContainEqual({ id: 'mpv', phase: 'download', received: 5, total: 10 })
    expect(events).toContainEqual({ id: 'mpv', phase: 'done' })
  })
  it('uses an existing Git for Windows bash instead of downloading PortableGit', () => {
    const gitBash = path.join(base, 'pf', 'Git', 'bin', 'bash.exe')
    fs.mkdirSync(path.dirname(gitBash), { recursive: true })
    fs.writeFileSync(gitBash, '')
    const t = make({ env: { ProgramFiles: path.join(base, 'pf'), 'ProgramFiles(x86)': path.join(base, 'no-pf') } })
    expect(t.missing()).not.toContain('bash')
    expect(t.status().bash).toEqual({ installed: true, path: gitBash, version: 'system', optional: false })
    expect(t.toolPaths().gitRoot).toBe(path.join(base, 'pf', 'Git'))
  })
  it('keeps going when one tool fails and reports its error', async () => {
    releases['mpv-player/mpv'].assets = []
    const errors = await tm.installMissing((e) => events.push(e))
    expect(Object.keys(errors)).toEqual(['mpv'])
    expect(tm.missing()).toEqual(['mpv'])
    expect(events.some((e) => e.id === 'mpv' && e.phase === 'error')).toBe(true)
  })
  it('detects and applies updates only for tools with a new tag', async () => {
    await tm.installMissing()
    expect(await tm.updatesAvailable()).toEqual([])
    releases['pystardust/ani-cli'].tag_name = 'v5.2'
    expect(await tm.updatesAvailable()).toEqual(['ani-cli'])
    expect(await tm.updateAll()).toEqual(['ani-cli'])
    expect(tm.status()['ani-cli'].version).toBe('v5.2')
  })
  it('keeps the old version working when the new one cannot be moved in (antivirus / file in use)', async () => {
    await tm.installMissing()
    const oldPath = tm.toolPaths().aniCli
    releases['pystardust/ani-cli'].tag_name = 'v5.2'
    const locked = (from, to) => {
      if (from.endsWith('.new')) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      fs.renameSync(from, to)
    }
    const t = make({ rename: locked, sleep: async () => {} })
    await expect(t.updateAll()).rejects.toThrow(/EPERM/)
    expect(t.missing()).toEqual([])
    expect(t.toolPaths().aniCli).toBe(oldPath)
    expect(t.status()['ani-cli'].version).toBe('v5.1')
    expect(fs.existsSync(`${path.dirname(oldPath)}.new`)).toBe(false)
  })
  it('retries a rename that fails once with EBUSY', async () => {
    await tm.installMissing()
    releases['pystardust/ani-cli'].tag_name = 'v5.2'
    let failed = false
    const flaky = (from, to) => {
      if (!failed && from.endsWith('.new')) { failed = true; throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' }) }
      fs.renameSync(from, to)
    }
    const t = make({ rename: flaky, sleep: async () => {} })
    expect(await t.updateAll()).toEqual(['ani-cli'])
    expect(t.status()['ani-cli'].version).toBe('v5.2')
  })
  it('remembers the last update check', () => {
    expect(tm.lastUpdateCheck()).toBeNull()
    tm.markUpdateCheck('2026-10-01T00:00:00Z')
    expect(make().lastUpdateCheck()).toBe('2026-10-01T00:00:00Z')
  })
  it('treats a tool whose file was deleted as missing', async () => {
    await tm.installMissing()
    fs.rmSync(tm.toolPaths().ytDlp)
    expect(tm.missing()).toEqual(['yt-dlp'])
  })
  it('findSystemBash returns null when Git is not installed', () => {
    expect(findSystemBash({ ProgramFiles: path.join(base, 'nothing') }, () => false)).toBeNull()
  })
})
