import crypto from 'node:crypto'
import { EVENTS } from '../shared/channels.js'
import { animeLineTitle } from '../shared/domain.js'
import { autoAnswer, menuKind, parsePlayerArgs, parseQualityFallback } from './aniCliBridge.js'
import { decideWatched } from './playerMonitor.js'

const RETRY_TTL_MS = 30 * 60 * 1000

export function createWatchService({ aniCli, player, internalPlayer = null, library, settings, notify, seriesPrefs = null, positions = null, mpvExtraArgs = () => [], skipsFor = null, now = Date.now }) {
  const pending = new Map() // requestId -> { sessionId, resolve }
  const sessions = new Map() // sessionId -> session
  const retryBudget = new Map() // "title|episode" -> time of the last recovery
  let current = null // { entry, info } shown in the in-app player
  let lastFailed = null // { params, resume } of the last recovery that never reached the player
  const budgetKey = (info) => `${info.title}|${info.episode}`

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

  // One ani-cli session. `resume` marks a recovery: it answers menus only automatically and reports its own failure.
  function spawn(params, resume = null) {
    let sessionId = null
    const entry = { session: null, params, playing: false, cancelled: false, opened: false, animeLine: null, qualityFallback: null, failure: null }
    const remember = (prompt, line) => { if (line != null && menuKind(prompt) === 'anime') entry.animeLine = line }
    const session = aniCli.startSession({
      query: params.query,
      player: 'play',
      episodes: params.episode,
      quality: params.quality,
      mode: params.mode,
      onLine: (line) => { entry.qualityFallback ??= parseQualityFallback(line) },
      onMenu: ({ prompt, lines }) => {
        const auto = autoAnswer(prompt, lines, { anime: params.anime, episode: params.episode })
        if (auto) { remember(prompt, auto); return Promise.resolve(auto) }
        // Nobody is on the search page to answer for a recovery; give up instead of showing an orphan menu.
        if (resume) { entry.failure = 'not-found'; return Promise.resolve(null) }
        return new Promise((resolve) => {
          const requestId = crypto.randomUUID()
          pending.set(requestId, { sessionId, resolve: (line) => { remember(prompt, line); resolve(line) } })
          notify(EVENTS.menu, { requestId, sessionId, kind: menuKind(prompt), prompt, lines })
        })
      },
      onPlay: async ({ args }) => {
        const info = { ...parsePlayerArgs(args), qualityFallback: entry.qualityFallback, resume }
        entry.opened = true
        notify(EVENTS.playing, { title: info.title, episode: info.episode })
        entry.playing = true
        current = { entry, info }
        const r = await runPlayer(info)
        entry.playing = false
        if (current?.entry === entry) current = null
        // A recovery is never "watching": no tracking, no XP, the saved position stays.
        if (r.reason === 'retry') {
          if (!entry.cancelled) startRetry(retryParams(entry, info), { at: r.position ?? 0, auto: true, title: info.title, episode: info.episode })
          return r.exitCode
        }
        retryBudget.delete(budgetKey(info))
        // A cancelled session must not mark the episode as watched.
        if (!entry.cancelled) afterPlayback({ title: info.title, episode: info.episode, maxPercent: r.maxPercent })
        return r.exitCode
      },
    })
    entry.session = session
    sessionId = session.sessionId
    sessions.set(sessionId, entry)
    session.done.then((result) => {
      sessions.delete(sessionId)
      notify(EVENTS.sessionEnd, { sessionId, retry: Boolean(resume), result: { ok: result.ok, error: result.error, stderr: result.stderr } })
      if (resume && !entry.opened && !entry.cancelled) {
        lastFailed = { params, resume }
        notify(EVENTS.playerRetry, { title: resume.title, episode: resume.episode, state: 'failed', error: entry.failure ?? result.error ?? 'unknown', sessionId })
      }
    })
    return entry
  }

  // Same series, episode, quality and mode as the stalled playback; the anime picked in a menu is reused by name.
  function retryParams(entry, info) {
    const anime = entry.animeLine ? animeLineTitle(entry.animeLine) : entry.params.anime ?? info.title
    return { ...entry.params, anime, episode: info.episode }
  }

  function startRetry(params, resume) {
    let entry
    try {
      entry = spawn(params, resume)
    } catch {
      lastFailed = { params, resume }
      notify(EVENTS.playerRetry, { title: resume.title, episode: resume.episode, state: 'failed', error: 'tools-missing', sessionId: null })
      return
    }
    notify(EVENTS.playerRetry, { title: resume.title, episode: resume.episode, state: 'reconnecting', sessionId: entry.session.sessionId })
  }

  function watch({ query, anime = null, episode = null, mode = null }) {
    const s = settings.get()
    const prefs = seriesPrefs ? seriesPrefs.resolve(anime ?? query, s) : { quality: s.quality, mode: s.mode }
    const forced = mode === 'sub' || mode === 'dub' ? mode : null
    const params = { query, anime, episode, quality: prefs.quality, mode: forced ?? prefs.mode }
    const entry = spawn(params)
    // ani-cli reads quality/mode only at start; the UI needs them to know when a sub/dub switch requires a restart.
    return { sessionId: entry.session.sessionId, quality: params.quality, mode: params.mode }
  }

  // The renderer reports a stall or an unrecoverable stream; main decides whether this one is automatic.
  function recover(snapshot, { manual = false } = {}) {
    const active = internalPlayer?.current?.()
    if (!active || !current || active.playbackId !== snapshot?.playbackId) return { ok: false }
    const key = budgetKey(current.info)
    const last = retryBudget.get(key)
    if (!manual && last != null && now() - last < RETRY_TTL_MS) return { ok: true, auto: false }
    retryBudget.set(key, now())
    internalPlayer.closed({ ...snapshot, reason: 'retry' })
    return { ok: true }
  }

  function retryAgain() {
    if (!lastFailed) return
    const { params, resume } = lastFailed
    lastFailed = null
    startRetry(params, resume)
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

  return { watch, answerMenu, cancel, playLocal, afterPlayback, recover, retryAgain }
}
