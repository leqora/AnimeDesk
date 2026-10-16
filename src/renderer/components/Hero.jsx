import { useT } from '../i18n/I18nContext.jsx'
import { useAniListInfo } from '../anilist/useAniListInfo.js'
import { usePosterTint } from '../theme/usePosterTint.js'
import { XpBar } from './XpBar.jsx'
import { Icon } from './Icon.jsx'
import { nextEpisode } from '../../shared/domain.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'
import { formatTime } from '../../shared/player.js'
import { useNow } from '../useNow.js'
import { AiringLine, NewBadge } from './AiringLine.jsx'
import { newEpisodeCount } from '../../shared/airing.js'

export function Hero({ entry, ready, onContinue, onDetails, onSearch }) {
  const t = useT()
  const info = useAniListInfo(entry?.title ?? null, entry?.aniListId ?? null, { live: true })
  const tint = usePosterTint(info?.poster ?? null)
  const progress = useEpisodeProgress(entry ? (entry.aniCliTitle ?? entry.title) : null)
  const now = useNow()

  if (!entry) {
    return (
      <section className="hero hero--welcome">
        <div className="hero__body">
          <div className="hero__text">
            <h1 className="hero__title">{t('home.welcome')}</h1>
            <p className="muted">{t('home.welcomeSub')}</p>
            <div className="row">
              <button type="button" className="primary" onClick={onSearch}><Icon name="search" /> {t('home.searchCta')}</button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const key = entry.aniCliTitle ?? entry.title
  const next = nextEpisode(entry)
  const saved = progress[String(next)]
  const watched = entry.watchedEpisodes.length
  const fresh = newEpisodeCount(entry, info, now)
  return (
    <section className="hero" style={tint ? { '--poster-tint': tint } : undefined}>
      {info?.poster && <div className="hero__bg" style={{ backgroundImage: `url(${info.poster})` }} />}
      <div className="hero__body">
        <div className="hero__text">
          <span className="hero__label hud">{t('home.continue')} <NewBadge count={fresh} inline /></span>
          <h1 className="hero__title">{entry.title}</h1>
          <span className="hud muted">{t('home.episodeOf', { watched, total: entry.totalEpisodes ?? '?' })}</span>
          <AiringLine info={info} now={now} />
          {entry.totalEpisodes ? <XpBar into={watched} total={entry.totalEpisodes} /> : null}
          {saved && <div className="hero__ep-progress" aria-hidden="true"><span style={{ '--ratio': saved.ratio }} /></div>}
          <div className="row">
            <button type="button" className="primary" disabled={!ready} onClick={() => onContinue({ query: key, anime: key, episode: String(next) })}>
              <Icon name="play" /> {saved ? t('home.continueEpFrom', { episode: next, time: formatTime(saved.position) }) : t('home.continueEp', { episode: next })}
            </button>
            <button type="button" onClick={() => onDetails(entry.id)}><Icon name="info" /> {t('home.details')}</button>
          </div>
        </div>
        {info?.poster && <img className="hero__poster" src={info.poster} alt="" />}
      </div>
    </section>
  )
}
