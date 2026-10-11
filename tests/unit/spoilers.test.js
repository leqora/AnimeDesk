import { describe, it, expect } from 'vitest'
import { watchedMax, episodeVisibility, redactEpisode } from '../../src/shared/spoilers.js'

const rule = (over = {}) => ({ enabled: true, watchedMax: 3, revealAll: false, revealed: [], ...over })
const META = { title: 'Tajna 5', image: 'https://img.example/5.jpg', overview: 'Opis 5', runtime: 24 }

describe('watchedMax', () => {
  it('returns the highest watched episode, 0 when none', () => {
    expect(watchedMax([])).toBe(0)
    expect(watchedMax([1, 3, 2])).toBe(3)
    expect(watchedMax([12, 12.5])).toBe(12.5)
    expect(watchedMax(['4', 'x', null])).toBe(4)
  })
})

describe('episodeVisibility', () => {
  it('shows watched episodes and gaps below the highest one fully', () => {
    expect(episodeVisibility('1', rule())).toBe('full')
    expect(episodeVisibility('3', rule())).toBe('full')
    expect(episodeVisibility('2', rule({ watchedMax: 3 }))).toBe('full') // a skipped episode is not a spoiler
  })
  it('previews only the next episode and hides the rest', () => {
    expect(episodeVisibility('4', rule())).toBe('preview')
    expect(episodeVisibility('5', rule())).toBe('hidden')
    expect(episodeVisibility(100, rule())).toBe('hidden')
  })
  it('treats decimals by value', () => {
    expect(episodeVisibility('12.5', rule({ watchedMax: 12 }))).toBe('preview')
    expect(episodeVisibility('13', rule({ watchedMax: 12.5 }))).toBe('preview')
    expect(episodeVisibility('13.5', rule({ watchedMax: 12 }))).toBe('hidden')
  })
  it('shows only episode 1 of a series not started yet', () => {
    expect(episodeVisibility('1', rule({ watchedMax: 0 }))).toBe('preview')
    expect(episodeVisibility('0', rule({ watchedMax: 0 }))).toBe('full')
    expect(episodeVisibility('2', rule({ watchedMax: 0 }))).toBe('hidden')
  })
  it('reveals single episodes, the whole series, or everything when protection is off', () => {
    expect(episodeVisibility('7', rule({ revealed: ['7'] }))).toBe('full')
    expect(episodeVisibility('7', rule({ revealed: ['8'] }))).toBe('hidden')
    expect(episodeVisibility('9', rule({ revealAll: true }))).toBe('full')
    expect(episodeVisibility('9', rule({ enabled: false }))).toBe('full')
  })
  it('hides unreadable numbers', () => {
    expect(episodeVisibility('', rule())).toBe('hidden')
    expect(episodeVisibility('  ', rule())).toBe('hidden')
    expect(episodeVisibility('S1', rule())).toBe('hidden')
    expect(episodeVisibility(null, rule())).toBe('hidden')
  })
})

describe('redactEpisode', () => {
  it('keeps exactly number, runtime and visibility for a hidden episode', () => {
    const r = redactEpisode('5', META, 'hidden')
    expect(r).toEqual({ number: '5', runtime: 24, visibility: 'hidden' })
    expect(JSON.stringify(r)).not.toContain('Tajna')
    expect(JSON.stringify(r)).not.toContain('img.example')
    expect(JSON.stringify(r)).not.toContain('Opis')
  })
  it('gives a preview the title and a thumbnail flag but no summary', () => {
    expect(redactEpisode('4', META, 'preview')).toEqual({ number: '4', runtime: 24, visibility: 'preview', title: 'Tajna 5', hasThumb: true })
  })
  it('gives a full episode the summary too, never the image URL', () => {
    const r = redactEpisode('1', META, 'full')
    expect(r).toEqual({ number: '1', runtime: 24, visibility: 'full', title: 'Tajna 5', hasThumb: true, overview: 'Opis 5' })
    expect(JSON.stringify(r)).not.toContain('img.example')
  })
  it('never copies unknown fields', () => {
    const r = redactEpisode('1', { ...META, synopsis: 'skriveno', airdate: '2030-01-01' }, 'full')
    expect(Object.keys(r).sort()).toEqual(['hasThumb', 'number', 'overview', 'runtime', 'title', 'visibility'])
  })
  it('handles missing metadata and bad runtimes', () => {
    expect(redactEpisode('12.5', null, 'full')).toEqual({ number: '12.5', runtime: null, visibility: 'full' })
    expect(redactEpisode('2', { title: null, image: null, overview: null, runtime: -3 }, 'full'))
      .toEqual({ number: '2', runtime: null, visibility: 'full', hasThumb: false })
  })
  it('fails closed for any visibility other than preview or full', () => {
    for (const v of [undefined, 'bogus', null]) {
      expect(redactEpisode('5', META, v)).toEqual({ number: '5', runtime: 24, visibility: v })
    }
  })
})
