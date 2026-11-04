import { describe, it, expect } from 'vitest'
import { localDay, localHour, shiftDay, mondayOf, longestStreak } from '../../src/shared/localTime.js'

describe('localDay / localHour', () => {
  it('converts to the local day using the Date#getTimezoneOffset convention', () => {
    expect(localDay('2026-11-03T23:30:00Z', -60)).toBe('2026-11-04')
    expect(localDay('2026-11-03T23:30:00Z', 0)).toBe('2026-11-03')
  })
  it('returns null for an invalid iso', () => {
    expect(localDay('nope', 0)).toBeNull()
    expect(localHour('nope', 0)).toBeNull()
  })
  it('returns the local hour 0-23', () => {
    expect(localHour('2026-11-03T23:59:00Z', -60)).toBe(0)
    expect(localHour('2026-11-04T03:59:00Z', -60)).toBe(4)
    expect(localHour('2026-11-04T04:00:00Z', -60)).toBe(5)
  })
})

describe('shiftDay / mondayOf', () => {
  it('shifts across month ends', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
  })
  it('finds the Monday of the week', () => {
    expect(mondayOf('2026-11-04')).toBe('2026-11-02')
    expect(mondayOf('2026-11-02')).toBe('2026-11-02')
    expect(mondayOf('2026-11-08')).toBe('2026-11-02')
  })
})

describe('longestStreak', () => {
  it('finds the longest run of consecutive days', () => {
    expect(longestStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'])).toBe(3)
  })
  it('handles empty input, duplicates and month ends', () => {
    expect(longestStreak([])).toBe(0)
    expect(longestStreak(['2026-10-01', '2026-10-01', '2026-10-01'])).toBe(1)
    expect(longestStreak(['2026-10-31', '2026-11-01'])).toBe(2)
  })
  it('accepts a Set and unsorted input', () => {
    expect(longestStreak(new Set(['2026-10-03', '2026-10-01', '2026-10-02']))).toBe(3)
  })
})
