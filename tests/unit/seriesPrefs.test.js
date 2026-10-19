import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSeriesPrefs, sanitizeSeriesPrefs } from '../../src/main/seriesPrefs.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

let file
beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-sp-')), 'series-prefs.json') })

describe('seriesPrefs', () => {
  it('returns empty prefs for an unknown series', () => {
    expect(createSeriesPrefs(file).get('Frieren')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
  })
  it('stores prefs per normalized title and persists them', () => {
    const p = createSeriesPrefs(file)
    expect(p.set('One Piece (1120 episodes)', { mode: 'dub' })).toEqual({ quality: null, mode: 'dub', subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
    p.set('one piece', { quality: '720' })
    expect(createSeriesPrefs(file).get('ONE PIECE')).toEqual({ quality: '720', mode: 'dub', subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
  })
  it('ignores invalid values and clears a field with null', () => {
    const p = createSeriesPrefs(file)
    p.set('X Y', { quality: '4k', mode: 'raw' })
    expect(p.get('X Y')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
    p.set('X Y', { quality: '1080', mode: 'dub' })
    p.set('X Y', { mode: null })
    expect(p.get('X Y')).toEqual({ quality: '1080', mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
    p.set('X Y', { quality: null })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({})
  })
  it('resolves against global settings', () => {
    const p = createSeriesPrefs(file)
    p.set('Show', { mode: 'dub' })
    expect(p.resolve('Show', { ...DEFAULT_SETTINGS, quality: '480' })).toEqual({ quality: '480', mode: 'dub' })
    expect(p.resolve('Other', DEFAULT_SETTINGS)).toEqual({ quality: 'best', mode: 'sub' })
  })
  it('survives a hand-edited or corrupt file', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, series: { show: { quality: 'huge', mode: 7 } } }))
    expect(createSeriesPrefs(file).resolve('Show', DEFAULT_SETTINGS)).toEqual({ quality: 'best', mode: 'sub' })
    fs.writeFileSync(file, JSON.stringify({ nope: true }))
    expect(createSeriesPrefs(file).get('Show')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
    fs.writeFileSync(file, '{broken')
    const p = createSeriesPrefs(file)
    expect(p.get('Show')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
    expect(p.set('Show', { mode: 'dub' }).mode).toBe('dub')
  })
  it('remembers the subtitle offset per mode and keeps the other mode', () => {
    const p = createSeriesPrefs(file)
    expect(p.set('Show', { subOffset: { dub: 1.54 } }).subOffset).toEqual({ sub: 0, dub: 1.5 })
    p.set('Show', { subOffset: { sub: -0.3 } })
    expect(createSeriesPrefs(file).get('show').subOffset).toEqual({ sub: -0.3, dub: 1.5 })
    p.set('Show', { subOffset: { dub: 99 } })
    expect(p.get('Show').subOffset.dub).toBe(60)
    p.set('Show', { subOffset: { dub: 'x', raw: 3 } })
    expect(p.get('Show').subOffset).toEqual({ sub: -0.3, dub: 60 })
  })
  it('drops zero or null offsets from the file', () => {
    const p = createSeriesPrefs(file)
    p.set('Show', { subOffset: { sub: 2 } })
    p.set('Show', { subOffset: { sub: 0 } })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({})
    p.set('Show', { mode: 'dub', subOffset: { dub: 1 } })
    p.set('Show', { subOffset: { dub: null } })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({ show: { mode: 'dub' } })
  })
  it('ignores a hand-edited offset that is not a number', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, series: { show: { subOffset: { sub: 'late', dub: 500 } } } }))
    expect(createSeriesPrefs(file).get('Show').subOffset).toEqual({ sub: 0, dub: 60 })
  })
})

describe('seriesPrefs spoilers', () => {
  const none = { reveal: { all: false, episodes: [] }, metaOff: false }
  it('starts with nothing revealed', () => {
    expect(createSeriesPrefs(file).getSpoilers('Frieren')).toEqual(none)
  })
  it('remembers revealed episodes, the whole series and metaOff, and persists them', () => {
    const p = createSeriesPrefs(file)
    p.setSpoilers('Show (12 episodes)', { episode: 7 })
    p.setSpoilers('show', { episode: '7' }) // no duplicate
    p.setSpoilers('SHOW', { episode: ' 9 ' })
    expect(p.setSpoilers('Show', { all: true })).toEqual({ reveal: { all: true, episodes: ['7', '9'] }, metaOff: false })
    p.setSpoilers('Show', { metaOff: true })
    expect(createSeriesPrefs(file).getSpoilers('show')).toEqual({ reveal: { all: true, episodes: ['7', '9'] }, metaOff: true })
  })
  it('reset hides everything again but keeps metaOff', () => {
    const p = createSeriesPrefs(file)
    p.setSpoilers('Show', { episode: '3' })
    p.setSpoilers('Show', { metaOff: true })
    expect(p.setSpoilers('Show', { reset: true })).toEqual({ reveal: { all: false, episodes: [] }, metaOff: true })
    p.setSpoilers('Show', { metaOff: false })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({})
  })
  it('keeps reveals when quality, mode or the subtitle offset change, and the other way round', () => {
    const p = createSeriesPrefs(file)
    p.set('Show', { quality: '720' })
    p.setSpoilers('Show', { episode: '5' })
    p.set('Show', { mode: 'dub', subOffset: { sub: 0.5 } })
    expect(p.getSpoilers('Show').reveal.episodes).toEqual(['5'])
    expect(p.get('Show')).toEqual({ quality: '720', mode: 'dub', subOffset: { sub: 0.5, dub: 0 }, autoDownload: false, hideFiller: false })
  })
  it('ignores bad actions and hand-edited values', () => {
    const p = createSeriesPrefs(file)
    expect(p.setSpoilers('Show', { episode: '' })).toEqual(none)
    expect(p.setSpoilers('Show', { all: 'yes' })).toEqual(none)
    expect(p.setSpoilers('', { all: true })).toEqual(none)
    fs.writeFileSync(file, JSON.stringify({ version: 1, series: { show: { reveal: { all: 1, episodes: 'x' }, metaOff: 'y' } } }))
    expect(createSeriesPrefs(file).getSpoilers('Show')).toEqual(none)
  })
})

describe('seriesPrefs auto-download', () => {
  it('is off for an unknown series', () => {
    const p = createSeriesPrefs(file)
    expect(p.getAutoDownload('Show')).toBeNull()
    expect(p.get('Show').autoDownload).toBe(false)
  })
  it('remembers the boundary per series and survives a reload', () => {
    const p = createSeriesPrefs(file)
    expect(p.setAutoDownload('Show (12 episodes)', { after: 4 })).toEqual({ after: 4 })
    expect(p.getAutoDownload('show')).toEqual({ after: 4 })
    expect(p.get('Show').autoDownload).toBe(true)
    const again = createSeriesPrefs(file)
    expect(again.getAutoDownload('Show')).toEqual({ after: 4 })
    expect(again.get('Show').autoDownload).toBe(true)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({ show: { autoDownload: { after: 4 } } })
  })
  it('null removes it, and the series key disappears when nothing else is stored', () => {
    const p = createSeriesPrefs(file)
    p.setAutoDownload('Show', { after: 0 })
    expect(p.getAutoDownload('Show')).toEqual({ after: 0 })
    expect(p.setAutoDownload('Show', null)).toBeNull()
    expect(p.get('Show').autoDownload).toBe(false)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({})
  })
  it('rejects a malformed value without changing anything', () => {
    const p = createSeriesPrefs(file)
    p.setAutoDownload('Show', { after: 3 })
    for (const bad of [{ after: -1 }, { after: 1.5 }, { after: '2' }, {}, 'x', 7, undefined]) {
      expect(p.setAutoDownload('Show', bad)).toEqual({ after: 3 })
    }
    expect(p.getAutoDownload('Show')).toEqual({ after: 3 })
    expect(p.setAutoDownload('', { after: 1 })).toBeNull()
  })
  it('reads a hand-edited malformed value as off', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, series: { a: { autoDownload: { after: -2 } }, b: { autoDownload: 'yes' }, c: { autoDownload: { after: 2.5 } } } }))
    const p = createSeriesPrefs(file)
    for (const t of ['a', 'b', 'c']) {
      expect(p.getAutoDownload(t)).toBeNull()
      expect(p.get(t).autoDownload).toBe(false)
    }
  })
  it('stores the remembered schedule and the pending flag, dropping malformed ones', () => {
    const p = createSeriesPrefs(file)
    const rec = { after: 3, next: { episode: 4, airingAt: 1000 }, pending: true }
    expect(p.setAutoDownload('Show', { ...rec, extra: 1 })).toEqual(rec)
    expect(createSeriesPrefs(file).getAutoDownload('Show')).toEqual(rec)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({ show: { autoDownload: rec } })
    // exactly the given fields: leaving next/pending out removes them
    expect(p.setAutoDownload('Show', { after: 4 })).toEqual({ after: 4 })
    for (const next of [{ episode: 0, airingAt: 1 }, { episode: 1.5, airingAt: 1 }, { episode: 2, airingAt: Infinity }, { episode: 2 }, 'x', null]) {
      expect(p.setAutoDownload('Show', { after: 4, next, pending: 'yes' })).toEqual({ after: 4 })
    }
    fs.writeFileSync(file, JSON.stringify({ version: 1, series: { show: { autoDownload: { after: 2, next: { episode: -1, airingAt: 5 }, pending: 1 } } } }))
    expect(createSeriesPrefs(file).getAutoDownload('Show')).toEqual({ after: 2 })
  })
  it('keeps every other field when the switch changes, and the switch when they change', () => {
    const p = createSeriesPrefs(file)
    p.set('Show', { quality: '720', mode: 'dub', subOffset: { sub: 0.5 } })
    p.setSpoilers('Show', { episode: '3' })
    p.setSpoilers('Show', { metaOff: true })
    p.setAutoDownload('Show', { after: 2 })
    expect(p.get('Show')).toEqual({ quality: '720', mode: 'dub', subOffset: { sub: 0.5, dub: 0 }, autoDownload: true, hideFiller: false })
    expect(p.getSpoilers('Show')).toEqual({ reveal: { all: false, episodes: ['3'] }, metaOff: true })
    p.set('Show', { quality: '1080' })
    p.setSpoilers('Show', { episode: '4' })
    expect(p.getAutoDownload('Show')).toEqual({ after: 2 })
    expect(createSeriesPrefs(file).getAutoDownload('Show')).toEqual({ after: 2 })
    p.setAutoDownload('Show', null)
    expect(p.get('Show').quality).toBe('1080')
    expect(p.getSpoilers('Show').reveal.episodes).toEqual(['3', '4'])
  })
})

