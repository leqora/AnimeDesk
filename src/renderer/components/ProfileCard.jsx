import { useT } from '../i18n/I18nContext.jsx'
import { XpBar } from './XpBar.jsx'

export function initials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
}

export function ProfileCard({ name, stats, onClick }) {
  const t = useT()
  return (
    <button type="button" className="profile-card" onClick={onClick}>
      <span className="profile-card__avatar">{initials(name)}</span>
      <span className="profile-card__meta">
        <span className="profile-card__level hud">{t('profile.level', { level: stats.level })}</span>
        <span className="profile-card__title">{t(`title.${stats.title}`)}</span>
        <XpBar into={stats.xpIntoLevel} total={stats.xpForNext} />
      </span>
    </button>
  )
}
