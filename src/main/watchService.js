import crypto from 'node:crypto'
import { EVENTS } from '../shared/channels.js'
import { animeLineTitle } from '../shared/domain.js'
import { autoAnswer, menuKind, parsePlayerArgs, parseQualityFallback } from './aniCliBridge.js'
import { decideWatched } from './playerMonitor.js'
import { isLastEpisode, nextEpisodeNumber } from '../shared/player.js'

const RETRY_TTL_MS = 30 * 60 * 1000
const MIN_SAVED_POSITION_S = 10 // same floor as before: backing out of the resume prompt reports 0
export const PREFETCH_AT_PERCENT = 80
export const PREFETCH_TTL_MS = 10 * 60 * 1000

function makeGate() {
  let open
  const promise = new Promise((resolve) => { open = resolve })
  return { promise, open }
}

export function createWatchService({ aniCli, player, internalPlayer = null, library, settings, notify, seriesPrefs = null, positions = null, mpvExtraArgs = () => [], skipsFor = null, now = Date.now, celebrations = { hold() {}, release() {} }, getTotalEpisodes = () => null, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const pending = new Map() // requestId -> { sessionId, resolve }
  const sessions = new Map() // sessionId -> session
  const retryBudget = new Map() // "title|episode" -> time of the last recovery
  let current = null // { entry, info } shown in the in-app player
  let lastFailed = null // { params, resume } of the last recovery that never reached the player
  let prefetch = null // the one quiet session for the next episode (running or parked at onPlay)
  let prefetchTimer = null
  const sameKey = (a, b) => a != null && b != null && a.forTitle === b.forTitle && a.episode === b.episode && a.quality === b.quality && a.mode === b.mode
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

  // Both players report progress here; positions and the watched threshold are decided once, for either player.
  async function runPlayer(info, isCancelled = () => false, { onInternalProgress = null } = {}) {
    const s = settings.get()
    const state = { recorded: false }
    const save = (p) => {
      if (state.recorded || info.episode == null || !positions) return
      if (Number.isFinite(p?.position) && p.position >= MIN_SAVED_POSITION_S) positions.save(info.title, info.episode, { position: p.position, duration: p.duration })
    }
    const onProgress = (p) => {
      save(p)
      if (state.recorded || isCancelled() || info.episode == null) return
      const cur = settings.get()
      if (decideWatched({ maxPercent: p?.maxPercent ?? 0, threshold: cur.watchedThreshold, autoTrack: cur.autoTrack, askOnClose: cur.askOnClose }) !== 'watched') return
      try {
        state.recorded = afterPlayback({ title: info.title, episode: info.episode, maxPercent: p.maxPercent }) === 'watched'
      } catch (err) {
        console.warn('watch: recording at the threshold failed, retrying on close', err?.message)
      }
    }
    const mpv = (args, extra = {}) => player.play(args, {
      extraArgs: mpvExtraArgs(),
      autoSkip: s.autoSkip,
      language: s.language,
      skips: skipsFor && info.episode != null ? (duration) => skipsFor(info.title, info.episode, duration) : null,
      onProgress,
      ...extra,
    })
    const mpvResumed = () => {
      const saved = info.episode != null ? positions?.get(info.title, info.episode) ?? null : null
      return saved ? mpv([...info.mpvArgs, `--start=${Math.floor(saved.position)}`], { resumeAt: saved.position }) : mpv(info.mpvArgs)
    }
    let r
    if (!internalPlayer || s.playerMode !== 'internal') r = await mpvResumed()
    else {
      // e.g. a malformed referrer: still play, in mpv. The in-app player never started, so mpv resumes
      // from the saved position itself (and shows "Resumed from") — intended.
      try { r = await internalPlayer.play(info, { onProgress: (p) => { onProgress(p); onInternalProgress?.(p) } }) } catch { r = await mpvResumed() }
      if (r.reason === 'external') {
        const ext = await mpv([...info.mpvArgs, `--start=${Math.floor(r.position ?? 0)}`])
        r = { exitCode: ext.exitCode, maxPercent: Math.max(r.maxPercent ?? 0, ext.maxPercent ?? 0), position: ext.position, duration: ext.duration }
      }
    }
    if (r.reason !== 'retry') save(r)
    return { ...r, recorded: state.recorded }
  }

  function answerMenu(requestId, line) {
    const p = pending.get(requestId)
    if (!p) return
    pending.delete(requestId)
    p.resolve(line ?? null)
  }

  // One ani-cli session. `resume` marks a recovery: it answers menus only automatically and reports its own failure.
  function spawn(params, resume = null, { quiet = false } = {}) {
    let sessionId = null
    const entry = { session: null, params, playing: false, cancelled: false, retrying: false, opened: false, animeLine: null, qualityFallback: null, failure: null, quiet, gate: quiet ? makeGate() : null, prefetchKey: null, parked: false, adopted: false, freeRetryUsed: false, ended: false }
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
        // A prefetch nobody asked for yet must not show a menu; it just gives up.
        if (entry.quiet) { entry.failure = 'needs-user'; return Promise.resolve(null) }
        return new Promise((resolve) => {
          const requestId = crypto.randomUUID()
          pending.set(requestId, { sessionId, resolve: (line) => { remember(prompt, line); resolve(line) } })
          notify(EVENTS.menu, { requestId, sessionId, kind: menuKind(prompt), prompt, lines })
        })
      },
      onPlay: async ({ args }) => {
        const info = { ...parsePlayerArgs(args), qualityFallback: entry.qualityFallback, resume, mode: params.mode }
        if (entry.gate) {
          entry.parked = true
          // Parked: ani-cli waits for the "player" until watch() adopts this session or it is discarded.
          if (!(await entry.gate.promise)) return 1
        }
        entry.opened = true
        notify(EVENTS.playing, { title: info.title, episode: info.episode })
        entry.playing = true
        current = { entry, info }
        celebrations.hold()
        let r
        let prefetched = false
        const onInternalProgress = (p) => {
          if (prefetched) return
          try { prefetched = maybePrefetch(entry, info, p) } catch (err) { prefetched = true; console.warn('watch: prefetch failed to start', err?.message) }
        }
        try { r = await runPlayer(info, () => entry.cancelled || entry.retrying, { onInternalProgress }) } finally { celebrations.release() }
        entry.playing = false
        if (current?.entry === entry) current = null
        // A recovery is never "watching": no tracking, no XP, the saved position stays.
        if (r.reason === 'retry') {
          if (!entry.cancelled) startRetry(retryParams(entry, info), { at: r.position ?? 0, auto: true, title: info.title, episode: info.episode })
          return r.exitCode
        }
        retryBudget.delete(budgetKey(info))
        // A cancelled session must not mark the episode as watched.
        if (!entry.cancelled && !r.recorded) afterPlayback({ title: info.title, episode: info.episode, maxPercent: r.maxPercent })
        return r.exitCode
      },
    })
    entry.session = session
    sessionId = session.sessionId
    sessions.set(sessionId, entry)
    session.done.then((result) => {
      sessions.delete(sessionId)
      entry.ended = true
      if (prefetch === entry) { clearTimer(prefetchTimer); prefetchTimer = null; prefetch = null }
      // Nobody asked for this session (yet): nothing to report.
      if (entry.quiet) {
        if (!entry.cancelled && !result.ok) console.warn('watch: prefetch failed', entry.failure ?? result.error)
        return
      }
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

  // Returns true once this playback has decided (started a prefetch, or found there is nothing to prefetch).
  function maybePrefetch(entry, info, p) {
    if (entry.cancelled || entry.retrying) return false
    if (!((p?.maxPercent ?? 0) >= PREFETCH_AT_PERCENT)) return false
    if (info.episode == null || !Number.isFinite(Number(info.episode))) return true
    if (isLastEpisode(info.episode, getTotalEpisodes(info.title))) return true
    const params = { ...retryParams(entry, info), episode: String(nextEpisodeNumber(info.episode, 1)) }
    const key = { forTitle: info.title, episode: params.episode, quality: params.quality, mode: params.mode }
    if (prefetch && sameKey(prefetch.prefetchKey, key)) return true
    discardPrefetch()
    const next = spawn(params, null, { quiet: true })
    next.prefetchKey = key
    prefetch = next
    prefetchTimer = setTimer(discardPrefetch, PREFETCH_TTL_MS)
    return true
  }

  function discardPrefetch() {
    clearTimer(prefetchTimer)
    prefetchTimer = null
    const entry = prefetch
    if (!entry) return
    prefetch = null
    entry.cancelled = true
    entry.gate.open(false)
    entry.session.kill()
  }

  // "Next" asks for exactly the episode we prepared: hand over the quiet session instead of starting ani-cli again.
  function adoptPrefetch(key) {
    const entry = prefetch
    if (!entry || entry.ended || entry.failure || !sameKey(entry.prefetchKey, key)) return null
    clearTimer(prefetchTimer)
    prefetchTimer = null
    prefetch = null
    entry.quiet = false
    entry.adopted = true
    entry.gate.open(true)
    return entry
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
    const adopted = adoptPrefetch({ forTitle: anime, episode: episode == null ? null : String(episode), quality: params.quality, mode: params.mode })
    if (adopted) return { sessionId: adopted.session.sessionId, quality: params.quality, mode: params.mode }
    discardPrefetch() // the user went elsewhere
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
    // closed() reports the snapshot as progress; a recovery must not record it as watched (its position is still saved).
    current.entry.retrying = true
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

  async function playLocal({ file, title, episode, mode = 'sub' }) {
    const mpvArgs = [`--force-media-title=${title} Episode ${episode}`, file]
    celebrations.hold()
    let r
    try { r = await runPlayer({ mpvArgs, file, title, episode: String(episode), url: file, referrer: null, subUrl: null, mode }) } finally { celebrations.release() }
    return r.recorded ? 'watched' : afterPlayback({ title, episode: String(episode), maxPercent: r.maxPercent })
  }

  return { watch, answerMenu, cancel, playLocal, afterPlayback, recover, retryAgain, dispose: discardPrefetch }
}
