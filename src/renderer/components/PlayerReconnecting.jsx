import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'

// Stands in for the player while main starts a fresh ani-cli session for the same episode.
export function PlayerReconnecting({ state, title, episode, error, onRetry, onBack }) {
  const t = useT()
  return (
    <div className="player player--reconnect">
      <div className="player__top">
        <button type="button" onClick={onBack}><Icon name="back" /> {t('search.back')}</button>
        <h2 className="player__title">{title} <span className="hud">{t('player.episode', { episode: episode ?? '?' })}</span></h2>
      </div>
      {state === 'failed' ? (
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
