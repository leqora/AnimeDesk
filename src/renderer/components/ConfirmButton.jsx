import { useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

export function ConfirmButton({ label, confirmLabel, onConfirm, className = '' }) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  if (!armed) return <button type="button" className={className} onClick={() => setArmed(true)}>{label}</button>
  return (
    <span className="confirm">
      <span>{confirmLabel}</span>
      <button type="button" className="danger" onClick={() => { setArmed(false); onConfirm() }}>{t('ask.yes')}</button>
      <button type="button" onClick={() => setArmed(false)}>{t('ask.no')}</button>
    </span>
  )
}
