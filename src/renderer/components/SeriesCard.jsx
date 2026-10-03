import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from './Poster.jsx'
import { Icon } from './Icon.jsx'
import { XpBar } from './XpBar.jsx'
import { nextEpisode } from '../../shared/domain.js'

// Open and play are sibling buttons (a button cannot contain a button).
export function SeriesCard({ entry, ready, onOpen, onContinue }) {
  const t = useT()
  const key = entry.aniCliTitle ?? entry.title
  const watched = entry.watchedEpisodes.length
  const total = entry.totalEpisodes
  const pct = total ? Math.min(100, Math.round((watched / total) * 100)) : null
  const next = nextEpisode(entry)
  return (
    <div className="card series-card">
      <button type="button" className="series-card__open" onClick={() => onOpen(entry.id)}>
        <Poster title={entry.title} aniListId={entry.aniListId} />
        <span className="card__title">{entry.title}</span>
      </button>
      <span className="card__meta">{t('home.episodeOf', { watched, total: total ?? '?' })}</span>
      {pct != null && (
        <div className="series-card__progress">
          <XpBar into={watched} total={total} />
          <span className="hud muted">{pct}%</span>
        </div>
      )}
      <button type="button" className="series-card__play primary" disabled={!ready} aria-label={t('home.continueEp', { episode: next })} onClick={() => onContinue({ query: key, anime: key, episode: String(next) })}>
        <Icon name="play" />
      </button>
    </div>
  )
}
