import { describe, it, expect } from 'vitest'
import { normalizeTitle, animeLineTitle, STATUSES, TOOL_IDS, nextEpisode } from '../../src/shared/domain.js'

describe('domain', () => {
  it('strips the "(N episodes)" suffix', () => {
    expect(normalizeTitle('One Piece (1100 episodes)')).toBe('One Piece')
    expect(normalizeTitle('  Frieren  ')).toBe('Frieren')
  })
  it('takes the title out of an ani-cli menu line', () => {
    expect(animeLineTitle('3 Re:Zero kara Hajimeru')).toBe('Re:Zero kara Hajimeru')
    expect(animeLineTitle('12 86')).toBe('86')
  })
  it('lists statuses and tools', () => {
    expect(STATUSES).toEqual(['watching', 'completed', 'planned', 'paused', 'dropped'])
    expect(TOOL_IDS).toEqual(['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg'])
  })
})

describe('nextEpisode', () => {
  const e = (watchedEpisodes, totalEpisodes = null) => ({ totalEpisodes, watchedEpisodes })
  const pos = (...eps) => Object.fromEntries(eps.map((n) => [String(n), { position: 60, duration: 1400 }]))
  it('continues after the highest watched episode, not the first gap', () => {
    expect(nextEpisode(e([1, 2, 4], 12))).toBe(5)
    expect(nextEpisode(e([112], 220))).toBe(113)
    expect(nextEpisode(e([], 12))).toBe(1)
    expect(nextEpisode(e([]))).toBe(1)
  })
  it('continues after the highest watched episode when the total is unknown', () => {
    expect(nextEpisode(e([1, 2]))).toBe(3)
    expect(nextEpisode(e([2, 1, 3], undefined))).toBe(4)
    expect(nextEpisode(e([1, 3]))).toBe(4)
    expect(nextEpisode(e([1, 2, 2.5]))).toBe(3)
  })
  it('offers the last started episode after the watched ones', () => {
    expect(nextEpisode(e([112], 220), pos(113, 114))).toBe(114)
    expect(nextEpisode(e([]), pos(7))).toBe(7)
  })
  it('ignores a saved position below the highest watched episode', () => {
    expect(nextEpisode(e([112], 220), pos(50))).toBe(113)
  })
  it('ignores a saved position of an already watched episode', () => {
    expect(nextEpisode(e([1, 2, 3, 5], 12), pos(5))).toBe(6)
  })
  it('ignores non-integer and beyond-total saved positions', () => {
    expect(nextEpisode(e([112], 220), pos('12.5'))).toBe(113)
    expect(nextEpisode(e([112], 220), pos('113.5', 'x', 300))).toBe(113)
    expect(nextEpisode(e([1, 2], 3), pos(9))).toBe(3)
  })
  it('wraps to the first unwatched episode past the known total, or 1 when all are watched', () => {
    expect(nextEpisode(e([1, 2, 3], 3))).toBe(1)
    expect(nextEpisode(e([3], 3))).toBe(1)
    expect(nextEpisode(e([2, 3], 3))).toBe(1)
    expect(nextEpisode(e([1, 3], 3))).toBe(2)
  })
})
