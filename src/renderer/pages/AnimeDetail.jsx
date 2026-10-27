import { useEffect, useId, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useAniListInfo } from '../anilist/useAniListInfo.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { Tabs } from '../components/Tabs.jsx'
import { useRouteState } from '../nav/useNavigation.js'
import { DetailHero } from '../detail/DetailHero.jsx'
import { EpisodePicker } from '../components/EpisodePicker.jsx'
import { AniListMatch } from '../components/AniListMatch.jsx'
import { RecommendationCard } from '../components/RecommendationCard.jsx'
import { useSeriesEpisodes } from '../episodes/useSeriesEpisodes.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'
import { nextEpisode } from '../../shared/domain.js'
import { useNow } from '../useNow.js'
import { isSeriesComplete } from '../components/MediaCard.jsx'
import { newEpisodeCount } from '../../shared/airing.js'

export function AnimeDetail({ entry, ready, onBack, onRemoved, onChanged, onContinue, onSearch = () => {}, playerOpen = false }) {
  const api = useApi()
  const t = useT()
  const rawInfo = useAniListInfo(entry.title, entry.aniListId, { live: true }) // undefined = loading, null = not found
  const info = rawInfo ?? null
  // A fuzzy (close) title match is shown as poster/title/year/genres only; nothing else is taken from it.
  const closeMatch = info?.match === 'close'
  // "Similar": the linked id, else an exact title match; a close match never counts.
  const similarId = entry.aniListId ?? (info?.match === 'exact' ? info.id : null)
  const [similar, setSimilar] = useState([])
  const similarHeadId = useId()
  useEffect(() => {
    setSimilar([])
    if (similarId == null) return undefined
    let alive = true
    api.recommendations.forSeries(similarId)
      .then((r) => { if (alive && Array.isArray(r?.items)) setSimilar(r.items) })
      .catch(() => {})
    return () => { alive = false }
  }, [api, similarId])
  const matchRef = useRef(null)
  const [comment, setComment] = useState(entry.comment)
  const [noteEp, setNoteEp] = useState(null)
  const [noteText, setNoteText] = useState('')
  const toast = useToast()
  // Auto-download switch: needs a series identity (aniCliTitle + aniListId) and a download folder.
  const canAuto = Boolean(entry.aniCliTitle && entry.aniListId != null)
  const [auto, setAuto] = useState(false)
  const [hideFiller, setHideFiller] = useState(false)
  const [downloadDir, setDownloadDir] = useState(undefined)
  useEffect(() => {
    if (!entry.aniCliTitle) return undefined
    let live = true
    api.seriesPrefs.get(entry.aniCliTitle).then((p) => { if (live) { setAuto(Boolean(p?.autoDownload)); setHideFiller(Boolean(p?.hideFiller)) } }).catch((err) => console.error(err))
    return () => { live = false }
  }, [api, entry.aniCliTitle])
  useEffect(() => {
    if (!canAuto) return undefined
    let live = true
    // A failed read must not lock the switch: main validates the folder again on set().
    api.settings.get().then((s) => { if (live) setDownloadDir(s?.downloadDir ?? null) }).catch((err) => { console.error(err); if (live) setDownloadDir('') })
    return () => { live = false }
  }, [api, canAuto, entry.aniCliTitle])
  const toggleAuto = async (enabled) => {
    let r = null
    try { r = await api.autoDownload.set(entry.id, enabled) } catch (err) { console.error(err) }
    if (!mounted.current) return
    if (r?.ok) setAuto(r.enabled)
    else toast.show({ message: t('detail.autoDownloadFailed') })
  }

  const changeHideFiller = entry.aniCliTitle ? async (hide) => {
    setHideFiller(hide)
    try {
      const next = await api.seriesPrefs.set(entry.aniCliTitle, { hideFiller: hide })
      if (mounted.current) setHideFiller(Boolean(next?.hideFiller))
    } catch (err) { console.error(err); if (mounted.current) setHideFiller(!hide) }
  } : null

  // Patch aniListId/totalEpisodes into the library once per entry id, when its info first arrives.
  const patchedFor = useRef(null)
  useEffect(() => {
    if (!info || patchedFor.current === entry.id) return
    // Without a linked id only an exact title match may link one; a skipped info leaves the patch for a later exact one.
    if (entry.aniListId == null && info.match !== 'exact') return
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
  // The episode-info switch lives in the "more" menu; it needs something to switch (same condition as the old row).
  const metaToggle = series && (series.meta !== 'none' || series.marks === 'ok')
    ? { off: series.meta === 'off', onChange: (off) => update({ metaOff: off }) }
    : null
  const pickAniList = () => { pickPending.current = true; setTab('notes'); setPickReq((n) => n + 1) }

  const openNote = (ep) => { setNoteEp(ep); setNoteText(entry.episodeNotes[String(ep)] ?? '') }
  const saveNote = async () => { await api.library.setEpisodeNote(entry.id, noteEp, noteText); onChanged() }
  // Latest known watched list: follows the entry on refresh, and the last saved list in between (rapid marks accumulate).
  const latestWatched = useRef(watched)
  useEffect(() => { latestWatched.current = watched }, [watched])
  // The toast outlives the detail: its undo must know whether the detail is still mounted.
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const setWatched = async (next) => {
    const previous = latestWatched.current
    latestWatched.current = next
    try { await save({ watchedEpisodes: next }) } catch (err) {
      // Only roll back if no newer mark has replaced this one meanwhile.
      if (latestWatched.current === next) latestWatched.current = previous
      throw err
    }
  }
  const toggleWatched = async (ep) => {
    const id = entry.id
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
          const undoIn = (cur) => marking ? cur.filter((x) => x !== ep) : cur.includes(ep) ? cur : [...cur, ep]
          if (mounted.current) {
            try { await setWatched(undoIn(latestWatched.current)) } catch (err) { console.error(err) }
            return
          }
          // The detail is gone: its list is stale, so read the library's current entry.
          try {
            const fresh = (await api.library.list()).find((e) => e.id === id)
            if (!fresh) return
            await api.library.update(id, { watchedEpisodes: undoIn(fresh.watchedEpisodes) })
            onChanged()
          } catch (err) { console.error(err) }
        },
      },
    })
  }
  const remove = async () => {
    // Capture id/title: the detail unmounts after removal, the toast outlives it.
    const { id, title } = entry
    try { await api.library.remove(id) } catch (err) { console.error(err); return false }
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

  // Detail tabs: the remembered one (per history entry) wins only while it exists; "similar" needs items.
  const [tabChoice, setTab] = useRouteState('tab', 'episodes')
  const shownTab = tabChoice === 'notes' || (tabChoice === 'similar' && similar.length > 0) ? tabChoice : 'episodes'
  // "Choose series" (hero menu): open the notes tab, then focus the AniList card once it is shown.
  const [pickReq, setPickReq] = useState(0)
  const pickPending = useRef(false)
  useEffect(() => {
    if (!pickPending.current || shownTab !== 'notes') return
    pickPending.current = false
    const root = matchRef.current
    ;(root?.querySelector('button') ?? root?.querySelector('.anilist-match') ?? root)?.focus()
  }, [pickReq, shownTab])
  const episodesPanel = (
    <div className="page">
          <p>{t('detail.progress', { watched: watched.length, total: entry.totalEpisodes ?? '?' })}</p>
          {canAuto && (
            <div className="check-group">
              <label className="check">
                <input
                  type="checkbox" checked={auto} disabled={downloadDir == null && !auto}
                  aria-describedby="auto-download-hint" onChange={(e) => toggleAuto(e.target.checked)}
                />
                {t('detail.autoDownload')}
              </label>
              <p id="auto-download-hint" className="check-hint muted">
                {downloadDir === null ? t('detail.autoDownloadNoDir') : auto && `${t('detail.autoDownloadOn')}${entry.status === 'watching' ? '' : ` ${t('detail.autoDownloadNotWatching')}`}`}
              </p>
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
            hideMarked={hideFiller}
            onHideMarked={changeHideFiller}
          />
          {series && (series.meta === 'unreliable' || series.meta === 'ok') && (
            <div className="row spoiler-row">
              {series.meta === 'unreliable' && <span className="muted">{t('episodes.unreliable')}</span>}
              {series.meta === 'ok' && <button type="button" onClick={() => update({ all: true })}>{t('episodes.revealAll')}</button>}
              {series.meta === 'ok' && <button type="button" onClick={() => update({ reset: true })}>{t('episodes.hideAgain')}</button>}
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
    </div>
  )
  const notesPanel = (
    <div className="page">
          <div className="row">
            <label className="field">
              <span>{t('detail.rating')}</span>
              <select aria-label={t('detail.rating')} value={entry.rating ?? ''} onChange={(e) => save({ rating: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('detail.noRating')}</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div ref={matchRef} data-anilist-match tabIndex={-1}><AniListMatch entry={entry} info={rawInfo} onChanged={onChanged} /></div>
          <label className="field">
            <span>{t('detail.comment')}</span>
            <textarea aria-label={t('detail.comment')} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => { if (comment !== entry.comment) save({ comment }) }} />
          </label>
    </div>
  )
  const similarPanel = (
<section className="similar" aria-labelledby={similarHeadId}>
  <h3 id={similarHeadId}>{t('recommendations.similar')}</h3>
  <div className="similar__grid">
    {similar.map((s) => <RecommendationCard key={s.id} item={s} ready={ready} onSearch={onSearch} />)}
  </div>
</section>
  )

  return (
    <section className="page">
      <DetailHero
        entry={entry} info={info} ready={ready} nextEp={nextEp} saved={saved} finished={finished} fresh={fresh} now={now}
        metaToggle={metaToggle} playerOpen={playerOpen}
        onBack={onBack}
        onContinue={() => onContinue({ query: animeKey, anime: animeKey, episode: String(nextEp) })}
        onTogglePin={togglePin}
        onStatus={(status) => save({ status })}
        onRemove={remove}
        onPickAniList={pickAniList}
      />
      <div className="detail">
        <Tabs label={t('detail.tabs')} value={shownTab} onChange={setTab} tabs={[
          { id: 'episodes', label: t('detail.tabEpisodes'), content: episodesPanel },
          ...(similar.length > 0 ? [{ id: 'similar', label: t('detail.tabSimilar'), content: similarPanel }] : []),
          { id: 'notes', label: t('detail.tabNotes'), content: notesPanel },
        ]} />
      </div>
    </section>
  )
}
