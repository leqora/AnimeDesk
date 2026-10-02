import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Hero } from '../components/Hero.jsx'
import { Poster } from '../components/Poster.jsx'
import { SearchPage } from './SearchPage.jsx'

const byRecent = (a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? ''))

export const pickHeroEntry = (entries) => entries.filter((e) => e.status === 'watching' && e.lastWatchedAt).sort(byRecent)[0] ?? null
export const watchingNow = (entries) => entries.filter((e) => e.status === 'watching').sort(byRecent).slice(0, 10)

export function HomePage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled, onContinue, onOpenAnime }) {
  const api = useApi()
  const t = useT()
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const load = () => api.library.list().then(setEntries)
    load()
    return api.onLibraryChanged(load)
  }, [api])

  const rail = watchingNow(entries)
  return (
    <div className="page">
      <Hero entry={pickHeroEntry(entries)} ready={ready} onContinue={onContinue} onDetails={onOpenAnime} onSearch={() => document.getElementById('search-input')?.focus()} />
      {rail.length > 0 && (
        <section className="rail" aria-label={t('home.watchingNow')}>
          <h3 className="hud">{t('home.watchingNow')}</h3>
          <div className="rail__track">
            {rail.map((e) => (
              <button key={e.id} type="button" className="card" onClick={() => onOpenAnime(e.id)}>
                <Poster title={e.title} aniListId={e.aniListId} />
                <span className="card__title">{e.title}</span>
                <span className="card__meta">{t('home.episodeOf', { watched: e.watchedEpisodes.length, total: e.totalEpisodes ?? '?' })}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <SearchPage ready={ready} settings={settings} onSettings={onSettings} onOpenWizard={onOpenWizard} pendingWatch={pendingWatch} onPendingHandled={onPendingHandled} />
    </div>
  )
}
