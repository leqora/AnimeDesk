import { describe, it, expect } from 'vitest'
import { formatTime, segmentAt, nextEpisodeNumber, shouldOfferResume, trackMax, isLastEpisode, qualityLabel, qualityName, RATES, stepRate, formatRate, bufferedRanges, sameRanges } from '../../src/shared/player.js'

describe('player helpers', () => {
  it('formats time', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(754.9)).toBe('12:34')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(-3)).toBe('0:00')
  })
  it('finds the skip segment for a time', () => {
    const skips = { op: { start: 3, end: 93 }, ed: { start: 1417, end: 1507 }, recap: null }
    expect(segmentAt(2.9, skips)).toBeNull()
    expect(segmentAt(3, skips)).toBe('op')
    expect(segmentAt(92.9, skips)).toBe('op')
    expect(segmentAt(93, skips)).toBeNull()
    expect(segmentAt(1500, skips)).toBe('ed')
    expect(segmentAt(10, null)).toBeNull()
    expect(segmentAt(10, { op: null, ed: null, recap: { start: 0, end: 30 } })).toBe('recap')
  })
  it('computes neighbour episodes', () => {
    expect(nextEpisodeNumber('7', 1)).toBe(8)
    expect(nextEpisodeNumber('12.5', 1)).toBe(13)
    expect(nextEpisodeNumber('1', -1)).toBe(1)
    expect(nextEpisodeNumber(3, -1)).toBe(2)
  })
  it('offers resume only in the middle of an episode', () => {
    expect(shouldOfferResume(9, 1400)).toBe(false)
    expect(shouldOfferResume(10, 1400)).toBe(true)
    expect(shouldOfferResume(1260, 1400)).toBe(true)
    expect(shouldOfferResume(1261, 1400)).toBe(false)
    expect(shouldOfferResume(100, 0)).toBe(false)
    expect(shouldOfferResume(NaN, 1400)).toBe(false)
  })
  it('tracks the furthest watched percent', () => {
    expect(trackMax(0, 700, 1400)).toBe(50)
    expect(trackMax(60, 700, 1400)).toBe(60)
    expect(trackMax(10, 2000, 1400)).toBe(100)
    expect(trackMax(10, 5, 0)).toBe(10)
  })
  it('knows the last episode', () => {
    expect(isLastEpisode('12', 12)).toBe(true)
    expect(isLastEpisode('11', 12)).toBe(false)
    expect(isLastEpisode('5', null)).toBe(false)
  })
})

describe('qualityLabel', () => {
  it('snaps near-standard heights and keeps odd ones raw', () => {
    expect(qualityLabel(1080)).toBe('1080p')
    expect(qualityLabel(1072)).toBe('1080p')
    expect(qualityLabel(1088)).toBe('1080p')
    expect(qualityLabel(714)).toBe('720p')
    expect(qualityLabel(2160)).toBe('2160p')
    expect(qualityLabel(800)).toBe('800p')
    expect(qualityLabel(240)).toBe('240p')
  })
  it('returns null without a real height', () => {
    for (const h of [0, -5, Number.NaN, undefined, null]) expect(qualityLabel(h)).toBeNull()
  })
  it('names ani-cli qualities for people', () => {
    expect(qualityName('720')).toBe('720p')
    expect(qualityName('best')).toBe('best')
  })
})

describe('playback rate helpers', () => {
  it('steps through the rate list and stops at the ends', () => {
    expect(stepRate(1, 1)).toBe(1.25)
    expect(stepRate(1, -1)).toBe(0.75)
    expect(stepRate(2, 1)).toBe(2)
    expect(stepRate(0.5, -1)).toBe(0.5)
  })
  it('moves an off-list rate to the nearest list value in the step direction', () => {
    expect(stepRate(1.1, 1)).toBe(1.25)
    expect(stepRate(1.1, -1)).toBe(1)
    expect(stepRate(3, -1)).toBe(2)
  })
  it('formats rates with the language decimal mark', () => {
    expect(RATES).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2])
    expect(formatRate(1.25, 'sr')).toBe('1,25')
    expect(formatRate(1.25, 'en')).toBe('1.25')
    expect(formatRate(2, 'sr')).toBe('2')
  })
})

describe('buffered ranges', () => {
  const ranges = (...pairs) => ({ length: pairs.length, start: (i) => pairs[i][0], end: (i) => pairs[i][1] })
  it('reads TimeRanges into plain objects', () => {
    expect(bufferedRanges(ranges([0, 30], [60, 90]))).toEqual([{ start: 0, end: 30 }, { start: 60, end: 90 }])
    expect(bufferedRanges(null)).toEqual([])
    expect(bufferedRanges(ranges())).toEqual([])
  })
  it('compares range lists by value', () => {
    expect(sameRanges([{ start: 0, end: 30 }], [{ start: 0, end: 30 }])).toBe(true)
    expect(sameRanges([{ start: 0, end: 30 }], [{ start: 0, end: 31 }])).toBe(false)
    expect(sameRanges([], [{ start: 0, end: 1 }])).toBe(false)
    expect(sameRanges([], [])).toBe(true)
  })
})
