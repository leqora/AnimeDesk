import { useT } from '../i18n/I18nContext.jsx'

export function ReadyNotice({ ready, onOpenWizard }) {
  const t = useT()
  if (ready) return null
  return (
    <div className="notice notice--warn" role="alert">
      <span>{t('gate.blocked')}</span>
      <button type="button" onClick={onOpenWizard}>{t('health.openWizard')}</button>
    </div>
  )
}
