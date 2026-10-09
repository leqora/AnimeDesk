import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { PlayerControls } from './PlayerControls.jsx'
import { SkipButton } from './SkipButton.jsx'
import { NextEpisodeCard } from './NextEpisodeCard.jsx'
import { ResumePrompt } from './ResumePrompt.jsx'
import { usePlayerHealth } from '../player/usePlayerHealth.js'
import { trackMax, segmentAt, isLastEpisode, qualityLabel, qualityName } from '../../shared/player.js'

const HIDE_MS = 3000
const PROGRESS_MS = 5000
const VOLUME_SAVE_MS = 500
const QUALITY_FLASH_MS = 4000
const CLICK_DELAY_MS = 220
const COUNTDOWN_S = 10
const ENDING_FALLBACK_S = 30
const NET_RETRIES = 3
// hls.js 1.x: startLoad() is a no-op until a manifest has been parsed, so these must reload the source
const MANIFEST_ERRORS = new Set(['manifestLoadError', 'manifestLoadTimeOut', 'manifestParsingError'])
// Physical keys, so letter shortcuts also work on non-Latin layouts (e.g. Serbian Cyrillic).
const KEY_BY_CODE = { KeyF: 'f', KeyM: 'm', KeyS: 's', KeyN: 'n', Space: ' ' }
const TEXT_FIELD = 'input:not([type=range]), textarea, [contenteditable="true"]'
const shortcutKey = (e) => KEY_BY_CODE[e.code] ?? (e.key.length === 1 ? e.key.toLowerCase() : e.key)

