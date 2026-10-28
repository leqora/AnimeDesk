import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApiContext } from './api.js'
import { I18nProvider, useT } from './i18n/I18nContext.jsx'
import { TopBar } from './components/TopBar.jsx'
import { ProfilePage } from './pages/ProfilePage.jsx'
import { EMPTY_STATS } from '../shared/stats.js'
import { AskDialog } from './components/AskDialog.jsx'
import { SetupWizard } from './pages/SetupWizard.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { WatchlistPage } from './pages/WatchlistPage.jsx'
import { DiscoverPage } from './pages/DiscoverPage.jsx'
import { SchedulePage } from './pages/SchedulePage.jsx'
import { DownloadsPage } from './pages/DownloadsPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'
import { LevelUpOverlay } from './components/LevelUpOverlay.jsx'
import { ToastProvider, useToast } from './toast/ToastProvider.jsx'
import { ExternalPlayerBar } from './components/ExternalPlayerBar.jsx'
import { UpdateBanner } from './components/UpdateBanner.jsx'
import { WhatsNewDialog } from './components/WhatsNewDialog.jsx'
import { loadPlayer } from './player/loadPlayer.js'
import { PlayerReconnecting } from './components/PlayerReconnecting.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { nextEpisodeNumber } from '../shared/player.js'
import { normalizeTitle } from '../shared/domain.js'
import { returnTarget } from './nav/returnTarget.js'
import { createSound } from './sound.js'
import { useNavigation, RouteStateContext } from './nav/useNavigation.js'
import { CommandPalette } from './components/CommandPalette.jsx'
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

// Rendered next to PlayerView inside Suspense: its effects only run once the player really mounted.
function MountSignal({ mounted }) {
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [mounted])
  return null
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

