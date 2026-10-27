import { describe, it, expect } from 'vitest'
import { DICTS, createT } from '../../src/renderer/i18n/index.js'
import { STATUSES, TOOL_IDS } from '../../src/shared/domain.js'
import { ANILIST_STATUSES } from '../../src/shared/airing.js'

const DYNAMIC = [
  ...['search', 'home', 'watchlist', 'downloads', 'profile', 'settings'].map((p) => `nav.${p}`),
  ...['rookie', 'watcher', 'veteran', 'elite', 'sensei', 'legend'].map((x) => `title.${x}`),
  ...['green', 'checking', 'updating', 'missing-tools', 'source-down', 'offline'].map((r) => `health.${r}`),
  ...TOOL_IDS.map((id) => `tool.${id}`),
  ...['installed', 'missing', 'installing', 'error'].map((s) => `tool.${s}`),
  ...STATUSES.map((s) => `status.${s}`),
  ...['title', 'rating', 'lastWatched'].map((s) => `sort.${s}`),
  ...['queued', 'downloading', 'paused', 'done', 'error'].map((s) => `dstatus.${s}`),
  ...['no-results', 'episode-not-released', 'blocked', 'cancelled', 'unknown', 'file-not-found', 'not-found', 'tools-missing'].map((e) => `error.${e}`),
  ...ANILIST_STATUSES.map((s) => `airing.status.${s}`),
  ...['one', 'few', 'other'].flatMap((f) => [`airing.new_${f}`, `airing.newLabel_${f}`]),
  ...['d', 'dOnly', 'h', 'hOnly', 'min'].map((k) => `airing.in.${k}`),
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
    expect(t('detail.episodesCount', { n: 12 })).toBe('12 EP')
    expect(t('does.not.exist')).toBe('does.not.exist')
    expect(createT('xx')('nav.search')).toBe('Pretraga')
  })
  it('picks Serbian and English plural forms', () => {
    const sr = createT('sr')
    expect([1, 3, 5, 11, 21, 22, 25].map((n) => sr.n('airing.new', n))).toEqual(['1 nova', '3 nove', '5 novih', '11 novih', '21 nova', '22 nove', '25 novih'])
    expect(sr.n('airing.newLabel', 3)).toBe(', 3 nove epizode')
    const en = createT('en')
    expect([1, 3].map((n) => en.n('airing.new', n))).toEqual(['1 new', '3 new'])
    expect(en.n('airing.newLabel', 1)).toBe(', 1 new episode')
    expect(en.n('airing.newLabel', 2)).toBe(', 2 new episodes')
  })
  it('exposes the language and its date locale', () => {
    for (const [lang, code, locale] of [['sr', 'sr', 'sr-Latn'], ['en', 'en', 'en-GB'], ['xx', 'sr', 'sr-Latn']]) {
      const t = createT(lang)
      expect(t.lang).toBe(code)
      expect(t.locale).toBe(locale)
    }
  })
  it('formats the airing line', () => {
    const t = createT('sr')
    expect(t('airing.next', { episode: 13, when: t('airing.in.d', { d: 2, h: 4 }), at: 'pet 17:30' })).toBe('EP 13 izlazi za 2 d 4 h · pet 17:30')
    expect(createT('en')('airing.next', { episode: 13, when: 'in 3 h', at: 'Fri 17:30' })).toBe('EP 13 airs in 3 h · Fri 17:30')
  })
})
