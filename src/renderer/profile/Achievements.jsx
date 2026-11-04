import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from '../components/Icon.jsx'

const HOURS = new Set(['day-of-anime', 'hours-250'])

// Hours get one decimal below 10, everything else is a whole number.
function formatValue(id, value, locale) {
  if (HOURS.has(id)) {
    return value < 10
      ? value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : Math.floor(value).toLocaleString(locale)
  }
  return Math.floor(value).toLocaleString(locale)
}

export function Achievements({ items }) {
  const t = useT()
  const done = items.filter((a) => a.unlockedAt).length
  const title = t('profile.achievements', { count: done, total: items.length })
  return (
    <div className="profile-section">
      <h3 id="ach-heading"><Icon name="trophy" size={18} /> {title}</h3>
      <ul className="ach-grid" aria-labelledby="ach-heading">
        {items.map((a) => {
          const unlocked = Boolean(a.unlockedAt)
          const value = formatValue(a.id, a.value, t.locale)
          const goal = a.goal.toLocaleString(t.locale)
          return (
            <li key={a.id} data-ach={a.id} className={`ach-tile ${unlocked ? 'ach-tile--on' : 'ach-tile--off'}`}>
              <span className="ach-tile__icon"><Icon name={a.icon} size={20} /></span>
              <div className="ach-tile__body">
                <div className="ach-tile__name">{t(`achievement.${a.id}.name`)}</div>
                <div className="ach-tile__desc">{t(`achievement.${a.id}.desc`)}</div>
                {unlocked ? (
                  <>
                    <div className="ach-tile__state hud">{t('profile.achUnlocked', { date: new Date(a.unlockedAt).toLocaleDateString(t.locale) })}</div>
                    <span className="sr-only">{t('profile.achUnlockedSr')}</span>
                  </>
                ) : (
                  <>
                    <div className="ach-tile__bar" aria-hidden="true"><div className="ach-tile__fill" style={{ transform: `scaleX(${Math.min(1, Math.max(0, a.value / a.goal))})` }} /></div>
                    <div className="ach-tile__state hud" aria-hidden="true">{t('profile.achProgress', { value, goal })}</div>
                    <span className="sr-only">{t('profile.achLockedSr', { value, goal })}</span>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
