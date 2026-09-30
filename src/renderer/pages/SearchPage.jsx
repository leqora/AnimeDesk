import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { ReadyNotice } from '../components/ReadyNotice.jsx'
import { Poster } from '../components/Poster.jsx'
import { animeLineTitle, normalizeTitle } from '../../shared/domain.js'

const byNumber = (a, b) => Number(a) - Number(b)

export function SearchPage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled }) {
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

  useEffect(() => {
    const offs = [
      api.watch.onMenu((m) => { setMenu(m); setSelected([]); setPhase(m.kind === 'episode' ? 'episode' : 'anime') }),
      api.watch.onPlaying((p) => { setPlaying(p); setPhase('playing') }),
      api.watch.onSessionEnd(({ result }) => {
        setMenu(null)
        setPlaying(null)
        setPhase('idle')
        if (!result.ok && result.error !== 'cancelled') setError(result)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => {
    if (!anime) return
    api.library.list().then((list) => {
      const key = anime.toLowerCase()
      const e = list.find((x) => normalizeTitle(x.aniCliTitle ?? x.title).toLowerCase() === key)
      setWatched(e?.watchedEpisodes ?? [])
    })
  }, [api, anime])

  const start = (params) => {
    setError(null)
    setShowDetails(false)
    setNotice(null)
    setPhase('busy')
    api.watch.start(params).catch(() => { setPhase('idle'); setError({ error: 'unknown' }) })
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
  const watchSelected = () => { const ep = [...selected].sort(byNumber)[0]; if (ep) answer(ep) }

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
      <form className="search-bar" onSubmit={submit}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
        <button type="submit" className="primary" disabled={!ready || phase !== 'idle'}>{t('search.button')}</button>
      </form>

      {notice && <div className="notice">{notice}</div>}
      {error && (
        <div className="notice notice--error" role="alert">
          <span>{t(`error.${error.error ?? 'unknown'}`)}</span>
          {error.stderr && <button type="button" onClick={() => setShowDetails((v) => !v)}>{t('error.showDetails')}</button>}
          {showDetails && <pre className="details">{error.stderr}</pre>}
        </div>
      )}
      {phase === 'busy' && <p className="muted">{t('search.searching')}</p>}
      {phase === 'playing' && playing && <p>{t('search.playing', { title: playing.title, episode: playing.episode })}</p>}

      {phase === 'anime' && menu && (
        <div className="page">
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
          <h2>{anime} — {t('search.selectEpisode')}</h2>
          <div className="ep-grid">
            {menu.lines.map((line) => {
              const ep = line.trim()
              const cls = ['ep', selected.includes(ep) && 'ep--selected', watched.includes(Number(ep)) && 'ep--watched'].filter(Boolean).join(' ')
              return <button type="button" key={ep} className={cls} aria-pressed={selected.includes(ep)} onClick={() => toggle(ep)}>{ep}</button>
            })}
          </div>
          <div className="row">
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
          </div>
        </div>
      )}
    </section>
  )
}
