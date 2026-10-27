import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'

export function Rail({ title, count, hint, variant, children }) {
  const t = useT()
  const hintId = useId()
  const track = useRef(null)
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const el = track.current
    if (!el) return
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [count])
  const scroll = (dir) => track.current?.scrollBy?.({ left: dir * track.current.clientWidth, behavior: 'smooth' })
  // A focused card (keyboard) must be fully visible, ring and lift included.
  const keepInView = (e) => e.target.closest?.('.rail__track > *')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  return (
    <section className={variant === 'wide' ? 'rail rail--wide' : 'rail'} aria-label={title} aria-describedby={hint ? hintId : undefined}>
      <div className="rail__head">
        <h3 className="hud">{title}</h3>
        {overflow && (
          <div className="row">
            <button type="button" aria-label={t('home.prev')} onClick={() => scroll(-1)}><Icon name="chevronLeft" /></button>
            <button type="button" aria-label={t('home.next')} onClick={() => scroll(1)}><Icon name="chevronRight" /></button>
          </div>
        )}
      </div>
      {hint && <p id={hintId} className="rail__hint muted">{hint}</p>}
      <div className="rail__track" ref={track} onFocusCapture={keepInView}>{children}</div>
    </section>
  )
}
