import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { ReadyNotice } from '../components/ReadyNotice.jsx'
import { Poster, usePosterInfo } from '../components/Poster.jsx'
import { useSeriesEpisodes } from '../episodes/useSeriesEpisodes.js'
import { useEpisodeProgress } from '../episodes/useEpisodeProgress.js'
import { EpisodePicker } from '../components/EpisodePicker.jsx'
import { Icon } from '../components/Icon.jsx'
import { animeLineTitle, normalizeTitle } from '../../shared/domain.js'

const byNumber = (a, b) => Number(a) - Number(b)

export function SearchPage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled, pendingSearch = null, onPendingSearchHandled = () => {}, onFocusChange = () => {}, embedded = false, onEpisodePicked = () => {}, reopenSearch = null, onReopenHandled = () => {} }) {
  const api = useApi()
  const t = useT()
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('idle') // idle | busy | anime | episode | playing
  const [menu, setMenu] = useState(null)
  const [anime, setAnime] = useState(null)
  const [selected, setSelected] = useState([])
  const [watched, setWatched] = useState([])
  const [reloadTick, setReloadTick] = useState(0) // bumped on reopen so `watched` is read again for the same series
  const [playing, setPlaying] = useState(null)
  const [error, setError] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [remember, setRemember] = useState(false)
  const [notice, setNotice] = useState(null)
  // A lone search result is picked by ani-cli itself; main probes its title and reports null when it cannot.
  const [titleMissing, setTitleMissing] = useState(false)
  const episodeMenu = phase === 'episode' && menu ? menu.lines.map((l) => l.trim()) : null
  const { series, update: updateSpoilers, thumb } = useSeriesEpisodes({ title: episodeMenu ? anime : null, list: episodeMenu })
  const posterInfo = usePosterInfo(episodeMenu ? anime : null)
  const progress = useEpisodeProgress(episodeMenu ? anime : null)

  // When the episode picker appears while focus is lost (the search button that held it is gone), land on its heading.
  const pickerHeading = useRef(null)
  const pickerKey = phase === 'episode' && menu ? menu.requestId : null
  const focusReopened = useRef(false) // set by a reopen: App parked focus on <main>, so the list heading may take it from there
  useEffect(() => {
    if (!pickerKey) return
    const active = document.activeElement
    const lost = !active || active === document.body || (focusReopened.current && active.matches?.('main.content'))
    focusReopened.current = false
    if (lost) pickerHeading.current?.focus()
  }, [pickerKey])

  // The session id and phase are mirrored in a ref so the unmount cleanup sees the latest values.
  const [prefs, setPrefs] = useState({ quality: null, mode: null, hideFiller: false })
  // Until the saved quality / sub-dub are read the selects stay locked, so "Default" is never shown as the saved choice.
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  // ignore: sessions we cancelled on purpose (mode switch, series prefs) — their late events must not touch the new session
  // startedMode: the sub/dub the running session was started with (ani-cli reads it only at start)
  const live = useRef({ sessionId: null, phase: 'idle', ignore: new Set(), lastEpisode: null, startedMode: null, startSeq: 0 })
  useEffect(() => { live.current.phase = phase }, [phase])
  // Stay focused between the anime and episode menus (and during a sub/dub restart) so the home sections do not flash back.
  // A "no dub" error for the chosen series also stays on top, so "Play subtitled" is not pushed below the home sections.
  const errorFocus = phase === 'idle' && error?.error === 'no-dub' && anime != null
  const focused = phase === 'anime' || phase === 'episode' || (phase === 'busy' && anime != null) || errorFocus
  useEffect(() => { onFocusChange(focused) }, [focused])

  useEffect(() => {
    const offs = [
      api.watch.onMenu((m) => {
        if (live.current.ignore.has(m.sessionId)) return
        live.current.sessionId = m.sessionId; setMenu(m); setSelected([]); setPhase(m.kind === 'episode' ? 'episode' : 'anime')
      }),
      api.watch.onPlaying((p) => { setPlaying(p); setPhase('playing') }),
      api.watch.onSessionEnd(({ sessionId, result, retry }) => {
        if (live.current.ignore.delete(sessionId)) return
        // A recovery session is started by main, never by this page; only undo the 'playing' phase its own onPlaying set.
        if (retry && live.current.phase !== 'playing') return
        live.current.sessionId = null
        focusReopened.current = false // a reopen that ended without a list must not move focus later
        setMenu(null)
        setPlaying(null)
        setPhase('idle')
        if (!result.ok && result.error !== 'cancelled' && !retry) setError(result)
      }),
      api.watch.onTitle(async ({ sessionId, title }) => {
        if (sessionId !== live.current.sessionId) return
        if (!title) { setTitleMissing(true); return }
        setAnime((a) => a ?? title)
        if (live.current.phase !== 'episode') return
        // Same as picking it in the anime menu: saved prefs of this series need a fresh start.
        const p = await api.seriesPrefs.get(title).catch(() => null)
        if ((p?.quality || p?.mode) && live.current.sessionId === sessionId && live.current.phase === 'episode') restartFor(title)
      }),
    ]
    return () => {
      offs.forEach((off) => off())
      // Leaving the page while ani-cli waits on a menu would leave it hanging forever; playback keeps going.
      const { sessionId, phase: last } = live.current
      if (sessionId && last !== 'idle' && last !== 'playing') api.watch.cancel(sessionId)
    }
  }, [api])

  useEffect(() => {
    if (!anime) return
    let stale = false
    setPrefsLoaded(false)
    api.seriesPrefs.get(anime).then((p) => { if (!stale) { setPrefs(p); setPrefsLoaded(true) } }).catch((e) => { console.error('seriesPrefs.get failed', e); if (!stale) setPrefsLoaded(true) })
    api.library.list().then((list) => {
      const key = normalizeTitle(anime).toLowerCase()
      const e = list.find((x) => normalizeTitle(x.aniCliTitle ?? x.title).toLowerCase() === key)
      setWatched(e?.watchedEpisodes ?? [])
    })
    return () => { stale = true }
  }, [api, anime, reloadTick])

  const start = (params) => {
    live.current.lastParams = params
    live.current.lastEpisode = params.episode ?? null
    live.current.startedMode = null
    // Until the new session answers, nothing from the previous one (e.g. a late probed title) may land here.
    live.current.sessionId = null
    const seq = ++live.current.startSeq
    setError(null)
    setShowDetails(false)
    setNotice(null)
    setTitleMissing(false)
    setPhase('busy')
    api.watch.start(params)
      .then((r) => {
        if (seq !== live.current.startSeq) return
        if (r?.sessionId) live.current.sessionId = r.sessionId
        live.current.startedMode = r?.mode ?? null
      })
      .catch(() => { setPhase('idle'); setError({ error: 'unknown' }) })
  }
  const retrySame = () => start({ ...live.current.lastParams, ...(anime ? { query: anime, anime } : {}), ...(live.current.lastEpisode != null ? { episode: live.current.lastEpisode } : {}) })
  // Cancel the running session on purpose and start a fresh one for this series (prefs are read only at start).
  const restartFor = (title) => {
    const old = live.current.sessionId
    if (old) { live.current.ignore.add(old); api.watch.cancel(old) }
    live.current.sessionId = null
    setMenu(null)
    setAnime(title)
    start({ query: title, anime: title })
  }

  useEffect(() => {
    if (pendingWatch && ready) {
      if (reopenSearch) onReopenHandled() // a newer request wins; the pending reopen is dropped
      setAnime(pendingWatch.anime)
      // The previous episode's session is still winding down; its late sessionEnd must not reset this one.
      if (live.current.sessionId) live.current.ignore.add(live.current.sessionId)
      start(pendingWatch)
      onPendingHandled()
    }
  }, [pendingWatch, ready])

  // "Back" from a player that was started in the episode list: that list was a live session's menu and it is gone, so start it again.
  useEffect(() => {
    if (reopenSearch && ready) {
      if (live.current.sessionId) live.current.ignore.add(live.current.sessionId)
      setAnime(reopenSearch.series)
      setReloadTick((n) => n + 1)
      focusReopened.current = true
      setMenu(null)
      start({ query: reopenSearch.series, anime: reopenSearch.series })
      onReopenHandled()
    }
  }, [reopenSearch, ready])

  const search = (text) => {
    if (reopenSearch) onReopenHandled()
    setAnime(null)
    start({ query: text.trim() })
  }
  // A search request from outside (e.g. a Home card): fill the input and run the same path as Enter.
  useEffect(() => {
    if (pendingSearch && ready) {
      if (reopenSearch) onReopenHandled()
      setQuery(pendingSearch.query)
      if (pendingSearch.query.trim()) search(pendingSearch.query)
      onPendingSearchHandled()
    }
  }, [pendingSearch, ready])

  const submit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    search(query)
  }
  const answer = (line) => {
    api.watch.answerMenu(menu.requestId, line)
    setMenu(null)
    setPhase(line == null ? 'idle' : 'busy')
  }
  const pickAnime = async (line) => {
    const title = animeLineTitle(line)
    const requestId = menu.requestId
    setAnime(title)
    setMenu(null)
    setPhase('busy')
    // The session was started with prefs resolved for the search text; saved prefs of the picked series need a fresh start.
    const p = await api.seriesPrefs.get(title).catch(() => null)
    if (p?.quality || p?.mode) restartFor(title)
    else api.watch.answerMenu(requestId, line)
  }
  const toggle = (ep) => setSelected((s) => (s.includes(ep) ? s.filter((x) => x !== ep) : [...s, ep]))
  const watchSelected = () => { const ep = [...selected].sort(byNumber)[0]; if (ep) { live.current.lastEpisode = ep; answer(ep); if (anime) onEpisodePicked(anime) } }

  const changePrefs = async (patch) => {
    const started = live.current.startedMode ?? prefs.mode ?? settings.mode
    let next
    try { next = await api.seriesPrefs.set(anime, patch) } catch (e) { console.error('seriesPrefs.set failed', e); return }
    setPrefs(next)
    if ('mode' in patch && (next.mode ?? settings.mode) !== started && live.current.phase === 'episode') restartFor(anime)
  }
  const playSubtitled = () => start({ query: anime, anime, episode: live.current.lastEpisode, mode: 'sub' })

  const downloadSelected = async () => {
    let dir = settings.downloadDir
    if (!dir) {
      dir = await api.dialog.pickFolder()
      if (!dir) return
      if (remember) await onSettings({ downloadDir: dir })
    }
    const episodes = [...selected].sort(byNumber)
    await api.downloads.enqueue({ title: anime, aniCliTitle: anime, episodes, dir })
    answer(null)
    setNotice(t('search.queued', { count: episodes.length }))
  }

  const addToWatchlist = async () => {
    const list = await api.library.list()
    const key = normalizeTitle(anime).toLowerCase()
    if (list.some((x) => normalizeTitle(x.aniCliTitle ?? x.title).toLowerCase() === key)) {
      setNotice(t('search.alreadyInList'))
      return
    }
    await api.library.add({ title: anime, aniCliTitle: anime })
    setNotice(t('search.added'))
  }

  return (
    <section className="page">
      {embedded ? (
        <div className="rail__head"><h3 className="hud">{t('nav.search')}</h3></div>
      ) : (
        <header className="page__head">
          <h2 className="hud">{t('nav.search')}</h2>
          <p className="page__sub muted">{t('search.subtitle')}</p>
        </header>
      )}
      <ReadyNotice ready={ready} onOpenWizard={onOpenWizard} />
      {(!focused || errorFocus) && (
        <form className="search-bar" onSubmit={submit}>
          <input id="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
          <button type="submit" className="primary" disabled={!ready || phase !== 'idle'}>{t('search.button')}</button>
        </form>
      )}

      {notice && <div className="notice">{notice}</div>}
      {error && (
        <div className="notice notice--error" role="alert">
          <span>{t(`error.${error.error ?? 'unknown'}`)}</span>
          {error.stderr && <button type="button" onClick={() => setShowDetails((v) => !v)}>{t('error.showDetails')}</button>}
          {error.error === 'no-dub' && anime && <button type="button" className="primary" onClick={playSubtitled}>{t('search.playSub')}</button>}
          {error.error === 'no-sources' && live.current.lastParams && <button type="button" className="primary" onClick={retrySame}>{t('search.retry')}</button>}
          {showDetails && <pre className="details">{error.stderr}</pre>}
        </div>
      )}
      {phase === 'busy' && <p className="muted">{t('search.searching')}</p>}
      {phase === 'playing' && playing && <p>{t('search.playing', { title: playing.title, episode: playing.episode })}</p>}

      {phase === 'anime' && menu && (
        <div className="page">
          <div className="row"><button type="button" onClick={() => answer(null)}><Icon name="back" /> {t('search.back')}</button></div>
          <h3>{t('search.selectAnime')}</h3>
          <div className="card-grid">
            {menu.lines.map((line) => {
              const title = animeLineTitle(line)
              return (
                <button type="button" key={line} className="card" onClick={() => pickAnime(line)}>
                  <Poster title={title} />
                  <span className="card__title">{title}</span>
                </button>
              )
            })}
          </div>
          <div className="row"><button type="button" onClick={() => answer(null)}>{t('search.cancel')}</button></div>
        </div>
      )}

      {phase === 'episode' && menu && (
        <div className="page">
          <div className="row"><button type="button" onClick={() => answer(null)}><Icon name="back" /> {t('search.back')}</button></div>
          <h3 ref={pickerHeading} tabIndex={-1}>{anime ?? (titleMissing ? t('search.titleUnknown', { query: live.current.lastParams?.query ?? '' }) : t('search.titlePending'))} — {t('search.selectEpisode')}</h3>
          <EpisodePicker episodes={episodeMenu} selected={selected} watched={watched} onToggle={toggle} prefs={prefs} prefsLoading={anime != null && !prefsLoaded} onPrefs={anime ? changePrefs : null} groupKey={anime ? normalizeTitle(anime).toLowerCase() : null}
            series={series} poster={posterInfo?.poster ?? null} onReveal={(ep) => updateSpoilers({ episode: ep })} loadThumb={thumb} progress={progress}
            hideMarked={Boolean(prefs.hideFiller)} onHideMarked={anime ? (v) => changePrefs({ hideFiller: v }) : null}>
            <button type="button" className="primary" disabled={!ready || selected.length === 0} onClick={watchSelected}>{t('search.watch')}</button>
            <button type="button" disabled={!ready || selected.length === 0 || !anime} onClick={downloadSelected}>{t('search.download')}</button>
            {!settings.downloadDir && (
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t('downloads.rememberFolder')}
              </label>
            )}
            <button type="button" disabled={!anime} onClick={addToWatchlist}>{t('search.addToWatchlist')}</button>
            <button type="button" onClick={() => answer(null)}>{t('search.cancel')}</button>
          </EpisodePicker>
        </div>
      )}
    </section>
  )
}
