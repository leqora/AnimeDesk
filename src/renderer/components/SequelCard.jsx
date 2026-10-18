import { useId } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { PosterFrame } from './Poster.jsx'

// Only facts from the list item are shown: format, year, episode count. Never a description, tags or scores (spoilers).
export function sequelMeta(item, t) {
  return [
    item.format ? String(item.format).replace(/_/g, ' ') : null,
    Number.isInteger(item.year) ? item.year : null,
    Number.isInteger(item.episodes) && item.episodes > 0 ? t.n('sequels.episodes', item.episodes, { n: item.episodes }) : null,
  ].filter((x) => x != null).join(' · ')
}

// Search and hide are sibling buttons (a button cannot contain a button); the hide button reuses the hover/focus-within actions pattern.
export function SequelCard({ item, ready, onSearch, onHide }) {
  const t = useT()
  const lineId = useId()
  const meta = sequelMeta(item, t)
  const releasing = item.status === 'RELEASING'
  return (
    <div className="card media-card sequel-card">
      <button
        type="button" className="media-card__open" disabled={!ready} onClick={() => onSearch(item.romaji ?? item.title)}
        aria-label={t('sequels.open', { title: item.title })} aria-describedby={lineId}
      >
        <PosterFrame info={{ poster: item.poster }}>
          <span className="media-card__fade" aria-hidden="true" />
          {releasing && <span className="badge badge--progress sequel-card__badge" aria-hidden="true">{t('sequels.releasing')}</span>}
        </PosterFrame>
        <span className="card__title" aria-hidden="true">{item.title}</span>
        <span className="card__meta" id={lineId} aria-hidden="true">
          {meta && <>{meta}<br /></>}
          {t('sequels.after', { title: item.fromTitle })}
        </span>
      </button>
      <div className="media-card__actions">
        <button type="button" className="sequel-card__hide" aria-label={t('sequels.hide', { title: item.title })} onClick={() => onHide(item)}>×</button>
      </div>
    </div>
  )
}
