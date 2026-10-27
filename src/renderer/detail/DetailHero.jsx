import { useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { useBanner } from '../anilist/useBanner.js'
import { usePosterTint } from '../theme/usePosterTint.js'
import { STATUSES } from '../../shared/domain.js'
import { ANILIST_STATUSES, upcoming } from '../../shared/airing.js'
import { formatTime } from '../../shared/player.js'
import { Icon } from '../components/Icon.jsx'
import { Poster } from '../components/Poster.jsx'
import { MenuButton } from '../components/MenuButton.jsx'
import { AiringLine, NewBadge } from '../components/AiringLine.jsx'
import { HeroBackdrop } from '../components/HeroStage.jsx'
import { formatLabel } from '../components/SequelCard.jsx'

// Series detail banner: backdrop (AniList banner, else the blurred poster), poster, title, facts, genres, actions and the "more" menu.
// A "close" AniList guess shows poster-level data only (year, genres): no format, duration, airing status or description.
// metaToggle: null (no menu item) or { off, onChange(off) }.
export function DetailHero({
  entry, info, ready = true, nextEp, saved = null, finished = false, fresh = 0, now,
  metaToggle = null, onBack, onContinue, onTogglePin, onStatus, onRemove, onPickAniList, playerOpen = false,
}) {
  const t = useT()
  const [showDesc, setShowDesc] = useState(false)
  const banner = useBanner({ kind: 'series', entryId: entry.id, info: info?.id ?? null })
  const tint = usePosterTint(info?.poster ?? null)
  const close = info?.match === 'close'
  const totalEps = entry.totalEpisodes ?? (close ? null : info?.episodes) ?? null
  const meta = info
    ? [
        info.year,
        !close && info.format && formatLabel(info.format, t),
        totalEps && t('detail.episodesCount', { n: totalEps }),
        !close && info.duration && t('detail.duration', { min: info.duration }),
        !close && ANILIST_STATUSES.includes(info.status) && t(`airing.status.${info.status}`),
      ].filter(Boolean)
    : []
  const description = !close && info?.description ? info.description : null
  return (
    <>
      <section className="detail-hero page-banner" aria-label={entry.title}>
        <HeroBackdrop poster={info?.poster ?? null} banner={banner} tint={tint} />
        <button type="button" className="detail-hero__back" aria-label={t('detail.back')} onClick={onBack}>
          <span aria-hidden="true">← </span>{t('detail.back')}
        </button>
        <div className="detail-hero__in">
          <div className="detail-hero__poster"><Poster title={entry.title} aniListId={entry.aniListId} /></div>
          <div className="detail-hero__text">
            <h1 className="detail-hero__title">{entry.title}</h1>
            <div className="detail-hero__facts">
              {meta.length > 0 && <p className="detail-hero__meta hud">{meta.join(' · ')}</p>}
              <select className="detail-hero__status" aria-label={t('detail.status')} value={entry.status} onChange={(e) => onStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            </div>
            {(upcoming(info, now) || fresh > 0) && (
              <div className="detail-hero__airing">
                <AiringLine info={info} now={now} />
                <NewBadge count={fresh} inline />
              </div>
            )}
            {info?.genres?.length > 0 && (
              <ul className="chips" aria-label={t('detail.genres')}>
                {info.genres.map((g) => <li key={g} className="chip">{g}</li>)}
              </ul>
            )}
            <div className="detail-hero__actions">
              <button type="button" className="primary home-hero__cta" disabled={!ready} onClick={onContinue}>
                <Icon name="play" /> {finished ? t('detail.rewatch') : saved ? t('home.continueEpFrom', { episode: nextEp, time: formatTime(saved.position) }) : t('home.continueEp', { episode: nextEp })}
              </button>
              <button type="button" className="home-hero__glass" aria-pressed={Boolean(entry.pinnedAt)} onClick={onTogglePin}>
                <Icon name="star" /> {entry.pinnedAt ? t('pin.remove') : t('pin.add')}
              </button>
              {description && (
                <button type="button" className="home-hero__glass" aria-expanded={showDesc} onClick={() => setShowDesc((v) => !v)}>
                  {showDesc ? t('detail.hideDescription') : t('detail.showDescription')}
                </button>
              )}
              <MenuButton label={t('detail.more')} icon={<span aria-hidden="true">⋯</span>} className="detail-hero__more" closeWhen={playerOpen}>
                <button type="button" role="menuitem" tabIndex={-1} data-navigates className="menu-button__item" onClick={onPickAniList}>{t('detail.pickAniList')}</button>
                {metaToggle && (
                  <button type="button" role="menuitem" tabIndex={-1} className="menu-button__item" onClick={() => metaToggle.onChange(!metaToggle.off)}>
                    {t(metaToggle.off ? 'detail.metaOn' : 'detail.metaOff')}
                  </button>
                )}
                <button type="button" role="menuitem" tabIndex={-1} data-navigates className="menu-button__item" onClick={onRemove}>{t('detail.delete')}</button>
              </MenuButton>
            </div>
          </div>
        </div>
      </section>
      {showDesc && description && <p className="description detail-hero__description">{description}</p>}
    </>
  )
}
