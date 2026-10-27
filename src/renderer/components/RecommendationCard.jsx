import { useId } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { PosterFrame } from './Poster.jsx'
import { sequelMeta } from './SequelCard.jsx'

// "Oct 2026" / "2026" / "soon" for a series that has not started yet.
function startLabel(start, t) {
  if (start && Number.isInteger(start.year)) {
    if (Number.isInteger(start.month) && start.month >= 1 && start.month <= 12) {
      return new Intl.DateTimeFormat(t.locale, { month: 'short', year: 'numeric' }).format(new Date(start.year, start.month - 1, 1))
    }
    return String(start.year)
  }
  return t('discover.soon')
}

// Only list facts are shown: format, year, episode count, up to 3 genres and the series it came from. Never a description (spoilers).
// Search and hide are sibling buttons (a button cannot contain a button); without onHide (the detail's "Similar") there is no hide button.
// Discover extras: inWatchlist (badge + label suffix), onOpen (opens the library entry instead of searching), and item.poster === undefined (skeleton).
// A not yet released item without onOpen has nothing to search for yet, so it is a plain group (not a button, not in the Tab order).
export function RecommendationCard({ item, ready, onSearch, onHide, inWatchlist = false, onOpen }) {
  const t = useT()
  const lineId = useId()
  const badgeId = useId()
  const genres = Array.isArray(item.genres) ? item.genres.slice(0, 3).join(' · ') : ''
  const releasing = item.status === 'RELEASING'
  const upcoming = item.status === 'NOT_YET_RELEASED' && !onOpen
  const when = upcoming ? startLabel(item.start, t) : ''
  const meta = upcoming ? t('discover.starts', { date: when }) : sequelMeta(item, t)
  const poster = (
    <PosterFrame info={item.poster === undefined ? undefined : { poster: item.poster }}>
      <span className="media-card__fade" aria-hidden="true" />
      {releasing && <span id={badgeId} className="badge badge--progress rec-card__badge" aria-hidden="true">{t('sequels.releasing')}</span>}
      {inWatchlist && <span className="schedule-badge schedule-badge--accent rec-card__watchlist" aria-hidden="true">{t('discover.inWatchlist')}</span>}
    </PosterFrame>
  )
  const text = (
    <>
      <span className="card__title" aria-hidden="true">{item.title}</span>
      <span className="card__meta" id={lineId} aria-hidden="true">
        {meta && <>{meta}<br /></>}
        {genres && <>{genres}<br /></>}
        {item.fromTitle && t('recommendations.because', { title: item.fromTitle })}
      </span>
    </>
  )
  if (upcoming) {
    return (
      <div className="card media-card rec-card">
        <div className="media-card__open rec-card__static" role="group" aria-label={t('discover.startsLabel', { title: item.title, date: when })} aria-describedby={lineId}>
          {poster}
          {text}
        </div>
      </div>
    )
  }
  const label = (onOpen ? t('discover.openLabel', { title: item.title }) : t('recommendations.open', { title: item.title })) + (inWatchlist ? `, ${t('discover.inWatchlist')}` : '')
  return (
    <div className="card media-card rec-card">
      <button
        type="button" className="media-card__open" disabled={!ready} onClick={() => (onOpen ? onOpen() : onSearch(item.romaji ?? item.title))}
        aria-label={label} aria-describedby={releasing ? `${badgeId} ${lineId}` : lineId}
      >
        {poster}
        {text}
      </button>
      {onHide && (
        <div className="media-card__actions">
          <button type="button" className="rec-card__hide" aria-label={t('recommendations.hide', { title: item.title })} onClick={(e) => onHide(item, e.detail === 0)}>×</button>
        </div>
      )}
    </div>
  )
}
