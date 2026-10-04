import { useT } from '../i18n/I18nContext.jsx'

// mode: 'countdown' | 'manual' | 'done'
export function NextEpisodeCard({ mode, seconds, onNext, onCancel, onBack }) {
  const t = useT()
  if (mode === 'done') {
    return (
      <div className="player__card" role="status">
        <p>{t('player.seriesDone')}</p>
        <button type="button" className="primary" onClick={onBack}>{t('search.back')}</button>
      </div>
    )
  }
  return (
    <div className="player__card" role="status">
      {mode === 'countdown' && <p>{t('player.nextIn', { n: seconds })}</p>}
      <div className="row">
        <button type="button" className="primary" onClick={onNext}>{mode === 'countdown' ? t('player.playNow') : t('player.next')}</button>
        {mode === 'countdown' ? <button type="button" onClick={onCancel}>{t('player.cancel')}</button> : <button type="button" onClick={onBack}>{t('search.back')}</button>}
      </div>
    </div>
  )
}
