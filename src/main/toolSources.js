export const SOURCES = {
  bash: { repo: 'git-for-windows/git', asset: /^PortableGit-[\d.]+-64-bit\.7z\.exe$/, kind: 'sfx', exe: 'bin/bash.exe' },
  'ani-cli': { repo: 'pystardust/ani-cli', asset: /^ani-cli$/, kind: 'file' },
  mpv: { repo: 'mpv-player/mpv', asset: /^mpv-v?[\d.]+-x86_64-pc-windows-msvc\.zip$/, kind: 'zip', exe: 'mpv.exe' },
  'yt-dlp': { repo: 'yt-dlp/yt-dlp', asset: /^yt-dlp\.exe$/, kind: 'file' },
  ffmpeg: { repo: 'GyanD/codexffmpeg', asset: /^ffmpeg-[\d.]+-essentials_build\.zip$/, kind: 'zip', exe: 'ffmpeg.exe' },
}

export const AUTO_UPDATE_TOOLS = ['ani-cli', 'yt-dlp']

export function resolveDownload(toolId, release) {
  const src = SOURCES[toolId]
  const asset = (release.assets ?? []).find((a) => src.asset.test(a.name))
  if (!asset) throw new Error(`No download found for ${toolId} in release ${release.tag_name}`)
  return { url: asset.browser_download_url, name: asset.name, version: release.tag_name }
}

// Only Git for Windows locations — never C:\Windows\System32\bash.exe (WSL).
export function systemBashCandidates(env) {
  return [
    `${env.ProgramFiles ?? 'C:\\Program Files'}\\Git\\bin\\bash.exe`,
    `${env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Git\\bin\\bash.exe`,
    env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe`,
  ].filter(Boolean)
}
