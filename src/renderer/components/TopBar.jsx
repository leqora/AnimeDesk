import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { Semaphore } from './Semaphore.jsx'
import { initials } from '../initials.js'
import { XpBar } from './XpBar.jsx'
import { Icon } from './Icon.jsx'
import { NotificationBell } from './NotificationBell.jsx'
import { MenuButton } from './MenuButton.jsx'
import { useNarrow } from '../nav/useNarrow.js'

// a page chosen from a menu: the menu item disappears, so App moves focus to the page
const MENU_NAV = { focusMain: true }
const PAGES = ['home', 'discover', 'watchlist', 'schedule', 'downloads']

export function TopBar({ page, onNavigate, health, onSemaphoreClick, profileName, stats, version = '', onOpenAnime = () => {}, libraryIds = new Set(), fullscreen = false, onToggleFullscreen = () => {}, onOpenPalette = () => {}, hidden = false, closeMenus = false, onActiveChange }) {
  const t = useT()
  const narrow = useNarrow()
  // The nav links and the Menu trigger replace each other at 1000 px; focus inside either must not fall to <body>.
  const navRef = useRef(null)
  const lastNarrow = useRef(narrow)
  const focusWasInNav = useRef(false)
  if (lastNarrow.current !== narrow) focusWasInNav.current = navRef.current?.contains(document.activeElement) === true // the old DOM is still there
  useLayoutEffect(() => {
    if (lastNarrow.current === narrow) return
    lastNarrow.current = narrow
    if (!focusWasInNav.current) return
    focusWasInNav.current = false
    const root = navRef.current
    const target = narrow ? root?.querySelector('.menu-button__trigger') : (root?.querySelector('[aria-current="page"]') ?? root?.querySelector('.topbar__link'))
    target?.focus()
  }, [narrow])
  // "active" = pointer over the bar, focus inside it, or one of its menus open: the bar must not disappear then
  const [hover, setHover] = useState(false)
  const [focusIn, setFocusIn] = useState(false)
  const [menus, setMenus] = useState(0)
  const menuChange = (open) => setMenus((n) => Math.max(0, n + (open ? 1 : -1)))
  const active = hover || focusIn || menus > 0
  const activeChange = useRef(onActiveChange)
  activeChange.current = onActiveChange
  useEffect(() => { activeChange.current?.(active) }, [active])
  // a hidden bar can neither be hovered nor hold focus, and the browser may not say so
  useEffect(() => { if (hidden) { setHover(false); setFocusIn(false) } }, [hidden])
  const fullscreenLabel = fullscreen ? t('window.exitFullscreen') : t('window.fullscreen')
  return (
    <header
      className={hidden ? 'topbar topbar--hidden' : 'topbar'}
      inert={hidden}
      aria-hidden={hidden ? 'true' : undefined}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocusIn(false) }}
    >
      <div className="topbar__logo">{t('app.name')}</div>
      <div className="topbar__navwrap" ref={navRef}>
      {narrow ? (
        <MenuButton label={t('topbar.menu')} className="topbar__menu" closeWhen={closeMenus} onOpenChange={menuChange}>
          {PAGES.map((p) => (
            <button key={p} type="button" role="menuitem" tabIndex={-1} data-navigates className="menu-button__item" aria-current={p === page ? 'page' : undefined} onClick={() => onNavigate(p, MENU_NAV)}>
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
      </div>
      <div className="topbar__right">
        <button type="button" className="topbar__palette" aria-keyshortcuts="Control+K" aria-label={t('palette.open')} onClick={onOpenPalette}>
          <Icon name="search" size={16} />
          <span className="topbar__palette-label">{t('palette.open')}</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        <Semaphore health={health} onClick={onSemaphoreClick} />
        <NotificationBell onOpenAnime={onOpenAnime} libraryIds={libraryIds} playerOpen={closeMenus} onOpenChange={menuChange} />
        <button type="button" className="topbar__icon" aria-label={t('nav.settings')} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onNavigate('settings')}>
          <Icon name="settings" size={20} />
        </button>
        <MenuButton
          label={t('topbar.account')}
          className="topbar__account"
          closeWhen={closeMenus}
          onOpenChange={menuChange}
          icon={<span className="topbar__avatar" aria-hidden="true">{initials(profileName)}</span>}
          header={(
            <div className="topbar__summary">
              <span className="topbar__avatar topbar__avatar--lg" aria-hidden="true">{initials(profileName)}</span>
              <span className="topbar__summary-meta">
                <span className="topbar__summary-name">{profileName}</span>
                <span className="topbar__summary-level hud">{t('profile.level', { level: stats.level })}</span>
                <span className="topbar__summary-title">{t(`title.${stats.title}`)}</span>
                <XpBar into={stats.xpIntoLevel} total={stats.xpForNext} />
              </span>
            </div>
          )}
          footer={<div className="topbar__version muted">{version ? `v${version} · ` : ''}by Leqora</div>}
        >
          <button type="button" role="menuitem" tabIndex={-1} data-navigates className="menu-button__item" onClick={() => onNavigate('profile', MENU_NAV)}>
            <Icon name="profile" size={16} />{t('nav.profile')}
          </button>
          <button type="button" role="menuitem" tabIndex={-1} className="menu-button__item" onClick={onToggleFullscreen}>
            <Icon name={fullscreen ? 'minimize' : 'maximize'} size={16} />{fullscreenLabel}
          </button>
        </MenuButton>
      </div>
    </header>
  )
}
