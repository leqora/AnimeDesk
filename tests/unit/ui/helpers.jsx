import { vi } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import { ApiContext } from '../../../src/renderer/api.js'
import { I18nProvider } from '../../../src/renderer/i18n/I18nContext.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'
import { ToastProvider } from '../../../src/renderer/toast/ToastProvider.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'

const sub = () => vi.fn(() => () => {})

export function makeFakeApi(overrides = {}) {
  const api = {
    settings: { get: vi.fn(async () => ({ ...DEFAULT_SETTINGS })), update: vi.fn(async (p) => ({ ...DEFAULT_SETTINGS, ...p })) },
    library: {
      list: vi.fn(async () => []), facets: vi.fn(async () => ({})), add: vi.fn(async (e) => ({ id: 'new', ...e })), update: vi.fn(async (id, p) => ({ id, ...p })),
      remove: vi.fn(async () => true), restore: vi.fn(async () => ({ ok: true, entry: {} })), setEpisodeNote: vi.fn(async () => ({})), recordWatched: vi.fn(async () => ({})), wasCorrupt: vi.fn(async () => false),
      setPinned: vi.fn(async (id, pinned) => ({ ok: true, entry: { id, pinnedAt: pinned ? 'now' : null } })),
    },
    seriesPrefs: { get: vi.fn(async () => ({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: false })), set: vi.fn(async (title, patch) => ({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, ...patch })) },
    autoDownload: { set: vi.fn(async (animeId, enabled) => ({ ok: true, enabled })) },
    anilist: { forTitle: vi.fn(async () => null), search: vi.fn(async () => []) },
    episodes: { forSeries: vi.fn(async () => null), thumb: vi.fn(async () => null), spoilers: vi.fn(async () => null) },
    positions: { forSeries: vi.fn(async () => ({})) },
    tools: { status: vi.fn(async () => ({})), installMissing: vi.fn(async () => ({})), checkUpdates: vi.fn(async () => []), onProgress: sub() },
    health: { get: vi.fn(async () => ({ light: 'green', reason: 'ok' })), recheck: vi.fn(async () => ({})), onChange: sub() },
    watch: {
      start: vi.fn(async () => ({ sessionId: 's1' })), cancel: vi.fn(async () => {}), answerMenu: vi.fn(async () => {}),
      onMenu: sub(), onAsk: sub(), onPlaying: sub(), onSessionEnd: sub(), onTitle: sub(),
    },
    downloads: {
      enqueue: vi.fn(async () => []), pause: vi.fn(), resume: vi.fn(), retryFailed: vi.fn(async () => {}), cancel: vi.fn(), queue: vi.fn(async () => []), list: vi.fn(async () => []),
      remove: vi.fn(async () => true), play: vi.fn(async () => 'none'), openFolder: vi.fn(), onChange: sub(),
    },
    stats: { get: vi.fn(async () => ({ ...EMPTY_STATS })), onLevelUp: sub(), onSeriesCompleted: sub() },
    update: {
      getState: vi.fn(async () => ({ status: 'disabled', currentVersion: '0.3.0', version: null, percent: null, notes: null, lastCheckedAt: null, error: null })),
      check: vi.fn(async () => ({ status: 'none' })), download: vi.fn(async () => true), install: vi.fn(async () => true), onState: sub(),
    },
    whatsNew: { get: vi.fn(async () => null), seen: vi.fn(async () => {}) },
    window: { getFullscreen: vi.fn(async () => false), setFullscreen: vi.fn(async () => {}), onFullscreen: sub() },
    dialog: { pickFolder: vi.fn(async () => null) },
    app: { openRepo: vi.fn(async () => {}) },
    skip: { get: vi.fn(async () => ({ op: null, ed: null, recap: null })) },
    player: {
      onOpen: sub(), onClose: sub(), onRetry: sub(), progress: vi.fn(async () => {}), closed: vi.fn(async () => {}),
      // by default the automatic recovery is already used up, so the player shows its error screen
      recover: vi.fn(async () => ({ ok: true, auto: false })), retryAgain: vi.fn(async () => {}),
    },
    notifications: { list: vi.fn(async () => ({ items: [], unread: 0 })), markRead: vi.fn(async () => ({ items: [], unread: 0 })) },
    anilistAuth: {
      status: vi.fn(async () => ({ connected: false, name: null, expiresAt: null, state: 'none' })),
      connect: vi.fn(async () => ({ ok: true, status: { connected: true, name: 'leqora', expiresAt: null, state: 'ok' } })),
      disconnect: vi.fn(async () => ({ ok: true })),
      openAuthorize: vi.fn(async () => false), openApps: vi.fn(async () => {}), onChange: sub(),
    },
    anilistSync: {
      stateFor: vi.fn(async () => ({ state: 'off' })), confirm: vi.fn(async () => ({ ok: true, entry: {} })),
      setEnabled: vi.fn(async () => true), candidates: vi.fn(async () => []), pendingConfirm: vi.fn(async () => []), onChange: sub(),
    },
    sequels: { list: vi.fn(async () => []), hide: vi.fn(async () => ({ ok: true })), unhide: vi.fn(async () => ({ ok: true })), onChanged: vi.fn(() => () => {}) },
    onNotificationsChanged: sub(),
    onOpenAnime: sub(),
    onOpenPage: sub(),
    onLibraryChanged: sub(),
    onPositionsChanged: sub(),
  }
  for (const [group, fns] of Object.entries(overrides)) Object.assign(api[group], fns)
  return api
}

export function renderUi(ui, { api = makeFakeApi(), lang = 'sr' } = {}) {
  const wrapper = ({ children }) => (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={lang}><ToastProvider>{children}</ToastProvider></I18nProvider>
    </ApiContext.Provider>
  )
  const result = render(ui, { wrapper })
  return { api, ...result }
}

export function renderHookUi(callback, { api = makeFakeApi(), lang = 'sr', initialProps } = {}) {
  const wrapper = ({ children }) => (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={lang}><ToastProvider>{children}</ToastProvider></I18nProvider>
    </ApiContext.Provider>
  )
  return { api, ...renderHook(callback, { wrapper, initialProps }) }
}

// renderUi always mounts the (empty) persistent toast live region; ignore it when asserting "renders nothing".
export const hasNoContent = (container) => container.querySelector(':scope > :not(.toast-stack)') === null
