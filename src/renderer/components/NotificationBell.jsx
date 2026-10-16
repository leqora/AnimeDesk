import { useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useNotifications } from '../notifications/useNotifications.js'
import { Icon } from './Icon.jsx'
import { Modal } from './Modal.jsx'

const UNITS = [['day', 86400000], ['hour', 3600000], ['minute', 60000]]

function relativeTime(at, locale) {
  const diff = new Date(at).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, ms] of UNITS) if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit)
  return rtf.format(0, 'minute')
}

export function NotificationBell({ onOpenAnime, libraryIds }) {
  const api = useApi()
  const t = useT()
  const { items, unread, markRead } = useNotifications(api)
  const [open, setOpen] = useState(false)
  const label = unread > 0 ? t('notifications.bellUnread', { n: unread }) : t('notifications.title')
  const sorted = [...items].sort((a, b) => new Date(b.at) - new Date(a.at))
  return (
    <>
      <button type="button" className="nav-item bell" aria-label={label} onClick={() => setOpen(true)}>
        <span className="bell__icon"><Icon name="bell" size={20} />
          {unread > 0 && <span className="bell__badge hud" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
        </span>
        <span className="nav-item__label">{t('notifications.title')}</span>
      </button>
      {open && (
        <Modal label={t('notifications.title')} onClose={() => setOpen(false)}>
          <h2>{t('notifications.title')}</h2>
          {sorted.length === 0 ? <p className="muted">{t('notifications.empty')}</p> : (
            <ul className="bell__list">
              {sorted.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.read ? 'bell__item' : 'bell__item bell__item--unread'}
                    disabled={!libraryIds.has(n.animeId)}
                    onClick={() => { onOpenAnime(n.animeId); setOpen(false) }}
                  >
                    <span className="bell__item-title">{n.title} — EP {n.episode}</span>
                    <span className="bell__item-time muted">{relativeTime(n.at, t.locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button type="button" disabled={unread === 0} onClick={markRead}>{t('notifications.markAllRead')}</button>
            <button type="button" onClick={() => setOpen(false)}>{t('update.close')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
