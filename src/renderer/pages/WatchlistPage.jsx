import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { MediaCard } from '../components/MediaCard.jsx'
import { AnimeDetail } from './AnimeDetail.jsx'
import { STATUSES } from '../../shared/domain.js'
import { sortItems, filterEntries, statusCounts, genreOptions } from '../../shared/watchlistFilter.js'
import { useRouteState } from '../nav/useNavigation.js'

export { sortItems }

export function WatchlistPage({ ready, onContinue, animeId = null, onOpen, onBack, onRemoved, onSearch, playerOpen = false }) {
  const api = useApi()
  const t = useT()
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useRouteState('filter', 'all')
  const [query, setQuery] = useRouteState('q', '')
  const [genre, setGenre] = useRouteState('genre', 'all')
  const [sort, setSort] = useRouteState('sort', 'title')
  const [facets, setFacets] = useState({})
  const searchRef = useRef(null)
  const [newTitle, setNewTitle] = useState('')
  const toast = useToast()

  const load = () =>
    Promise.all([api.library.list(), api.library.facets().catch(() => ({}))]).then(([list, f]) => {
      setFacets(f ?? {})
      setItems(list)
    })
  useEffect(() => {
    load()
    return api.onLibraryChanged(load)
  }, [api])

  const gridShown = !(animeId != null && items?.some((i) => i.id === animeId)) && !(animeId != null && items == null)

  // search shortcuts live only while the grid is on screen (not in the detail page, not over a dialog)
  useEffect(() => {
    if (!gridShown) return undefined
    const onKey = (e) => {
      if (e.repeat || document.querySelector('[role="dialog"]')) return
      const field = searchRef.current
      // the player overlay is not a dialog: it makes the app shell inert instead
      if (!field || field.closest('[inert]')) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        field.focus()
        field.select()
        return
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = e.target
        if (el instanceof Element && el.closest('input, textarea, select, [contenteditable]')) return
        e.preventDefault()
        field.focus()
        field.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gridShown])

  // an id that is no longer in the library (removed elsewhere) simply falls through to the grid
  const open = animeId != null ? items?.find((i) => i.id === animeId) : null
  if (open) return <AnimeDetail key={open.id} entry={open} ready={ready} onBack={onBack} onRemoved={onRemoved} onChanged={load} onContinue={onContinue} onSearch={onSearch} playerOpen={playerOpen} />
  // the library is still loading for a detail route: paint nothing rather than flash the grid
  if (animeId != null && items == null) return null

  const all = items ?? []
  const visible = sortItems(filterEntries(all, { query, status: filter, genre }, facets), sort)
  const counts = statusCounts(all, { query, genre }, facets)
  const genres = genreOptions(facets, all, genre)
  const onSearchKey = (e) => {
    if (e.key !== 'Escape') return
    if (query) {
      e.preventDefault()
      setQuery('')
    } else {
      e.currentTarget.blur()
    }
  }
  const resetFilters = () => {
    setQuery('')
    setFilter('all')
    setGenre('all')
    searchRef.current?.focus()
  }
  const addManual = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await api.library.add({ title: newTitle.trim() })
    setNewTitle('')
    load()
  }

  const togglePin = async (entry) => {
    const r = await api.library.setPinned(entry.id, !entry.pinnedAt)
    if (!r.ok) toast.show({ message: t('pin.limit'), icon: 'alert' })
    load()
  }

  return (
    <section className="page">
      <header className="page__head">
        <h2 className="hud">{t('nav.watchlist')}</h2>
        <p className="page__sub muted">{t('watchlist.subtitle')}</p>
      </header>
      <div className="watchlist-toolbar">
        <input
          ref={searchRef}
          type="search"
          className="watchlist-search"
          aria-label={t('watchlist.search')}
          placeholder={t('watchlist.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
        {genres.length > 0 && (
          <select className="watchlist-genre" aria-label={t('watchlist.genre')} value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="all">{t('watchlist.allGenres')}</option>
            {genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <label className="field field--inline">
          <span>{t('watchlist.sort')}</span>
          <select aria-label={t('watchlist.sort')} value={sort} onChange={(e) => setSort(e.target.value)}>
            {['title', 'rating', 'lastWatched', 'added'].map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </select>
        </label>
        <form className="row watchlist-add" onSubmit={addManual}>
          <input aria-label={t('watchlist.titlePrompt')} placeholder={t('watchlist.titlePrompt')} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <button type="submit">{t('watchlist.addManual')}</button>
        </form>
      </div>
      <div className="status-chips" role="group" aria-label={t('watchlist.statusGroup')}>
        {['all', ...STATUSES].map((s) => (
          <button key={s} type="button" className="chip-btn" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s === 'all' ? t('watchlist.all') : t(`status.${s}`)} <span className="chip-btn__count">{counts[s]}</span>
          </button>
        ))}
      </div>
      {items && items.length === 0 && <p className="muted">{t('watchlist.empty')}</p>}
      {items && items.length > 0 && visible.length === 0 && (
        <div className="watchlist-nomatch">
          <p className="muted">{t('watchlist.noMatch')}</p>
          <button type="button" onClick={resetFilters}>{t('watchlist.resetFilters')}</button>
        </div>
      )}
      <div className="card-grid">
        {visible.map((i) => (
          <MediaCard key={i.id} entry={i} ready={ready} onOpen={onOpen} onContinue={onContinue} onTogglePin={togglePin} showScore />
        ))}
      </div>
    </section>
  )
}
