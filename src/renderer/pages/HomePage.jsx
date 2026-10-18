import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Hero } from '../components/Hero.jsx'
import { MediaCard } from '../components/MediaCard.jsx'
import { SequelCard } from '../components/SequelCard.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { Icon } from '../components/Icon.jsx'
import { SearchPage } from './SearchPage.jsx'

const byRecent = (a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? ''))

export const pickHeroEntry = (entries) => entries.filter((e) => e.status === 'watching' && e.lastWatchedAt).sort(byRecent)[0] ?? null
export const watchingNow = (entries) => entries.filter((e) => e.status === 'watching').sort(byRecent).slice(0, 10)
export const pinnedEntries = (entries) => entries.filter((e) => e.pinnedAt).sort((a, b) => String(a.pinnedAt).localeCompare(String(b.pinnedAt)))

function Rail({ title, count, children }) {
  const t = useT()
  const track = useRef(null)
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const el = track.current
    if (!el) return
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [count])
  const scroll = (dir) => track.current?.scrollBy?.({ left: dir * track.current.clientWidth, behavior: 'smooth' })
  return (
    <section className="rail" aria-label={title}>
      <div className="rail__head">
        <h3 className="hud">{title}</h3>
        {overflow && (
          <div className="row">
            <button type="button" aria-label={t('home.prev')} onClick={() => scroll(-1)}><Icon name="chevronLeft" /></button>
            <button type="button" aria-label={t('home.next')} onClick={() => scroll(1)}><Icon name="chevronRight" /></button>
          </div>
        )}
      </div>
      <div className="rail__track" ref={track}>{children}</div>
    </section>
  )
}

export function HomePage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled, onContinue, onOpenAnime }) {
  const api = useApi()
  const t = useT()
  const toast = useToast()
  const [entries, setEntries] = useState([])
  const [sequels, setSequels] = useState([])
  const [pendingSearch, setPendingSearch] = useState(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const load = () => api.library.list().then(setEntries)
    load()
    return api.onLibraryChanged(load)
  }, [api])

  // The list is computed in main (cache + hidden); the push event carries the new list, so hide/undo need no refetch.
  useEffect(() => {
    let alive = true
    api.sequels.list().then((list) => { if (alive) setSequels(list) }).catch(() => {})
    const off = api.sequels.onChanged((list) => { if (alive) setSequels(list) })
    return () => { alive = false; off() }
  }, [api])

  const hideSequel = async (item) => {
    await api.sequels.hide(item.id)
    // Only the sequel title goes in the toast; it is already on the card.
    toast.show({
      message: t('sequels.hidden', { title: item.title }),
      action: { label: t('toast.undo'), onAction: () => api.sequels.unhide(item.id) },
    })
  }

  const pinned = pinnedEntries(entries)
  const rail = watchingNow(entries)
  const card = (e) => <MediaCard key={e.id} entry={e} ready={ready} onOpen={onOpenAnime} onContinue={onContinue} />
  return (
    <div className="page">
      {!focused && (
        <>
          <Hero entry={pickHeroEntry(entries)} ready={ready} onContinue={onContinue} onDetails={onOpenAnime} onSearch={() => document.getElementById('search-input')?.focus()} />
          {pinned.length > 0 && <Rail title={t('home.favorites')} count={pinned.length}>{pinned.map(card)}</Rail>}
          {rail.length > 0 && <Rail title={t('home.continueWatching')} count={rail.length}>{rail.map(card)}</Rail>}
          {sequels.length > 0 && (
            <Rail title={t('sequels.title')} count={sequels.length}>
              {sequels.map((s) => <SequelCard key={s.id} item={s} ready={ready} onSearch={(query) => setPendingSearch({ query })} onHide={hideSequel} />)}
            </Rail>
          )}
        </>
      )}
      <SearchPage ready={ready} settings={settings} onSettings={onSettings} onOpenWizard={onOpenWizard} pendingWatch={pendingWatch} onPendingHandled={onPendingHandled} pendingSearch={pendingSearch} onPendingSearchHandled={() => setPendingSearch(null)} onFocusChange={setFocused} />
    </div>
  )
}
