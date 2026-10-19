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
  // "Invalid episode!" = the episode list lacks the number; "Invalid episode selection" (no "!") is not that.
  if (/Episode not released|Out of range|Invalid episode!/i.test(s)) return 'episode-not-released'
  if (/Blocked by cloudflare/i.test(s)) return 'blocked'
  if (/No sources found for dub/i.test(s)) return 'no-dub'
  if (/no valid sources/i.test(s)) return 'no-sources'
  return 'unknown'
}

// ani-cli prints "<quality> not found, defaulting to best" (colored, after "\33[2K\r") when the asked quality is missing.
export function parseQualityFallback(line) {
  const m = /^(\S+) not found, defaulting to best/.exec(stripAnsi(line).trim())
  return m ? m[1] : null
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
  const opt = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null }
  const full = opt('force-media-title') ?? ''
  const m = /^(.*) Episode (\S+)$/.exec(full)
  const url = [...args].reverse().find((a) => !a.startsWith('--')) ?? null
  return { mpvArgs: args, title: m ? m[1] : full, episode: m ? m[2] : null, url, referrer: opt('referrer'), subUrl: opt('sub-file') }
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
    // ani-cli parses options anywhere in argv: a query word starting with '-' must never reach it as one
    const words = String(query).trim().split(/\s+/).filter((w) => !w.startsWith('-'))
    args.push(...(words.length ? words : ['']))
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

  // ani-cli picks a lone search result itself (nth() skips the menu), so its title never reaches ANI_CLI_MENU;
  // the only place it leaves ani-cli is the player's --force-media-title. A quiet second run of the same search
  // with -S 1 hands it to a "player" that only reads the title and plays nothing. Resolves to the title or null.
  function probeTitle({ query, episode, quality = null, mode = null, timeoutMs = 30000 }) {
    let title = null
    let s
    try {
      s = startSession({
        query, index: 1, episodes: episode, quality, mode, timeoutMs,
        // a menu here means ani-cli did not take the lone-result path: give up rather than guess
        onMenu: async () => null,
        onPlay: async ({ args }) => { title = parsePlayerArgs(args).title || null; return 1 },
      })
    } catch {
      return { done: Promise.resolve(null), kill: () => {} }
    }
    return { done: s.done.then(() => title, () => title), kill: s.kill }
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

  return { startSession, probeTitle, selfTest }
}
