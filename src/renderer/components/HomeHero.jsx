import { useT } from '../i18n/I18nContext.jsx'
import { useAniListInfo } from '../anilist/useAniListInfo.js'
import { useBanner } from '../anilist/useBanner.js'
import { usePosterTint } from '../theme/usePosterTint.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'
import { useNow } from '../useNow.js'
import { nextEpisode } from '../../shared/domain.js'
import { newEpisodeCount } from '../../shared/airing.js'
import { formatTime } from '../../shared/player.js'
import { Icon } from './Icon.jsx'
import { AiringLine, NewBadge } from './AiringLine.jsx'
import { HeroBackdrop, HeroStage } from './HeroStage.jsx'
import { formatLabel } from './SequelCard.jsx'

// Facts only (year · format · episodes · up to 3 genres) — never a description, and nothing for a "close" AniList guess.
export function heroMeta(info, t) {
  if (!info || info.match === 'close') return ''
  const genres = Array.isArray(info.genres) ? info.genres.slice(0, 3) : []
  return [
    Number.isInteger(info.year) ? info.year : null,
    info.format ? formatLabel(info.format, t) : null,
    Number.isInteger(info.episodes) && info.episodes > 0 ? t.n('sequels.episodes', info.episodes, { n: info.episodes }) : null,
    ...genres,
  ].filter((x) => x != null).join(' · ')
}

function Slide({ entry, ready, now, onContinue, onDetails }) {
  const t = useT()
  const info = useAniListInfo(entry.title, entry.aniListId ?? null, { live: true })
  const banner = useBanner({ kind: 'series', entryId: entry.id, info: info?.id ?? null })
  const tint = usePosterTint(info?.poster ?? null)
  const key = entry.aniCliTitle ?? entry.title
  const progress = useEpisodeProgress(key)
  const next = nextEpisode(entry, progress)
  const saved = progress[String(next)]
  const fresh = newEpisodeCount(entry, info, now)
  const meta = heroMeta(info, t)
  return (
    <>
      <HeroBackdrop poster={info?.poster ?? null} banner={banner} tint={tint} />
      <div className="home-hero__in">
        <span className="home-hero__kicker hud">{t('home.continue')} <NewBadge count={fresh} inline /></span>
        <h1 className="home-hero__title">{entry.title}</h1>
        {meta && <div className="home-hero__meta hud">{meta}</div>}
        <AiringLine info={info} now={now} />
        <div className="home-hero__actions">
          <button type="button" className="primary home-hero__cta" disabled={!ready} onClick={() => onContinue({ query: key, anime: key, episode: String(next) })}>
            <Icon name="play" /> {saved ? t('home.continueEpFrom', { episode: next, time: formatTime(saved.position) }) : t('home.continueEp', { episode: next })}
          </button>
          <button type="button" className="home-hero__glass" onClick={() => onDetails(entry.id)}><Icon name="info" /> {t('home.details')}</button>
        </div>
        {saved && (
          <div className="home-hero__left hud muted">
            <div className="home-hero__progress" aria-hidden="true"><span style={{ '--ratio': saved.ratio }} /></div>
            {t('hero.left', { n: saved.remaining })}
          </div>
        )}
      </div>
    </>
  )
}

export function HomeHero({ entries, ready, reduced = false, onContinue, onDetails }) {
  const t = useT()
  const now = useNow()
  return (
    <HeroStage
      keys={entries.map((e) => String(e.id))} reduced={reduced} label={t('hero.label')}
      renderSlide={(i) => <Slide key={entries[i].id} entry={entries[i]} ready={ready} now={now} onContinue={onContinue} onDetails={onDetails} />}
    />
  )
}
