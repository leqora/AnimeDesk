import { useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { useEpisodeThumb } from '../episodes/useEpisodeThumb.js'
import { MenuButton } from './MenuButton.jsx'
import { Modal } from './Modal.jsx'
import { Icon } from './Icon.jsx'

// One episode as a 16:9 card. The card is one button (plays); the "more" menu is a sibling button after it (a button cannot contain a button).
// What it may show was decided in main: a hidden row only ever has number + runtime and is a locked tile that cannot be played.
export function EpisodeCard({ row, poster = null, watched = false, next = false, noted = false, kind = null, progress = null, loadThumb = null, onPlay, onReveal = null, onNote, onToggleWatched, cardRef = null }) {
  const t = useT()
  const ref = useRef(null)
  const src = useEpisodeThumb({ row, loadThumb, ref })
  const [describing, setDescribing] = useState(false)
  const [bad, setBad] = useState(null)
  const hidden = row.visibility === 'hidden'
  const full = row.visibility === 'full'
  const overview = full ? row.overview : null
  const title = hidden ? null : row.title
  const img = src && src !== bad ? src : poster
  const label = title ? t('episodes.titled', { n: row.number, title }) : t('episodes.number', { n: row.number })
  const cls = ['ep-card', next && !hidden && 'ep-card--next', watched && 'ep-card--watched', noted && 'ep-card--note', hidden && 'ep-card--hidden'].filter(Boolean).join(' ')
  const runtime = row.runtime ? t('episodes.minutes', { n: row.runtime }) : null

  const menu = (
    <div className="ep-card__actions">
      <MenuButton label={t('episodes.more', { n: row.number })} icon={<span aria-hidden="true">⋯</span>}>
        <button type="button" role="menuitem" tabIndex={-1} data-navigates className="menu-button__item" onClick={() => onNote(row.number)}>{t('episodes.noteItem')}</button>
        <button type="button" role="menuitem" tabIndex={-1} className="menu-button__item" onClick={() => onToggleWatched(row.number)}>
          {t(watched ? 'detail.unmarkWatched' : 'detail.markWatched')}
        </button>
        {overview && <button type="button" role="menuitem" tabIndex={-1} className="menu-button__item" onClick={() => setDescribing(true)}>{t('episodes.summary')}</button>}
      </MenuButton>
    </div>
  )

  if (hidden) {
    return (
      <div ref={(el) => { ref.current = el; cardRef?.(el) }} className={cls}>
        <div className="ep-card__frame ep-card__frame--locked">
          <span className="ep-card__lock" aria-hidden="true">🔒</span>
          <span className="ep-card__badge hud">{t('episodes.badge', { n: row.number })}</span>
          {runtime && <span className="ep-card__len hud">{runtime}</span>}
          {onReveal && <button type="button" className="ep-card__reveal" aria-label={`${t('episodes.reveal')}: ${t('episodes.number', { n: row.number })}`} onClick={() => onReveal(row.number)}>{t('episodes.reveal')}</button>}
        </div>
        {menu}
      </div>
    )
  }

  return (
    <div ref={(el) => { ref.current = el; cardRef?.(el) }} className={cls}>
      <button type="button" className="ep-card__open" aria-label={t('episodes.play', { label })} onClick={() => onPlay(row.number)}>
        <span className="ep-card__frame">
          {img ? <img className="ep-card__img" src={img} alt="" onError={() => setBad(img)} /> : <span className="ep-card__img ep-card__img--empty" aria-hidden="true" />}
          <span className="ep-card__fade" aria-hidden="true" />
          {next && <span className="ep-card__play" aria-hidden="true"><Icon name="play" /></span>}
          <span className="ep-card__badge hud" aria-hidden="true">{t('episodes.badge', { n: row.number })}</span>
          {kind && <span className={`ep-card__kind ep-card__kind--${kind}`} aria-hidden="true">{kind === 'filler' ? 'F' : 'R'}</span>}
          {runtime && <span className="ep-card__len hud" aria-hidden="true">{runtime}</span>}
          {progress && <span className="ep-card__bar" aria-hidden="true" style={{ '--ratio': progress.ratio }} />}
        </span>
        {title && <span className="ep-card__title">{title}</span>}
        <span className="ep-card__meta muted">
          {progress && <span className="ep-card__left">{t('episodes.remaining', { min: progress.remaining })}</span>}
          {watched && <span className="ep-card__done">{t('episodes.watchedMark')}</span>}
          {kind && <span>{t(kind === 'filler' ? 'episodes.kindFiller' : 'episodes.kindRecap')}</span>}
        </span>
      </button>
      {menu}
      {describing && overview && (
        <Modal label={label} onClose={() => setDescribing(false)}>
          <h3>{label}</h3>
          <p className="ep-card__overview">{overview}</p>
          <div className="row"><button type="button" onClick={() => setDescribing(false)}>{t('episodes.summaryClose')}</button></div>
        </Modal>
      )}
    </div>
  )
}
