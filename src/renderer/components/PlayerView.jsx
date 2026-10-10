import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { PlayerControls } from './PlayerControls.jsx'
import { SkipButton } from './SkipButton.jsx'
import { NextEpisodeCard } from './NextEpisodeCard.jsx'
import { ResumePrompt } from './ResumePrompt.jsx'
import { SubtitleOverlay } from './SubtitleOverlay.jsx'
import { usePlayerHealth } from '../player/usePlayerHealth.js'
import { useLatest } from '../player/useLatest.js'
import { useFlash } from '../player/useFlash.js'
import { useIdle } from '../player/useIdle.js'
import { usePlayerVolume } from '../player/usePlayerVolume.js'
import { usePlayerSubtitles } from '../player/usePlayerSubtitles.js'
import { usePlaybackRate } from '../player/usePlaybackRate.js'
import { useHlsSource } from '../player/useHlsSource.js'
import { useEpisodeEnd } from '../player/useEpisodeEnd.js'
import { usePlayerShortcuts, QUIET } from '../player/usePlayerShortcuts.js'
import { trackMax, bufferedRanges, sameRanges, segmentAt, isLastEpisode, qualityLabel, qualityName } from '../../shared/player.js'

const PROGRESS_MS = 5000
const QUALITY_FLASH_MS = 4000
const CLICK_DELAY_MS = 220
const ENDING_FALLBACK_S = 30

