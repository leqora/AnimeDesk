import { useT } from '../i18n/I18nContext.jsx'

// "2026-11-02" -> "2. 11." (day and month of the Monday)
const label = (start) => { const [, m, d] = start.split('-').map(Number); return `${d}. ${m}.` }

export function WeeklyChart({ weeks }) {
  const t = useT()
  const max = Math.max(1, ...weeks.map((w) => w.hours))
  return (
    <div className="profile-section">
      <h3>{t('profile.weekly')}</h3>
      <div className="week-chart">
        {weeks.map((w) => {
          const date = label(w.start)
          const text = t('profile.weekCell', { date, hours: w.hours.toLocaleString(t.locale, { maximumFractionDigits: 1 }) })
          return (
            <div key={w.start} className="week-col" title={text}>
              <div className="week-bar__slot"><div className="week-bar" style={{ transform: `scaleY(${w.hours / max})` }} /></div>
              <span className="week-col__label hud muted" aria-hidden="true">{date}</span>
              <span className="sr-only">{text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
