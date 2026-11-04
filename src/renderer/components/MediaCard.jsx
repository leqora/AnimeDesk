import { useId } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { PosterFrame, usePosterInfo } from './Poster.jsx'
import { Icon } from './Icon.jsx'
import { NewBadge } from './AiringLine.jsx'
import { nextEpisode } from '../../shared/domain.js'
import { newEpisodeCount } from '../../shared/airing.js'
import { useEpisodeProgressState } from '../episodes/useEpisodeProgress.js'
import { useCardMenu } from './useCardMenu.js'
import { LibraryCardMenu } from './LibraryCardMenu.jsx'

export function isSeriesComplete(entry) {
  const total = entry.totalEpisodes
  if (!Number.isInteger(total) || total <= 0) return false
  for (let ep = 1; ep <= total; ep++) if (!entry.watchedEpisodes.includes(ep)) return false
  return true
}

// The line under the title. Only "EP N" — never an episode title (those only come through seriesEpisodes in main).
export function cardLine(entry, progress, loaded = true) {
  if (entry.status === 'completed' || isSeriesComplete(entry)) return { key: 'card.completed', vars: {} }
  if (!loaded) return null // the next episode may still move once the saved positions arrive
  const next = nextEpisode(entry, progress)
  const saved = progress[String(next)]
  if (saved) return { key: 'card.remaining', vars: { episode: next, min: saved.remaining } }
  if (entry.watchedEpisodes.length > 0 || entry.status === 'watching') return { key: 'card.next', vars: { episode: next } }
  return null
}

// Only numbers (count, minutes) — never episode titles. Hidden for a "close" AniList match, which may be a different show.
export function episodesLine(entry, info, t) {
  if (info?.match === 'close') return null
  const n = entry.totalEpisodes ?? info?.episodes
  if (!Number.isInteger(n) || n <= 0) return null
  const text = t.n('card.episodes', n, { n })
  return info?.duration > 0 ? `${text} · ${t('detail.duration', { min: info.duration })}` : text
}

// Open and the actions are sibling buttons (a button cannot contain a button).
export function MediaCard({ entry, ready, onOpen, onContinue, onTogglePin = null, showScore = false }) {
  const t = useT()
  const lineId = useId()
  const { rootProps, open, menuProps } = useCardMenu({ label: entry.title })
  const key = entry.aniCliTitle ?? entry.title
  const { progress, loaded } = useEpisodeProgressState(key)
  const info = usePosterInfo(entry.title, entry.aniListId)
  // Cards have no clock of their own; they re-render on every library/position change.
  const fresh = newEpisodeCount(entry, info, Date.now())
  const total = entry.totalEpisodes
  // AniList's count is for display only (badge, bar, label); "complete", the line and the next episode stay on entry.totalEpisodes.
  const displayTotal = total ?? (info?.match === 'close' ? null : info?.episodes) ?? null
  const complete = isSeriesComplete(entry)
  const finished = complete || entry.status === 'completed'
  const hasTotal = Number.isInteger(displayTotal) && displayTotal > 0
  const watched = hasTotal ? Math.min(entry.watchedEpisodes.length, displayTotal) : entry.watchedEpisodes.length
  const ratio = hasTotal ? Math.min(1, watched / displayTotal) : null
  const next = nextEpisode(entry, progress)
  const line = cardLine(entry, progress, loaded)
  const peek = line ? null : episodesLine(entry, info, t)
  return (
    <div className="card media-card" {...rootProps} data-status={entry.status} data-complete={complete ? 'true' : undefined}>
      <button
        type="button" className="media-card__open" data-card-main aria-keyshortcuts="Shift+F10" onClick={() => onOpen(entry.id)}
        aria-label={t('card.label', { title: entry.title, watched, total: displayTotal ?? '?', status: t(`status.${entry.status}`) }) + (fresh > 0 ? t.n('airing.newLabel', fresh) : '')}
        aria-describedby={line || peek ? lineId : undefined}
      >
        <PosterFrame info={info}>
          <span className="media-card__fade" aria-hidden="true" />
          {ratio != null && <span className="media-card__bar" aria-hidden="true" style={{ '--ratio': ratio }} />}
          <span className="media-card__status" aria-hidden="true" />
          <NewBadge count={fresh} />
          <span className="badge badge--progress" aria-hidden="true">
            {complete ? `✓ ${total}/${total}` : <>{watched}<span className="muted">/{displayTotal ?? '?'}</span></>}
          </span>
          {showScore && entry.rating ? <span className="badge badge--score" aria-hidden="true">★ {entry.rating}</span> : null}
        </PosterFrame>
        <span className="card__title">{entry.title}</span>
        {line && <span className="card__meta" id={lineId}>{t(line.key, line.vars)}</span>}
        {!line && <span className="card__meta media-card__peek" id={lineId}>{peek}</span>}
      </button>
      <div className="media-card__actions">
        {!finished && (
          <button type="button" className="primary media-card__play" disabled={!ready || !loaded} aria-label={loaded ? t('home.continueEp', { episode: next }) : t('home.continueShort')} onClick={() => onContinue({ query: key, anime: key, episode: String(next) })}>
            <Icon name="play" />
          </button>
        )}
        {onTogglePin && (
          <button type="button" className="media-card__pin" aria-pressed={Boolean(entry.pinnedAt)} aria-label={`${entry.pinnedAt ? t('pin.remove') : t('pin.add')}: ${entry.title}`} onClick={() => onTogglePin(entry)}>
            <Icon name="star" />
          </button>
        )}
      </div>
      {open && <LibraryCardMenu entry={entry} next={next} canContinue={!finished} ready={ready && loaded} onContinue={onContinue} onOpen={onOpen} menuProps={menuProps} />}
    </div>
  )
}
