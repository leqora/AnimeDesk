import { useRef } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { MiniChrome } from './MiniChrome.jsx'
import { useMiniDrag } from '../player/useMiniDrag.js'

// Stands in for the player while main starts a fresh ani-cli session for the same episode.
// In mini mode it keeps the floating frame (same corner and size) and never takes focus.
export function PlayerReconnecting({ state, title, episode, error, onRetry, onBack, mini = false, miniCorner = 'br', onExpand, onMiniCorner }) {
  const t = useT()
  const root = useRef(null)
  useMiniDrag({ ref: root, enabled: mini, corner: miniCorner, onCorner: onMiniCorner, onClick: onExpand })
  const failed = state === 'failed'
  if (mini) {
    return (
      <div ref={root} tabIndex={-1} className="player player--reconnect player--mini" role="region" aria-label={t('player.miniLabel', { title, episode: episode ?? '?' })}>
        <MiniChrome title={title} episode={episode} pinned={failed} onExpand={onExpand} onClose={onBack}>
          {failed && (
            <div className="mini__state" role="alert">
              <span>{t('player.miniError')}</span>
              <button type="button" className="primary" onClick={onRetry}>{t('player.retry')}</button>
            </div>
          )}
        </MiniChrome>
        {!failed && (
          <div className="player__loading" role="status" aria-label={t('player.loading')}>
            <span className="player__spinner" aria-hidden="true" />
            <span className="hud">{t('player.reconnecting')}</span>
          </div>
        )}
      </div>
    )
  }
  return (
    <div ref={root} className="player player--reconnect" tabIndex={-1}>
      <div className="player__top">
        <button type="button" onClick={onBack}><Icon name="back" /> {t('search.back')}</button>
        <h2 className="player__title">{title} <span className="hud">{t('player.episode', { episode: episode ?? '?' })}</span></h2>
      </div>
      {failed ? (
        <div className="player__error notice notice--error" role="alert">
          <span>{t(`error.${error ?? 'unknown'}`)}</span>
          <button type="button" className="primary" onClick={onRetry}>{t('player.retry')}</button>
        </div>
      ) : (
        <div className="player__loading" role="status" aria-label={t('player.loading')}>
          <span className="player__spinner" aria-hidden="true" />
          <span className="hud">{t('player.reconnecting')}</span>
        </div>
      )}
    </div>
  )
}
