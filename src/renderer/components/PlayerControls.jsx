import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { PlayerMenu } from './PlayerMenu.jsx'
import { formatTime } from '../../shared/player.js'

export function PlayerControls({ time, duration, quality = null, playing, muted, volume, subsOn, subsAvailable = true, subsHint = null, menu, fullscreen, canPrev, canNext = true, segments = [], onTogglePlay, onSeek, onStep, onPrev, onNext, onToggleMute, onVolume, onToggleSubs, onToggleFullscreen }) {
  const t = useT()
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
        <PlayerMenu {...menu} />
        <button type="button" aria-label={fullscreen ? t('window.exitFullscreen') : t('window.fullscreen')} onClick={onToggleFullscreen}><Icon name={fullscreen ? 'minimize' : 'maximize'} /></button>
      </div>
    </div>
  )
}