describe('seriesPrefs aniListSync', () => {
  it('defaults to true', () => {
    expect(createSeriesPrefs(file).getAniListSync('Frieren')).toBe(true)
  })
  it('false persists as aniListSync:false under the normalized key; true removes the key', () => {
    const p = createSeriesPrefs(file)
    expect(p.setAniListSync('One Piece (1120 episodes)', false)).toBe(false)
    expect(p.getAniListSync('one piece')).toBe(false)
    expect(createSeriesPrefs(file).getAniListSync('ONE PIECE')).toBe(false)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series['one piece']).toEqual({ aniListSync: false })
    expect(p.setAniListSync('one piece', true)).toBe(true)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({})
  })
  it('does not change get()', () => {
    const p = createSeriesPrefs(file)
    p.setAniListSync('Show', false)
    expect(p.get('Show')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 }, autoDownload: false, hideFiller: false })
  })
  it('ignores non-boolean values and empty titles', () => {
    const p = createSeriesPrefs(file)
    p.setAniListSync('Show', false)
    expect(p.setAniListSync('Show', 'yes')).toBe(false)
    expect(p.setAniListSync('', false)).toBe(true)
  })
  it('is kept by set, setSpoilers and setAutoDownload', () => {
    const p = createSeriesPrefs(file)
    p.setAniListSync('Show', false)
    p.set('Show', { quality: '720' })
    expect(p.getAniListSync('Show')).toBe(false)
    p.setSpoilers('Show', { episode: '3' })
    expect(p.getAniListSync('Show')).toBe(false)
    p.setAutoDownload('Show', { after: 2 })
    expect(p.getAniListSync('Show')).toBe(false)
    p.setAutoDownload('Show', null)
    expect(createSeriesPrefs(file).getAniListSync('Show')).toBe(false)
  })
  it('keeps the other prefs when it changes', () => {
    const p = createSeriesPrefs(file)
    p.set('Show', { quality: '720', mode: 'dub' })
    p.setSpoilers('Show', { episode: '3' })
    p.setAutoDownload('Show', { after: 2 })
    p.setAniListSync('Show', false)
    p.setAniListSync('Show', true)
    p.setAniListSync('Show', false)
    const again = createSeriesPrefs(file)
    expect(again.get('Show')).toEqual({ quality: '720', mode: 'dub', subOffset: { sub: 0, dub: 0 }, autoDownload: true, hideFiller: false })
    expect(again.getSpoilers('Show').reveal.episodes).toEqual(['3'])
    expect(again.getAutoDownload('Show')).toEqual({ after: 2 })
    expect(again.getAniListSync('Show')).toBe(false)
  })
})

