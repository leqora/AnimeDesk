import { describe, it, expect } from 'vitest'
import {
  localProgress, wantsSync, decide, RETRY_DELAYS_MS, RETRY_LATER_MS, retryDelay, MAX_REJECTED, DEBOUNCE_MS,
} from '../../src/shared/anilistSync.js'

const remote = (entry, episodes = null) => ({ episodes, entry })

describe('localProgress', () => {
  it('is the max integer watched episode', () => {
    expect(localProgress({ watchedEpisodes: [1, 2, 12.5, 3] })).toBe(3)
  })
  it('is 0 when nothing is watched', () => {
    expect(localProgress({ watchedEpisodes: [] })).toBe(0)
    expect(localProgress({})).toBe(0)
  })
})

describe('wantsSync', () => {
  it('is false when progress was already sent', () => {
    expect(wantsSync({ watchedEpisodes: [1, 2, 3] }, { progress: 3, status: 'CURRENT' })).toBe(false)
  })
  it('is true for a completed entry not yet sent as COMPLETED', () => {
    expect(wantsSync({ status: 'completed', watchedEpisodes: [1, 2, 3] }, { progress: 3, status: 'CURRENT' })).toBe(true)
  })
  it('is false for a completed entry already sent as COMPLETED', () => {
    expect(wantsSync({ status: 'completed', watchedEpisodes: [1, 2, 3] }, { progress: 3, status: 'COMPLETED' })).toBe(false)
  })
  it('is false with no sent record and no progress', () => {
    expect(wantsSync({ watchedEpisodes: [] }, undefined)).toBe(false)
  })
  it('is true with no sent record and some progress', () => {
    expect(wantsSync({ watchedEpisodes: [1] }, undefined)).toBe(true)
  })
})

describe('decide', () => {
  it('sends CURRENT when there is no remote entry', () => {
    expect(decide({ progress: 3, completed: false, remote: remote(null) })).toEqual({ action: 'send', progress: 3, status: 'CURRENT' })
  })
  it('promotes PLANNING to CURRENT', () => {
    expect(decide({ progress: 3, completed: false, remote: remote({ progress: 1, status: 'PLANNING' }) }))
      .toEqual({ action: 'send', progress: 3, status: 'CURRENT' })
  })
  it('sends progress only for CURRENT', () => {
    const r = decide({ progress: 3, completed: false, remote: remote({ progress: 1, status: 'CURRENT' }) })
    expect(r).toEqual({ action: 'send', progress: 3 })
    expect('status' in r).toBe(false)
  })
  it.each(['PAUSED', 'DROPPED', 'REPEATING'])('keeps remote status %s', (status) => {
    const r = decide({ progress: 3, completed: false, remote: remote({ progress: 2, status }) })
    expect(r).toEqual({ action: 'send', progress: 3 })
    expect('status' in r).toBe(false)
  })
  it('skips when remote is ahead', () => {
    expect(decide({ progress: 3, completed: false, remote: remote({ progress: 5, status: 'CURRENT' }) }))
      .toEqual({ action: 'skip', remember: { progress: 5, status: 'CURRENT' } })
  })
  it('skips when remote is equal', () => {
    expect(decide({ progress: 3, completed: false, remote: remote({ progress: 3, status: 'CURRENT' }) }))
      .toEqual({ action: 'skip', remember: { progress: 3, status: 'CURRENT' } })
  })
  it('skips when remote is COMPLETED', () => {
    expect(decide({ progress: 13, completed: false, remote: remote({ progress: 12, status: 'COMPLETED' }) }))
      .toEqual({ action: 'skip', remember: { progress: 12, status: 'COMPLETED' } })
  })
  it('skips when remote is COMPLETED even if completed locally', () => {
    expect(decide({ progress: 12, completed: true, remote: remote({ progress: 12, status: 'COMPLETED' }) }))
      .toEqual({ action: 'skip', remember: { progress: 12, status: 'COMPLETED' } })
  })
  it('completed sends COMPLETED with max progress', () => {
    expect(decide({ progress: 10, completed: true, remote: remote({ progress: 12, status: 'CURRENT' }) }))
      .toEqual({ action: 'send', progress: 12, status: 'COMPLETED' })
  })
  it('completed overrides PAUSED/DROPPED/REPEATING', () => {
    for (const status of ['PAUSED', 'DROPPED', 'REPEATING']) {
      expect(decide({ progress: 12, completed: true, remote: remote({ progress: 2, status }) }))
        .toEqual({ action: 'send', progress: 12, status: 'COMPLETED' })
    }
  })
  it('completed with no remote entry sends COMPLETED', () => {
    expect(decide({ progress: 12, completed: true, remote: remote(null) }))
      .toEqual({ action: 'send', progress: 12, status: 'COMPLETED' })
  })
  it('mismatch when progress exceeds known episode count', () => {
    expect(decide({ progress: 13, completed: false, remote: remote(null, 12) })).toEqual({ action: 'mismatch' })
    expect(decide({ progress: 13, completed: true, remote: remote({ progress: 2, status: 'CURRENT' }, 12) })).toEqual({ action: 'mismatch' })
  })
  it('sends when episode count is unknown', () => {
    expect(decide({ progress: 13, completed: false, remote: remote(null, null) }).action).toBe('send')
  })
})

describe('retry', () => {
  it('uses the delay ladder then retry-later', () => {
    expect(RETRY_DELAYS_MS).toEqual([60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3])
    expect([1, 2, 3, 4].map(retryDelay)).toEqual(RETRY_DELAYS_MS)
    expect(retryDelay(5)).toBe(RETRY_LATER_MS)
    expect(retryDelay(9)).toBe(RETRY_LATER_MS)
    expect(RETRY_LATER_MS).toBe(6 * 3600e3)
  })
  it('exports limits', () => {
    expect(MAX_REJECTED).toBe(5)
    expect(DEBOUNCE_MS).toBe(30e3)
  })
})
