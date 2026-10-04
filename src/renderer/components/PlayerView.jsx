import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { PlayerControls } from './PlayerControls.jsx'
import { trackMax } from '../../shared/player.js'

const HIDE_MS = 3000
const PROGRESS_MS = 5000

export function PlayerView({ open, settings, fullscreen, onSettings, onClose, HlsImpl = Hls }) {
  const api = useApi()
  const t = useT()
  const video = useRef(null)
  const maxPercent = useRef(0)
  const closed = useRef(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [subsOn, setSubsOn] = useState(true)
  const [idle, setIdle] = useState(false)
  const [failed, setFailed] = useState(false)
  const idleTimer = useRef(null)

  const snapshot = () => {
    const v = video.current
    return { playbackId: open.playbackId, position: v?.currentTime ?? 0, duration: Number.isFinite(v?.duration) ? v.duration : 0, maxPercent: Math.round(maxPercent.current) }
  }
  const close = (reason) => {
    if (closed.current) return
    closed.current = true
    api.player.closed({ ...snapshot(), reason })
    onClose(reason)
  }

  useEffect(() => {
    const v = video.current
    if (open.kind === 'file') { v.src = open.src; return undefined }
    const hls = new HlsImpl({ enableWorker: true })
    let netRetries = 0
    let mediaRecovered = false
    hls.on(HlsImpl.Events.ERROR, (_e, d) => {
      if (!d.fatal) return
      if (d.type === HlsImpl.ErrorTypes.NETWORK_ERROR && netRetries < 3) { netRetries++; hls.startLoad(); return }
      if (d.type === HlsImpl.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return }
      setFailed(true)
    })
    hls.loadSource(open.src)
    hls.attachMedia(v)
    return () => hls.destroy()
  }, [open.playbackId])

  useEffect(() => {
    const id = setInterval(() => api.player.progress(snapshot()), PROGRESS_MS)
    return () => clearInterval(id)
  }, [open.playbackId])

  useEffect(() => {
    const track = video.current?.textTracks?.[0]
    if (track) track.mode = subsOn ? 'showing' : 'hidden'
  }, [subsOn])

  const poke = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => { if (video.current && !video.current.paused) setIdle(true) }, HIDE_MS)
  }
  useEffect(() => { poke(); return () => clearTimeout(idleTimer.current) }, [])

  const togglePlay = () => { const v = video.current; if (v.paused) v.play(); else v.pause() }
  const step = (s) => { const v = video.current; v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s)) }
  const toggleFullscreen = () => api.window.setFullscreen(!fullscreen)

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.('input, select, textarea')) return
      const v = video.current
      if (!v) return
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft': step(-10); break
        case 'ArrowRight': step(10); break
        case 'ArrowUp': v.volume = Math.min(1, v.volume + 0.1); break
        case 'ArrowDown': v.volume = Math.max(0, v.volume - 0.1); break
        case 'f': case 'F': toggleFullscreen(); break
        case 'm': case 'M': v.muted = !v.muted; setMuted(v.muted); break
        case 's': case 'S': setSubsOn((x) => !x); break
        case 'n': case 'N': close('next'); return
        default: return
      }
      poke()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const onLoadedMetadata = () => { setDuration(video.current.duration); video.current.play() }
  const onTimeUpdate = () => {
    const v = video.current
    setTime(v.currentTime)
    maxPercent.current = trackMax(maxPercent.current, v.currentTime, v.duration)
  }

  return (
    <div className={`player player--subs-${settings.subtitleSize}${idle ? ' player--idle' : ''}`} onMouseMove={poke}>
      <video
        ref={video} className="player__video" crossOrigin="anonymous"
        onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setIdle(false); api.player.progress(snapshot()) }}
        onVolumeChange={() => { setVolume(video.current.volume); setMuted(video.current.muted) }}
        onEnded={() => close('ended')} onClick={togglePlay}
      >
        {open.subtitleUrl && <track kind="subtitles" src={open.subtitleUrl} default />}
      </video>
      <div className="player__top">
        <button type="button" onClick={() => close('back')}><Icon name="back" /> {t('search.back')}</button>
        <h2 className="player__title">{open.title} <span className="hud">{t('player.episode', { episode: open.episode ?? '?' })}</span></h2>
      </div>
      {failed && (
        <div className="player__error notice notice--error" role="alert">
          <span>{t('player.error')}</span>
          <button type="button" className="primary" onClick={() => close('external')}>{t('player.playExternal')}</button>
          <button type="button" onClick={() => close('back')}>{t('search.back')}</button>
        </div>
      )}
      <PlayerControls
        time={time} duration={duration} playing={playing} muted={muted} volume={volume} subsOn={subsOn}
        subtitleSize={settings.subtitleSize} fullscreen={fullscreen} canPrev={Number(open.episode) > 1}
        onTogglePlay={togglePlay} onSeek={(s) => { video.current.currentTime = s }} onStep={step}
        onPrev={() => close('prev')} onNext={() => close('next')}
        onToggleMute={() => { video.current.muted = !video.current.muted }} onVolume={(x) => { video.current.volume = x; video.current.muted = false }}
        onToggleSubs={() => setSubsOn((x) => !x)} onSubtitleSize={(s) => onSettings({ subtitleSize: s })} onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
