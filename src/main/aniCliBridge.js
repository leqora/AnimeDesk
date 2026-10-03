import path from 'node:path'
import crypto from 'node:crypto'
import { toMsysPath } from './paths.js'
import { run } from './run.js'
import { animeLineTitle } from '../shared/domain.js'

export function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

export function mapError(stderr) {
  const s = stripAnsi(stderr)
  if (/No results found/i.test(s)) return 'no-results'
  if (/Episode not released|Out of range/i.test(s)) return 'episode-not-released'
  if (/Blocked by cloudflare/i.test(s)) return 'blocked'
  if (/No sources found for dub/i.test(s)) return 'no-dub'
  return 'unknown'
}

export function menuKind(prompt) {
  if (/anime/i.test(prompt)) return 'anime'
  if (/episode/i.test(prompt)) return 'episode'
  return 'other'
}

export function autoAnswer(prompt, lines, { anime = null, episode = null } = {}) {
  const kind = menuKind(prompt)
  if (kind === 'anime' && anime) {
    const want = anime.trim().toLowerCase()
    return lines.find((l) => animeLineTitle(l).toLowerCase() === want) ?? null
  }
  if (kind === 'episode' && episode != null) {
    return lines.find((l) => l.trim() === String(episode)) ?? null
  }
  return null
}

export function parsePlayerArgs(args) {
  const titleArg = args.find((a) => a.startsWith('--force-media-title='))
  const full = titleArg ? titleArg.slice('--force-media-title='.length) : ''
  const m = /^(.*) Episode (\S+)$/.exec(full)
  const url = [...args].reverse().find((a) => !a.startsWith('--')) ?? null
  return { mpvArgs: args, title: m ? m[1] : full, episode: m ? m[2] : null, url }
}

export function buildEnv({ baseEnv, tools, bridges, server, sessionId, player, downloadDir, settings, historyDir, quality = null, mode = null }) {
  const env = { ...baseEnv }
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH')
  const oldPath = pathKey ? env[pathKey] : ''
  if (pathKey) delete env[pathKey]
  const dirs = [
    path.dirname(bridges.player),
    tools.gitRoot && path.join(tools.gitRoot, 'usr', 'bin'),
    tools.gitRoot && path.join(tools.gitRoot, 'mingw64', 'bin'),
    tools.ytDlp && path.dirname(tools.ytDlp),
    tools.ffmpeg && path.dirname(tools.ffmpeg),
    oldPath,
  ].filter(Boolean)
  Object.assign(env, {
    PATH: dirs.join(';'),
    ANI_CLI_MENU: toMsysPath(bridges.menu),
    // ani-cli runs the player UNQUOTED, so a path with a space would split; use the bare name from PATH
    ANI_CLI_PLAYER: player === 'play' ? path.basename(bridges.player) : player,
    ANI_CLI_NO_DETACH: '1',
    ANI_CLI_EXIT_AFTER_PLAY: '1',
    ANI_CLI_LOG: '0',
    ANI_CLI_QUALITY: quality ?? settings.quality,
    ANI_CLI_MODE: mode ?? settings.mode,
    ANI_CLI_HIST_DIR: toMsysPath(historyDir),
    ANIMEDESK_PORT: String(server.port),
    ANIMEDESK_TOKEN: server.token,
    ANIMEDESK_SESSION: sessionId,
  })
  // Windows form with forward slashes: MSYS hands it to yt-dlp.exe unchanged, whereas an /d/... path
  // is left unconverted (and so wrong) as soon as ani-cli appends a title containing : ? or *.
  if (downloadDir) env.ANI_CLI_DOWNLOAD_DIR = downloadDir.replace(/\\/g, '/')
  return env
}

export function createAniCliBridge({ toolManager, server, bridges, getSettings, historyDir, runImpl = run, baseEnv = process.env }) {
  function startSession({
    query, player = 'play', episodes = null, index = null, downloadDir = null,
    onMenu = async () => null, onPlay = async () => 0, onLine, timeoutMs, quality = null, mode = null,
  }) {
    const tools = toolManager.toolPaths()
    if (!tools.bash || !tools.aniCli) throw new Error('tools-missing')
    const sessionId = crypto.randomUUID()
    let cancelled = false
    server.registerSession(sessionId, {
      onMenu: async (req) => {
        const answer = await onMenu(req)
        if (answer == null) cancelled = true
        return answer
      },
      onPlay,
    })
    const args = [toMsysPath(tools.aniCli)]
    if (index != null) args.push('-S', String(index))
    if (episodes != null) args.push('-e', String(episodes))
    args.push(...String(query).trim().split(/\s+/))
    const env = buildEnv({ baseEnv, tools, bridges, server, sessionId, player, downloadDir, settings: getSettings(), historyDir, quality, mode })
    const proc = runImpl(tools.bash, args, { env, onLine, timeoutMs })
    const done = proc.done.then((r) => {
      server.unregisterSession(sessionId)
      const ok = r.code === 0
      const error = ok ? null : (cancelled || r.killed ? 'cancelled' : mapError(r.stderr))
      return { ok, code: r.code, stdout: r.stdout, stderr: stripAnsi(r.stderr), error }
    })
    return { sessionId, done, kill: () => { cancelled = true; proc.kill() } }
  }

  async function selfTest({ timeoutMs = 30000 } = {}) {
    try {
      const s = startSession({ query: 'one piece', player: 'debug', index: 1, episodes: 1, onMenu: async ({ lines }) => lines[0] ?? null, timeoutMs })
      const r = await s.done
      return r.ok && /Selected link:\s*\n\s*https?:\/\//.test(stripAnsi(r.stdout))
    } catch {
      return false
    }
  }

  return { startSession, selfTest }
}
