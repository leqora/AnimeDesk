import { useT } from '../i18n/I18nContext.jsx'
import { XpBar } from '../components/XpBar.jsx'
import { Icon } from '../components/Icon.jsx'
import { initials } from '../components/ProfileCard.jsx'

const activityLevel = (count) => (count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3)

export function ProfilePage({ stats, name, lang }) {
  const t = useT()
  const locale = lang === 'en' ? 'en-US' : 'sr-RS'
  const fmt = (n) => n.toLocaleString(locale)
  const maxGenre = Math.max(1, ...stats.topGenres.map((g) => g.episodes))
  const tiles = [
    ['episodes', fmt(stats.episodes)],
    ['hours', `~${fmt(stats.hours)}`],
    ['completed', fmt(stats.completed)],
    ['avgRating', stats.avgRating == null ? '—' : stats.avgRating.toLocaleString(locale)],
  ]
  return (
    <section className="page">
      <div className="profile-head">
        <span className="avatar--lg">{initials(name)}</span>
        <div className="profile-head__meta">
          <h2>{name}</h2>
          <span className="hud">{t('profile.level', { level: stats.level })} · {t(`title.${stats.title}`)}</span>
          <XpBar into={stats.xpIntoLevel} total={stats.xpForNext} />
          <span className="muted hud">{t('profile.xp', { into: fmt(stats.xpIntoLevel), total: fmt(stats.xpForNext) })}</span>
          <span className="muted">{t('profile.toNext')}</span>
        </div>
      </div>
      {stats.xp === 0 && <p className="notice">{t('profile.empty')}</p>}
      <div className="stat-tiles">
        {tiles.map(([key, value]) => (
          <div key={key} className="stat-tile">
            <div className="stat-tile__value">{value}</div>
            <div className="stat-tile__label">{t(`profile.${key}`)}</div>
          </div>
        ))}
      </div>
      <h3>{t('profile.genres')}</h3>
      {stats.topGenres.length === 0 ? <p className="muted">{t('profile.noGenres')}</p> : (
        <div className="genre-bars">
          {stats.topGenres.map((g) => (
            <div key={g.genre} className="genre-bar">
              <span>{g.genre}</span>
              <div className="genre-bar__track"><div className="genre-bar__fill" style={{ transform: `scaleX(${g.episodes / maxGenre})` }} /></div>
              <span className="hud muted">{g.episodes}</span>
            </div>
          ))}
        </div>
      )}
      <div className="streak"><Icon name="flame" size={20} /><span className="hud">{t('profile.streak', { days: stats.streakDays })}</span></div>
      <h3>{t('profile.activity')}</h3>
      <div className="activity-grid">
        {stats.activity.map((d) => (
          <span key={d.date} data-testid="activity-cell" className={`activity-cell activity-cell--l${activityLevel(d.count)}`} title={t('profile.activityCell', { date: d.date, count: d.count })} />
        ))}
      </div>
    </section>
  )
}
