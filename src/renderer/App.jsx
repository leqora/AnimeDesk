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
import { UpdateBanner } from './components/UpdateBanner.jsx'
import { WhatsNewDialog } from './components/WhatsNewDialog.jsx'
import { PlayerView } from './components/PlayerView.jsx'
import { nextEpisodeNumber } from '../shared/player.js'
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
  const [updateState, setUpdateState] = useState({ status: 'idle', currentVersion: '' })
  const [whatsNew, setWhatsNew] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [player, setPlayer] = useState(null)

  useEffect(() => {
    api.settings.get().then(setSettings)
    api.health.get().then(setHealth)
    api.library.wasCorrupt().then(setCorrupt)
    const offs = [api.health.onChange(setHealth), api.watch.onAsk(setAsk)]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => {
    api.update.getState().then(setUpdateState)
    api.whatsNew.get().then((w) => { if (w) setWhatsNew({ mode: 'after', ...w }) })
    return api.update.onState(setUpdateState)
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

  useEffect(() => {
    api.window.getFullscreen().then(setFullscreen)
    return api.window.onFullscreen(setFullscreen)
  }, [api])
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen
  useEffect(() => {
    // Dialogs close on Esc too (and mark it with preventDefault); leave fullscreen only when no dialog handled it.
    // Registered once so its order relative to dialog listeners never changes.
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && fullscreenRef.current && !document.querySelector('[role="dialog"]')) api.window.setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api])

  useEffect(() => {
    const offs = [api.player.onOpen(setPlayer), api.player.onClose(() => setPlayer(null))]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => { if (health.reason === 'missing-tools') setWizardOpen(true) }, [health.reason])

  if (!settings) return null
  settingsRef.current = settings
  const ready = health.light === 'green'
  const updateSettings = async (patch) => setSettings(await api.settings.update(patch))
  const navigate = (p) => { if (p !== page) sound.play('navigate'); setOpenAnimeId(null); setPage(p) }
  const openAnime = (id) => { setOpenAnimeId(id); setPage('watchlist') }
  const continueWatching = (params) => { setPendingWatch(params); setPage('home') }
  const openWhatsNew = () => setWhatsNew({ mode: 'before', version: updateState.version, notes: updateState.notes })
  const closeWhatsNew = () => { if (whatsNew?.mode === 'after') api.whatsNew.seen(); setWhatsNew(null) }

  return (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={settings.language}>
        <div className="app-shell" inert={player != null} aria-hidden={player ? 'true' : undefined}>
          <Sidebar
            page={page}
            onNavigate={navigate}
            health={health}
            onSemaphoreClick={() => setWizardOpen(true)}
            profileName={settings.profileName || settings.systemName}
            stats={stats}
            version={updateState.currentVersion}
            fullscreen={fullscreen}
            onToggleFullscreen={() => api.window.setFullscreen(!fullscreen)}
          />
          <main className="content">
            <UpdateBanner state={updateState} onWhatsNew={openWhatsNew} />
            <div key={page} className="page-enter">
              {corrupt && <CorruptBanner />}
              {page === 'home' && (
                <HomePage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} onContinue={continueWatching} onOpenAnime={openAnime} />
              )}
              {page === 'watchlist' && <WatchlistPage ready={ready} onContinue={continueWatching} initialOpenId={openAnimeId} />}
              {page === 'downloads' && <DownloadsPage />}
              {page === 'profile' && <ProfilePage stats={stats} name={settings.profileName || settings.systemName} lang={settings.language} />}
              {page === 'settings' && <SettingsPage settings={settings} onSettings={updateSettings} onTestSound={() => sound.play('levelUp')} updateState={updateState} />}
            </div>
          </main>
        </div>
        {player && (
          <PlayerView
            key={player.playbackId} // PlayerView's per-playback refs/state rely on a remount per playback
            open={player} settings={settings} fullscreen={fullscreen} onSettings={updateSettings}
            onClose={(reason) => {
              setPlayer(null)
              if ((reason === 'next' || reason === 'prev') && player.episode != null) {
                continueWatching({ query: player.title, anime: player.title, episode: String(nextEpisodeNumber(player.episode, reason === 'next' ? 1 : -1)) })
              }
            }}
          />
        )}
        {wizardOpen && <SetupWizard health={health} onClose={() => setWizardOpen(false)} />}
        {ask && <AskDialog ask={ask} onDone={() => setAsk(null)} />}
        <Celebrations levelUp={levelUp} toast={toast} stats={stats} motionOff={motionOff} onLevelUpDone={() => setLevelUp(null)} onToastDone={() => setToast(null)} />
        {whatsNew && <WhatsNewDialog mode={whatsNew.mode} version={whatsNew.version} notes={whatsNew.notes} status={updateState.status} onClose={closeWhatsNew} />}
      </I18nProvider>
    </ApiContext.Provider>
  )
}
