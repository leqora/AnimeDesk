import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from '../components/Poster.jsx'
import { Icon } from '../components/Icon.jsx'
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
  const [notice, setNotice] = useState(null)

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
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="card-grid">
        {visible.map((i) => (
          <div key={i.id} className="card watch-card">
            <button type="button" className="series-card__open" onClick={() => setOpenId(i.id)}>
              <Poster title={i.title} aniListId={i.aniListId} />
              <span className="card__title">{i.title}</span>
              <span className="card__meta">
                {t(`status.${i.status}`)} · {i.watchedEpisodes.length}/{i.totalEpisodes ?? '?'}{i.rating ? ` · ★ ${i.rating}` : ''}
              </span>
            </button>
            <button
              type="button" className="watch-card__pin" aria-pressed={Boolean(i.pinnedAt)}
              aria-label={`${i.pinnedAt ? t('pin.remove') : t('pin.add')}: ${i.title}`}
              onClick={async () => { const r = await api.library.setPinned(i.id, !i.pinnedAt); setNotice(r.ok ? null : t('pin.limit')); load() }}
            >
              <Icon name="star" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
