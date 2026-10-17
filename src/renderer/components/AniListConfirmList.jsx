import { useT } from '../i18n/I18nContext.jsx'
import { useAniListInfo } from '../anilist/useAniListInfo.js'
import { PosterFrame } from './Poster.jsx'

// One pending entry: library title on the left, what AniList says on the right (poster, title, year, episodes; no description).
function Row({ entry, error, onConfirm, onPick }) {
  const t = useT()
  const info = useAniListInfo(entry.title, entry.aniListId)
  const meta = [info?.year, info?.episodes != null ? t('detail.episodesCount', { n: info.episodes }) : null].filter((x) => x != null).join(' · ')
  return (
    <li className="anilist-confirm__row">
      <div className="anilist-confirm__poster"><PosterFrame info={info} /></div>
      <div className="anilist-confirm__text">
        <span className="anilist-confirm__library">{entry.title}</span>
        {info && (
          <span className="anilist-confirm__match muted">
            <span aria-hidden="true">↔ </span>{info.title}{meta && <> · {meta}</>}
          </span>
        )}
        {error && <span className="anilist-confirm__error" role="alert">{error}</span>}
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={() => onConfirm(entry)}>{t('anilist.confirmYes')}</button>
        <button type="button" onClick={() => onPick(entry)}>{t('anilist.confirmNo')}</button>
      </div>
    </li>
  )
}

export function AniListConfirmList({ entries, errors = {}, onConfirm, onPick }) {
  const t = useT()
  return (
    <ul className="anilist-confirm" aria-label={t('anilist.confirmList')}>
      {entries.map((e) => <Row key={e.id} entry={e} error={errors[e.id]} onConfirm={onConfirm} onPick={onPick} />)}
    </ul>
  )
}
