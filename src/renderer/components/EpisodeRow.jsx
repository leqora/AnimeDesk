import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

// One episode in the list view. What it may show was decided in main: a hidden row only ever has number + runtime.
export function EpisodeRow({ row, poster = null, watched = false, selected = false, noted = false, onToggle, onReveal = null, loadThumb = null }) {
  const t = useT()
  const ref = useRef(null)
  const [src, setSrc] = useState(null)
  const [open, setOpen] = useState(false)
  const hidden = row.visibility === 'hidden'

  useEffect(() => {
    setSrc(null)
    if (hidden || !row.hasThumb || !loadThumb) return undefined
    let live = true
    const fetchThumb = () => loadThumb(row.number).then((u) => { if (live && u) setSrc(u) }).catch(() => {})
    // A group holds up to 100 rows: only ask for the pictures that scroll into view.
    if (typeof IntersectionObserver === 'undefined') {
      fetchThumb()
      return () => { live = false }
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fetchThumb() }
    })
    io.observe(ref.current)
    return () => { live = false; io.disconnect() }
  }, [row.number, hidden, row.hasThumb, loadThumb])

  const img = src ?? poster
  const label = row.title ? t('episodes.titled', { n: row.number, title: row.title }) : t('episodes.number', { n: row.number })
  const cls = ['ep-row', watched && 'ep-row--watched', selected && 'ep-row--selected', noted && 'ep-row--note', hidden && 'ep-row--hidden'].filter(Boolean).join(' ')
  return (
    <div ref={ref} className={cls}>
      <button type="button" className="ep-row__main" aria-pressed={selected} onClick={() => onToggle(row.number)}>
        {img ? <img className="ep-row__thumb" src={img} alt="" /> : <span className="ep-row__thumb ep-row__thumb--empty" aria-hidden="true" />}
        <span className="ep-row__text">
          <span className="ep-row__title">{label}</span>
          <span className="ep-row__meta muted">
            {row.runtime ? t('episodes.minutes', { n: row.runtime }) : null}
            {watched && <span className="ep-row__done">{t('episodes.watchedMark')}</span>}
          </span>
        </span>
      </button>
      {hidden && onReveal && <button type="button" onClick={() => onReveal(row.number)}>{t('episodes.reveal')}</button>}
      {row.overview && <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('episodes.summary')}</button>}
      {open && row.overview && <p className="ep-row__overview">{row.overview}</p>}
    </div>
  )
}
