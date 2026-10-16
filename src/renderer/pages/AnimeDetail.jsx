import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useAniListInfo } from '../anilist/useAniListInfo.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { Poster } from '../components/Poster.jsx'
import { EpisodePicker } from '../components/EpisodePicker.jsx'
import { Icon } from '../components/Icon.jsx'
import { useSeriesEpisodes } from '../episodes/useSeriesEpisodes.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'
import { usePosterTint } from '../theme/usePosterTint.js'
import { STATUSES, nextEpisode } from '../../shared/domain.js'
import { useNow } from '../useNow.js'
import { isSeriesComplete } from '../components/MediaCard.jsx'
import { AiringLine, NewBadge } from '../components/AiringLine.jsx'
import { newEpisodeCount, upcoming, ANILIST_STATUSES } from '../../shared/airing.js'
import { formatTime } from '../../shared/player.js'

export function AnimeDetail({ entry, ready, onBack, onRemoved, onChanged, onContinue }) {
  const api = useApi()
  const t = useT()
  const info = useAniListInfo(entry.title, entry.aniListId, { live: true }) ?? null
  const tint = usePosterTint(info?.poster ?? null)
  const [showDesc, setShowDesc] = useState(false)
  const [comment, setComment] = useState(entry.comment)
  const [noteEp, setNoteEp] = useState(null)
  const [noteText, setNoteText] = useState('')
  const toast = useToast()

  // Patch aniListId/totalEpisodes into the library once per entry id, when its info first arrives.
  const patchedFor = useRef(null)
  useEffect(() => {
    if (!info || patchedFor.current === entry.id) return
    patchedFor.current = entry.id
    const patch = {}
    if (entry.aniListId == null) patch.aniListId = info.id
    if (entry.totalEpisodes == null && info.episodes) patch.totalEpisodes = info.episodes
    if (Object.keys(patch).length) api.library.update(entry.id, patch).then(onChanged)
  }, [api, entry.id, info])

  const save = async (patch) => { await api.library.update(entry.id, patch); onChanged() }
  const watched = entry.watchedEpisodes
  const animeKey = entry.aniCliTitle ?? entry.title
  const { series, update, thumb } = useSeriesEpisodes({ title: animeKey, aniListId: entry.aniListId ?? null })
  const progress = useEpisodeProgress(animeKey)
  const maxEp = Math.max(entry.totalEpisodes ?? 0, ...watched.map(Math.ceil), 1)
  // The real ani-cli list (or 1..max) comes from main; until it answers, 1..max as before.
  const episodes = series?.episodes?.length ? series.episodes.map((e) => e.number) : Array.from({ length: maxEp }, (_, i) => String(i + 1))
  const nextEp = nextEpisode(entry)
  const finished = entry.status === 'completed' || isSeriesComplete(entry) // nextEp wraps to 1 here
  const now = useNow()
  const fresh = newEpisodeCount(entry, info, now)
  const saved = progress[String(nextEp)]
  const totalEps = entry.totalEpisodes ?? info?.episodes ?? null
  const meta = info
    ? [
        info.year,
        totalEps && t('detail.episodesCount', { n: totalEps }),
        info.duration && t('detail.duration', { min: info.duration }),
        ANILIST_STATUSES.includes(info.status) && t(`airing.status.${info.status}`),
      ].filter(Boolean)
    : []

  const openNote = (ep) => { setNoteEp(ep); setNoteText(entry.episodeNotes[String(ep)] ?? '') }
  const saveNote = async () => { await api.library.setEpisodeNote(entry.id, noteEp, noteText); onChanged() }
  // Latest known watched list: follows the entry on refresh, and the last saved list in between (rapid marks accumulate).
  const latestWatched = useRef(watched)
  useEffect(() => { latestWatched.current = watched }, [watched])
  const setWatched = async (next) => {
    const previous = latestWatched.current
    latestWatched.current = next
    try { await save({ watchedEpisodes: next }) } catch (err) { latestWatched.current = previous; throw err }
  }
  const toggleWatched = async (ep) => {
    const marking = !latestWatched.current.includes(ep)
    try {
      await setWatched(marking ? [...latestWatched.current, ep] : latestWatched.current.filter((x) => x !== ep))
    } catch (err) { console.error(err); return }
    // Only the episode number goes in the toast, never a title (spoilers).
    toast.show({
      message: t(marking ? 'toast.markedWatched' : 'toast.unmarkedWatched', { episode: ep }),
      action: {
        label: t('toast.undo'),
        // Undo touches only this episode, relative to the current list.
        onAction: async () => {
          const cur = latestWatched.current
          const next = marking ? cur.filter((x) => x !== ep) : cur.includes(ep) ? cur : [...cur, ep]
          try { await setWatched(next) } catch (err) { console.error(err) }
        },
      },
    })
  }
  const remove = async () => {
    // Capture id/title: the detail unmounts after removal, the toast outlives it.
    const { id, title } = entry
    try { await api.library.remove(id) } catch (err) { console.error(err); return }
    ;(onRemoved ?? onBack)()
    onChanged()
    toast.show({
      focusAction: true,
      message: t('toast.removed', { title }),
      action: {
        label: t('toast.undo'),
        onAction: async () => {
          let ok = false
          try { ok = Boolean((await api.library.restore(id))?.ok) } catch (err) { console.error(err) }
          if (ok) onChanged()
          else toast.show({ message: t('toast.restoreFailed'), icon: 'alert' })
        },
      },
    })
  }
  const togglePin = async () => {
    const r = await api.library.setPinned(entry.id, !entry.pinnedAt)
    if (!r.ok) { toast.show({ message: t('pin.limit'), icon: 'alert' }); return }
    onChanged()
  }

  return (
    <section className="page">
      <div className="row">
        <button type="button" onClick={onBack}>{t('detail.back')}</button>
      </div>
      <div className="banner" style={tint ? { '--poster-tint': tint } : undefined}>
        {info?.poster && <div className="hero__bg" style={{ backgroundImage: `url(${info.poster})` }} />}
        <div className="banner__body">
          <Poster title={entry.title} aniListId={entry.aniListId} />
          <div className="banner__text">
            <h2>{entry.title}</h2>
            {meta.length > 0 && <p className="banner__meta hud">{meta.join(' · ')}</p>}
            {(upcoming(info, now) || fresh > 0) && (
              <div className="banner__airing">
                <AiringLine info={info} now={now} />
                <NewBadge count={fresh} inline />
              </div>
            )}
            {info?.genres?.length > 0 && (
              <ul className="chips" aria-label={t('detail.genres')}>
                {info.genres.map((g) => <li key={g} className="chip">{g}</li>)}
              </ul>
            )}
            <div className="row banner__actions">
              <button type="button" className="primary" disabled={!ready} onClick={() => onContinue({ query: animeKey, anime: animeKey, episode: String(nextEp) })}>
                <Icon name="play" /> {finished ? t('detail.rewatch') : saved ? t('home.continueEpFrom', { episode: nextEp, time: formatTime(saved.position) }) : t('home.continueEp', { episode: nextEp })}
              </button>
              <button type="button" aria-pressed={Boolean(entry.pinnedAt)} onClick={togglePin}><Icon name="star" /> {entry.pinnedAt ? t('pin.remove') : t('pin.add')}</button>
            </div>
          </div>
        </div>
      </div>
      <div className="detail">
        <div className="page">
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
          <EpisodePicker
            key={episodes.length}
            episodes={episodes}
            selected={noteEp != null ? [String(noteEp)] : []}
            watched={watched}
            noted={Object.keys(entry.episodeNotes)}
            onToggle={(ep) => openNote(Number(ep))}
            series={series}
            poster={info?.poster ?? null}
            progress={progress}
            onReveal={(ep) => update({ episode: ep })}
            loadThumb={thumb}
          />
          {series && series.meta !== 'none' && (
            <div className="row spoiler-row">
              {series.meta === 'unreliable' && <span className="muted">{t('episodes.unreliable')}</span>}
              {series.meta === 'ok' && <button type="button" onClick={() => update({ all: true })}>{t('episodes.revealAll')}</button>}
              {series.meta === 'ok' && <button type="button" onClick={() => update({ reset: true })}>{t('episodes.hideAgain')}</button>}
              <label className="check">
                <input type="checkbox" checked={series.meta === 'off'} onChange={(e) => update({ metaOff: e.target.checked })} />
                {t('episodes.metaOff')}
              </label>
            </div>
          )}
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
            <button type="button" onClick={remove}>{t('detail.delete')}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
