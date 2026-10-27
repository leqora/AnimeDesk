import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { usePosterInfo } from './Poster.jsx'
import { useBanner } from '../anilist/useBanner.js'
import { usePosterTint } from '../theme/usePosterTint.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'
import { nextEpisode } from '../../shared/domain.js'
import { Icon } from './Icon.jsx'

// The thumbnail of the next episode, only as main allows it (seriesEpisodes decides). undefined = loading, null = none.
function useNextThumb(entry, episode) {
  const api = useApi()
  const title = entry.aniCliTitle ?? entry.title
  const aniListId = entry.aniListId ?? null
  const key = `${title}|${aniListId ?? ''}|${episode}`
  const [state, setState] = useState(null)
  useEffect(() => {
    let live = true
    Promise.resolve()
      .then(() => api.episodes.thumb({ title, aniListId, episode, cachedOnly: true }))
      .then((value) => { if (live) setState({ key, value: typeof value === 'string' ? value : null }) })
      .catch(() => { if (live) setState({ key, value: null }) })
    return () => { live = false }
  }, [api, key])
  return state?.key === key ? state.value : undefined
}

// 16:9 "continue watching" card. The card is one button (plays); details and pin are sibling buttons after it
// (a button cannot contain a button), shown on hover/focus. Only the series title and an episode number — never an episode title.
export function ContinueCard({ entry, ready, onContinue, onOpen }) {
  const api = useApi()
  const t = useT()
  const toast = useToast()
  const key = entry.aniCliTitle ?? entry.title
  const next = nextEpisode(entry)
  const info = usePosterInfo(entry.title, entry.aniListId)
  const progress = useEpisodeProgress(key)
  const rawThumb = useNextThumb(entry, next)
  // An image that fails to load (a removed cache file, a broken thumb) falls through to the next source.
  const [bad, setBad] = useState([])
  const markBad = (src) => setBad((prev) => (prev.includes(src) ? prev : [...prev, src]))
  const thumb = typeof rawThumb === 'string' && bad.includes(rawThumb) ? null : rawThumb
  const rawBanner = useBanner(thumb === null ? { kind: 'series', entryId: entry.id } : null)
  const banner = typeof rawBanner === 'string' && bad.includes(rawBanner) ? null : rawBanner
  const tint = usePosterTint(thumb === null && !banner ? (info?.poster ?? null) : null)
  const saved = progress[String(next)]
  const line = saved ? t('continue.episodeLeft', { n: next, m: saved.remaining }) : t('continue.episode', { n: next })
  const image = typeof thumb === 'string' ? thumb : (typeof banner === 'string' ? banner : null)
  const minutes = info?.match !== 'close' && info?.duration > 0 ? info.duration : null

  const togglePin = async () => {
    const r = await api.library.setPinned(entry.id, !entry.pinnedAt)
    if (!r?.ok) toast.show({ message: t('pin.limit'), icon: 'alert' })
  }

  return (
    <div className="continue-card">
      <button type="button" className="continue-card__open" disabled={!ready} aria-label={`${t('home.continueEp', { episode: next })}: ${entry.title}`} onClick={() => onContinue({ query: key, anime: key, episode: String(next) })}>
        <span className="continue-card__frame" style={tint ? { '--poster-tint': tint } : undefined}>
          {image ? <img className="continue-card__img" src={image} alt="" onError={() => markBad(image)} />
            : thumb === undefined || banner === undefined ? <span className="poster poster--skeleton" aria-hidden="true" />
              : info?.poster ? (
                <span className="continue-card__poster" aria-hidden="true">
                  <span className="hero__bg" style={{ backgroundImage: `url(${info.poster})` }} />
                  <img src={info.poster} alt="" />
                </span>
              ) : <span className="poster poster--empty" aria-hidden="true"><Icon name="film" size={28} /></span>}
          <span className="continue-card__fade" aria-hidden="true" />
          <span className="continue-card__play" aria-hidden="true"><Icon name="play" /></span>
          {minutes && <span className="continue-card__len hud" aria-hidden="true">{t('detail.duration', { min: minutes })}</span>}
          {saved && <span className="continue-card__bar" aria-hidden="true" style={{ '--ratio': saved.ratio }} />}
        </span>
        <span className="card__title">{entry.title}</span>
        <span className="card__meta">{line}</span>
      </button>
      <div className="continue-card__actions">
        <button type="button" aria-label={`${t('home.details')}: ${entry.title}`} onClick={() => onOpen(entry.id)}><Icon name="info" /></button>
        <button type="button" className="continue-card__pin" aria-pressed={Boolean(entry.pinnedAt)} aria-label={`${entry.pinnedAt ? t('pin.remove') : t('pin.add')}: ${entry.title}`} onClick={togglePin}><Icon name="star" /></button>
      </div>
    </div>
  )
}
