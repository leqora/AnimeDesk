import { describe, it, expect } from 'vitest'
import { GROUP_SIZE, episodeGroups, findEpisodeIndex, groupIndexOf, firstUnwatchedIndex } from '../../src/shared/episodes.js'

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i))

describe('episodes', () => {
  it('makes one group for short lists and none for empty ones', () => {
    expect(episodeGroups(range(1, 12))).toEqual([{ label: '1–12', from: 0, to: 11 }])
    expect(episodeGroups([])).toEqual([])
  })
  it('groups long lists by index in blocks of 100', () => {
    const g = episodeGroups(range(1, 1120))
    expect(GROUP_SIZE).toBe(100)
    expect(g).toHaveLength(12)
    expect(g[0]).toEqual({ label: '1–100', from: 0, to: 99 })
    expect(g[11]).toEqual({ label: '1101–1120', from: 1100, to: 1119 })
  })
  it('labels groups with the real episode numbers when the list has 0, halves or gaps', () => {
    const list = ['0', ...range(1, 12), '12.5', ...range(13, 200)]
    const g = episodeGroups(list)
    expect(g[0].label).toBe('0–98')
    expect(g[0].to - g[0].from).toBe(99)
    expect(g.at(-1).label).toBe('199–200')
  })
  it('finds an episode by exact text, then by number', () => {
    const list = ['1', '2', '12.5', '13']
    expect(findEpisodeIndex(list, '12.5')).toBe(2)
    expect(findEpisodeIndex(list, ' 13 ')).toBe(3)
    expect(findEpisodeIndex(list, '02')).toBe(1)
    expect(findEpisodeIndex(list, 2)).toBe(1)
    expect(findEpisodeIndex(list, '99')).toBe(-1)
    expect(findEpisodeIndex(list, '')).toBe(-1)
    expect(findEpisodeIndex(list, 'abc')).toBe(-1)
  })
  it('knows which group an episode is in', () => {
    const list = range(1, 350)
    expect(groupIndexOf(list, '1')).toBe(0)
    expect(groupIndexOf(list, '101')).toBe(1)
    expect(groupIndexOf(list, '350')).toBe(3)
    expect(groupIndexOf(list, '351')).toBe(-1)
  })
  it('finds the first unwatched episode', () => {
    expect(firstUnwatchedIndex(range(1, 5), [1, 2])).toBe(2)
    expect(firstUnwatchedIndex(range(1, 3), [1, 2, 3])).toBe(0)
    expect(firstUnwatchedIndex([], [])).toBe(0)
    expect(firstUnwatchedIndex(['1', '1.5', '2'], [1])).toBe(1)
  })
})
