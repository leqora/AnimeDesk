import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'

export function AskDialog({ ask, onDone }) {
  const api = useApi()
  const t = useT()
  const yes = async () => {
    await api.library.recordWatched({ aniCliTitle: ask.aniCliTitle, episode: ask.episode })
    onDone()
  }
  return (
    <div className="modal" role="dialog">
      <div className="modal__box">
        <p>{t('ask.markWatched', { episode: ask.episode, title: ask.aniCliTitle })}</p>
        <div className="row">
          <button type="button" className="primary" onClick={yes}>{t('ask.yes')}</button>
          <button type="button" onClick={onDone}>{t('ask.no')}</button>
        </div>
      </div>
    </div>
  )
}
