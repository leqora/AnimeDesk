import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { MediaCard } from '../components/MediaCard.jsx'
import { AnimeDetail } from './AnimeDetail.jsx'
import { STATUSES } from '../../shared/domain.js'

export function sortItems(items, sort) {
  const copy = [...items]
  if (sort === 'rating') copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  else if (sort === 'lastWatched') copy.sort((a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? '')))
  else copy.sort((a, b) => a.title.localeCompare(b.title))
  return copy
}

export function WatchlistPage({ ready, onContinue, initialOpenId = null }) {
  const api = useApi()
  const t = useT()
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('title')
  const [openId, setOpenId] = useState(initialOpenId)
  const [newTitle, setNewTitle] = useState('')
  const toast = useToast()

  const load = () => api.library.list().then(setItems)
  useEffect(() => {
    load()
    return api.onLibraryChanged(load)
  }, [api])

  const open = items?.find((i) => i.id === openId)
  if (open) return <AnimeDetail key={open.id} entry={open} ready={ready} onBack={() => setOpenId(null)} onChanged={load} onContinue={onContinue} />

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
          <MediaCard key={i.id} entry={i} ready={ready} onOpen={setOpenId} onContinue={onContinue} onTogglePin={togglePin} showScore />
        ))}
      </div>
    </section>
  )
}
