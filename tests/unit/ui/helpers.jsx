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
    },
    anilist: { forTitle: vi.fn(async () => null), search: vi.fn(async () => []) },
    tools: { status: vi.fn(async () => ({})), installMissing: vi.fn(async () => ({})), checkUpdates: vi.fn(async () => []), onProgress: sub() },
    health: { get: vi.fn(async () => ({ light: 'green', reason: 'ok' })), recheck: vi.fn(async () => ({})), onChange: sub() },
    watch: {
      start: vi.fn(async () => ({ sessionId: 's1' })), cancel: vi.fn(async () => {}), answerMenu: vi.fn(async () => {}),
      onMenu: sub(), onAsk: sub(), onPlaying: sub(), onSessionEnd: sub(),
    },
    downloads: {
      enqueue: vi.fn(async () => []), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), queue: vi.fn(async () => []), list: vi.fn(async () => []),
      remove: vi.fn(async () => true), play: vi.fn(async () => 'none'), openFolder: vi.fn(), onChange: sub(),
    },
    stats: { get: vi.fn(async () => ({ ...EMPTY_STATS })), onLevelUp: sub(), onSeriesCompleted: sub() },
    dialog: { pickFolder: vi.fn(async () => null) },
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
