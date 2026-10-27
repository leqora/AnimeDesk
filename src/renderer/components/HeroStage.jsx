import { useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { useRotation } from '../home/useRotation.js'

// The banner image of one slide: the blurred, tinted poster is always underneath; a real banner (local file url) covers it once known.
export function HeroBackdrop({ poster, banner, tint }) {
  return (
    <div className="home-hero__media" style={tint ? { '--poster-tint': tint } : undefined}>
      {poster && <div className="hero__bg" style={{ backgroundImage: `url(${poster})` }} />}
      {typeof banner === 'string' && <div className="home-hero__banner" style={{ backgroundImage: `url("${banner}")` }} />}
    </div>
  )
}

// Full-width banner with crossfading slides and dots. All slides stay mounted (so they can fade), the inactive ones are
// inert and hidden from the accessibility tree. Rotation pauses while the mouse or the focus is inside, so nothing moves under a user.
// `keys` are stable ids in display order. The slide wrappers keep a stable DOM order (never moved when the list is reordered,
// so a focused button keeps focus), and the slide that holds the focus stays the shown one.
export function HeroStage({ keys, label, reduced = false, renderSlide }) {
  const t = useT()
  const count = keys.length
  const [hover, setHover] = useState(false)
  const [focusIn, setFocusIn] = useState(false)
  const focusKey = useRef(null)
  const order = useRef([])
  const [index, setIndex] = useRotation({ count, paused: hover || focusIn, reduced })
  order.current = [...order.current.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.current.includes(k))]
  const held = focusIn && focusKey.current != null ? keys.indexOf(focusKey.current) : -1
  const shown = held >= 0 ? held : index
  return (
    <section
      className="home-hero page-banner" aria-label={label} aria-roledescription="carousel"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={(e) => { focusKey.current = e.target.closest?.('[data-slide-key]')?.dataset.slideKey ?? null; setFocusIn(true) }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { const at = focusKey.current == null ? -1 : keys.indexOf(focusKey.current); if (at >= 0) setIndex(at); focusKey.current = null; setFocusIn(false) } }}
    >
      {order.current.map((k) => {
        const i = keys.indexOf(k)
        const active = i === shown
        return (
          <div key={k} data-slide-key={k} className="home-hero__slide" data-active={active ? 'true' : undefined} inert={active ? undefined : true} aria-hidden={active ? undefined : 'true'}>
            {renderSlide(i)}
          </div>
        )
      })}
      {count > 1 && (
        <div className="home-hero__dots">
          {keys.map((k, i) => (
            <button key={k} type="button" className="home-hero__dot" aria-current={i === shown ? 'true' : undefined} aria-label={t('hero.slide', { n: i + 1, total: count })} onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
    </section>
  )
}
