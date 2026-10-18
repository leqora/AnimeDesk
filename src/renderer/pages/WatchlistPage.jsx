import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { MediaCard } from '../components/MediaCard.jsx'
import { AnimeDetail } from './AnimeDetail.jsx'
import { STATUSES } from '../../shared/domain.js'
import { sortItems } from '../../shared/watchlistFilter.js'
import { useRouteState } from '../nav/useNavigation.js'

export { sortItems }

export function WatchlistPage({ ready, onContinue, animeId = null, onOpen, onBack, onRemoved }) {
  const api = useApi()
  const t = useT()
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useRouteState('filter', 'all')
  const [sort, setSort] = useRouteState('sort', 'title')
  const [newTitle, setNewTitle] = useState('')
  const toast = useToast()

  const load = () => api.library.list().then(setItems)
  useEffect(() => {
    load()
    return api.onLibraryChanged(load)
  }, [api])

  // an id that is no longer in the library (removed elsewhere) simply falls through to the grid
  const open = animeId != null ? items?.find((i) => i.id === animeId) : null
  if (open) return <AnimeDetail key={open.id} entry={open} ready={ready} onBack={onBack} onRemoved={onRemoved} onChanged={load} onContinue={onContinue} />
  // the library is still loading for a detail route: paint nothing rather than flash the grid
  if (animeId != null && items == null) return null

  const visible = sortItems((items ?? []).filter((i) => filter === 'all' || i.status === filter), sort)
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
      <div className="row">
        <label className="field">
          <span>{t('detail.status')}</span>
          <select aria-label={t('detail.status')} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t('watchlist.all')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('watchlist.sort')}</span>
          <select aria-label={t('watchlist.sort')} value={sort} onChange={(e) => setSort(e.target.value)}>
            {['title', 'rating', 'lastWatched'].map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </select>
        </label>
        <form className="row" onSubmit={addManual}>
          <input aria-label={t('watchlist.titlePrompt')} placeholder={t('watchlist.titlePrompt')} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <button type="submit">{t('watchlist.addManual')}</button>
        </form>
      </div>
      {items && items.length === 0 && <p className="muted">{t('watchlist.empty')}</p>}
      <div className="card-grid">
        {visible.map((i) => (
          <MediaCard key={i.id} entry={i} ready={ready} onOpen={onOpen} onContinue={onContinue} onTogglePin={togglePin} showScore />
        ))}
      </div>
    </section>
  )
}
