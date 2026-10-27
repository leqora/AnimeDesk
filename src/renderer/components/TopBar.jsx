import { useT } from '../i18n/I18nContext.jsx'
import { Semaphore } from './Semaphore.jsx'
import { initials } from './ProfileCard.jsx'
import { XpBar } from './XpBar.jsx'
import { Icon } from './Icon.jsx'
import { NotificationBell } from './NotificationBell.jsx'
import { MenuButton } from './MenuButton.jsx'
import { useNarrow } from '../nav/useNarrow.js'

const PAGES = ['home', 'discover', 'watchlist', 'schedule', 'downloads']

export function TopBar({ page, onNavigate, health, onSemaphoreClick, profileName, stats, version = '', onOpenAnime = () => {}, libraryIds = new Set(), fullscreen = false, onToggleFullscreen = () => {}, playerOpen = false, onOpenPalette = () => {} }) {
  const t = useT()
  const narrow = useNarrow()
  const fullscreenLabel = fullscreen ? t('window.exitFullscreen') : t('window.fullscreen')
  return (
    <header className="topbar">
      <div className="topbar__logo">{t('app.name')}</div>
      {narrow ? (
        <MenuButton label={t('topbar.menu')} className="topbar__menu">
          {PAGES.map((p) => (
            <button key={p} type="button" role="menuitem" tabIndex={-1} data-navigates className="menu-button__item" aria-current={p === page ? 'page' : undefined} onClick={() => onNavigate(p)}>
              {t(`nav.${p}`)}
            </button>
          ))}
        </MenuButton>
      ) : (
        <nav className="topbar__nav">
          {PAGES.map((p) => (
            <button key={p} type="button" className={p === page ? 'topbar__link topbar__link--active' : 'topbar__link'} aria-current={p === page ? 'page' : undefined} aria-label={t(`nav.${p}`)} onClick={() => onNavigate(p)}>
              {t(`nav.${p}`)}
            </button>
          ))}
        </nav>
      )}
      <div className="topbar__right">
        <button type="button" className="topbar__palette" aria-keyshortcuts="Control+K" aria-label={t('palette.open')} onClick={onOpenPalette}>
          <Icon name="search" size={16} />
          <span className="topbar__palette-label">{t('palette.open')}</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        <Semaphore health={health} onClick={onSemaphoreClick} variant="dot" />
        <NotificationBell onOpenAnime={onOpenAnime} libraryIds={libraryIds} playerOpen={playerOpen} />
        <button type="button" className="topbar__icon" aria-label={t('topbar.settings')} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onNavigate('settings')}>
          <Icon name="settings" size={20} />
        </button>
        <MenuButton label={t('topbar.account')} className="topbar__account" icon={<span className="topbar__avatar" aria-hidden="true">{initials(profileName)}</span>}>
          <div className="topbar__summary" role="none">
            <span className="topbar__summary-level hud">{t('profile.level', { level: stats.level })}</span>
            <span className="topbar__summary-title">{t(`title.${stats.title}`)}</span>
            <XpBar into={stats.xpIntoLevel} total={stats.xpForNext} />
          </div>
          <button type="button" role="menuitem" tabIndex={-1} data-navigates className="menu-button__item" onClick={() => onNavigate('profile')}>
            <Icon name="profile" size={16} />{t('nav.profile')}
          </button>
          <button type="button" role="menuitem" tabIndex={-1} className="menu-button__item" onClick={onToggleFullscreen}>
            <Icon name={fullscreen ? 'minimize' : 'maximize'} size={16} />{fullscreenLabel}
          </button>
          <div className="topbar__version muted" role="none">{version ? `v${version} · ` : ''}by Leqora</div>
        </MenuButton>
      </div>
    </header>
  )
}
