import { useState } from 'react'
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
export function HeroStage({ count, label, renderSlide }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const [focusIn, setFocusIn] = useState(false)
  const [index, setIndex] = useRotation({ count, paused: hover || focusIn })
  return (
    <section
      className="home-hero" aria-label={label} aria-roledescription="carousel"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocusIn(false) }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="home-hero__slide" data-active={i === index ? 'true' : undefined} inert={i === index ? undefined : true} aria-hidden={i === index ? undefined : 'true'}>
          {renderSlide(i)}
        </div>
      ))}
      {count > 1 && (
        <div className="home-hero__dots">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} type="button" className="home-hero__dot" aria-current={i === index ? 'true' : undefined} aria-label={t('hero.slide', { n: i + 1, total: count })} onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
    </section>
  )
}