describe('sanitizeSeriesPrefs', () => {
  it('produces the stored shape, re-normalizes keys and drops empty records', () => {
    const r = sanitizeSeriesPrefs({ version: 1, series: {
      'Naruto ': { quality: '720', mode: 'xx', subOffset: { sub: 0, dub: 1.5 }, autoDownload: { after: 3 }, junk: 1 },
      x: {},
      '   ': { quality: '720' },
      y: { reveal: { all: true, episodes: [' 3 ', ''] }, metaOff: true, aniListSync: false },
      z: 'nope',
    } })
    expect(r).toEqual({ version: 1, series: {
      naruto: { quality: '720', subOffset: { dub: 1.5 }, autoDownload: { after: 3 } },
      y: { reveal: { all: true, episodes: ['3'] }, metaOff: true, aniListSync: false },
    } })
  })
  it('returns empty when not an object', () => {
    expect(sanitizeSeriesPrefs(null)).toEqual({ version: 1, series: {} })
    expect(sanitizeSeriesPrefs({ series: [] })).toEqual({ version: 1, series: {} })
  })
})

describe('seriesPrefs snapshot / replaceAll', () => {
  it('snapshot is a deep copy; replaceAll swaps and persists', () => {
    const p = createSeriesPrefs(file)
    p.set('A', { quality: '720' })
    const s = p.snapshot()
    s.series.a.quality = '480'
    expect(p.get('A').quality).toBe('720')
    const db = { version: 1, series: { b: { mode: 'dub' } } }
    p.replaceAll(db)
    expect(p.get('A').quality).toBeNull()
    expect(p.get('B').mode).toBe('dub')
    db.series.b.mode = 'sub'
    expect(p.get('B').mode).toBe('dub')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ version: 1, series: { b: { mode: 'dub' } } })
    p.setAniListSync('B', false)
    expect(p.getAniListSync('B')).toBe(false)
  })
})

