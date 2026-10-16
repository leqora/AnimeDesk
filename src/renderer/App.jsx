import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
import { ToastProvider, useToast } from './toast/ToastProvider.jsx'
import { UpdateBanner } from './components/UpdateBanner.jsx'
import { WhatsNewDialog } from './components/WhatsNewDialog.jsx'
import { loadPlayer } from './player/loadPlayer.js'
import { PlayerReconnecting } from './components/PlayerReconnecting.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { nextEpisodeNumber } from '../shared/player.js'
import { createSound } from './sound.js'
import { useNavigation, RouteStateContext } from './nav/useNavigation.js'
import { restoreScroll } from './nav/restoreScroll.js'

function CorruptBanner() {
  const t = useT()
  return <div className="notice notice--warn" role="status">{t('library.corrupt')}</div>
}

const PRELOAD_FALLBACK_MS = 3000

function PlayerFallback() {
  const t = useT()
  return (
    <div className="player">
      <div className="player__loading" role="status" aria-label={t('player.loading')}>
        <span className="player__spinner" aria-hidden="true" />
      </div>
    </div>
  )
}

// Ctrl/Cmd+Z runs the newest "Undo" toast. Not while typing, over a dialog, or under the player.
function UndoShortcut({ disabled }) {
  const { runLatestAction } = useToast()
  const off = useRef(disabled)
  off.current = disabled
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key.toLowerCase() !== 'z' && e.code !== 'KeyZ')) return
      if (off.current || e.target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]')) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (runLatestAction()) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runLatestAction])
  return null
}

function BootText({ k }) {
  const t = useT()
  return t(k)
}

// Settings (and so the language) are unknown here, so the message is shown in both languages.
function BootError({ onRetry }) {
  const both = (k) => <><I18nProvider lang="sr"><BootText k={k} /></I18nProvider> / <I18nProvider lang="en"><BootText k={k} /></I18nProvider></>
  return (
    <div className="boot-error glass" role="alert">
      <p>{both('boot.failed')}</p>
      <button type="button" className="primary" onClick={onRetry}>{both('boot.retry')}</button>
    </div>
  )
}

const SILENT = { soundKey: false, soundUi: false, soundVolume: 0 }

function Celebrations({ levelUp, toast, stats, motionOff, onLevelUpDone, onToastDone }) {
  const t = useT()
  const { show } = useToast()
  // latest values for the effects below, so they re-run only when the celebration state changes
  const latest = useRef({})
  latest.current = { t, onLevelUpDone, onToastDone }
  // With animations off the level-up becomes a queued toast; hand it over once and clear the state.
  useEffect(() => {
    if (!levelUp || !motionOff) return
    const { t, onLevelUpDone } = latest.current
    show({ message: t('toast.levelUp', { level: levelUp.level, title: t(`title.${levelUp.title}`) }), icon: 'flame' })
    onLevelUpDone()
  }, [levelUp, motionOff, show])
  useEffect(() => {
    if (!toast) return
    const { t, onToastDone } = latest.current
    show({ message: t('toast.completed', { title: toast.title, xp: toast.xp }) })
    onToastDone()
  }, [toast, show])
  return levelUp && !motionOff
    ? <LevelUpOverlay level={levelUp.level} title={levelUp.title} xpIntoLevel={stats.xpIntoLevel} xpForNext={stats.xpForNext} onDone={onLevelUpDone} />
    : null
}

