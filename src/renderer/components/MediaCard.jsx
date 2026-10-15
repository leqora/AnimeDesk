import { useId } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from './Poster.jsx'
import { Icon } from './Icon.jsx'
import { nextEpisode } from '../../shared/domain.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'

export function isSeriesComplete(entry) {
  const total = entry.totalEpisodes
  if (!Number.isInteger(total) || total <= 0) return false
  for (let ep = 1; ep <= total; ep++) if (!entry.watchedEpisodes.includes(ep)) return false
  return true
}

// The line under the title. Only "EP N" — never an episode title (those only come through seriesEpisodes in main).
export function cardLine(entry, progress) {
  if (isSeriesComplete(entry)) return { key: 'card.completed', vars: {} }
  const next = nextEpisode(entry)
  const saved = progress[String(next)]
  if (saved) return { key: 'card.remaining', vars: { episode: next, min: saved.remaining } }
  if (entry.watchedEpisodes.length > 0 || entry.status === 'watching') return { key: 'card.next', vars: { episode: next } }
  return null
}

// Open and the actions are sibling buttons (a button cannot contain a button).
export function MediaCard({ entry, ready, onOpen, onContinue, onTogglePin = null, showScore = false }) {
  const t = useT()
  const lineId = useId()
  const key = entry.aniCliTitle ?? entry.title
  const progress = useEpisodeProgress(key)
  const total = entry.totalEpisodes
  const complete = isSeriesComplete(entry)
  const watched = Number.isInteger(total) && total > 0 ? Math.min(entry.watchedEpisodes.length, total) : entry.watchedEpisodes.length
  const ratio = Number.isInteger(total) && total > 0 ? Math.min(1, watched / total) : null
  const next = nextEpisode(entry)
  const line = cardLine(entry, progress)
  return (
    <div className="card media-card" data-status={entry.status} data-complete={complete ? 'true' : undefined}>
      <button
        type="button" className="media-card__open" onClick={() => onOpen(entry.id)}
        aria-label={t('card.label', { title: entry.title, watched, total: total ?? '?', status: t(`status.${entry.status}`) })}
        aria-describedby={line ? lineId : undefined}
      >
        <Poster title={entry.title} aniListId={entry.aniListId}>
          <span className="media-card__fade" aria-hidden="true" />
          {ratio != null && <span className="media-card__bar" aria-hidden="true" style={{ '--ratio': ratio }} />}
          <span className="media-card__status" aria-hidden="true" />
          <span className="badge badge--progress" aria-hidden="true">
            {complete ? `✓ ${total}/${total}` : <>{watched}<span className="muted">/{total ?? '?'}</span></>}
          </span>
          {showScore && entry.rating ? <span className="badge badge--score" aria-hidden="true">★ {entry.rating}</span> : null}
        </Poster>
        <span className="card__title">{entry.title}</span>
        {line && <span className="card__meta" id={lineId}>{t(line.key, line.vars)}</span>}
      </button>
      <div className="media-card__actions">
        {!complete && (
          <button type="button" className="primary media-card__play" disabled={!ready} aria-label={t('home.continueEp', { episode: next })} onClick={() => onContinue({ query: key, anime: key, episode: String(next) })}>
            <Icon name="play" />
          </button>
        )}
        {onTogglePin && (
          <button type="button" className="media-card__pin" aria-pressed={Boolean(entry.pinnedAt)} aria-label={`${entry.pinnedAt ? t('pin.remove') : t('pin.add')}: ${entry.title}`} onClick={() => onTogglePin(entry)}>
            <Icon name="star" />
          </button>
        )}
      </div>
    </div>
  )
}
