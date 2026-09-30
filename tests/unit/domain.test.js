import { describe, it, expect } from 'vitest'
import { normalizeTitle, animeLineTitle, STATUSES, TOOL_IDS } from '../../src/shared/domain.js'

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
