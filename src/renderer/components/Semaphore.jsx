import { useT } from '../i18n/I18nContext.jsx'

export function Semaphore({ health, onClick }) {
  const t = useT()
  const label = t(health.reason === 'ok' ? 'health.green' : `health.${health.reason}`)
  return (
    <button type="button" className={`semaphore semaphore--${health.light}`} data-light={health.light} onClick={onClick} title={label}>
      <span className="semaphore__dot" aria-hidden="true" />
      <span className="semaphore__label">{label}</span>
    </button>
  )
}
