import { useEffect, useState } from 'react'
import { ApiContext } from './api.js'
import { I18nProvider, useT } from './i18n/I18nContext.jsx'
import { Header } from './components/Header.jsx'
import { AskDialog } from './components/AskDialog.jsx'
import { SetupWizard } from './pages/SetupWizard.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
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
  const [page, setPage] = useState('search')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [ask, setAsk] = useState(null)
  const [pendingWatch, setPendingWatch] = useState(null)
  const [corrupt, setCorrupt] = useState(false)

  useEffect(() => {
    api.settings.get().then(setSettings)
    api.health.get().then(setHealth)
    api.library.wasCorrupt().then(setCorrupt)
    const offs = [api.health.onChange(setHealth), api.watch.onAsk(setAsk)]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => { if (health.reason === 'missing-tools') setWizardOpen(true) }, [health.reason])

  if (!settings) return null
  const ready = health.light === 'green'
  const updateSettings = async (patch) => setSettings(await api.settings.update(patch))
  const continueWatching = (params) => { setPendingWatch(params); setPage('search') }

  return (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={settings.language}>
        <Header page={page} onNavigate={setPage} health={health} onSemaphoreClick={() => setWizardOpen(true)} />
        <main>
          {corrupt && <CorruptBanner />}
          {page === 'search' && (
            <SearchPage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} />
          )}
          {page === 'watchlist' && <WatchlistPage ready={ready} onContinue={continueWatching} />}
          {page === 'downloads' && <DownloadsPage />}
          {page === 'settings' && <SettingsPage settings={settings} onSettings={updateSettings} />}
        </main>
        {wizardOpen && <SetupWizard health={health} onClose={() => setWizardOpen(false)} />}
        {ask && <AskDialog ask={ask} onDone={() => setAsk(null)} />}
      </I18nProvider>
    </ApiContext.Provider>
  )
}
