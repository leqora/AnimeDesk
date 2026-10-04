import crypto from 'node:crypto'
import { EVENTS } from '../shared/channels.js'
import { autoAnswer, menuKind, parsePlayerArgs } from './aniCliBridge.js'
import { decideWatched } from './playerMonitor.js'

export function createWatchService({ aniCli, player, internalPlayer = null, library, settings, notify, seriesPrefs = null, positions = null, mpvExtraArgs = () => [], skipsFor = null }) {
  const pending = new Map() // requestId -> { sessionId, resolve }
  const sessions = new Map() // sessionId -> session

  function afterPlayback({ title, episode, maxPercent }) {
    const s = settings.get()
    const decision = decideWatched({ maxPercent, threshold: s.watchedThreshold, autoTrack: s.autoTrack, askOnClose: s.askOnClose })
    if (episode == null) return 'none'
    if (decision === 'watched') {
      library.recordWatched({ aniCliTitle: title, episode })
      positions?.clear(title, episode)
      notify(EVENTS.libraryChanged)
    }
    if (decision === 'ask') notify(EVENTS.ask, { aniCliTitle: title, episode })
    return decision
  }

  // Both players resolve to { exitCode, maxPercent, ... }, so tracking does not care which one ran.
  async function runPlayer(info) {
    const s = settings.get()
    const mpv = (args) => player.play(args, {
      extraArgs: mpvExtraArgs(),
      autoSkip: s.autoSkip,
      language: s.language,
      skips: skipsFor && info.episode != null ? (duration) => skipsFor(info.title, info.episode, duration) : null,
    })
    if (!internalPlayer || s.playerMode !== 'internal') return mpv(info.mpvArgs)
    let r
    try { r = await internalPlayer.play(info) } catch { return mpv(info.mpvArgs) } // e.g. a malformed referrer: still play, in mpv
    if (r.reason !== 'external') return r
    const ext = await mpv([...info.mpvArgs, `--start=${Math.floor(r.position ?? 0)}`])
    return { exitCode: ext.exitCode, maxPercent: Math.max(r.maxPercent ?? 0, ext.maxPercent ?? 0) }
  }

  function answerMenu(requestId, line) {
    const p = pending.get(requestId)
    if (!p) return
    pending.delete(requestId)
    p.resolve(line ?? null)
  }

  function watch({ query, anime = null, episode = null, mode = null }) {
    let sessionId = null
    const s = settings.get()
    const prefs = seriesPrefs ? seriesPrefs.resolve(anime ?? query, s) : { quality: s.quality, mode: s.mode }
    const forced = mode === 'sub' || mode === 'dub' ? mode : null
    const effectiveMode = forced ?? prefs.mode
    const session = aniCli.startSession({
      query,
      player: 'play',
      episodes: episode,
      quality: prefs.quality,
      mode: effectiveMode,
      onMenu: ({ prompt, lines }) => {
        const auto = autoAnswer(prompt, lines, { anime, episode })
        if (auto) return Promise.resolve(auto)
        return new Promise((resolve) => {
          const requestId = crypto.randomUUID()
          pending.set(requestId, { sessionId, resolve })
          notify(EVENTS.menu, { requestId, sessionId, kind: menuKind(prompt), prompt, lines })
        })
      },
      onPlay: async ({ args }) => {
        const info = parsePlayerArgs(args)
        notify(EVENTS.playing, { title: info.title, episode: info.episode })
        entry.playing = true
        const r = await runPlayer(info)
        entry.playing = false
        // A cancelled session must not mark the episode as watched.
        if (!entry.cancelled) afterPlayback({ title: info.title, episode: info.episode, maxPercent: r.maxPercent })
        return r.exitCode
      },
    })
    const entry = { session, playing: false, cancelled: false }
    sessionId = session.sessionId
    sessions.set(sessionId, entry)
    session.done.then((result) => {
      sessions.delete(sessionId)
      notify(EVENTS.sessionEnd, { sessionId, result: { ok: result.ok, error: result.error, stderr: result.stderr } })
    })
    // ani-cli reads quality/mode only at start; the UI needs them to know when a sub/dub switch requires a restart.
    return { sessionId, quality: prefs.quality, mode: effectiveMode }
  }

  function cancel(sessionId) {
    for (const [requestId, p] of pending) if (p.sessionId === sessionId) answerMenu(requestId, null)
    const entry = sessions.get(sessionId)
    if (!entry) return
    entry.cancelled = true
    if (entry.playing) { player.stop(); internalPlayer?.stop() } // mpv is the app's child, killing ani-cli does not close it
    entry.session.kill()
  }

  async function playLocal({ file, title, episode }) {
    const mpvArgs = [`--force-media-title=${title} Episode ${episode}`, file]
    const r = await runPlayer({ mpvArgs, file, title, episode: String(episode), url: file, referrer: null, subUrl: null })
    return afterPlayback({ title, episode: String(episode), maxPercent: r.maxPercent })
  }

  return { watch, answerMenu, cancel, playLocal, afterPlayback }
}
