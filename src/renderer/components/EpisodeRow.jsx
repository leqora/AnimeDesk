import { useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { useEpisodeThumb } from '../episodes/useEpisodeThumb.js'

// One episode in the list view. What it may show was decided in main: a hidden row only ever has number + runtime.
export function EpisodeRow({ row, poster = null, watched = false, selected = false, noted = false, onToggle, onReveal = null, loadThumb = null, rowRef = null, progress = null, kind = null }) {
  const t = useT()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const hidden = row.visibility === 'hidden'
  const full = row.visibility === 'full'
  const overview = full ? row.overview : null
  const title = hidden ? null : row.title

  const src = useEpisodeThumb({ row, loadThumb, ref })

  const img = src ?? poster
  const label = title ? t('episodes.titled', { n: row.number, title }) : t('episodes.number', { n: row.number })
  const cls = ['ep-row', watched && 'ep-row--watched', selected && 'ep-row--selected', noted && 'ep-row--note', hidden && 'ep-row--hidden'].filter(Boolean).join(' ')
  return (
    <div ref={(el) => { ref.current = el; rowRef?.(el) }} className={cls}>
      <button type="button" className="ep-row__main" aria-pressed={selected} onClick={() => onToggle(row.number)}>
        <span className="ep-row__media">
          {img ? <img className="ep-row__thumb" src={img} alt="" /> : <span className="ep-row__thumb ep-row__thumb--empty" aria-hidden="true" />}
          {progress && <span className="ep-row__progress" aria-hidden="true" style={{ '--ratio': progress.ratio }} />}
        </span>
        <span className="ep-row__text">
          <span className="ep-row__title">{label}</span>
          <span className="ep-row__meta muted">
            {row.runtime ? t('episodes.minutes', { n: row.runtime }) : null}
            {progress && <span className="ep-row__left">{t('episodes.remaining', { min: progress.remaining })}</span>}
            {watched && <span className="ep-row__done">{t('episodes.watchedMark')}</span>}
            {kind && <span className={`ep-row__kind ep-row__kind--${kind}`}>{t(kind === 'filler' ? 'episodes.kindFiller' : 'episodes.kindRecap')}</span>}
          </span>
        </span>
      </button>
      {hidden && onReveal && <button type="button" onClick={() => onReveal(row.number)}>{t('episodes.reveal')}</button>}
      {overview && <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('episodes.summary')}</button>}
      {open && overview && <p className="ep-row__overview">{overview}</p>}
    </div>
  )
}
