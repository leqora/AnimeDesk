import { useT } from '../i18n/I18nContext.jsx'

// variant "dot": only the light is drawn; the state text stays in aria-label and title.
export function Semaphore({ health, onClick, variant = 'full' }) {
  const t = useT()
  const label = t(health.reason === 'ok' ? 'health.green' : `health.${health.reason}`)
  const dot = variant === 'dot'
  return (
    <button type="button" className={`semaphore semaphore--${health.light}${dot ? ' semaphore--dot' : ''}`} data-light={health.light} onClick={onClick} title={label} aria-label={dot ? label : undefined}>
      <span className="semaphore__dot" aria-hidden="true" />
      {!dot && <span className="semaphore__label">{label}</span>}
    </button>
  )
}
