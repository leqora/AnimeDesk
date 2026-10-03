import { useEffect } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'

export function WhatsNewDialog({ mode, version, notes, status, onClose }) {
  const api = useApi()
  const t = useT()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const title = mode === 'after' ? t('update.titleAfter', { version }) : t('update.titleBefore', { version })
  return (
    <div className="modal" role="dialog" aria-label={title}>
      <div className="modal__box">
        <h2>{title}</h2>
        <div className="whats-new__notes">{notes || t('update.noNotes')}</div>
        <div className="row">
          {mode === 'before' && status === 'ready' && (
            <button type="button" className="primary" onClick={() => api.update.install()}>{t('update.install')}</button>
          )}
          {mode === 'before' && status === 'available' && (
            <button type="button" className="primary" onClick={() => api.update.download()}>{t('update.download')}</button>
          )}
          <button type="button" onClick={onClose}>{t('update.close')}</button>
        </div>
      </div>
    </div>
  )
}
