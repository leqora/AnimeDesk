import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { PosterFrame } from '../components/Poster.jsx'
import { Rail } from '../components/Rail.jsx'
import { RecommendationCard } from '../components/RecommendationCard.jsx'
import { useRouteState } from '../nav/useNavigation.js'
import { filterRails, genreOptions, pickSurprise, surprisePool } from '../../shared/discover.js'

const MAX_POSTERS = 40
const SKELETON_RAILS = 3
const SKELETON_CARDS = 6
const EMPTY_RAILS = { season: [], upcoming: [], movies: [], trending: [] }
const FAILED = { state: 'error', refreshing: false, fetchedAt: null, retryAt: null, season: null, next: null, rails: EMPTY_RAILS, hiddenIds: [] }

export function DiscoverPage({ ready, onOpenAnime, onSearch }) {
  const api = useApi()
  const t = useT()
  const [data, setData] = useState(null)
  const [posters, setPosters] = useState({})
  const [genreChoice, setGenre] = useRouteState('genre', null)
  const [retryNow, setRetryNow] = useState(() => Date.now())
  const [announced, setAnnounced] = useState({ at: null, n: 0 })
  const lastPick = useRef(null)
  const selectRef = useRef(null)

  // list() answers are applied newest-first: an older answer arriving late is ignored.
  const seq = useRef(0)
  const load = (force = false) => {
    const mine = ++seq.current
    const call = force ? api.discover.list({ force: true }) : api.discover.list()
    return call.then((r) => { if (mine === seq.current && r && r.rails) setData(r) }).catch(() => {
      if (mine === seq.current) setData((d) => d ?? FAILED)
    })
  }
  // Loaded when the page opens and on every discover/library change (the library decides the badge and what a click opens).
  useEffect(() => {
    load()
    const offDiscover = api.discover.onChanged(() => load())
    const offLibrary = api.onLibraryChanged(() => load())
    return () => { seq.current++; offDiscover(); offLibrary() }
  }, [api]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the retry block goes away while its button had focus, focus moves to the heading instead of falling to <body>.
  const headingRef = useRef(null)
  const retryFocused = useRef(false)
  const retryShown = data?.state === 'error' || data?.state === 'stale'
  useEffect(() => {
    if (retryShown) return
    if (retryFocused.current) {
      retryFocused.current = false
      headingRef.current?.focus()
    }
  }, [retryShown])

  const retryAt = typeof data?.retryAt === 'number' ? data.retryAt : null
  useEffect(() => {
    const start = Date.now()
    setRetryNow(start)
    if (retryAt == null || retryAt <= start) return undefined
    // the live region gets the message once, with the first count, so a screen reader does not read every second
    setAnnounced({ at: retryAt, n: Math.ceil((retryAt - start) / 1000) })
    const id = setInterval(() => {
      const n = Date.now()
      setRetryNow(n)
      if (n >= retryAt) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [retryAt])

  const state = data?.state ?? 'loading'
  const usable = state === 'ok' || state === 'stale'
  const rails = data?.rails ?? EMPTY_RAILS
  const genres = genreOptions(rails)
  // a stored genre that no longer exists in the data counts as "all genres" (derived, never written back to the route)
  const genre = genreChoice != null && genres.includes(genreChoice) ? genreChoice : null
  const shown = filterRails(rails, genre)
  const railDefs = [
    ['season', data?.season ? t('discover.railSeason', { season: t(`discover.season.${data.season.season}`), year: data.season.year }) : ''],
    ['upcoming', data?.next ? t('discover.railUpcoming', { season: t(`discover.season.${data.next.season}`), year: data.next.year }) : ''],
    ['movies', t('discover.railMovies')],
    ['trending', t('discover.railTrending')],
  ].filter(([key]) => shown[key].length > 0)

  const pool = usable ? surprisePool(shown, (i) => i.entryId != null, data?.hiddenIds ?? []) : []
  const surpriseBlocked = !ready || pool.length === 0
  const surprise = () => {
    if (surpriseBlocked) return
    const pick = pickSurprise(pool, lastPick.current)
    if (!pick) return
    lastPick.current = pick.id
    onSearch(pick.romaji ?? pick.title)
  }

  // Posters for the shown items; ids already asked (even if the answer was empty) are not asked again.
  // every id is asked at most once per page session; a null answer counts as answered
  const requested = useRef(new Set())
  const idsKey = [...new Set(railDefs.flatMap(([key]) => shown[key].map((i) => i.id)))].join(',')
  useEffect(() => {
    if (!idsKey) return undefined
    let alive = true
    const all = idsKey.split(',').map(Number).filter((id) => !requested.current.has(id))
    for (const id of all) requested.current.add(id)
    // an id missing from an answer (or a failed chunk) gets the empty frame, never a skeleton that never ends
    const settle = (ids, map) => setPosters((prev) => {
      const next = { ...prev }
      for (const id of ids) next[id] = (map && typeof map === 'object' ? map[id] : null) ?? null
      return next
    })
    // chunks go one after another so main's download limiter is never asked for more than one batch from this page
    ;(async () => {
      for (let k = 0; k < all.length && alive; k += MAX_POSTERS) {
        const ids = all.slice(k, k + MAX_POSTERS)
        let map = null
        try { map = await api.discover.posters(ids) } catch { map = null }
        if (alive) settle(ids, map)
      }
    })()
    return () => { alive = false }
  }, [api, idsKey])

  const staleTime = data?.fetchedAt != null ? new Date(data.fetchedAt).toLocaleString(t.locale, { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  // retryNow lags one effect run behind a new retryAt, so the first paint reads the real clock too
  const clock = Math.max(retryNow, Date.now())
  const counting = retryAt != null && retryAt > clock
  const refreshing = data?.refreshing === true
  const retryBlocked = refreshing || counting
  const retryLabel = refreshing ? t('discover.refreshing') : counting ? t('discover.retryIn', { n: Math.ceil((retryAt - clock) / 1000) }) : t('discover.retry')
  // aria-disabled, not disabled: a disabled button loses keyboard focus in Chromium
  const retryButton = (
    <button
      type="button" onFocus={() => { retryFocused.current = true }} onBlur={() => { retryFocused.current = false }} aria-disabled={retryBlocked ? 'true' : undefined} aria-busy={refreshing ? 'true' : undefined}
      onClick={() => { if (!retryBlocked) load(true) }}
    >
      {retryLabel}
    </button>
  )

  const resetGenre = () => {
    setGenre(null)
    selectRef.current?.focus()
  }
  const noPool = usable && pool.length === 0

  return (
    <section className="page discover-page" aria-busy={state === 'loading' ? 'true' : undefined}>
      <header className="page__head">
        <h2 className="hud" ref={headingRef} tabIndex={-1}>{t('discover.title')}</h2>
        <p className="muted">{t('discover.subtitle')}</p>
      </header>
      <div className="discover-controls">
        <select ref={selectRef} className="discover-genre" aria-label={t('discover.genre')} value={genre ?? ''} onChange={(e) => setGenre(e.target.value || null)}>
          <option value="">{t('discover.allGenres')}</option>
          {genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button type="button" aria-disabled={surpriseBlocked ? 'true' : undefined} aria-describedby={noPool ? 'discover-surprise-empty' : undefined} title={noPool ? t('discover.surpriseEmpty') : undefined} onClick={surprise}>
          {t('discover.surprise')}
        </button>
        {noPool && <span id="discover-surprise-empty" hidden>{t('discover.surpriseEmpty')}</span>}
      </div>
      <div className="schedule-live" role="status">
        {state === 'error' && <p className="muted">{t('discover.error')}</p>}
        {state === 'stale' && <p className="muted">{t('discover.stale', { time: staleTime })}</p>}
        {counting && announced.at === retryAt && <p className="muted">{t('discover.retryIn', { n: announced.n })}</p>}
      </div>
      {state === 'error' && <div className="schedule-state">{retryButton}</div>}
      {state === 'loading' && (
        <div className="discover-skeleton" data-testid="discover-skeleton" aria-hidden="true">
          {Array.from({ length: SKELETON_RAILS }, (_, r) => (
            <div key={r} className="rail__track">
              {Array.from({ length: SKELETON_CARDS }, (_, c) => <div key={c} className="card media-card"><PosterFrame info={undefined} /></div>)}
            </div>
          ))}
        </div>
      )}
      {usable && (
        <>
          {state === 'stale' && <div className="schedule-state schedule-state--stale">{retryButton}</div>}
          {railDefs.length > 0 ? railDefs.map(([key, title]) => (
            <Rail key={key} title={title} count={shown[key].length}>
              {shown[key].map((i) => (
                <RecommendationCard
                  key={i.id} item={{ ...i, poster: posters[i.id] }} ready={ready} onSearch={onSearch}
                  inWatchlist={i.entryId != null} onOpen={i.entryId != null ? () => onOpenAnime(i.entryId) : undefined}
                />
              ))}
            </Rail>
          )) : genre != null ? (
            <div className="schedule-state">
              <p className="muted">{t('discover.genreEmpty')}</p>
              <button type="button" onClick={resetGenre}>{t('discover.resetGenre')}</button>
            </div>
          ) : (
            <p className="muted">{t('discover.empty')}</p>
          )}
        </>
      )}
    </section>
  )
}