export function PlayerView({ open, settings, fullscreen, onSettings, onClose, HlsImpl = Hls }) {
  const api = useApi()
  // latest props/api for long-lived handlers (keydown, intervals) so they are never stale
  const live = useRef({})
  live.current = { onClose, open, api, onSettings, settings }
  const t = useT()
  const video = useRef(null)
  const maxPercent = useRef(0)
  const closed = useRef(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(settings.playerMuted)
  const [volume, setVolume] = useState(settings.playerVolume)
  const volumeTimer = useRef(null)
  const pendingVolume = useRef(null)
  const clickTimer = useRef(null)
  const [subsOn, setSubsOn] = useState(true)
  const [idle, setIdle] = useState(false)
  const [failed, setFailed] = useState(false)
  const health = usePlayerHealth({ video, active: false })
  const idleTimer = useRef(null)
  const [skips, setSkips] = useState(null)
  const [resume, setResume] = useState(open.resumeAt)
  const [end, setEnd] = useState(null)
  const [left, setLeft] = useState(COUNTDOWN_S)
  const [flash, setFlash] = useState(null)
  const autoSkipped = useRef(new Set())
  const flashTimer = useRef(null)
  const [quality, setQuality] = useState(null)
  const fallbackShown = useRef(false)
  const showFlash = (text, ms = 1500) => {
    setFlash(text)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), ms)
  }
  const readQuality = () => setQuality(qualityLabel(video.current?.videoHeight))
  useEffect(() => {
    if (!open.qualityFallback || !quality || fallbackShown.current) return
    fallbackShown.current = true
    showFlash(t('player.qualityFallback', { requested: qualityName(open.qualityFallback), actual: quality }), QUALITY_FLASH_MS)
  }, [quality])

  const snapshot = () => {
    const v = video.current
    const { open } = live.current
    return { playbackId: open.playbackId, position: v?.currentTime ?? 0, duration: Number.isFinite(v?.duration) ? v.duration : 0, maxPercent: Math.round(maxPercent.current) }
  }
  const close = (reason) => {
    if (closed.current) return
    closed.current = true
    // leaving for the next episode during the ending counts as having watched it all
    if (reason === 'next' && live.current.inEnding) maxPercent.current = 100
    live.current.api.player.closed({ ...snapshot(), reason })
    live.current.onClose(reason)
  }
  // Saved after the slider settles; refs are gone by unmount, so the last values are kept here.
  const flushVolume = () => {
    clearTimeout(volumeTimer.current)
    const p = pendingVolume.current
    pendingVolume.current = null
    const s = live.current.settings
    if (p && (p.playerVolume !== s.playerVolume || p.playerMuted !== s.playerMuted)) live.current.onSettings(p)
  }
  const onVolumeChange = () => {
    const v = video.current
    setVolume(v.volume)
    setMuted(v.muted)
    pendingVolume.current = { playerVolume: v.volume, playerMuted: v.muted }
    clearTimeout(volumeTimer.current)
    volumeTimer.current = setTimeout(flushVolume, VOLUME_SAVE_MS)
  }
  useEffect(() => {
    const v = video.current
    v.volume = settings.playerVolume
    v.muted = settings.playerMuted
    return () => { flushVolume(); clearTimeout(clickTimer.current) }
  }, [])

  useEffect(() => {
    const v = video.current
    if (open.kind === 'file') { v.src = open.src; return undefined }
    const hls = new HlsImpl({ enableWorker: true })
    let netRetries = 0
    let mediaRecovered = false
    hls.on(HlsImpl.Events.ERROR, (_e, d) => {
      if (!d.fatal) return
      if (d.type === HlsImpl.ErrorTypes.NETWORK_ERROR && netRetries < NET_RETRIES) {
        netRetries++
        if (MANIFEST_ERRORS.has(d.details) || !hls.levels?.length) hls.loadSource(open.src)
        else hls.startLoad()
        return
      }
      if (d.type === HlsImpl.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return }
      setFailed(true)
    })
    hls.loadSource(open.src)
    hls.attachMedia(v)
    return () => hls.destroy()
  }, [open.playbackId])

  useEffect(() => {
    const id = setInterval(() => live.current.api.player.progress(snapshot()), PROGRESS_MS)
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
  useEffect(() => { poke(); return () => { clearTimeout(idleTimer.current); clearTimeout(flashTimer.current) } }, [])

  // autoplay policy / aborted loads reject play(); that is never fatal
  const play = () => { const p = video.current?.play(); if (p && typeof p.catch === 'function') p.catch(() => {}) }
  const togglePlay = () => { const v = video.current; if (v.paused) play(); else v.pause() }
  const step = (s) => { const v = video.current; v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s)) }
  const toggleFullscreen = () => live.current.api.window.setFullscreen(!fullscreen)
  // A click waits briefly so a double click can toggle fullscreen without also pausing.
  const onVideoClick = () => { clearTimeout(clickTimer.current); clickTimer.current = setTimeout(togglePlay, CLICK_DELAY_MS) }
  const onVideoDoubleClick = () => { clearTimeout(clickTimer.current); toggleFullscreen() }

  useEffect(() => {
    const onKey = (e) => {
      // Only text entry keeps its keys; a focused slider or select must not swallow the player shortcuts.
      if (e.ctrlKey || e.altKey || e.metaKey || e.target?.closest?.(TEXT_FIELD)) return
      const v = video.current
      if (!v) return
      switch (shortcutKey(e)) {
        case ' ': togglePlay(); break
        case 'ArrowLeft': step(-10); break
        case 'ArrowRight': step(10); break
        case 'ArrowUp': v.volume = Math.min(1, v.volume + 0.1); break
        case 'ArrowDown': v.volume = Math.max(0, v.volume - 0.1); break
        case 'f': toggleFullscreen(); break
        case 'm': v.muted = !v.muted; break
        case 's': setSubsOn((x) => !x); break
        case 'n': e.preventDefault(); if (!live.current.lastEpisode) close('next'); return
        default: return
      }
      e.preventDefault() // the focused control (slider, select) must not react to the same key
      poke()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const finishEpisode = () => {
    video.current?.pause()
    // reached the ending (or its auto-skip): the episode is watched even if the ED itself was not
    maxPercent.current = 100
    if (lastEpisode) setEnd('done')
    else if (settings.autoNext) { setLeft(COUNTDOWN_S); setEnd('countdown') }
    else setEnd('manual')
  }
  useEffect(() => {
    if (end !== 'countdown') return undefined
    const id = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(id)
  }, [end])
  useEffect(() => { if (end === 'countdown' && left <= 0) close('next') }, [left, end])

  const onLoadedMetadata = () => {
    const v = video.current
    setDuration(v.duration)
    readQuality()
    if (open.episode != null) {
      const request = Promise.resolve().then(() => api.skip.get(open.title, open.episode, v.duration))
      request.then(setSkips).catch(() => setSkips(null))
    }
    if (resume == null) play()
  }
  const onTimeUpdate = () => {
    const v = video.current
    setTime(v.currentTime)
    maxPercent.current = trackMax(maxPercent.current, v.currentTime, v.duration)
    const seg = segmentAt(v.currentTime, skips)
    if (settings.autoSkip && seg && !autoSkipped.current.has(seg)) {
      autoSkipped.current.add(seg)
      if (seg === 'ed') { finishEpisode(); return }
      v.currentTime = skips[seg].end
      showFlash(t(seg === 'op' ? 'player.skipped' : 'player.skippedRecap'))
    }
  }
  const segment = segmentAt(time, skips)
  const lastEpisode = isLastEpisode(open.episode, open.totalEpisodes)
  const inEnding = !end && !lastEpisode && (segment === 'ed' || (!skips?.ed && duration > 0 && time >= duration - ENDING_FALLBACK_S))
  live.current.inEnding = inEnding
  live.current.lastEpisode = lastEpisode
  const startAt = (sec) => { video.current.currentTime = sec; setResume(null); play() }

  return (
    <div className={`player player--subs-${settings.subtitleSize}${idle ? ' player--idle' : ''}`} onMouseMove={poke}>
      <video
        ref={video} className="player__video" crossOrigin="anonymous"
        onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate}
        onPlay={() => { setPlaying(true); setResume(null); poke() }} onPause={() => { health.onReady(); setPlaying(false); setIdle(false); api.player.progress(snapshot()) }}
        onVolumeChange={onVolumeChange} onResize={readQuality}
        onWaiting={health.onWaiting} onStalled={health.onWaiting} onPlaying={health.onReady} onCanPlay={health.onReady} onSeeked={health.onReady}
        onEnded={finishEpisode} onClick={onVideoClick} onDoubleClick={onVideoDoubleClick}
        // a downloaded file the browser cannot decode; hls streams report through hls.js (with recovery) instead
        onError={() => { if (open.kind === 'file') setFailed(true) }}
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
      {health.buffering && !failed && resume == null && !end && (
        <div className="player__loading" role="status" aria-label={t('player.loading')}>
          <span className="player__spinner" aria-hidden="true" />
          {health.slow && <span className="hud">{t('player.slow')}</span>}
        </div>
      )}
      {resume != null && <ResumePrompt at={resume} onResume={() => startAt(resume)} onRestart={() => startAt(0)} />}
      {resume == null && <SkipButton segment={segment} onSkip={() => { video.current.currentTime = skips[segment].end }} />}
      {inEnding && resume == null && <button type="button" className="player__next primary" onClick={() => close('next')}>{t('player.next')}</button>}
      {flash && <div className="player__flash hud" role="status">{flash}</div>}
      {end && <NextEpisodeCard mode={end} seconds={left} onNext={() => close('next')} onCancel={() => setEnd('manual')} onBack={() => close('ended')} />}
      <PlayerControls
        segments={['op', 'ed', 'recap'].filter((k) => skips?.[k]).map((k) => ({ kind: k, ...skips[k] }))}
        time={time} duration={duration} quality={quality} playing={playing} muted={muted} volume={volume} subsOn={subsOn}
        subtitleSize={settings.subtitleSize} fullscreen={fullscreen} canPrev={Number(open.episode) > 1} canNext={!lastEpisode}
        onTogglePlay={togglePlay} onSeek={(s) => { video.current.currentTime = s }} onStep={step}
        onPrev={() => close('prev')} onNext={() => close('next')}
        onToggleMute={() => { video.current.muted = !video.current.muted }} onVolume={(x) => { video.current.volume = x; video.current.muted = false }}
        onToggleSubs={() => setSubsOn((x) => !x)} onSubtitleSize={(s) => onSettings({ subtitleSize: s })} onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