describe('seriesPrefs hideFiller', () => {
  it('set hideFiller true/false round trip', () => {
    const p = createSeriesPrefs(file)
    expect(p.get('A').hideFiller).toBe(false)
    expect(p.set('A', { hideFiller: true }).hideFiller).toBe(true)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series.a).toEqual({ hideFiller: true })
    expect(createSeriesPrefs(file).get('A').hideFiller).toBe(true)
    expect(p.set('A', { hideFiller: 'yes' }).hideFiller).toBe(true)
    expect(p.set('A', { hideFiller: false }).hideFiller).toBe(false)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series).toEqual({})
  })
  it('other setters keep hideFiller', () => {
    const p = createSeriesPrefs(file)
    p.set('A', { hideFiller: true })
    p.setSpoilers('A', { metaOff: true })
    p.setAutoDownload('A', { after: 2 })
    p.setAniListSync('A', false)
    p.set('A', { quality: '720' })
    expect(p.get('A').hideFiller).toBe(true)
    expect(p.get('A').quality).toBe('720')
  })
  it('sanitizeSeriesPrefs keeps true and drops other values', () => {
    const out = sanitizeSeriesPrefs({ series: { a: { hideFiller: true }, b: { hideFiller: 'yes' } } })
    expect(out.series).toEqual({ a: { hideFiller: true } })
  })
})
