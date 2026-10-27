import { useT } from '../i18n/I18nContext.jsx'

// Only the light is drawn; the state text lives in aria-label and title.
export function Semaphore({ health, onClick }) {
  const t = useT()
  const label = t(health.reason === 'ok' ? 'health.green' : `health.${health.reason}`)
  return (
    <button type="button" className={`semaphore semaphore--${health.light} semaphore--dot`} data-light={health.light} onClick={onClick} title={label} aria-label={label}>
      <span className="semaphore__dot" aria-hidden="true" />
    </button>
  )
}
