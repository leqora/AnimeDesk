import { useT } from '../i18n/I18nContext.jsx'
import { upcoming, untilKey } from '../../shared/airing.js'

// Only the episode number and air time — never an episode title (spoiler rule).
export function AiringLine({ info, now }) {
  const t = useT()
  const next = upcoming(info, now)
  if (!next) return null
  const when = untilKey(next.airingAt - now)
  const at = new Intl.DateTimeFormat(t.locale, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(next.airingAt)
  return <p className="airing-line hud">{t('airing.next', { episode: next.episode, when: t(when.key, when.vars), at })}</p>
}

// On a poster the card's aria-label already says it, so the badge itself is hidden from screen readers.
export function NewBadge({ count, inline = false }) {
  const t = useT()
  if (!(count > 0)) return null
  return (
    <span className={inline ? 'badge badge--new badge--inline' : 'badge badge--new'} aria-hidden={inline ? undefined : 'true'}>
      {t.n('airing.new', count)}
    </span>
  )
}
