import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Modal } from './Modal.jsx'

export function WhatsNewDialog({ mode, version, notes, status, onClose }) {
  const api = useApi()
  const t = useT()
  const title = mode === 'after' ? t('update.titleAfter', { version }) : t('update.titleBefore', { version })
  return (
    <Modal label={title} onClose={onClose}>
      <h2>{title}</h2>
      <div className="whats-new__notes">{notes || t('update.noNotes')}</div>
      {mode === 'before' && status === 'ready' && <p id="whats-new-hint" className="muted">{t('update.restartHint')}</p>}
      <div className="row">
        {mode === 'before' && status === 'ready' && (
          <button type="button" className="primary" aria-describedby="whats-new-hint" onClick={() => api.update.install()}>{t('update.install')}</button>
        )}
        {mode === 'before' && status === 'available' && (
          <button type="button" className="primary" onClick={() => api.update.download()}>{t('update.download')}</button>
        )}
        <button type="button" onClick={onClose}>{t('update.close')}</button>
      </div>
    </Modal>
  )
}
