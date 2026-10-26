import { describe, it, expect } from 'vitest'
import { BOOST_LEVELS, isBoostLevel, formatBoost, mpvBoostArgs } from '../../src/shared/volumeBoost.js'

describe('volumeBoost', () => {
  it('has the agreed levels', () => {
    expect(BOOST_LEVELS).toEqual([1, 1.25, 1.5, 2, 2.5, 3])
    expect(isBoostLevel(2)).toBe(true)
    expect(isBoostLevel(1.75)).toBe(false)
    expect(isBoostLevel('2')).toBe(false)
  })
  it('formats the level per language, null for off', () => {
    expect(formatBoost(1, 'sr')).toBeNull()
    expect(formatBoost(1.5, 'sr')).toBe('150 %')
    expect(formatBoost(2, 'en')).toBe('200%')
    expect(formatBoost(1.25, 'en')).toBe('125%')
  })
  it('builds the mpv lavfi args', () => {
    expect(mpvBoostArgs(1)).toEqual([])
    expect(mpvBoostArgs(7)).toEqual([])
    expect(mpvBoostArgs(2)).toEqual(['--af-add=@animedesk-boost:lavfi=[volume=2,alimiter=limit=0.95:level=disabled]'])
  })
})
