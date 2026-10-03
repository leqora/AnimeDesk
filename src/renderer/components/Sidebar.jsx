import { useT } from '../i18n/I18nContext.jsx'
import { Semaphore } from './Semaphore.jsx'
import { ProfileCard } from './ProfileCard.jsx'
import { Icon } from './Icon.jsx'

const PAGES = ['home', 'watchlist', 'downloads', 'profile', 'settings']

export function Sidebar({ page, onNavigate, health, onSemaphoreClick, profileName, stats, version = '', fullscreen = false, onToggleFullscreen = () => {} }) {
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
        <button type="button" className="nav-item" aria-label={fullscreen ? t('window.exitFullscreen') : t('window.fullscreen')} onClick={onToggleFullscreen}>
          <Icon name={fullscreen ? 'minimize' : 'maximize'} size={20} />
          <span className="nav-item__label">{fullscreen ? t('window.exitFullscreen') : t('window.fullscreen')}</span>
        </button>
        <span className="sidebar__version muted">
          {version && <span>v{version}</span>}{version ? ' · ' : ''}by Leqora
        </span>
      </div>
    </aside>
  )
}
