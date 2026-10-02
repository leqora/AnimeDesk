import { useEffect, useState } from 'react'
import { ApiContext } from './api.js'
import { I18nProvider, useT } from './i18n/I18nContext.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { ProfilePage } from './pages/ProfilePage.jsx'
import { EMPTY_STATS } from '../shared/stats.js'
import { AskDialog } from './components/AskDialog.jsx'
import { SetupWizard } from './pages/SetupWizard.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { WatchlistPage } from './pages/WatchlistPage.jsx'
import { DownloadsPage } from './pages/DownloadsPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'

function CorruptBanner() {
  const t = useT()
  return <div className="notice notice--warn" role="status">{t('library.corrupt')}</div>
}

export default function App({ api }) {
  const [settings, setSettings] = useState(null)
  const [health, setHealth] = useState({ light: 'yellow', reason: 'checking' })
  const [page, setPage] = useState('home')
  const [stats, setStats] = useState(EMPTY_STATS)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [ask, setAsk] = useState(null)
  const [pendingWatch, setPendingWatch] = useState(null)
  const [corrupt, setCorrupt] = useState(false)
  const [openAnimeId, setOpenAnimeId] = useState(null)

  useEffect(() => {
    api.settings.get().then(setSettings)
    api.health.get().then(setHealth)
    api.library.wasCorrupt().then(setCorrupt)
    const offs = [api.health.onChange(setHealth), api.watch.onAsk(setAsk)]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => {
    const refresh = () => api.stats.get().then(setStats)
    refresh()
    return api.onLibraryChanged(refresh)
  }, [api, page])

  useEffect(() => { if (health.reason === 'missing-tools') setWizardOpen(true) }, [health.reason])

  if (!settings) return null
  const ready = health.light === 'green'
  const updateSettings = async (patch) => setSettings(await api.settings.update(patch))
  const navigate = (p) => { setOpenAnimeId(null); setPage(p) }
  const openAnime = (id) => { setOpenAnimeId(id); setPage('watchlist') }
  const continueWatching = (params) => { setPendingWatch(params); setPage('home') }

  return (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={settings.language}>
        <div className="app-shell">
          <Sidebar
            page={page}
            onNavigate={navigate}
            health={health}
            onSemaphoreClick={() => setWizardOpen(true)}
            profileName={settings.profileName || settings.systemName}
            stats={stats}
          />
          <main className="content">
            <div key={page} className="page-enter">
              {corrupt && <CorruptBanner />}
              {page === 'home' && (
                <HomePage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} onContinue={continueWatching} onOpenAnime={openAnime} />
              )}
              {page === 'watchlist' && <WatchlistPage ready={ready} onContinue={continueWatching} initialOpenId={openAnimeId} />}
              {page === 'downloads' && <DownloadsPage />}
              {page === 'profile' && <ProfilePage stats={stats} name={settings.profileName || settings.systemName} lang={settings.language} />}
              {page === 'settings' && <SettingsPage settings={settings} onSettings={updateSettings} />}
            </div>
          </main>
        </div>
        {wizardOpen && <SetupWizard health={health} onClose={() => setWizardOpen(false)} />}
        {ask && <AskDialog ask={ask} onDone={() => setAsk(null)} />}
      </I18nProvider>
    </ApiContext.Provider>
  )
}
