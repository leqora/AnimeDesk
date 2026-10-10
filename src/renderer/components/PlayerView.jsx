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
import { useFlash } from '../player/useFlash.js'
import { useIdle } from '../player/useIdle.js'
import { SubtitleOverlay } from './SubtitleOverlay.jsx'
import { useSubtitleCues } from '../player/useSubtitleCues.js'
import { clampOffset, formatOffset } from '../../shared/subtitles.js'
import { trackMax, segmentAt, isLastEpisode, qualityLabel, qualityName } from '../../shared/player.js'

const PROGRESS_MS = 5000
const VOLUME_SAVE_MS = 500
const QUALITY_FLASH_MS = 4000
const OFFSET_SAVE_MS = 500
const SUBS_FLASH_MS = 6000
const CLICK_DELAY_MS = 220
const COUNTDOWN_S = 10
const ENDING_FALLBACK_S = 30
const NET_RETRIES = 3
// hls.js 1.x: startLoad() is a no-op until a manifest has been parsed, so these must reload the source
const MANIFEST_ERRORS = new Set(['manifestLoadError', 'manifestLoadTimeOut', 'manifestParsingError'])
// Physical keys, so letter shortcuts also work on non-Latin layouts (e.g. Serbian Cyrillic).
const KEY_BY_CODE = { KeyF: 'f', KeyM: 'm', KeyS: 's', KeyG: 'g', KeyH: 'h', KeyN: 'n', Space: ' ' }
const TEXT_FIELD = 'input:not([type=range]):not([type=checkbox]), textarea, [contenteditable="true"]'
const shortcutKey = (e) => KEY_BY_CODE[e.code] ?? (e.key.length === 1 ? e.key.toLowerCase() : e.key)

