import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { ReadyNotice } from '../components/ReadyNotice.jsx'
import { Poster } from '../components/Poster.jsx'
import { EpisodePicker } from '../components/EpisodePicker.jsx'
import { Icon } from '../components/Icon.jsx'
import { animeLineTitle, normalizeTitle } from '../../shared/domain.js'

const byNumber = (a, b) => Number(a) - Number(b)

export function SearchPage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled, onFocusChange = () => {} }) {
  const api = useApi()
  const t = useT()
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('idle') // idle | busy | anime | episode | playing
  const [menu, setMenu] = useState(null)
  const [anime, setAnime] = useState(null)
  const [selected, setSelected] = useState([])
  const [watched, setWatched] = useState([])
  const [playing, setPlaying] = useState(null)
  const [error, setError] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [remember, setRemember] = useState(false)
  const [notice, setNotice] = useState(null)

  // The session id and phase are mirrored in a ref so the unmount cleanup sees the latest values.
  const [prefs, setPrefs] = useState({ quality: null, mode: null })
  // ignore: sessions we cancelled on purpose (mode switch) — their late events must not touch the new session
  const live = useRef({ sessionId: null, phase: 'idle', ignore: new Set(), lastEpisode: null })
  useEffect(() => { live.current.phase = phase }, [phase])
  // Stay focused between the anime and episode menus (and during a sub/dub restart) so the home sections do not flash back.
  const focused = phase === 'anime' || phase === 'episode' || (phase === 'busy' && anime != null)
  useEffect(() => { onFocusChange(focused) }, [focused])

  useEffect(() => {
    const offs = [
      api.watch.onMenu((m) => {
        if (live.current.ignore.has(m.sessionId)) return
        live.current.sessionId = m.sessionId; setMenu(m); setSelected([]); setPhase(m.kind === 'episode' ? 'episode' : 'anime')
      }),
      api.watch.onPlaying((p) => { setPlaying(p); setPhase('playing') }),
      api.watch.onSessionEnd(({ sessionId, result }) => {
        if (live.current.ignore.delete(sessionId)) return
        live.current.sessionId = null
        setMenu(null)
        setPlaying(null)
        setPhase('idle')
        if (!result.ok && result.error !== 'cancelled') setError(result)
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
    api.seriesPrefs.get(anime).then(setPrefs)
    api.library.list().then((list) => {
      const key = anime.toLowerCase()
      const e = list.find((x) => normalizeTitle(x.aniCliTitle ?? x.title).toLowerCase() === key)
      setWatched(e?.watchedEpisodes ?? [])
    })
  }, [api, anime])

  const start = (params) => {
    live.current.lastEpisode = params.episode ?? null
    setError(null)
    setShowDetails(false)
    setNotice(null)
    setPhase('busy')
    api.watch.start(params)
      .then((r) => { if (r?.sessionId) live.current.sessionId = r.sessionId })
      .catch(() => { setPhase('idle'); setError({ error: 'unknown' }) })
  }

  useEffect(() => {
    if (pendingWatch && ready) {
      setAnime(pendingWatch.anime)
      start(pendingWatch)
      onPendingHandled()
    }
  }, [pendingWatch, ready])

  const submit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setAnime(null)
    start({ query: query.trim() })
  }
  const answer = (line) => {
    api.watch.answerMenu(menu.requestId, line)
    setMenu(null)
    setPhase(line == null ? 'idle' : 'busy')
  }
  const pickAnime = (line) => { setAnime(animeLineTitle(line)); answer(line) }
  const toggle = (ep) => setSelected((s) => (s.includes(ep) ? s.filter((x) => x !== ep) : [...s, ep]))
  const watchSelected = () => { const ep = [...selected].sort(byNumber)[0]; if (ep) { live.current.lastEpisode = ep; answer(ep) } }

  const restart = () => {
    const old = live.current.sessionId
    if (old) { live.current.ignore.add(old); api.watch.cancel(old) }
    live.current.sessionId = null
    setMenu(null)
    start({ query: anime, anime })
  }
  const changePrefs = async (patch) => {
    const before = prefs.mode ?? settings.mode
    const next = await api.seriesPrefs.set(anime, patch)
    setPrefs(next)
    if ('mode' in patch && (next.mode ?? settings.mode) !== before && live.current.phase === 'episode') restart()
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
    const key = anime.toLowerCase()
    if (list.some((x) => normalizeTitle(x.aniCliTitle ?? x.title).toLowerCase() === key)) {
      setNotice(t('search.alreadyInList'))
      return
    }
    await api.library.add({ title: anime, aniCliTitle: anime })
    setNotice(t('search.added'))
  }

  return (
    <section className="page">
      <ReadyNotice ready={ready} onOpenWizard={onOpenWizard} />
      {!focused && (
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
          {showDetails && <pre className="details">{error.stderr}</pre>}
        </div>
      )}
      {phase === 'busy' && <p className="muted">{t('search.searching')}</p>}
      {phase === 'playing' && playing && <p>{t('search.playing', { title: playing.title, episode: playing.episode })}</p>}

      {phase === 'anime' && menu && (
        <div className="page">
          <div className="row"><button type="button" onClick={() => answer(null)}><Icon name="back" /> {t('search.back')}</button></div>
          <h2>{t('search.selectAnime')}</h2>
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
          <h2>{anime} — {t('search.selectEpisode')}</h2>
          <EpisodePicker episodes={menu.lines.map((l) => l.trim())} selected={selected} watched={watched} onToggle={toggle} prefs={prefs} onPrefs={changePrefs}>
            <button type="button" className="primary" disabled={!ready || selected.length === 0} onClick={watchSelected}>{t('search.watch')}</button>
            <button type="button" disabled={!ready || selected.length === 0} onClick={downloadSelected}>{t('search.download')}</button>
            {!settings.downloadDir && (
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t('downloads.rememberFolder')}
              </label>
            )}
            <button type="button" onClick={addToWatchlist}>{t('search.addToWatchlist')}</button>
            <button type="button" onClick={() => answer(null)}>{t('search.cancel')}</button>
          </EpisodePicker>
        </div>
      )}
    </section>
  )
}
