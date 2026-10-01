import { useT } from '../i18n/I18nContext.jsx'
import { Semaphore } from './Semaphore.jsx'

const PAGES = ['search', 'watchlist', 'downloads', 'settings']

export function Header({ page, onNavigate, health, onSemaphoreClick }) {
  const t = useT()
  return (
    <header className="header">
      <span className="header__logo">AnimeDesk</span>
      <nav className="header__nav">
        {PAGES.map((p) => (
          <button key={p} type="button" className={p === page ? 'nav-btn nav-btn--active' : 'nav-btn'} onClick={() => onNavigate(p)}>
            {t(`nav.${p}`)}
          </button>
        ))}
      </nav>
      <Semaphore health={health} onClick={onSemaphoreClick} />
    </header>
  )
}
