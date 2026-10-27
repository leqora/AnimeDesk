import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { HomeHero } from '../components/HomeHero.jsx'
import { PopularHero } from '../components/PopularHero.jsx'
import { ContinueCard } from '../components/ContinueCard.jsx'
import { popularSlides } from '../home/popularSlides.js'
import { MediaCard } from '../components/MediaCard.jsx'
import { SequelCard } from '../components/SequelCard.jsx'
import { RecommendationCard } from '../components/RecommendationCard.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { Rail } from '../components/Rail.jsx'
import { SearchPage } from './SearchPage.jsx'

const byRecent = (a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? ''))

export const pickHeroEntries = (entries, max = 5) => entries.filter((e) => e.status === 'watching' && e.lastWatchedAt).sort(byRecent).slice(0, max)
export const watchingNow = (entries) => entries.filter((e) => e.status === 'watching').sort(byRecent).slice(0, 10)
export const pinnedEntries = (entries) => entries.filter((e) => e.pinnedAt).sort((a, b) => String(a.pinnedAt).localeCompare(String(b.pinnedAt)))

export function HomePage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled, onContinue, onOpenAnime, pendingSearch = null, onPendingSearchHandled = () => {}, onSearch = () => {} }) {
  const api = useApi()
  const t = useT()
  const toast = useToast()
  const [entries, setEntries] = useState([])
  const [sequels, setSequels] = useState([])
  const [recs, setRecs] = useState({ mode: 'trending', hint: false, items: [] })
  const [peek, setPeek] = useState(null)
  const [peekSettled, setPeekSettled] = useState(false)
  const [focused, setFocused] = useState(false)
  // The popular list is frozen at the first non-empty result while Home is mounted: adding a series must not remove the slide under the focus.
  const frozen = useRef(null)

  useEffect(() => {
    const load = () => api.library.list().then(setEntries)
    load()
    return api.onLibraryChanged(load)
  }, [api])

  // Cached Discover season rail: no network (peek never asks AniList).
  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => api.discover.peek())
      .then((data) => { if (alive && data && Array.isArray(data.items)) setPeek(data) })
      .catch(() => {})
      .then(() => { if (alive) setPeekSettled(true) })
    return () => { alive = false }
  }, [api])

  // The list is computed in main (cache + hidden); the change event has no payload, so every call re-fetches.
  // A stale response (an older list() resolving after a newer one) is ignored.
  useEffect(() => {
    let alive = true
    let seq = 0
    const load = () => {
      const mine = ++seq
      api.sequels.list().then((list) => { if (alive && mine === seq && Array.isArray(list)) setSequels(list) }).catch(() => {})
    }
    load()
    const off = api.sequels.onChanged(load)
    return () => { alive = false; off() }
  }, [api])

  // Same loading rules as the sequels: no payload on the event, a stale answer is ignored.
  useEffect(() => {
    let alive = true
    let seq = 0
    const load = () => {
      const mine = ++seq
      api.recommendations.list().then((data) => { if (alive && mine === seq && data && Array.isArray(data.items)) setRecs(data) }).catch(() => {})
    }
    load()
    const off = api.recommendations.onChanged(load)
    return () => { alive = false; off() }
  }, [api])

  // One hide flow for both rails; only the api group and the copy differ.
  const hideFrom = (group) => async (item, viaKeyboard = false) => {
    try {
      await api[group].hide(item.id)
    } catch (err) {
      console.warn(`${group}: hide failed`, err?.message)
      return
    }
    // The card unmounts; for a keyboard user focus would fall to body, so it goes to "Undo" (a mouse click keeps the old behavior).
    const cls = document.activeElement?.classList
    if (viaKeyboard && (cls?.contains('sequel-card__hide') || cls?.contains('rec-card__hide'))) document.activeElement.blur()
    // Only the item title goes in the toast; it is already on the card.
    toast.show({
      message: t(`${group}.hidden`, { title: item.title }),
      action: { label: t('toast.undo'), onAction: () => api[group].unhide(item.id) },
      focusAction: viaKeyboard,
    })
  }
  const hideSequel = hideFrom('sequels')
  const hideRec = hideFrom('recommendations')
  // The same series is not offered twice: sequels win.
  const sequelIds = new Set(sequels.map((s) => s.id))
  const recItems = recs.items.filter((r) => !sequelIds.has(r.id))

  const rail = watchingNow(entries)
  const heroEntries = pickHeroEntries(entries)
  // The same series is not shown twice in two neighbouring rails: the big continue cards win over Favorites.
  const railIds = new Set(rail.map((e) => e.id))
  const pinned = pinnedEntries(entries).filter((e) => !railIds.has(e.id))
  const card = (e) => <MediaCard key={e.id} entry={e} ready={ready} onOpen={onOpenAnime} onContinue={onContinue} />
  // Frozen only after peek (the highest-priority source) has settled, so a fast recommendations answer cannot lock in a lower one.
  if (heroEntries.length === 0 && !frozen.current && peekSettled) {
    const slides = popularSlides({ peek, recs })
    if (slides.length > 0) frozen.current = slides
  }
  const reduced = settings?.animations === false
  const focusSearch = () => document.getElementById('search-input')?.focus()
  return (
    <div className="page">
      {!focused && (
        <>
          {heroEntries.length > 0
            ? <HomeHero entries={heroEntries} ready={ready} reduced={reduced} onContinue={onContinue} onDetails={onOpenAnime} />
            : (peekSettled || frozen.current) && <PopularHero slides={frozen.current ?? []} reduced={reduced} onSearch={(query) => (query ? onSearch(query) : focusSearch())} />}
          {pinned.length > 0 && <Rail title={t('home.favorites')} count={pinned.length}>{pinned.map(card)}</Rail>}
          {rail.length > 0 && (
            <Rail title={t('home.continueWatching')} count={rail.length} variant="wide">
              {rail.map((e) => <ContinueCard key={e.id} entry={e} ready={ready} onContinue={onContinue} onOpen={onOpenAnime} />)}
            </Rail>
          )}
          {sequels.length > 0 && (
            <Rail title={t('sequels.title')} count={sequels.length}>
              {sequels.map((s) => <SequelCard key={s.id} item={s} ready={ready} onSearch={onSearch} onHide={hideSequel} />)}
            </Rail>
          )}
          {recItems.length > 0 && (
            <Rail title={t(recs.mode === 'personal' ? 'recommendations.titlePersonal' : 'recommendations.titleTrending')} count={recItems.length} hint={recs.hint === 'link' ? t('recommendations.hintLink') : recs.hint ? t('recommendations.hint') : null}>
              {recItems.map((r) => <RecommendationCard key={r.id} item={r} ready={ready} onSearch={onSearch} onHide={hideRec} />)}
            </Rail>
          )}
        </>
      )}
      <SearchPage ready={ready} settings={settings} onSettings={onSettings} onOpenWizard={onOpenWizard} pendingWatch={pendingWatch} onPendingHandled={onPendingHandled} pendingSearch={pendingSearch} onPendingSearchHandled={onPendingSearchHandled} onFocusChange={setFocused} />
    </div>
  )
}
