import { EVENTS } from '../shared/channels.js'

// Bridges a watch session to the renderer's PlayerView; resolves like playerMonitor.play so tracking is identical.
export function createInternalPlayer({ streams, notify, positions, getTotalEpisodes = () => null, seriesPrefs = null }) {
  let active = null

  function finish(result) {
    if (!active) return
    const a = active
    active = null
    streams.unregister(a.playbackId)
    a.resolve({
      exitCode: 0,
      maxPercent: Math.max(a.maxPercent, result.maxPercent ?? 0),
      position: result.position ?? a.position,
      duration: result.duration ?? a.duration,
      reason: result.reason ?? 'back',
    })
  }

  function play(info, { onProgress = null } = {}) {
    if (active) stop()
    const local = Boolean(info.file)
    const reg = local ? streams.registerFile(info.file) : streams.register({ url: info.url, referrer: info.referrer, subUrl: info.subUrl })
    // A recovery carries its own position (it may be under the 10 s floor watchService applies when saving) and must not ask again;
    // the quality notice was already shown for this episode, so it is not repeated.
    const saved = info.resume || info.episode == null ? null : positions.get(info.title, info.episode)
    const mode = info.mode === 'dub' ? 'dub' : 'sub'
    // same key as positions (the player title), so reading and saving the offset always meet
    const subOffset = seriesPrefs?.get(info.title)?.subOffset?.[mode] ?? 0
    return new Promise((resolve) => {
      active = { playbackId: reg.id, resolve, title: info.title, episode: info.episode, maxPercent: 0, position: 0, duration: 0, onProgress }
      notify(EVENTS.playerOpen, {
        playbackId: reg.id, title: info.title, episode: info.episode, kind: local ? 'file' : 'hls',
        src: local ? reg.fileUrl : reg.playlistUrl, subtitleUrl: reg.subtitleUrl ?? null,
        resumeAt: info.resume ? info.resume.at : saved?.position ?? null, autoResume: Boolean(info.resume),
        qualityFallback: info.resume ? null : info.qualityFallback ?? null, totalEpisodes: getTotalEpisodes(info.title),
        mode, subOffset,
      })
    })
  }

  function remember(p) {
    active.position = p.position ?? active.position
    active.duration = p.duration ?? active.duration
    active.maxPercent = Math.max(active.maxPercent, p.maxPercent ?? 0)
    // watchService decides what to keep (positions, the watched threshold) for both players.
    active.onProgress?.({ position: active.position, duration: active.duration, maxPercent: active.maxPercent })
  }

  function progress(p) { if (active && p?.playbackId === active.playbackId) remember(p) }
  function closed(p) {
    if (!active || p?.playbackId !== active.playbackId) return
    // A recovery is decided in main, so main also takes the player off screen.
    if (p.reason === 'retry') notify(EVENTS.playerClose, { playbackId: active.playbackId })
    // A throwing onProgress must never leave the playback unresolved (that would hold celebrations forever).
    try { remember(p) } catch (err) { console.warn('internalPlayer: progress handler failed on close', err?.message) } finally { finish(p) }
  }
  const current = () => (active ? { playbackId: active.playbackId, title: active.title, episode: active.episode } : null)
  function stop() {
    if (!active) return
    notify(EVENTS.playerClose, { playbackId: active.playbackId })
    finish({ reason: 'back' })
  }

  return { play, progress, closed, stop, current, isActive: () => active != null }
}
