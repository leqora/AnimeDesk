import { useId } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { PosterFrame } from './Poster.jsx'
import { sequelMeta } from './SequelCard.jsx'

// Only list facts are shown: format, year, episode count, up to 3 genres and the series it came from. Never a description (spoilers).
// Search and hide are sibling buttons (a button cannot contain a button); without onHide (the detail's "Similar") there is no hide button.
export function RecommendationCard({ item, ready, onSearch, onHide }) {
  const t = useT()
  const lineId = useId()
  const badgeId = useId()
  const meta = sequelMeta(item, t)
  const genres = Array.isArray(item.genres) ? item.genres.slice(0, 3).join(' · ') : ''
  const releasing = item.status === 'RELEASING'
  return (
    <div className="card media-card rec-card">
      <button
        type="button" className="media-card__open" disabled={!ready} onClick={() => onSearch(item.romaji ?? item.title)}
        aria-label={t('recommendations.open', { title: item.title })} aria-describedby={releasing ? `${badgeId} ${lineId}` : lineId}
      >
        <PosterFrame info={{ poster: item.poster }}>
          <span className="media-card__fade" aria-hidden="true" />
          {releasing && <span id={badgeId} className="badge badge--progress rec-card__badge" aria-hidden="true">{t('sequels.releasing')}</span>}
        </PosterFrame>
        <span className="card__title" aria-hidden="true">{item.title}</span>
        <span className="card__meta" id={lineId} aria-hidden="true">
          {meta && <>{meta}<br /></>}
          {genres && <>{genres}<br /></>}
          {item.fromTitle && t('recommendations.because', { title: item.fromTitle })}
        </span>
      </button>
      {onHide && (
        <div className="media-card__actions">
          <button type="button" className="rec-card__hide" aria-label={t('recommendations.hide', { title: item.title })} onClick={(e) => onHide(item, e.detail === 0)}>×</button>
        </div>
      )}
    </div>
  )
}
