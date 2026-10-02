import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from '../components/Poster.jsx'
import { ConfirmButton } from '../components/ConfirmButton.jsx'
import { usePosterTint } from '../theme/usePosterTint.js'
import { STATUSES, nextEpisode } from '../../shared/domain.js'

export function AnimeDetail({ entry, ready, onBack, onChanged, onContinue }) {
  const api = useApi()
  const t = useT()
  const [info, setInfo] = useState(null)
  const tint = usePosterTint(info?.poster ?? null)
  const [showDesc, setShowDesc] = useState(false)
  const [comment, setComment] = useState(entry.comment)
  const [noteEp, setNoteEp] = useState(null)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    let live = true
    api.anilist.forTitle(entry.title, entry.aniListId).then((i) => {
      if (!live || !i) return
      setInfo(i)
      const patch = {}
      if (entry.aniListId == null) patch.aniListId = i.id
      if (entry.totalEpisodes == null && i.episodes) patch.totalEpisodes = i.episodes
      if (Object.keys(patch).length) api.library.update(entry.id, patch).then(onChanged)
    }).catch(() => {})
    return () => { live = false }
  }, [api, entry.id])

  const save = async (patch) => { await api.library.update(entry.id, patch); onChanged() }
  const watched = entry.watchedEpisodes
  const maxEp = Math.max(entry.totalEpisodes ?? 0, ...watched.map(Math.ceil), 1)
  const episodes = Array.from({ length: maxEp }, (_, i) => i + 1)
  const nextEp = nextEpisode(entry)

  const openNote = (ep) => { setNoteEp(ep); setNoteText(entry.episodeNotes[String(ep)] ?? '') }
  const saveNote = async () => { await api.library.setEpisodeNote(entry.id, noteEp, noteText); onChanged() }
  const toggleWatched = (ep) => save({ watchedEpisodes: watched.includes(ep) ? watched.filter((x) => x !== ep) : [...watched, ep] })
  const remove = async () => { await api.library.remove(entry.id); onBack(); onChanged() }
  const animeKey = entry.aniCliTitle ?? entry.title

  return (
    <section className="page">
      <div className="row"><button type="button" onClick={onBack}>{t('detail.back')}</button></div>
      <div className="banner" style={tint ? { '--poster-tint': tint } : undefined}>
        {info?.poster && <div className="hero__bg" style={{ backgroundImage: `url(${info.poster})` }} />}
        <div className="banner__body">
          <Poster title={entry.title} aniListId={entry.aniListId} />
          <h2>{entry.title}</h2>
        </div>
      </div>
      <div className="detail">
        <div className="page">
          {info && (
            <p className="muted">
              {t('detail.genres')}: {info.genres.map((g) => <span key={g}>{g} </span>)}
              {info.year && <> · {t('detail.year')}: {info.year}</>}
            </p>
          )}
          <p>{t('detail.progress', { watched: watched.length, total: entry.totalEpisodes ?? '?' })}</p>
          <div className="row">
            <label className="field">
              <span>{t('detail.status')}</span>
              <select aria-label={t('detail.status')} value={entry.status} onChange={(e) => save({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('detail.rating')}</span>
              <select aria-label={t('detail.rating')} value={entry.rating ?? ''} onChange={(e) => save({ rating: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('detail.noRating')}</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>{t('detail.comment')}</span>
            <textarea aria-label={t('detail.comment')} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => { if (comment !== entry.comment) save({ comment }) }} />
          </label>
          {info?.description && (
            <div>
              <button type="button" onClick={() => setShowDesc((v) => !v)}>{showDesc ? t('detail.hideDescription') : t('detail.showDescription')}</button>
              {showDesc && <p className="description">{info.description}</p>}
            </div>
          )}
          <h3>{t('detail.episodes')}</h3>
          <div className="ep-grid">
            {episodes.map((ep) => {
              const cls = ['ep', watched.includes(ep) && 'ep--watched', noteEp === ep && 'ep--selected', entry.episodeNotes[String(ep)] && 'ep--note'].filter(Boolean).join(' ')
              return <button type="button" key={ep} className={cls} onClick={() => openNote(ep)}>{ep}</button>
            })}
          </div>
          {noteEp != null && (
            <div className="page">
              <label className="field">
                <span>{t('detail.note', { episode: noteEp })}</span>
                <textarea aria-label={t('detail.note', { episode: noteEp })} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              </label>
              <div className="row">
                <button type="button" className="primary" onClick={saveNote}>{t('detail.save')}</button>
                <button type="button" onClick={() => toggleWatched(noteEp)}>
                  {watched.includes(noteEp) ? t('detail.unmarkWatched') : t('detail.markWatched')}
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <button type="button" className="primary" disabled={!ready} onClick={() => onContinue({ query: animeKey, anime: animeKey, episode: String(nextEp) })}>
              {t('detail.continue')}
            </button>
            <ConfirmButton label={t('detail.delete')} confirmLabel={t('detail.confirmDelete')} onConfirm={remove} />
          </div>
        </div>
      </div>
    </section>
  )
}