// Ctrl/Cmd+K toggles the command palette. Works while typing; not over the player or another dialog.
function PaletteShortcut({ open, disabled, onToggle }) {
  const latest = useRef({})
  latest.current = { open, disabled, onToggle }
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.code !== 'KeyK' && e.key !== 'k' && e.key !== 'K')) return
      const { open, disabled, onToggle } = latest.current
      if (open) { e.preventDefault(); onToggle(false); return }
      if (disabled || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      onToggle(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
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

// AniList asked us to slow down: say so, so the empty posters make sense. Only while the user can see it.
function RateLimitNotice({ api, overlay }) {
  const t = useT()
  const { show } = useToast()
  const latest = useRef({})
  latest.current = { t, show, overlay }
  useEffect(() => api.anilist.onRateLimited(({ seconds, until }) => {
    if (document.visibilityState === 'hidden' || Date.now() > until || latest.current.overlay) return
    const { t, show } = latest.current
    show({ message: t('toast.anilistRateLimited', { seconds }), icon: 'alert' })
  }), [api])
  return null
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
  const shellRef = useRef(null)
  // the top bar turns see-through only while the page is scrolled to its very top
  const [atTop, setAtTop] = useState(true)
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
  // bumped after an import so SettingsPage (which keeps local copies of some settings) remounts with the new values
  const [settingsKey, setSettingsKey] = useState(0)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // one-shot: after the palette has unmounted (so Modal's opener restore is done) focus goes to the page
  const [focusMain, setFocusMain] = useState(false)
  useEffect(() => {
    if (!focusMain || paletteOpen) return
    // a toast that took focus on purpose (the "Poništi" button after a removal) keeps it
    if (!document.activeElement?.closest?.('.toast-stack')) mainRef.current?.focus()
    setFocusMain(false)
  }, [focusMain, paletteOpen])
  // FIFO: an ask for episode N must survive the ask for N+1 (askOnClose + autoNext)
  const [asks, setAsks] = useState([])
  const [pendingWatch, setPendingWatch] = useState(null)
  const [pendingSearch, setPendingSearch] = useState(null)
  const [corrupt, setCorrupt] = useState(false)
  // one-shot: after an import remounts Settings, focus goes to its import button; dropped when leaving Settings
  const [focusImport, setFocusImport] = useState(false)
  useEffect(() => { if (page !== 'settings') setFocusImport(false) }, [page])
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
  // the top bar shows over the player only together with the player controls (idle = controls hidden)
  const [playerIdle, setPlayerIdle] = useState(false)
  const [barActive, setBarActive] = useState(false)
  // true for one commit when a player opens, so top bar menus that were open close
  const [playerOpening, setPlayerOpening] = useState(false)
  useEffect(() => { if (playerOpening) setPlayerOpening(false) }, [playerOpening])
  // barActive is not reset here: TopBar owns hover/focus/menus and reports changes only, so a cursor resting on the bar
  // must keep the bar visible when the next episode opens
  useEffect(() => { if (!player) setPlayerIdle(false) }, [player])
  // true while PlayerView itself is mounted (not its loading fallback, not the crash screen)
  const playerMounted = useRef(false)
  // top bar actions during playback: the episode is closed first ('nav'), then the remembered action runs
  const [closeRequest, setCloseRequest] = useState(null)
  const afterPlayerClose = useRef(null)
  // Where the current episode was started from (a route), so "Back" from the player returns there; null = nowhere to return.
  const originRef = useRef(null)
  const [reopenSearch, setReopenSearch] = useState(null) // { series, seq }: Search restarts the episode list of that series
  const playerOpenedRef = useRef(false) // a player opened since the last fresh start
  const playedSessions = useRef(new Set()) // sessions that reached playback (their late end is not a failed start)
  const [bootFailed, setBootFailed] = useState(false)

  // Alt+Left/Right and the mouse back/forward buttons walk the history; not while the player or a modal is up.
  const navKeys = useRef({})
  navKeys.current = { back: nav.back, forward: nav.forward, blocked: player != null || reconnecting != null }
  // the palette must not stay open over the player / reconnecting overlay (no focus move to main here)
  const overlayOpen = player != null || reconnecting != null
  useEffect(() => { if (overlayOpen) setPaletteOpen(false) }, [overlayOpen])
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
      setPaletteOpen(false) // unmount the palette Modal in the same commit, before the player takes focus
      setPlayerIdle(false)
      setPlayerOpening(true)
      afterPlayerClose.current = null
      playerOpenedRef.current = true
      setCloseRequest(null)
      setPlayer(p)
    }
    const offs = [
      api.player.onOpen(onOpen),
      api.player.onClose(() => setPlayer(null)),
      api.player.onRetry(setReconnecting),
    ]
    return () => offs.forEach((off) => off())
  }, [api])

  // A start that ends without ever playing (error, cancelled menu) leaves the user on Home: forget where it came from.
  // Mpv playback has no in-app player to come back from, so it forgets the origin too.
  useEffect(() => {
    const offs = [
      api.watch.onPlaying((p) => {
        if (p?.sessionId) playedSessions.current.add(p.sessionId)
        if (settingsRef.current?.playerMode === 'external') originRef.current = null
      }),
      api.watch.onSessionEnd(({ sessionId, retry }) => {
        if (retry || playedSessions.current.delete(sessionId) || playerOpenedRef.current) return
        originRef.current = null
      }),
    ]
    return () => offs.forEach((off) => off?.())
  }, [api])

  // ids of library series, so the notification panel can disable entries whose series was removed
  const [libraryIds, setLibraryIds] = useState(() => new Set())
  useEffect(() => {
    let alive = true
    const refresh = () => api.library.list().then((l) => { if (alive) setLibraryIds(new Set((l ?? []).map((e) => e.id))) }, () => {})
    refresh()
    const off = api.onLibraryChanged(refresh)
    return () => { alive = false; off?.() }
  }, [api])

  // main asks to show a series (notification click) or a page (tray menu)
  const openRef = useRef({})
  useEffect(() => {
    const offs = [
      api.onOpenAnime(({ animeId }) => openRef.current.anime(animeId)),
      api.onOpenPage(({ page }) => openRef.current.page(page)),
    ]
    return () => offs.forEach((off) => off?.())
  }, [api])

  useEffect(() => { if (health.reason === 'missing-tools') setWizardOpen(true) }, [health.reason])

  // The top bar sits over the scrolling page, so it must stop short of the page's scrollbar.
  const booted = settings != null
  useEffect(() => {
    if (!booted) return undefined
    const measure = () => {
      const main = mainRef.current
      shellRef.current?.style.setProperty('--scrollbar-w', `${main ? Math.max(0, main.offsetWidth - main.clientWidth) : 0}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [booted])

  if (!settings) return bootFailed ? <BootError onRetry={loadSettings} /> : null
  settingsRef.current = settings
  const ready = health.light === 'green'
  const updateSettings = async (patch) => setSettings(await api.settings.update(patch))
  const onImported = (next) => {
    setSettings(next)
    setSettingsKey((k) => k + 1)
    setCorrupt(false)
    setFocusImport(true)
    api.stats.get().then(setStats).catch((err) => console.warn('stats refresh after import failed', err?.message))
  }
  const navigate = (p) => { if (p !== page) sound.play('navigate'); nav.navigate({ page: p, animeId: null }) }
  const openAnime = (id) => nav.navigate({ page: 'watchlist', animeId: id })
  openRef.current = { anime: openAnime, page: navigate }
  const closeDetail = () => (nav.canBack ? nav.back() : nav.navigate({ page: 'watchlist', animeId: null }))
  // a removed series has no detail to come back to: step back, or swap the entry in place when there is no history
  const onRemoved = () => { if (nav.canBack) nav.back(); else nav.replace({ page: 'watchlist', animeId: null }); setFocusMain(true) }
  // chain = the next/previous episode of a playback that is already going: it keeps the origin of the first start
  const continueWatching = (params, { chain = false } = {}) => {
    if (!chain) originRef.current = nav.route
    playerOpenedRef.current = false
    setPendingWatch(params)
    nav.navigate({ page: 'home', animeId: null })
  }
  // Search picked an episode from its list: remember the series so "Back" from the player can reopen that list
  const onEpisodePicked = (title) => { originRef.current = { page: 'home', animeId: null, search: title }; playerOpenedRef.current = false }
  // "Back" from the player: to where the episode was started (or, by setting, to the series' episode list)
  const returnFromPlayer = async (title) => {
    const origin = originRef.current
    originRef.current = null
    const mode = settingsRef.current?.returnAfterEpisode ?? 'origin'
    let libraryEntryId = null
    if (mode === 'episodes') {
      const key = normalizeTitle(String(title ?? '')).toLowerCase()
      try { libraryEntryId = ((await api.library.list()) ?? []).find((e) => normalizeTitle(e.aniCliTitle ?? e.title).toLowerCase() === key)?.id ?? null } catch (err) { console.warn('return to episodes: library read failed', err?.message) }
    }
    const target = returnTarget({ origin, behind: nav.behind, mode, libraryEntryId })
    if (target.kind === 'back') { nav.back(); if (target.tab) nav.setRouteState('tab', target.tab) }
    else if (target.kind === 'navigate') {
      nav.navigate(target.route)
      if (target.tab) nav.setRouteState('tab', target.tab)
    } else if (target.kind === 'search') {
      // the episode list was the menu of a live session that ended with the playback: ask Search for a fresh one
      nav.navigate({ page: 'home', animeId: null })
      setReopenSearch((r) => ({ series: target.series, seq: (r?.seq ?? 0) + 1 }))
    }
    setFocusMain(true)
  }
  // Search from anywhere (sequel/recommendation cards, the detail's "Similar"): fills Home's search box and runs it.
  const searchAnime = (query) => { setPendingSearch({ query }); nav.navigate({ page: 'home', animeId: null }) }
  const openWhatsNew = () => setWhatsNew({ mode: 'before', version: updateState.version, notes: updateState.notes })
  const closeWhatsNew = () => { if (whatsNew?.mode === 'after') api.whatsNew.seen(); setWhatsNew(null) }

  const overlay = player != null || reconnecting != null
  // The player never got going (still loading, or crashed): main still waits for this playback, so tell it and drop the player.
  const dropPlayer = () => {
    if (player == null) return
    api.player.closed({ playbackId: player.playbackId, position: null, duration: null, maxPercent: 0, reason: 'back' })
    setPlayer(null)
    setCloseRequest(null)
    setPlayerAttempt((n) => n + 1)
  }
  const leavePlayerThen = (action) => {
    if (player == null) { action(); return }
    if (!playerMounted.current) { // no PlayerView to answer a close request: run the action right away
      afterPlayerClose.current = null
      originRef.current = null
      dropPlayer()
      action()
      return
    }
    afterPlayerClose.current = action
    setCloseRequest((r) => ({ seq: (r?.seq ?? 0) + 1 }))
  }
  const barHidden = overlay && (reconnecting != null || fullscreen || (playerIdle && !barActive))
  const runPalette = (a) => {
    setPaletteOpen(false)
    if (a.type === 'anime') openAnime(a.id)
    else if (a.type === 'page') navigate(a.page)
    else if (a.type === 'search') searchAnime(a.query)
    else if (a.type === 'fullscreen') api.window.setFullscreen(!fullscreen)
    else if (a.type === 'wizard') setWizardOpen(true)
    if (a.type === 'anime' || a.type === 'page' || a.type === 'search') setFocusMain(true)
  }

  return (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={settings.language}>
        <ToastProvider hold={Boolean(levelUp) && !motionOff}>
        <UndoShortcut disabled={overlay} />
        <PaletteShortcut open={paletteOpen} disabled={overlay} onToggle={setPaletteOpen} />
        <div className={player ? 'app-shell app-shell--playing' : 'app-shell'} ref={shellRef} data-at-top={atTop ? 'true' : 'false'}>
          <TopBar
            page={page}
            onNavigate={(p, o) => leavePlayerThen(() => { navigate(p); if (o?.focusMain || player != null) setFocusMain(true) })}
            health={health}
            onSemaphoreClick={() => leavePlayerThen(() => setWizardOpen(true))}
            profileName={settings.profileName || settings.systemName}
            stats={stats}
            version={updateState.currentVersion}
            onOpenAnime={(id) => leavePlayerThen(() => openAnime(id))}
            libraryIds={libraryIds}
            closeMenus={playerOpening || reconnecting != null || barHidden}
            hidden={barHidden}
            onActiveChange={setBarActive}
            fullscreen={fullscreen}
            onToggleFullscreen={() => api.window.setFullscreen(!fullscreen)}
            onOpenPalette={() => leavePlayerThen(() => setPaletteOpen(true))}
          />
          <main className="content" ref={mainRef} tabIndex={-1} inert={overlay} aria-hidden={overlay ? 'true' : undefined} onScroll={(e) => setAtTop(e.currentTarget.scrollTop === 0)}>
            <div className="content__notices">
              <ExternalPlayerBar onGone={() => setFocusMain(true)} />
              <UpdateBanner state={updateState} onWhatsNew={openWhatsNew} />
              {corrupt && <CorruptBanner />}
            </div>
            <div key={`${page}:${animeId ?? ''}`} className="page-enter">
              <ErrorBoundary>
                <RouteStateContext.Provider value={{ state: nav.entry.state, set: nav.setRouteState }}>
                {page === 'home' && (
                  <HomePage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} onContinue={continueWatching} onOpenAnime={openAnime} pendingSearch={pendingSearch} onPendingSearchHandled={() => setPendingSearch(null)} onSearch={searchAnime} onEpisodePicked={onEpisodePicked} reopenSearch={reopenSearch} onReopenHandled={() => setReopenSearch(null)} />
                )}
                {page === 'watchlist' && <WatchlistPage ready={ready} onContinue={continueWatching} animeId={animeId} onOpen={openAnime} onBack={closeDetail} onRemoved={onRemoved} onSearch={searchAnime} playerOpen={overlay} />}
                {page === 'discover' && <DiscoverPage ready={ready} onOpenAnime={openAnime} onSearch={searchAnime} />}
                {page === 'schedule' && <SchedulePage ready={ready} onOpenAnime={openAnime} onSearch={searchAnime} />}
                {page === 'downloads' && <DownloadsPage />}
                {page === 'profile' && <ProfilePage stats={stats} name={settings.profileName || settings.systemName} lang={settings.language} />}
                {page === 'settings' && <SettingsPage key={settingsKey} focusImport={focusImport} settings={settings} onSettings={updateSettings} onImported={onImported} onTestSound={() => sound.play('levelUp')} updateState={updateState} />}
                </RouteStateContext.Provider>
              </ErrorBoundary>
            </div>
          </main>
        </div>
        {player && (
          <ErrorBoundary key={player.playbackId} className="error-fallback--overlay" actionLabelKey="error.close" onAction={() => {
            // main still waits for this playback to end (session, held celebrations); null keeps the last reported position
            const title = player.title
            dropPlayer()
            returnFromPlayer(title) // same as Back
          }}>
            <Suspense fallback={<PlayerFallback />}>
            <PlayerView
              key={player.playbackId} // PlayerView's per-playback refs/state rely on a remount per playback
              open={player} settings={settings} fullscreen={fullscreen} onSettings={updateSettings}
              initialRate={playerRate} onIdleChange={setPlayerIdle} holdControls={barActive} closeRequest={closeRequest} onRate={(rate) => { if (lastRate.current) lastRate.current.rate = rate }}
              onClose={(reason) => {
                setPlayer(null)
                setCloseRequest(null)
                const afterClose = afterPlayerClose.current
                afterPlayerClose.current = null
                if (reason === 'nav') { originRef.current = null; afterClose?.() } // top bar action; it goes to the chosen page, never back to an origin
                else if (reason === 'next' || reason === 'prev') {
                  if (player.episode != null) continueWatching({ query: player.title, anime: player.title, episode: String(nextEpisodeNumber(player.episode, reason === 'next' ? 1 : -1)) }, { chain: true })
                  else originRef.current = null // nothing follows, so there is nothing to come back from either
                } else if (reason === 'external') originRef.current = null // playback continues in mpv; nothing to come back from
                else returnFromPlayer(player.title)
              }}
            />
              <MountSignal mounted={playerMounted} />
            </Suspense>
          </ErrorBoundary>
        )}
        {!player && reconnecting && (
          <PlayerReconnecting
            state={reconnecting.state} title={reconnecting.title} episode={reconnecting.episode} error={reconnecting.error}
            onRetry={() => api.player.retryAgain()}
            onBack={() => { if (reconnecting.state === 'reconnecting' && reconnecting.sessionId) api.watch.cancel(reconnecting.sessionId); originRef.current = null; setReconnecting(null) }}
          />
        )}
        {paletteOpen && <CommandPalette fullscreen={fullscreen} onRun={runPalette} onClose={() => setPaletteOpen(false)} />}
        {wizardOpen && <SetupWizard health={health} onClose={() => setWizardOpen(false)} />}
        {asks.length > 0 && <AskDialog ask={asks[0]} onDone={() => setAsks((q) => q.slice(1))} />}
        <Celebrations levelUp={levelUp} toast={toast} stats={stats} motionOff={motionOff} onLevelUpDone={() => setLevelUp(null)} onToastDone={() => setToast(null)} />
        <RateLimitNotice api={api} overlay={overlay} />
        {whatsNew && <WhatsNewDialog mode={whatsNew.mode} version={whatsNew.version} notes={whatsNew.notes} status={updateState.status} onClose={closeWhatsNew} />}
        </ToastProvider>
      </I18nProvider>
    </ApiContext.Provider>
  )
}
