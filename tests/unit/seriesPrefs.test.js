import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSeriesPrefs } from '../../src/main/seriesPrefs.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

let file
beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-sp-')), 'series-prefs.json') })

describe('seriesPrefs', () => {
  it('returns empty prefs for an unknown series', () => {
    expect(createSeriesPrefs(file).get('Frieren')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 } })
  })
  it('stores prefs per normalized title and persists them', () => {
    const p = createSeriesPrefs(file)
    expect(p.set('One Piece (1120 episodes)', { mode: 'dub' })).toEqual({ quality: null, mode: 'dub', subOffset: { sub: 0, dub: 0 } })
    p.set('one piece', { quality: '720' })
    expect(createSeriesPrefs(file).get('ONE PIECE')).toEqual({ quality: '720', mode: 'dub', subOffset: { sub: 0, dub: 0 } })
  })
  it('ignores invalid values and clears a field with null', () => {
    const p = createSeriesPrefs(file)
    p.set('X Y', { quality: '4k', mode: 'raw' })
    expect(p.get('X Y')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 } })
    p.set('X Y', { quality: '1080', mode: 'dub' })
    p.set('X Y', { mode: null })
    expect(p.get('X Y')).toEqual({ quality: '1080', mode: null, subOffset: { sub: 0, dub: 0 } })
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
    expect(createSeriesPrefs(file).get('Show')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 } })
    fs.writeFileSync(file, '{broken')
    const p = createSeriesPrefs(file)
    expect(p.get('Show')).toEqual({ quality: null, mode: null, subOffset: { sub: 0, dub: 0 } })
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
    expect(p.get('Show')).toEqual({ quality: '720', mode: 'dub', subOffset: { sub: 0.5, dub: 0 } })
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
