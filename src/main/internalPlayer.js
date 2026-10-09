import { EVENTS } from '../shared/channels.js'

// Bridges a watch session to the renderer's PlayerView; resolves like playerMonitor.play so tracking is identical.
export function createInternalPlayer({ streams, notify, positions, getTotalEpisodes = () => null }) {
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

  function play(info) {
    if (active) stop()
    const local = Boolean(info.file)
    const reg = local ? streams.registerFile(info.file) : streams.register({ url: info.url, referrer: info.referrer, subUrl: info.subUrl })
    // A recovery carries its own position (it may be under the 10 s that positions keeps) and must not ask again.
    const saved = info.resume || info.episode == null ? null : positions.get(info.title, info.episode)
    return new Promise((resolve) => {
      active = { playbackId: reg.id, resolve, title: info.title, episode: info.episode, maxPercent: 0, position: 0, duration: 0 }
      notify(EVENTS.playerOpen, {
        playbackId: reg.id, title: info.title, episode: info.episode, kind: local ? 'file' : 'hls',
        src: local ? reg.fileUrl : reg.playlistUrl, subtitleUrl: reg.subtitleUrl ?? null,
        resumeAt: info.resume ? info.resume.at : saved?.position ?? null, autoResume: Boolean(info.resume),
        qualityFallback: info.qualityFallback ?? null, totalEpisodes: getTotalEpisodes(info.title),
      })
    })
  }

  function remember(p) {
    active.position = p.position ?? active.position
    active.duration = p.duration ?? active.duration
    active.maxPercent = Math.max(active.maxPercent, p.maxPercent ?? 0)
    // Below 10 s (e.g. backing out of the resume prompt reports 0) must not overwrite a good resume point.
    if (active.episode != null && Number.isFinite(p.position) && p.position >= 10) positions.save(active.title, active.episode, { position: p.position, duration: p.duration })
  }

  function progress(p) { if (active && p?.playbackId === active.playbackId) remember(p) }
  function closed(p) {
    if (!active || p?.playbackId !== active.playbackId) return
    // A recovery is decided in main, so main also takes the player off screen.
    if (p.reason === 'retry') notify(EVENTS.playerClose, { playbackId: active.playbackId })
    remember(p)
    finish(p)
  }
  const current = () => (active ? { playbackId: active.playbackId, title: active.title, episode: active.episode } : null)
  function stop() {
    if (!active) return
    notify(EVENTS.playerClose, { playbackId: active.playbackId })
    finish({ reason: 'back' })
  }

  return { play, progress, closed, stop, current, isActive: () => active != null }
}
