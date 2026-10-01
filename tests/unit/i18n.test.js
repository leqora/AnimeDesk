import { describe, it, expect } from 'vitest'
import { DICTS, createT } from '../../src/renderer/i18n/index.js'
import { STATUSES, TOOL_IDS } from '../../src/shared/domain.js'

const DYNAMIC = [
  ...['search', 'watchlist', 'downloads', 'settings'].map((p) => `nav.${p}`),
  ...['green', 'checking', 'updating', 'missing-tools', 'source-down', 'offline'].map((r) => `health.${r}`),
  ...TOOL_IDS.map((id) => `tool.${id}`),
  ...['installed', 'missing', 'installing', 'error'].map((s) => `tool.${s}`),
  ...STATUSES.map((s) => `status.${s}`),
  ...['title', 'rating', 'lastWatched'].map((s) => `sort.${s}`),
  ...['queued', 'downloading', 'paused', 'done', 'error'].map((s) => `dstatus.${s}`),
  ...['no-results', 'episode-not-released', 'blocked', 'cancelled', 'unknown', 'file-not-found', 'not-found', 'tools-missing'].map((e) => `error.${e}`),
  'settings.mode.sub', 'settings.mode.dub', 'lang.sr', 'lang.en',
]

describe('i18n', () => {
  it('sr and en have exactly the same keys', () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(Object.keys(DICTS.sr).sort())
  })
  it('contains every dynamic key family', () => {
    for (const k of DYNAMIC) expect(DICTS.sr, k).toHaveProperty([k])
  })
  it('interpolates variables and falls back to the key', () => {
    const t = createT('en')
    expect(t('detail.progress', { watched: 3, total: 12 })).toBe('Progress: 3 / 12')
    expect(t('does.not.exist')).toBe('does.not.exist')
    expect(createT('xx')('nav.search')).toBe('Pretraga')
  })
})
