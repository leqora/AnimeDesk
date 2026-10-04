import { useT } from '../i18n/I18nContext.jsx'
import { formatTime } from '../../shared/player.js'

export function ResumePrompt({ at, onResume, onRestart }) {
  const t = useT()
  return (
    <div className="player__card" role="dialog" aria-label={t('player.resumeFrom', { time: formatTime(at) })}>
      <div className="row">
        <button type="button" className="primary" autoFocus onClick={onResume}>{t('player.resumeFrom', { time: formatTime(at) })}</button>
        <button type="button" onClick={onRestart}>{t('player.fromStart')}</button>
      </div>
    </div>
  )
}
