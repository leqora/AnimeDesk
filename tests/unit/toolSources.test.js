import { describe, it, expect } from 'vitest'
import { resolveDownload, systemBashCandidates, AUTO_UPDATE_TOOLS, SOURCES } from '../../src/main/toolSources.js'

const rel = (tag, ...names) => ({ tag_name: tag, assets: names.map((name) => ({ name, browser_download_url: `https://x/${name}` })) })

describe('toolSources', () => {
  it('picks the right asset for every tool', () => {
    expect(resolveDownload('mpv', rel('v0.41.0', 'mpv-v0.41.0-aarch64-pc-windows-msvc.zip', 'mpv-v0.41.0-x86_64-pc-windows-msvc.zip')).name)
      .toBe('mpv-v0.41.0-x86_64-pc-windows-msvc.zip')
    expect(resolveDownload('ffmpeg', rel('9.0.2', 'ffmpeg-9.0.2-full_build.zip', 'ffmpeg-9.0.2-essentials_build.zip')).name)
      .toBe('ffmpeg-9.0.2-essentials_build.zip')
    expect(resolveDownload('bash', rel('v2.56.0.windows.1', 'Git-2.56.0-64-bit.exe', 'PortableGit-2.56.0-64-bit.7z.exe')).name)
      .toBe('PortableGit-2.56.0-64-bit.7z.exe')
    expect(resolveDownload('ani-cli', rel('v5.1', 'ani-cli'))).toEqual({ url: 'https://x/ani-cli', name: 'ani-cli', version: 'v5.1' })
    expect(resolveDownload('yt-dlp', rel('2026.08.19', 'yt-dlp', 'yt-dlp.exe')).name).toBe('yt-dlp.exe')
  })
  it('throws a clear error when no asset matches', () => {
    expect(() => resolveDownload('mpv', rel('v1', 'readme.txt'))).toThrow(/mpv/)
  })
  it('only ever looks for Git for Windows bash, never WSL bash in System32', () => {
    const c = systemBashCandidates({ ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\N\\AppData\\Local' })
    expect(c).toContain('C:\\Program Files\\Git\\bin\\bash.exe')
    expect(c.some((p) => /system32/i.test(p))).toBe(false)
  })
  it('auto-updates ani-cli and yt-dlp', () => {
    expect(AUTO_UPDATE_TOOLS).toEqual(['ani-cli', 'yt-dlp'])
  })
  it('knows the optional uosc skin', () => {
    expect(SOURCES.uosc).toMatchObject({ repo: 'tomasklaen/uosc', kind: 'zip', exe: 'main.lua' })
    expect(SOURCES.uosc.asset.test('uosc.zip')).toBe(true)
    expect(AUTO_UPDATE_TOOLS).not.toContain('uosc')
  })
})
