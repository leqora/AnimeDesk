import { useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useBanner } from '../anilist/useBanner.js'
import { usePosterTint } from '../theme/usePosterTint.js'
import { Icon } from './Icon.jsx'
import { HeroBackdrop, HeroStage } from './HeroStage.jsx'
import { formatLabel } from './SequelCard.jsx'

// Nothing in progress: popular series (list facts only — never a description). "+ Watchlist" uses aria-disabled
// (not disabled) once added, so the focus stays on the button.
function Slide({ slide, added, onAdd, onSearch }) {
  const t = useT()
  const banner = useBanner({ kind: slide.kind, id: slide.id })
  const tint = usePosterTint(slide.poster)
  const meta = [slide.year, slide.format ? formatLabel(slide.format, t) : null, ...slide.genres.slice(0, 3)].filter((x) => x != null).join(' · ')
  return (
    <>
      <HeroBackdrop poster={slide.poster} banner={banner} tint={tint} />
      <div className="home-hero__in">
        <span className="home-hero__kicker hud">{t(slide.labelKey, { n: slide.rank })}</span>
        <h1 className="home-hero__title">{slide.title}</h1>
        {meta && <div className="home-hero__meta hud">{meta}</div>}
        <div className="home-hero__actions">
          <button type="button" className="primary home-hero__cta" onClick={() => onSearch(slide.romaji ?? slide.title)}><Icon name="search" /> {t('hero.searchWatch')}</button>
          <button type="button" className="home-hero__glass" aria-disabled={added ? 'true' : undefined} onClick={() => { if (!added) onAdd(slide) }}>
            {added ? `✓ ${t('hero.inWatchlist')}` : `＋ ${t('hero.addWatchlist')}`}
          </button>
        </div>
      </div>
    </>
  )
}

export function PopularHero({ slides, onSearch }) {
  const api = useApi()
  const t = useT()
  const [added, setAdded] = useState(() => new Set())
  const busy = useRef(new Set())
  const add = async (slide) => {
    if (busy.current.has(slide.id)) return
    busy.current.add(slide.id)
    try {
      await api.library.add({ title: slide.title, aniListId: slide.id, status: 'planned' })
      setAdded((prev) => new Set(prev).add(slide.id))
    } catch (err) {
      console.warn('popular: add failed', err?.message)
    } finally {
      busy.current.delete(slide.id)
    }
  }
  if (slides.length === 0) {
    return (
      <section className="hero hero--welcome">
        <div className="hero__body">
          <div className="hero__text">
            <h1 className="hero__title">{t('home.welcome')}</h1>
            <p className="muted">{t('home.welcomeSub')}</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => onSearch()}><Icon name="search" /> {t('home.searchCta')}</button>
            </div>
          </div>
        </div>
      </section>
    )
  }
  return (
    <HeroStage
      count={slides.length} label={t('hero.label')}
      renderSlide={(i) => <Slide key={slides[i].id} slide={slides[i]} added={added.has(slides[i].id)} onAdd={add} onSearch={onSearch} />}
    />
  )
}
