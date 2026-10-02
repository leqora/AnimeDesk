import { useEffect, useMemo, useRef, useState } from 'react'
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
import { LevelUpOverlay } from './components/LevelUpOverlay.jsx'
import { Toast } from './components/Toast.jsx'
import { createSound } from './sound.js'

function CorruptBanner() {
  const t = useT()
  return <div className="notice notice--warn" role="status">{t('library.corrupt')}</div>
}

const SILENT = { soundKey: false, soundUi: false, soundVolume: 0 }

function Celebrations({ levelUp, toast, stats, motionOff, onLevelUpDone, onToastDone }) {
  const t = useT()
  return (
    <>
      {levelUp && !motionOff && <LevelUpOverlay level={levelUp.level} title={levelUp.title} xpIntoLevel={stats.xpIntoLevel} xpForNext={stats.xpForNext} onDone={onLevelUpDone} />}
      {levelUp && motionOff && (
        <Toast onDone={onLevelUpDone} icon="flame">{t('toast.levelUp', { level: levelUp.level, title: t(`title.${levelUp.title}`) })}</Toast>
      )}
      {!levelUp && toast && <Toast onDone={onToastDone}>{t('toast.completed', { title: toast.title, xp: toast.xp })}</Toast>}
    </>
  )
}

export default function App({ api, sound: injectedSound }) {
  const settingsRef = useRef(null)
  const sound = useMemo(() => injectedSound ?? createSound({ getSettings: () => settingsRef.current ?? SILENT }), [injectedSound])
  const doneIds = useRef(new Set())
  const [levelUp, setLevelUp] = useState(null)
  const [toast, setToast] = useState(null)
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

  useEffect(() => {
    const refresh = () => api.stats.get().then(setStats)
    const offs = [
      api.stats.onLevelUp((p) => { sound.play('levelUp'); setLevelUp(p); refresh() }),
      api.stats.onSeriesCompleted((p) => { sound.play('seriesCompleted'); setToast(p); refresh() }),
      api.downloads.onChange((queue) => {
        const done = queue.filter((i) => i.status === 'done').map((i) => i.id)
        if (done.some((id) => !doneIds.current.has(id))) sound.play('downloadDone')
        doneIds.current = new Set(done)
      }),
    ]
    const onClick = (e) => { if (e.target.closest?.('button')) sound.play('click') }
    document.addEventListener('click', onClick, true)
    return () => { offs.forEach((off) => off()); document.removeEventListener('click', onClick, true) }
  }, [api, sound])

  const motionOff = settings != null && (!settings.animations || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true)
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', motionOff)
    return () => document.documentElement.classList.remove('reduce-motion')
  }, [motionOff])

  useEffect(() => { if (health.reason === 'missing-tools') setWizardOpen(true) }, [health.reason])

  if (!settings) return null
  settingsRef.current = settings
  const ready = health.light === 'green'
  const updateSettings = async (patch) => setSettings(await api.settings.update(patch))
  const navigate = (p) => { if (p !== page) sound.play('navigate'); setOpenAnimeId(null); setPage(p) }
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
              {page === 'settings' && <SettingsPage settings={settings} onSettings={updateSettings} onTestSound={() => sound.play('levelUp')} />}
            </div>
          </main>
        </div>
        {wizardOpen && <SetupWizard health={health} onClose={() => setWizardOpen(false)} />}
        {ask && <AskDialog ask={ask} onDone={() => setAsk(null)} />}
        <Celebrations levelUp={levelUp} toast={toast} stats={stats} motionOff={motionOff} onLevelUpDone={() => setLevelUp(null)} onToastDone={() => setToast(null)} />
      </I18nProvider>
    </ApiContext.Provider>
  )
}
