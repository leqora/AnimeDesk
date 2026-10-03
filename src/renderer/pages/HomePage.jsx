import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Hero } from '../components/Hero.jsx'
import { SeriesCard } from '../components/SeriesCard.jsx'
import { Icon } from '../components/Icon.jsx'
import { SearchPage } from './SearchPage.jsx'

const byRecent = (a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? ''))

export const pickHeroEntry = (entries) => entries.filter((e) => e.status === 'watching' && e.lastWatchedAt).sort(byRecent)[0] ?? null
export const watchingNow = (entries) => entries.filter((e) => e.status === 'watching').sort(byRecent).slice(0, 10)
export const pinnedEntries = (entries) => entries.filter((e) => e.pinnedAt).sort((a, b) => String(a.pinnedAt).localeCompare(String(b.pinnedAt)))

function Rail({ title, children }) {
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
  })
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
  const [entries, setEntries] = useState([])
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const load = () => api.library.list().then(setEntries)
    load()
    return api.onLibraryChanged(load)
  }, [api])

  const pinned = pinnedEntries(entries)
  const rail = watchingNow(entries)
  const card = (e) => <SeriesCard key={e.id} entry={e} ready={ready} onOpen={onOpenAnime} onContinue={onContinue} />
  return (
    <div className="page">
      {!focused && (
        <>
          <Hero entry={pickHeroEntry(entries)} ready={ready} onContinue={onContinue} onDetails={onOpenAnime} onSearch={() => document.getElementById('search-input')?.focus()} />
          {pinned.length > 0 && <Rail title={t('home.favorites')}>{pinned.map(card)}</Rail>}
          {rail.length > 0 && <Rail title={t('home.continueWatching')}>{rail.map(card)}</Rail>}
        </>
      )}
      <SearchPage ready={ready} settings={settings} onSettings={onSettings} onOpenWizard={onOpenWizard} pendingWatch={pendingWatch} onPendingHandled={onPendingHandled} onFocusChange={setFocused} />
    </div>
  )
}
