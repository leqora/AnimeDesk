import { useT } from '../i18n/I18nContext.jsx'
import { PosterFrame, usePosterInfo } from '../components/Poster.jsx'

function Row({ item, onOpen }) {
  const t = useT()
  const info = usePosterInfo(item.title, item.aniListId ?? null)
  return (
    <li>
      <button type="button" className="top-row" onClick={() => onOpen?.(item.animeId)}>
        <span className="top-row__poster" aria-hidden="true"><PosterFrame info={info} /></span>
        <span className="top-row__title">{item.title}</span>
        <span className="top-row__count hud muted">{t.n('profile.topEpisodes', item.episodes)}</span>
      </button>
    </li>
  )
}

export function TopThisMonth({ items, onOpenAnime }) {
  const t = useT()
  return (
    <div className="profile-section">
      <h3>{t('profile.topMonth')}</h3>
      {items.length === 0 ? <p className="muted">{t('profile.topMonthEmpty')}</p> : (
        <ul className="top-list">
          {items.map((it) => <Row key={it.animeId} item={it} onOpen={onOpenAnime} />)}
        </ul>
      )}
    </div>
  )
}
