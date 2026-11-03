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

export function SearchPage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled, pendingSearch = null, onPendingSearchHandled = () => {}, onFocusChange = () => {}, embedded = false, onEpisodePicked = () => {}, reopenSearch = null, onReopenHandled = () => {}, resetSeq = 0 }) {
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
  const liveMenu = phase === 'episode' && menu ? menu.lines.map((l) => l.trim()) : null
  // The last episode list of a series, kept so "Back" can show it (read-only) while the reopened live menu loads.
  const [cachedList, setCachedList] = useState(null) // { anime, lines }
  const [reopening, setReopening] = useState(false)
  const cachedView = reopening && phase === 'busy' && cachedList && anime != null && normalizeTitle(cachedList.anime).toLowerCase() === normalizeTitle(anime).toLowerCase() ? cachedList : null
  const episodeMenu = liveMenu ?? cachedView?.lines ?? null
  useEffect(() => { if (liveMenu && anime) setCachedList({ anime, lines: liveMenu }) }, [menu?.requestId, anime, phase])
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

  // The session ids and phase are mirrored in a ref so the unmount cleanup sees the latest values.
  // listSession: the session this page started and whose menu it shows; playingSession: the one whose episode is playing (it may
  // outlive the list, so a new search can run while it plays). A recovery session started by main only ever becomes playingSession.
  const [prefs, setPrefs] = useState({ quality: null, mode: null, hideFiller: false })
  // Until the saved quality / sub-dub are read the selects stay locked, so "Default" is never shown as the saved choice.
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  // ignore: sessions we cancelled on purpose (mode switch, series prefs) — their late events must not touch the new session
  // startedMode: the sub/dub the running session was started with (ani-cli reads it only at start)
  const live = useRef({ listSession: null, playingSession: null, phase: 'idle', ignore: new Set(), lastEpisode: null, startedMode: null, startSeq: 0, abandoned: new Set(), pendingStart: null, earlyEnds: new Map(), resetCount: 0, pendingPlay: false })
  useEffect(() => { live.current.phase = phase }, [phase])
  // Stay focused between the anime and episode menus (and during a sub/dub restart) so the home sections do not flash back.
  // A "no dub" error for the chosen series also stays on top, so "Play subtitled" is not pushed below the home sections.
  const errorFocus = phase === 'idle' && error?.error === 'no-dub' && anime != null
  const focused = phase === 'anime' || phase === 'episode' || (phase === 'busy' && anime != null) || errorFocus
  useEffect(() => { onFocusChange(focused) }, [focused])

  useEffect(() => {
    const offs = [
      api.watch.onMenu((m) => {
        const l = live.current
        if (l.ignore.has(m.sessionId) || m.sessionId === l.playingSession) return
        // Only our own list session, or the answer to a live start that has not replied yet, may show a menu.
        const startLive = l.pendingStart != null && !l.abandoned.has(l.pendingStart)
        if (m.sessionId !== l.listSession && !(l.phase === 'busy' && startLive)) return
        l.listSession = m.sessionId; setReopening(false); setMenu(m); setSelected([]); setPhase(m.kind === 'episode' ? 'episode' : 'anime')
      }),
      api.watch.onPlaying((p) => {
        const l = live.current
        const sid = p.sessionId ?? l.listSession
        l.playingSession = sid
        setPlaying(p)
        if (sid === l.listSession) {
          // The list session turned into the playing one: the list is done.
          l.listSession = null
          setMenu(null)
          setPhase('playing')
        } else if (l.phase !== 'busy' && l.phase !== 'anime' && l.phase !== 'episode') {
          setPhase('playing') // another session (e.g. a recovery) plays; a list the user opened meanwhile stays untouched
        }
      }),
      api.watch.onSessionEnd(({ sessionId, result, retry }) => {
        const l = live.current
        if (l.ignore.delete(sessionId)) return
        const failed = !result.ok && result.error !== 'cancelled' && !retry
        // The playing episode ended: only its own state goes; a list opened meanwhile stays.
        if (sessionId === l.playingSession || (retry && l.playingSession == null && l.phase === 'playing')) {
          l.playingSession = null
          setPlaying(null)
          if (l.phase === 'playing') {
            setPhase('idle')
            if (failed) setError(result)
          }
          return
        }
        // A recovery session is started by main, never by this page.
        if (retry) return
        // Some other session while our list is live or our start has not replied: not ours to end — but keep the
        // end of a start that fails so fast it ends before its reply, and settle it when the reply names the session.
        if (l.listSession && l.listSession !== sessionId) return
        if (!l.listSession && l.pendingStart != null) {
          if (!l.abandoned.has(l.pendingStart)) l.earlyEnds.set(sessionId, { result, failed })
          return
        }
        l.listSession = null
        setReopening(false)
        focusReopened.current = false // a reopen that ended without a list must not move focus later
        setMenu(null)
        setPhase(l.playingSession ? 'playing' : 'idle')
        if (failed) setError(result)
      }),
      api.watch.onTitle(async ({ sessionId, title }) => {
        if (sessionId !== live.current.listSession) return
        if (!title) { setTitleMissing(true); return }
        setAnime((a) => a ?? title)
        if (live.current.phase !== 'episode') return
        // Same as picking it in the anime menu: saved prefs of this series need a fresh start.
        const p = await api.seriesPrefs.get(title).catch(() => null)
        if ((p?.quality || p?.mode) && live.current.listSession === sessionId && live.current.phase === 'episode') restartFor(title)
      }),
    ]
    return () => {
      offs.forEach((off) => off())
      // Leaving the page while ani-cli waits on a menu would leave it hanging forever; playback keeps going.
      const { listSession, phase: last } = live.current
      if (listSession && last !== 'idle' && last !== 'playing') api.watch.cancel(listSession)
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
    live.current.listSession = null
    const seq = ++live.current.startSeq
    live.current.pendingPlay = params.episode != null // a play start (e.g. Continue) survives a Home reset
    live.current.pendingStart = seq
    live.current.earlyEnds.clear()
    setError(null)
    setShowDetails(false)
    setNotice(null)
    setTitleMissing(false)
    setReopening(false) // only the reopen effect turns this on again, after its start()
    setPhase('busy')
    api.watch.start(params)
      .then((r) => {
        const l = live.current
        if (l.abandoned.delete(seq)) {
          if (l.pendingStart === seq) l.pendingStart = null
          if (r?.sessionId) { l.ignore.add(r.sessionId); api.watch.cancel(r.sessionId) }
          return
        }
        if (seq !== l.startSeq) {
          // Superseded by a newer start: its session would wait on a menu nobody shows (a superseded play start is cancelled on purpose too: the newer request wins).
          if (r?.sessionId && r.sessionId !== l.playingSession) { l.ignore.add(r.sessionId); api.watch.cancel(r.sessionId) }
          return
        }
        l.pendingStart = null
        const sid = r?.sessionId
        l.startedMode = r?.mode ?? null
        if (!sid) return
        if (sid === l.playingSession) {
          // The reply names a session that already reported playing (an adopted prefetch): nothing to list.
          if (l.phase === 'busy') setPhase('playing')
          return
        }
        l.listSession = sid
        const early = l.earlyEnds.get(sid)
        l.earlyEnds.clear()
        if (early) {
          l.listSession = null
          setReopening(false)
          setMenu(null)
          setPhase(l.playingSession ? 'playing' : 'idle')
          if (early.failed) setError(early.result)
        }
      })
      .catch(() => {
        const l = live.current
        if (l.abandoned.delete(seq)) {
          if (l.pendingStart === seq) l.pendingStart = null
          return
        }
        if (seq !== l.startSeq) return
        l.pendingStart = null
        setReopening(false); setPhase('idle'); setError({ error: 'unknown' })
      })
  }
  const retrySame = () => start({ ...live.current.lastParams, ...(anime ? { query: anime, anime } : {}), ...(live.current.lastEpisode != null ? { episode: live.current.lastEpisode } : {}) })
  // Cancel the running session on purpose and start a fresh one for this series (prefs are read only at start).
  const restartFor = (title) => {
    const old = live.current.listSession
    if (old) { live.current.ignore.add(old); api.watch.cancel(old) }
    live.current.listSession = null
    setMenu(null)
    setAnime(title)
    start({ query: title, anime: title })
  }

  useEffect(() => {
    if (pendingWatch && ready) {
      if (reopenSearch) onReopenHandled() // a newer request wins; the pending reopen is dropped
      setAnime(pendingWatch.anime)
      // The previous episode's session is still winding down; its late sessionEnd must not reset this one.
      if (live.current.listSession) live.current.ignore.add(live.current.listSession)
      start(pendingWatch)
      onPendingHandled()
    }
  }, [pendingWatch, ready])

  // "Back" from a player that was started in the episode list: that list was a live session's menu and it is gone, so start it again.
  useEffect(() => {
    if (!reopenSearch || !ready) return
    if (pendingWatch || pendingSearch) { onReopenHandled(); return } // a newer request wins
    if (live.current.listSession) live.current.ignore.add(live.current.listSession)
    setAnime(reopenSearch.series)
    setReloadTick((n) => n + 1)
    focusReopened.current = true
    setMenu(null)
    start({ query: reopenSearch.series, anime: reopenSearch.series })
    setReopening(true)
    onReopenHandled()
  }, [reopenSearch, ready])

  // The Home link pressed on Home: an open list goes back to the start state (typed text stays), the playing episode is untouched.
  const lastReset = useRef(resetSeq)
  useEffect(() => {
    if (resetSeq === lastReset.current) return
    lastReset.current = resetSeq
    const l = live.current
    if (l.phase === 'idle' || l.phase === 'playing') return
    if (l.phase === 'busy' && l.pendingPlay) return // a busy play start (before or after its reply) is left alone so its episode still opens
    l.resetCount++ // a pickAnime still reading prefs must not undo this reset
    if (l.listSession) { l.ignore.add(l.listSession); api.watch.cancel(l.listSession); l.listSession = null }
    else l.abandoned.add(l.startSeq) // start() still waiting for its session id: cancel it when it arrives
    focusReopened.current = false
    setReopening(false)
    setMenu(null); setSelected([]); setError(null); setNotice(null); setShowDetails(false); setAnime(null)
    setPhase(l.playingSession ? 'playing' : 'idle')
  }, [resetSeq])

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
    if (!menu) return
    api.watch.answerMenu(menu.requestId, line)
    setMenu(null)
    setPhase(line == null ? 'idle' : 'busy')
  }
  const pickAnime = async (line) => {
    const title = animeLineTitle(line)
    const requestId = menu.requestId
    const resets = live.current.resetCount
    setAnime(title)
    setMenu(null)
    setPhase('busy')
    // The session was started with prefs resolved for the search text; saved prefs of the picked series need a fresh start.
    const p = await api.seriesPrefs.get(title).catch(() => null)
    if (live.current.resetCount !== resets) return // Home reset meanwhile; it already cancelled the list
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
          <button type="submit" className="primary" disabled={!ready || (phase !== 'idle' && phase !== 'playing')}>{t('search.button')}</button>
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
      {phase === 'busy' && (cachedView ? <p className="muted" role="status">{t('search.refreshing')}</p> : <p className="muted">{t('search.searching')}</p>)}
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

      {((phase === 'episode' && menu) || cachedView) && (
        <div className="page" inert={Boolean(cachedView)} aria-busy={cachedView ? 'true' : undefined}>
          <div className="row"><button type="button" onClick={() => answer(null)}><Icon name="back" /> {t('search.back')}</button></div>
          <h3 ref={pickerHeading} tabIndex={-1}>{anime ?? (titleMissing ? t('search.titleUnknown', { query: live.current.lastParams?.query ?? '' }) : t('search.titlePending'))} — {t('search.selectEpisode')}</h3>
          <EpisodePicker episodes={episodeMenu} selected={selected} watched={watched} onToggle={toggle} prefs={prefs} prefsLoading={anime != null && !prefsLoaded} onPrefs={anime ? changePrefs : null} groupKey={anime ? normalizeTitle(anime).toLowerCase() : null}
            series={series} poster={posterInfo?.poster ?? null} onReveal={(ep) => updateSpoilers({ episode: ep })} loadThumb={thumb} progress={progress}
            hideMarked={Boolean(prefs.hideFiller)} onHideMarked={anime ? (v) => changePrefs({ hideFiller: v }) : null}>
            <button type="button" className="primary" disabled={!ready || !!cachedView || selected.length === 0} onClick={watchSelected}>{t('search.watch')}</button>
            <button type="button" disabled={!ready || !!cachedView || selected.length === 0 || !anime} onClick={downloadSelected}>{t('search.download')}</button>
            {!settings.downloadDir && (
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t('downloads.rememberFolder')}
              </label>
            )}
            <button type="button" disabled={!anime || !!cachedView} onClick={addToWatchlist}>{t('search.addToWatchlist')}</button>
            <button type="button" onClick={() => answer(null)}>{t('search.cancel')}</button>
          </EpisodePicker>
        </div>
      )}
    </section>
  )
}
