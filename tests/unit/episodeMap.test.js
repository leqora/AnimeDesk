import { describe, it, expect } from 'vitest'
import { metaKey, metaReliability, pickTitle, mapEpisode } from '../../src/shared/episodeMap.js'

const ep = (n) => ({ titles: { en: `Naslov ${n}`, 'x-jat': `Romaji ${n}` }, image: `https://img.example/${n}.jpg`, overview: `Opis ${n}`, runtime: 24 })
const anizip = (count, keys = count) => ({ episodeCount: count, episodes: Object.fromEntries(Array.from({ length: keys }, (_, i) => [String(i + 1), ep(i + 1)])) })

describe('metaKey', () => {
  it('maps whole episode numbers from 1 up and nothing else', () => {
    expect(metaKey('1')).toBe('1')
    expect(metaKey(' 28 ')).toBe('28')
    expect(metaKey('0')).toBeNull()
    expect(metaKey('12.5')).toBeNull()
    expect(metaKey('01')).toBeNull()
    expect(metaKey('S1')).toBeNull()
    expect(metaKey('')).toBeNull()
    expect(metaKey(null)).toBeNull()
  })
})

describe('metaReliability', () => {
  it('is ok when the source has as many or fewer whole episodes', () => {
    expect(metaReliability(['1', '2', '3'], anizip(3))).toBe('ok')
    expect(metaReliability(['1', '2'], anizip(12))).toBe('ok') // airing, or the source misses some
    expect(metaReliability(['0', '1', '1.5', '2'], anizip(2))).toBe('ok') // "0" and decimals do not count
  })
  it('is unreliable when the source counts more episodes (absolute numbering or a wrong match)', () => {
    expect(metaReliability(['1', '2', '3', '4'], anizip(3))).toBe('unreliable')
  })
  it('falls back to the number of episodes when episodeCount is missing', () => {
    expect(metaReliability(['1', '2'], { episodes: anizip(2).episodes })).toBe('ok')
    expect(metaReliability(['1', '2', '3'], { episodes: anizip(2).episodes })).toBe('unreliable')
  })
})

describe('pickTitle', () => {
  it('prefers English, then romaji, then any title', () => {
    expect(pickTitle({ ja: 'J', en: ' E ', 'x-jat': 'R' })).toBe('E')
    expect(pickTitle({ ja: 'J', 'x-jat': 'R' })).toBe('R')
    expect(pickTitle({ de: '', fr: 'F' })).toBe('F')
    expect(pickTitle({})).toBeNull()
    expect(pickTitle(null)).toBeNull()
  })
})

describe('mapEpisode', () => {
  it('finds metadata by number and leaves the rest without', () => {
    expect(mapEpisode('2', anizip(3))).toEqual({ title: 'Naslov 2', image: 'https://img.example/2.jpg', overview: 'Opis 2', runtime: 24 })
    expect(mapEpisode('9', anizip(3))).toBeNull()
    expect(mapEpisode('0', anizip(3))).toBeNull()
    expect(mapEpisode('1', null)).toBeNull()
  })
})