export default function App({ api, sound: injectedSound }) {
  const settingsRef = useRef(null)
  const sound = useMemo(() => injectedSound ?? createSound({ getSettings: () => settingsRef.current ?? SILENT }), [injectedSound])
  const doneIds = useRef(new Set())
  const [levelUp, setLevelUp] = useState(null)
  const [toast, setToast] = useState(null)
  const [settings, setSettings] = useState(null)
  const [health, setHealth] = useState({ light: 'yellow', reason: 'checking' })
  const mainRef = useRef(null)
  const cancelScroll = useRef(() => {})
  // target of a restore still waiting for content; until it ends, scrollTop is not the real position
  const pendingY = useRef(null)
  useEffect(() => () => cancelScroll.current(), [])
  const nav = useNavigation({
    getScroll: () => pendingY.current ?? mainRef.current?.scrollTop ?? 0,
    onArrive: (entry, kind) => {
      cancelScroll.current()
      const main = mainRef.current
      if (!main) return
      if (kind === 'back' || kind === 'forward') {
        pendingY.current = entry.scroll
        cancelScroll.current = restoreScroll(main, entry.scroll, { onDone: () => { pendingY.current = null } })
      }
      else main.scrollTop = 0
    },
  })
  const { page, animeId } = nav.route
  const [stats, setStats] = useState(EMPTY_STATS)
  const [wizardOpen, setWizardOpen] = useState(false)
  // FIFO: an ask for episode N must survive the ask for N+1 (askOnClose + autoNext)
  const [asks, setAsks] = useState([])
  const [pendingWatch, setPendingWatch] = useState(null)
  const [corrupt, setCorrupt] = useState(false)
  const [updateState, setUpdateState] = useState({ status: 'idle', currentVersion: '' })
  const [whatsNew, setWhatsNew] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [player, setPlayer] = useState(null)
  // React.lazy remembers a failed load, so a new lazy component is made after the error screen is closed.
  const [playerAttempt, setPlayerAttempt] = useState(0)
  const PlayerView = useMemo(() => lazy(() => loadPlayer().then((m) => ({ default: m.PlayerView }))), [playerAttempt])
  useEffect(() => {
    // load the player while the app is idle, so the first episode does not wait for it
    const preload = () => { loadPlayer().catch(() => {}) }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 5000 })
      return () => window.cancelIdleCallback?.(id)
    }
    const id = setTimeout(preload, PRELOAD_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [])
  const [reconnecting, setReconnecting] = useState(null)
  const [bootFailed, setBootFailed] = useState(false)

  // Alt+Left/Right and the mouse back/forward buttons walk the history; not while the player or a modal is up.
  const navKeys = useRef({})
  navKeys.current = { back: nav.back, forward: nav.forward, blocked: player != null || reconnecting != null }
  useEffect(() => {
    const blocked = () => navKeys.current.blocked || document.querySelector('[aria-modal="true"]') != null
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      if (blocked()) return
      e.preventDefault()
      if (e.key === 'ArrowLeft') navKeys.current.back()
      else navKeys.current.forward()
    }
    const onDown = (e) => { if (e.button === 3 || e.button === 4) e.preventDefault() }
    const onUp = (e) => {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      if (blocked()) return
      if (e.button === 3) navKeys.current.back()
      else navKeys.current.forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const loadSettings = () => api.settings.get().then(
    (s) => { setBootFailed(false); setSettings(s) },
    (err) => { console.error('settings.get failed', err); setBootFailed(true) },
  )

  useEffect(() => {
    loadSettings()
    api.health.get().then(setHealth)
    api.library.wasCorrupt().then(setCorrupt)
    const offs = [api.health.onChange(setHealth), api.watch.onAsk((a) => setAsks((q) => [...q, a]))]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => {
    api.update.getState().then(setUpdateState)
    api.whatsNew.get().then((w) => { if (w) setWhatsNew({ mode: 'after', ...w }) })
    return api.update.onState(setUpdateState)
  }, [api])

  // Library changes are pushed; the profile also depends on AniList info and the date, so refresh on opening it.
  const onProfile = page === 'profile'
  useEffect(() => {
    const refresh = () => api.stats.get().then(setStats)
    refresh()
    return api.onLibraryChanged(refresh)
  }, [api, onProfile])

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

  // A stall recovery reopens the same episode as a new playback; it keeps the speed, any other open starts at 1×.
  const reconnectingRef = useRef(reconnecting)
  reconnectingRef.current = reconnecting
  const lastRate = useRef(null) // { title, episode, rate } of the current playback
  const [playerRate, setPlayerRate] = useState(1)
  useEffect(() => {
    const sameEpisode = (a, b) => a != null && b != null && a.title === b.title && String(a.episode) === String(b.episode)
    const onOpen = (p) => {
      const r = reconnectingRef.current
      const recovered = r?.state === 'reconnecting' && sameEpisode(r, p) && sameEpisode(lastRate.current, p)
      const rate = recovered ? lastRate.current.rate : 1
      lastRate.current = { title: p.title, episode: p.episode, rate }
      setPlayerRate(rate)
      setReconnecting(null)
      setPlayer(p)
    }
    const offs = [
      api.player.onOpen(onOpen),
      api.player.onClose(() => setPlayer(null)),
      api.player.onRetry(setReconnecting),
    ]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => { if (health.reason === 'missing-tools') setWizardOpen(true) }, [health.reason])

  if (!settings) return bootFailed ? <BootError onRetry={loadSettings} /> : null
  settingsRef.current = settings
  const ready = health.light === 'green'
  const updateSettings = async (patch) => setSettings(await api.settings.update(patch))
  const navigate = (p) => { if (p !== page) sound.play('navigate'); nav.navigate({ page: p, animeId: null }) }
  const openAnime = (id) => nav.navigate({ page: 'watchlist', animeId: id })
  const closeDetail = () => (nav.canBack ? nav.back() : nav.navigate({ page: 'watchlist', animeId: null }))
  // a removed series has no detail to come back to: step back, or swap the entry in place when there is no history
  const onRemoved = () => (nav.canBack ? nav.back() : nav.replace({ page: 'watchlist', animeId: null }))
  const continueWatching = (params) => { setPendingWatch(params); nav.navigate({ page: 'home', animeId: null }) }
  const openWhatsNew = () => setWhatsNew({ mode: 'before', version: updateState.version, notes: updateState.notes })
  const closeWhatsNew = () => { if (whatsNew?.mode === 'after') api.whatsNew.seen(); setWhatsNew(null) }

  const overlay = player != null || reconnecting != null

  return (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={settings.language}>
        <ToastProvider hold={Boolean(levelUp) && !motionOff}>
        <UndoShortcut disabled={overlay} />
        <div className="app-shell" inert={overlay} aria-hidden={overlay ? 'true' : undefined}>
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
          <main className="content" ref={mainRef} tabIndex={-1}>
            <UpdateBanner state={updateState} onWhatsNew={openWhatsNew} />
            <div key={`${page}:${animeId ?? ''}`} className="page-enter">
              <ErrorBoundary>
                <RouteStateContext.Provider value={{ state: nav.entry.state, set: nav.setRouteState }}>
                {corrupt && <CorruptBanner />}
                {page === 'home' && (
                  <HomePage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} onContinue={continueWatching} onOpenAnime={openAnime} />
                )}
                {page === 'watchlist' && <WatchlistPage ready={ready} onContinue={continueWatching} animeId={animeId} onOpen={openAnime} onBack={closeDetail} onRemoved={onRemoved} />}
                {page === 'downloads' && <DownloadsPage />}
                {page === 'profile' && <ProfilePage stats={stats} name={settings.profileName || settings.systemName} lang={settings.language} />}
                {page === 'settings' && <SettingsPage settings={settings} onSettings={updateSettings} onTestSound={() => sound.play('levelUp')} updateState={updateState} />}
                </RouteStateContext.Provider>
              </ErrorBoundary>
            </div>
          </main>
        </div>
        {player && (
          <ErrorBoundary key={player.playbackId} className="error-fallback--overlay" actionLabelKey="error.close" onAction={() => {
            // main still waits for this playback to end (session, held celebrations); null keeps the last reported position
            api.player.closed({ playbackId: player.playbackId, position: null, duration: null, maxPercent: 0, reason: 'back' })
            setPlayer(null)
            setPlayerAttempt((n) => n + 1)
          }}>
            <Suspense fallback={<PlayerFallback />}>
            <PlayerView
              key={player.playbackId} // PlayerView's per-playback refs/state rely on a remount per playback
              open={player} settings={settings} fullscreen={fullscreen} onSettings={updateSettings}
              initialRate={playerRate} onRate={(rate) => { if (lastRate.current) lastRate.current.rate = rate }}
              onClose={(reason) => {
                setPlayer(null)
                if ((reason === 'next' || reason === 'prev') && player.episode != null) {
                  continueWatching({ query: player.title, anime: player.title, episode: String(nextEpisodeNumber(player.episode, reason === 'next' ? 1 : -1)) })
                }
              }}
            />
            </Suspense>
          </ErrorBoundary>
        )}
        {!player && reconnecting && (
          <PlayerReconnecting
            state={reconnecting.state} title={reconnecting.title} episode={reconnecting.episode} error={reconnecting.error}
            onRetry={() => api.player.retryAgain()}
            onBack={() => { if (reconnecting.state === 'reconnecting' && reconnecting.sessionId) api.watch.cancel(reconnecting.sessionId); setReconnecting(null) }}
          />
        )}
        {wizardOpen && <SetupWizard health={health} onClose={() => setWizardOpen(false)} />}
        {asks.length > 0 && <AskDialog ask={asks[0]} onDone={() => setAsks((q) => q.slice(1))} />}
        <Celebrations levelUp={levelUp} toast={toast} stats={stats} motionOff={motionOff} onLevelUpDone={() => setLevelUp(null)} onToastDone={() => setToast(null)} />
        {whatsNew && <WhatsNewDialog mode={whatsNew.mode} version={whatsNew.version} notes={whatsNew.notes} status={updateState.status} onClose={closeWhatsNew} />}
        </ToastProvider>
      </I18nProvider>
    </ApiContext.Provider>
  )
}
