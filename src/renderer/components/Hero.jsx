import { useT } from '../i18n/I18nContext.jsx'
import { usePosterInfo } from './Poster.jsx'
import { usePosterTint } from '../theme/usePosterTint.js'
import { XpBar } from './XpBar.jsx'
import { Icon } from './Icon.jsx'
import { nextEpisode } from '../../shared/domain.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'
import { formatTime } from '../../shared/player.js'

export function Hero({ entry, ready, onContinue, onDetails, onSearch }) {
  const t = useT()
  const info = usePosterInfo(entry?.title ?? null, entry?.aniListId ?? null)
  const tint = usePosterTint(info?.poster ?? null)
  const progress = useEpisodeProgress(entry ? (entry.aniCliTitle ?? entry.title) : null)

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
  return (
    <section className="hero" style={tint ? { '--poster-tint': tint } : undefined}>
      {info?.poster && <div className="hero__bg" style={{ backgroundImage: `url(${info.poster})` }} />}
      <div className="hero__body">
        <div className="hero__text">
          <span className="hero__label hud">{t('home.continue')}</span>
          <h1 className="hero__title">{entry.title}</h1>
          <span className="hud muted">{t('home.episodeOf', { watched, total: entry.totalEpisodes ?? '?' })}</span>
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
