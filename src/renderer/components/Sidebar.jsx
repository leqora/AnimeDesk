import { useT } from '../i18n/I18nContext.jsx'
import { Semaphore } from './Semaphore.jsx'
import { ProfileCard } from './ProfileCard.jsx'
import { Icon } from './Icon.jsx'

const PAGES = ['home', 'watchlist', 'downloads', 'profile', 'settings']

export function Sidebar({ page, onNavigate, health, onSemaphoreClick, profileName, stats, version = '' }) {
  const t = useT()
  return (
    <aside className="sidebar">
      <div className="sidebar__logo"><span className="sidebar__logo-text">{t('app.name')}</span></div>
      <nav className="sidebar__nav">
        {PAGES.map((p) => (
          <button
            key={p}
            type="button"
            className={p === page ? 'nav-item nav-item--active' : 'nav-item'}
            aria-current={p === page ? 'page' : undefined}
            aria-label={t(`nav.${p}`)}
            onClick={() => onNavigate(p)}
          >
            <Icon name={p} size={20} />
            <span className="nav-item__label">{t(`nav.${p}`)}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar__footer">
        <Semaphore health={health} onClick={onSemaphoreClick} />
        <ProfileCard name={profileName} stats={stats} onClick={() => onNavigate('profile')} />
        {version && <span className="sidebar__version muted">v{version}</span>}
      </div>
    </aside>
  )
}
