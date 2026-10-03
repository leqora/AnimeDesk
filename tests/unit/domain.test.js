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
  it('returns the first unwatched episode', () => {
    expect(nextEpisode({ totalEpisodes: 12, watchedEpisodes: [1, 2, 4] })).toBe(3)
    expect(nextEpisode({ totalEpisodes: 3, watchedEpisodes: [1, 2, 3] })).toBe(1)
    expect(nextEpisode({ totalEpisodes: null, watchedEpisodes: [] })).toBe(1)
  })
  it('continues after the last watched episode when the total is unknown', () => {
    expect(nextEpisode({ totalEpisodes: null, watchedEpisodes: [1, 2] })).toBe(3)
    expect(nextEpisode({ totalEpisodes: undefined, watchedEpisodes: [2, 1, 3] })).toBe(4)
    expect(nextEpisode({ totalEpisodes: null, watchedEpisodes: [1, 3] })).toBe(2)
    expect(nextEpisode({ totalEpisodes: null, watchedEpisodes: [1, 2, 2.5] })).toBe(3)
  })
})
