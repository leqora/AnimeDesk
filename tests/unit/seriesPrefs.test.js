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
    expect(createSeriesPrefs(file).get('Frieren')).toEqual({ quality: null, mode: null })
  })
  it('stores prefs per normalized title and persists them', () => {
    const p = createSeriesPrefs(file)
    expect(p.set('One Piece (1120 episodes)', { mode: 'dub' })).toEqual({ quality: null, mode: 'dub' })
    p.set('one piece', { quality: '720' })
    expect(createSeriesPrefs(file).get('ONE PIECE')).toEqual({ quality: '720', mode: 'dub' })
  })
  it('ignores invalid values and clears a field with null', () => {
    const p = createSeriesPrefs(file)
    p.set('X Y', { quality: '4k', mode: 'raw' })
    expect(p.get('X Y')).toEqual({ quality: null, mode: null })
    p.set('X Y', { quality: '1080', mode: 'dub' })
    p.set('X Y', { mode: null })
    expect(p.get('X Y')).toEqual({ quality: '1080', mode: null })
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
    expect(createSeriesPrefs(file).get('Show')).toEqual({ quality: null, mode: null })
    fs.writeFileSync(file, '{broken')
    const p = createSeriesPrefs(file)
    expect(p.get('Show')).toEqual({ quality: null, mode: null })
    expect(p.set('Show', { mode: 'dub' }).mode).toBe('dub')
  })
})
