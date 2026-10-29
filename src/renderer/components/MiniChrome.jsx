import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'

// The floating mini player's overlay: a thin bar (shown on hover / focus), a progress line, and always-visible
// children (end-of-episode or error actions). Only the series title and the episode number are shown.
// `onTogglePlay` is optional: the reconnecting stand-in has nothing to play or pause.
export function MiniChrome({ title, episode, playing, progress = 0, pinned = false, onTogglePlay, onExpand, onClose, children }) {
  const t = useT()
  return (
    <>
      <div className={`mini__bar${pinned ? ' mini__bar--pinned' : ''}`}>
        <span className="mini__title">{title} <span className="hud">{t('player.episode', { episode: episode ?? '?' })}</span></span>
        {onTogglePlay && (
          <button type="button" onClick={onTogglePlay} aria-label={playing ? t('player.pause') : t('player.play')} title={playing ? t('player.pause') : t('player.play')}>
            <Icon name={playing ? 'pause' : 'play'} size={16} />
          </button>
        )}
        <button type="button" onClick={onExpand} aria-label={t('player.expand')} title={t('player.expand')}><Icon name="expand" size={16} /></button>
        <button type="button" onClick={onClose} aria-label={t('error.close')} title={t('error.close')}><Icon name="close" size={16} /></button>
      </div>
      {children}
      <div className="mini__progress" aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} /></div>
    </>
  )
}
