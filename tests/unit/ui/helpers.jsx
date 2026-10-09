import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { ApiContext } from '../../../src/renderer/api.js'
import { I18nProvider } from '../../../src/renderer/i18n/I18nContext.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'
import { EMPTY_STATS } from '../../../src/shared/stats.js'

const sub = () => vi.fn(() => () => {})

export function makeFakeApi(overrides = {}) {
  const api = {
    settings: { get: vi.fn(async () => ({ ...DEFAULT_SETTINGS })), update: vi.fn(async (p) => ({ ...DEFAULT_SETTINGS, ...p })) },
    library: {
      list: vi.fn(async () => []), add: vi.fn(async (e) => ({ id: 'new', ...e })), update: vi.fn(async (id, p) => ({ id, ...p })),
      remove: vi.fn(async () => true), setEpisodeNote: vi.fn(async () => ({})), recordWatched: vi.fn(async () => ({})), wasCorrupt: vi.fn(async () => false),
      setPinned: vi.fn(async (id, pinned) => ({ ok: true, entry: { id, pinnedAt: pinned ? 'now' : null } })),
    },
    seriesPrefs: { get: vi.fn(async () => ({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 } })), set: vi.fn(async (title, patch) => ({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, ...patch })) },
    anilist: { forTitle: vi.fn(async () => null), search: vi.fn(async () => []) },
    tools: { status: vi.fn(async () => ({})), installMissing: vi.fn(async () => ({})), checkUpdates: vi.fn(async () => []), onProgress: sub() },
    health: { get: vi.fn(async () => ({ light: 'green', reason: 'ok' })), recheck: vi.fn(async () => ({})), onChange: sub() },
    watch: {
      start: vi.fn(async () => ({ sessionId: 's1' })), cancel: vi.fn(async () => {}), answerMenu: vi.fn(async () => {}),
      onMenu: sub(), onAsk: sub(), onPlaying: sub(), onSessionEnd: sub(),
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
    onLibraryChanged: sub(),
  }
  for (const [group, fns] of Object.entries(overrides)) Object.assign(api[group], fns)
  return api
}

export function renderUi(ui, { api = makeFakeApi(), lang = 'sr' } = {}) {
  const wrapper = ({ children }) => (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={lang}>{children}</I18nProvider>
    </ApiContext.Provider>
  )
  const result = render(ui, { wrapper })
  return { api, ...result }
}
