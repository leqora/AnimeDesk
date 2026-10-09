import { useEffect, useRef } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { formatTime } from '../../shared/player.js'

export function PlayerControls({ time, duration, quality = null, playing, muted, volume, subsOn, subsAvailable = true, subsHint = null, subOffsetLabel = '0', subSize = 40, subsMenuOpen = false, fullscreen, canPrev, canNext = true, segments = [], onTogglePlay, onSeek, onStep, onPrev, onNext, onToggleMute, onVolume, onToggleSubs, onSubsMenu = () => {}, onSubOffset = () => {}, onSubOffsetReset = () => {}, onSubSize = () => {}, onToggleFullscreen }) {
  const t = useT()
  const menuRef = useRef(null)
  const menuButton = useRef(null)
  useEffect(() => {
    if (!subsMenuOpen) return undefined
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !menuButton.current?.contains(e.target)) onSubsMenu(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [subsMenuOpen])
  return (
    <div className="player__bar">
      <div className="player__timeline">
        {duration > 0 && segments.map((s) => (
          <span key={s.kind} className={`player__segment player__segment--${s.kind}`} style={{ left: `${(s.start / duration) * 100}%`, width: `${((s.end - s.start) / duration) * 100}%` }} />
        ))}
        <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(time, duration || 0)} aria-label={t('player.seek')} onChange={(e) => onSeek(Number(e.target.value))} />
      </div>
      <div className="player__buttons">
        <button type="button" aria-label={t('player.prev')} disabled={!canPrev} onClick={onPrev}><Icon name="skipBack" /></button>
        <button type="button" aria-label={t('player.back10')} onClick={() => onStep(-10)}><Icon name="rewind" /></button>
        <button type="button" className="primary" aria-label={playing ? t('player.pause') : t('player.play')} onClick={onTogglePlay}><Icon name={playing ? 'pause' : 'play'} /></button>
        <button type="button" aria-label={t('player.fwd10')} onClick={() => onStep(10)}><Icon name="fastForward" /></button>
        <button type="button" aria-label={t('player.next')} disabled={!canNext} onClick={onNext}><Icon name="skipForward" /></button>
        <span className="hud player__time">{formatTime(time)} / {formatTime(duration)}</span>
        {quality && <span className="hud player__quality">{quality}</span>}
        <span className="player__spacer" />
        <button type="button" aria-label={muted ? t('player.unmute') : t('player.mute')} onClick={onToggleMute}><Icon name={muted ? 'volumeX' : 'volume'} /></button>
        <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label={t('player.volume')} onChange={(e) => onVolume(Number(e.target.value))} />
        <button type="button" aria-label={t('player.subs')} aria-pressed={subsOn && subsAvailable} disabled={!subsAvailable} title={subsHint ?? undefined} onClick={onToggleSubs}><Icon name="subtitles" /></button>
        <span className="player__subs-anchor">
          <button ref={menuButton} type="button" aria-label={t('player.subsMenu')} aria-haspopup="dialog" aria-expanded={subsMenuOpen} disabled={!subsAvailable} title={subsHint ?? undefined} onClick={() => onSubsMenu(!subsMenuOpen)}><Icon name="settings" /></button>
          {subsMenuOpen && (
            <div ref={menuRef} className="player__subs-menu" role="dialog" aria-label={t('player.subsMenu')} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onSubsMenu(false) } }}>
              <label className="check"><input type="checkbox" aria-label={t('player.subs')} checked={subsOn} onChange={onToggleSubs} /> {t('player.subs')}</label>
              <div className="row">
                <span>{t('player.subOffsetLabel')}</span>
                <button type="button" aria-label={t('player.subOffsetMinus')} onClick={() => onSubOffset(-0.1)}>−</button>
                <span className="hud">{subOffsetLabel} s</span>
                <button type="button" aria-label={t('player.subOffsetPlus')} onClick={() => onSubOffset(0.1)}>+</button>
                <button type="button" onClick={onSubOffsetReset}>{t('player.subOffsetReset')}</button>
              </div>
              <label className="field">
                <span>{t('player.subsSize')}</span>
                <input type="range" min="0" max="100" step="5" aria-label={t('player.subsSize')} value={subSize} onChange={(e) => onSubSize(Number(e.target.value))} />
              </label>
            </div>
          )}
        </span>
        <button type="button" aria-label={fullscreen ? t('window.exitFullscreen') : t('window.fullscreen')} onClick={onToggleFullscreen}><Icon name={fullscreen ? 'minimize' : 'maximize'} /></button>
      </div>
    </div>
  )
}