const headStatus = (url) => fetch(url, { method: 'HEAD' }).then((r) => r.status)
export function PlayerView({ open, settings, fullscreen, onSettings, onClose, initialRate = 1, onRate, HlsImpl = Hls, probeSub = headStatus }) {
  const api = useApi()
  const t = useT()
  const video = useRef(null)
  const trackEl = useRef(null)
  const maxPercent = useRef(0)
  const closed = useRef(false)
  const failing = useRef(false)
  const lastTime = useRef(0)
  const clickTimer = useRef(null)
  const autoSkipped = useRef(new Set())
  const fallbackShown = useRef(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState([])
  const [playing, setPlaying] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [failed, setFailed] = useState(null) // null | 'retryable' | 'final'
  const [skips, setSkips] = useState(null)
  const [resume, setResume] = useState(open.autoResume ? null : open.resumeAt)
  const [quality, setQuality] = useState(null)
  const mode = open.mode === 'dub' ? 'dub' : 'sub'
  const lastEpisode = isLastEpisode(open.episode, open.totalEpisodes)

  const flash = useFlash()
  const volume = usePlayerVolume({ video, settings, onSettings })
  const subs = usePlayerSubtitles({ video, trackEl, open, mode, settings, onSettings, probeSub, flash: flash.show })
  const rate = usePlaybackRate({ video, flash: flash.show, language: settings.language, initial: initialRate, onChange: onRate })
  const { idle, poke, show: showControls } = useIdle({ video, hold: menuOpen })
  const ending = useEpisodeEnd({ autoNext: settings.autoNext, lastEpisode, onNext: () => close('next') })
  const { end } = ending
  const health = usePlayerHealth({ video, active: resume == null && !end && !failed, onStall: () => fail() })
  const segment = segmentAt(time, skips)
  const inEnding = !end && !lastEpisode && (segment === 'ed' || (!skips?.ed && duration > 0 && time >= duration - ENDING_FALLBACK_S))
  // latest props for long-lived handlers (keydown, intervals, hls.js callbacks) so they are never stale
  const latest = useLatest({ api, open, onClose, fullscreen, inEnding })

  const readQuality = () => setQuality(qualityLabel(video.current?.videoHeight))
  useEffect(() => {
    if (!open.qualityFallback || !quality || fallbackShown.current) return
    fallbackShown.current = true
    flash.show(t('player.qualityFallback', { requested: qualityName(open.qualityFallback), actual: quality }), QUALITY_FLASH_MS)
  }, [quality])

  const snapshot = () => {
    const v = video.current
    return { playbackId: latest.current.open.playbackId, position: v?.currentTime ?? 0, duration: Number.isFinite(v?.duration) ? v.duration : 0, maxPercent: Math.round(maxPercent.current) }
  }
  const close = (reason) => {
    if (closed.current) return
    closed.current = true
    // leaving for the next episode during the ending counts as having watched it all
    if (reason === 'next' && latest.current.inEnding) maxPercent.current = 100
    subs.flush()
    latest.current.api.player.closed({ ...snapshot(), reason })
    latest.current.onClose(reason)
  }
  // Main owns the recovery budget: it either closes this player and reconnects, or says the automatic try is used up.
  const fail = async () => {
    if (failing.current || closed.current) return
    failing.current = true
    const { open, api } = latest.current
    if (open.kind === 'file') { setFailed('final'); return }
    let r = null
    try { r = await api.player.recover(snapshot()) } catch { /* treated as not recoverable */ }
    if (r?.ok && r.auto !== false) return
    setFailed(r?.ok ? 'retryable' : 'final')
  }
  const retryNow = () => {
    Promise.resolve(latest.current.api.player.recover(snapshot(), { manual: true }))
      .then((r) => { if (!r?.ok) setFailed('final') }, () => setFailed('final'))
  }
  useEffect(() => () => clearTimeout(clickTimer.current), [])
  useHlsSource({ video, open, HlsImpl, onFatal: fail })
  useEffect(() => {
    const id = setInterval(() => latest.current.api.player.progress(snapshot()), PROGRESS_MS)
    return () => clearInterval(id)
  }, [open.playbackId])

  // autoplay policy / aborted loads reject play(); that is never fatal
  const play = () => { const p = video.current?.play(); if (p && typeof p.catch === 'function') p.catch(() => {}) }
  const togglePlay = () => { const v = video.current; if (v.paused) play(); else v.pause() }
  const step = (s) => { const v = video.current; v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s)) }
  const toggleFullscreen = () => latest.current.api.window.setFullscreen(!latest.current.fullscreen)
  // A click waits briefly so a double click can toggle fullscreen without also pausing.
  const onVideoClick = () => { clearTimeout(clickTimer.current); clickTimer.current = setTimeout(togglePlay, CLICK_DELAY_MS) }
  const onVideoDoubleClick = () => { clearTimeout(clickTimer.current); toggleFullscreen() }

  usePlayerShortcuts({
    ' ': togglePlay,
    ArrowLeft: () => step(-10),
    ArrowRight: () => step(10),
    ArrowUp: () => volume.nudge(0.1),
    ArrowDown: () => volume.nudge(-0.1),
    f: toggleFullscreen,
    m: volume.toggleMute,
    s: subs.toggle,
    g: (e) => subs.shift(e.shiftKey ? -1 : -0.1),
    h: (e) => subs.shift(e.shiftKey ? 1 : 0.1),
    '[': () => rate.step(-1),
    ']': () => rate.step(1),
    '\\': rate.reset,
    n: () => { if (!lastEpisode) close('next'); return QUIET },
  }, { onHandled: poke })

  const finishEpisode = () => {
    video.current?.pause()
    // reached the ending (or its auto-skip): the episode is watched even if the ED itself was not
    maxPercent.current = 100
    ending.finish()
  }
  const onLoadedMetadata = () => {
    const v = video.current
    setDuration(v.duration)
    readQuality()
    rate.reapply()
    if (open.autoResume && open.resumeAt > 0) v.currentTime = open.resumeAt
    if (open.episode != null) {
      const request = Promise.resolve().then(() => api.skip.get(open.title, open.episode, v.duration))
      request.then(setSkips).catch(() => setSkips(null))
    }
    if (resume == null) play()
  }
  const readBuffered = () => { const next = bufferedRanges(video.current?.buffered); setBuffered((prev) => (sameRanges(prev, next) ? prev : next)) }
  const onTimeUpdate = () => {
    const v = video.current
    readBuffered()
    setTime(v.currentTime)
    // a browser `stalled` can fire with enough data buffered; moving time proves playback is fine
    if (!v.paused && v.currentTime > lastTime.current) health.onReady()
    lastTime.current = v.currentTime
    maxPercent.current = trackMax(maxPercent.current, v.currentTime, v.duration)
    const seg = segmentAt(v.currentTime, skips)
    if (settings.autoSkip && seg && !autoSkipped.current.has(seg)) {
      autoSkipped.current.add(seg)
      if (seg === 'ed') { finishEpisode(); return }
      v.currentTime = skips[seg].end
      flash.show(t(seg === 'op' ? 'player.skipped' : 'player.skippedRecap'))
    }
  }
  const startAt = (sec) => { video.current.currentTime = sec; setResume(null); play() }

  return (
    <div className={`player${idle ? ' player--idle' : ''}`} onMouseMove={poke}>
      <video
        ref={video} className="player__video" crossOrigin="anonymous"
        onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate} onProgress={readBuffered}
        onPlay={() => { setPlaying(true); setResume(null); poke() }} onPause={() => { health.onReady(); setPlaying(false); showControls(); api.player.progress(snapshot()) }}
        onVolumeChange={volume.onVolumeChange} onResize={readQuality}
        onWaiting={health.onWaiting} onStalled={health.onWaiting} onPlaying={health.onReady} onCanPlay={health.onReady} onSeeked={health.onReady}
        onEnded={finishEpisode} onClick={onVideoClick} onDoubleClick={onVideoDoubleClick}
        // a downloaded file the browser cannot decode; hls streams report through hls.js (with recovery) instead
        onError={() => { if (open.kind === 'file') fail() }}
      >
        {open.subtitleUrl && <track ref={trackEl} kind="subtitles" src={open.subtitleUrl} />}
      </video>
      {subs.on && subs.available && <SubtitleOverlay cues={subs.cues} subtitles={settings.subtitles} raised={!idle} />}
      <div className="player__top">
        <button type="button" onClick={() => close('back')}><Icon name="back" /> {t('search.back')}</button>
        <h2 className="player__title">{open.title} <span className="hud">{t('player.episode', { episode: open.episode ?? '?' })}</span></h2>
      </div>
      {failed && (
        <div className="player__error notice notice--error" role="alert">
          <span>{t('player.error')}</span>
          {failed === 'retryable' && <button type="button" className="primary" onClick={retryNow}>{t('player.retry')}</button>}
          <button type="button" className={failed === 'retryable' ? undefined : 'primary'} onClick={() => close('external')}>{t('player.playExternal')}</button>
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
      {flash.text && <div className="player__flash hud" role="status">{flash.text}</div>}
      {end && <NextEpisodeCard mode={end} seconds={ending.left} onNext={() => close('next')} onCancel={ending.cancel} onBack={() => close('ended')} />}
      <PlayerControls
        segments={['op', 'ed', 'recap'].filter((k) => skips?.[k]).map((k) => ({ kind: k, ...skips[k] }))}
        time={time} duration={duration} buffered={buffered} quality={quality} playing={playing} muted={volume.muted} volume={volume.volume} subsOn={subs.on}
        subsAvailable={subs.available} subsHint={subs.hint}
        menu={{
          open: menuOpen, onOpen: setMenuOpen,
          rate: rate.rate, language: settings.language, onRate: rate.setRate,
          subs: { on: subs.on, available: subs.available, hint: subs.hint, offsetLabel: subs.offsetLabel, size: settings.subtitles.size },
          onToggleSubs: subs.toggle, onSubOffset: subs.shift, onSubOffsetReset: subs.reset, onSubSize: (n) => onSettings({ subtitles: { size: n } }),
        }}
        fullscreen={fullscreen} canPrev={Number(open.episode) > 1} canNext={!lastEpisode}
        onTogglePlay={togglePlay} onSeek={(s) => { video.current.currentTime = s }} onStep={step}
        onPrev={() => close('prev')} onNext={() => close('next')}
        onToggleMute={volume.toggleMute} onVolume={volume.setVolume}
        onToggleSubs={subs.toggle} onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