const headStatus = (url) => fetch(url, { method: 'HEAD' }).then((r) => r.status)
export function PlayerView({ open, settings, fullscreen, onSettings, onClose, HlsImpl = Hls, probeSub = headStatus }) {
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
  const mode = open.mode === 'dub' ? 'dub' : 'sub'
  const trackEl = useRef(null)
  const [subsOn, setSubsOn] = useState(settings.subtitles.enabled[mode])
  const [offset, setOffset] = useState(clampOffset(open.subOffset ?? 0))
  const [subsUnsupported, setSubsUnsupported] = useState(false)
  const offsetTimer = useRef(null)
  const pendingOffset = useRef(null)
  const subs = useSubtitleCues(trackEl, video, offset, open.playbackId)
  const subsAvailable = Boolean(open.subtitleUrl) && subs.status !== 'error' && !subsUnsupported
  const subsHint = !open.subtitleUrl ? t('player.noSubs') : subsUnsupported ? t('player.subsUnsupported') : subs.status === 'error' ? t('player.subsFailed') : null
  const [subsMenu, setSubsMenu] = useState(false)
  const flash = useFlash()
  Object.assign(live.current, { subsOn, offset, subsAvailable, mode, t })
  const { idle, poke, show: showControls } = useIdle({ video, hold: subsMenu })
  const [failed, setFailed] = useState(null) // null | 'retryable' | 'final'
  const failing = useRef(false)
  const lastTime = useRef(0)
  const [skips, setSkips] = useState(null)
  const [resume, setResume] = useState(open.autoResume ? null : open.resumeAt)
  const [end, setEnd] = useState(null)
  const health = usePlayerHealth({ video, active: resume == null && !end && !failed, onStall: () => fail() })
  const [left, setLeft] = useState(COUNTDOWN_S)
  const autoSkipped = useRef(new Set())
  const [quality, setQuality] = useState(null)
  const fallbackShown = useRef(false)
  const readQuality = () => setQuality(qualityLabel(video.current?.videoHeight))
  useEffect(() => {
    if (!open.qualityFallback || !quality || fallbackShown.current) return
    fallbackShown.current = true
    flash.show(t('player.qualityFallback', { requested: qualityName(open.qualityFallback), actual: quality }), QUALITY_FLASH_MS)
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
    flushOffset()
    live.current.api.player.closed({ ...snapshot(), reason })
    live.current.onClose(reason)
  }
  // Main owns the recovery budget: it either closes this player and reconnects, or says the automatic try is used up.
  const fail = async () => {
    if (failing.current || closed.current) return
    failing.current = true
    const { open, api } = live.current
    if (open.kind === 'file') { setFailed('final'); return }
    let r = null
    try { r = await api.player.recover(snapshot()) } catch { /* treated as not recoverable */ }
    if (r?.ok && r.auto !== false) return
    setFailed(r?.ok ? 'retryable' : 'final')
  }
  const retryNow = () => {
    Promise.resolve(live.current.api.player.recover(snapshot(), { manual: true }))
      .then((r) => { if (!r?.ok) setFailed('final') }, () => setFailed('final'))
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
  // Written after the keys settle (holding H must not write the file 20 times); flushed on close.
  const flushOffset = () => {
    clearTimeout(offsetTimer.current)
    const value = pendingOffset.current
    pendingOffset.current = null
    if (value != null) live.current.api.seriesPrefs.set(live.current.open.title, { subOffset: { [live.current.mode]: value } })
  }
  const shiftOffset = (delta) => {
    if (!live.current.subsAvailable) return
    const next = clampOffset(live.current.offset + delta)
    live.current.offset = next
    setOffset(next)
    flash.show(live.current.t('player.subOffset', { value: formatOffset(next, live.current.settings.language) }))
    pendingOffset.current = next
    clearTimeout(offsetTimer.current)
    offsetTimer.current = setTimeout(flushOffset, OFFSET_SAVE_MS)
  }
  const resetOffset = () => shiftOffset(-live.current.offset)
  const toggleSubs = () => {
    if (!live.current.subsAvailable) return
    const next = !live.current.subsOn
    live.current.subsOn = next
    setSubsOn(next)
    live.current.onSettings({ subtitles: { enabled: { [live.current.mode]: next } } })
  }
  useEffect(() => {
    const v = video.current
    v.volume = settings.playerVolume
    v.muted = settings.playerMuted
    return () => { flushVolume(); flushOffset(); clearTimeout(clickTimer.current) }
  }, [])

  useEffect(() => {
    const v = video.current
    if (open.kind === 'file') { v.src = open.src; return undefined }
    const hls = new HlsImpl({ enableWorker: true })
    let netRetries = 0
    let mediaErrors = 0
    // progress means the earlier errors were transient; give later ones the full budget again
    hls.on(HlsImpl.Events.FRAG_CHANGED, () => { netRetries = 0; mediaErrors = 0 })
    hls.on(HlsImpl.Events.ERROR, (_e, d) => {
      if (!d.fatal) return
      if (d.type === HlsImpl.ErrorTypes.NETWORK_ERROR && netRetries < NET_RETRIES) {
        netRetries++
        if (MANIFEST_ERRORS.has(d.details) || !hls.levels?.length) hls.loadSource(open.src)
        else hls.startLoad()
        return
      }
      if (d.type === HlsImpl.ErrorTypes.MEDIA_ERROR && mediaErrors < 2) {
        mediaErrors++
        if (mediaErrors === 2) hls.swapAudioCodec()
        hls.recoverMediaError()
        return
      }
      fail()
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
    setSubsUnsupported(false)
    if (!open.subtitleUrl) return undefined
    let cancelled = false
    Promise.resolve().then(() => probeSub(open.subtitleUrl)).then((status) => {
      if (cancelled || status !== 415) return
      setSubsUnsupported(true)
      if (live.current.subsOn) flash.show(t('player.subsUnsupported'), SUBS_FLASH_MS)
    }, () => {})
    return () => { cancelled = true }
  }, [open.playbackId])

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
      // The subtitle menu's size slider owns its keys (arrows move the slider, they must not seek); other menu controls keep the shortcuts.
      if (e.target?.closest?.('.player__subs-menu input[type="range"]')) return
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
        case 's': toggleSubs(); break
        case 'g': shiftOffset(e.shiftKey ? -1 : -0.1); break
        case 'h': shiftOffset(e.shiftKey ? 1 : 0.1); break
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
    if (open.autoResume && open.resumeAt > 0) v.currentTime = open.resumeAt
    if (open.episode != null) {
      const request = Promise.resolve().then(() => api.skip.get(open.title, open.episode, v.duration))
      request.then(setSkips).catch(() => setSkips(null))
    }
    if (resume == null) play()
  }
  const onTimeUpdate = () => {
    const v = video.current
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
  const segment = segmentAt(time, skips)
  const lastEpisode = isLastEpisode(open.episode, open.totalEpisodes)
  const inEnding = !end && !lastEpisode && (segment === 'ed' || (!skips?.ed && duration > 0 && time >= duration - ENDING_FALLBACK_S))
  live.current.inEnding = inEnding
  live.current.lastEpisode = lastEpisode
  const startAt = (sec) => { video.current.currentTime = sec; setResume(null); play() }

  return (
    <div className={`player${idle ? ' player--idle' : ''}`} onMouseMove={poke}>
      <video
        ref={video} className="player__video" crossOrigin="anonymous"
        onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate}
        onPlay={() => { setPlaying(true); setResume(null); poke() }} onPause={() => { health.onReady(); setPlaying(false); showControls(); api.player.progress(snapshot()) }}
        onVolumeChange={onVolumeChange} onResize={readQuality}
        onWaiting={health.onWaiting} onStalled={health.onWaiting} onPlaying={health.onReady} onCanPlay={health.onReady} onSeeked={health.onReady}
        onEnded={finishEpisode} onClick={onVideoClick} onDoubleClick={onVideoDoubleClick}
        // a downloaded file the browser cannot decode; hls streams report through hls.js (with recovery) instead
        onError={() => { if (open.kind === 'file') fail() }}
      >
        {open.subtitleUrl && <track ref={trackEl} kind="subtitles" src={open.subtitleUrl} />}
      </video>
      {subsOn && subsAvailable && <SubtitleOverlay cues={subs.cues} subtitles={settings.subtitles} raised={!idle} />}
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
      {end && <NextEpisodeCard mode={end} seconds={left} onNext={() => close('next')} onCancel={() => setEnd('manual')} onBack={() => close('ended')} />}
      <PlayerControls
        segments={['op', 'ed', 'recap'].filter((k) => skips?.[k]).map((k) => ({ kind: k, ...skips[k] }))}
        time={time} duration={duration} quality={quality} playing={playing} muted={muted} volume={volume} subsOn={subsOn}
        subsAvailable={subsAvailable} subsHint={subsHint} subOffsetLabel={formatOffset(offset, settings.language)} subSize={settings.subtitles.size}
        subsMenuOpen={subsMenu} onSubsMenu={setSubsMenu} onSubOffset={shiftOffset} onSubOffsetReset={resetOffset}
        onSubSize={(n) => onSettings({ subtitles: { size: n } })}
        fullscreen={fullscreen} canPrev={Number(open.episode) > 1} canNext={!lastEpisode}
        onTogglePlay={togglePlay} onSeek={(s) => { video.current.currentTime = s }} onStep={step}
        onPrev={() => close('prev')} onNext={() => close('next')}
        onToggleMute={() => { video.current.muted = !video.current.muted }} onVolume={(x) => { video.current.volume = x; video.current.muted = false }}
        onToggleSubs={toggleSubs} onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
