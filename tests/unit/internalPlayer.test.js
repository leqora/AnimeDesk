import { describe, it, expect, vi } from 'vitest'
import { createInternalPlayer } from '../../src/main/internalPlayer.js'
import { EVENTS } from '../../src/shared/channels.js'

function setup({ resume = null } = {}) {
  const streams = {
    register: vi.fn(() => ({ id: 'p1', playlistUrl: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: 'http://127.0.0.1:9/s/t/p1/sub' })),
    registerFile: vi.fn(() => ({ id: 'f1', fileUrl: 'http://127.0.0.1:9/s/t/f1/file' })),
    unregister: vi.fn(),
  }
  const positions = { get: vi.fn(() => resume), save: vi.fn() }
  const events = []
  const player = createInternalPlayer({ streams, notify: (c, p) => events.push([c, p]), positions, getTotalEpisodes: () => 12 })
  return { streams, positions, events, player }
}
const info = { title: 'Show', episode: '3', url: 'https://cdn/x.m3u8', referrer: 'https://ref/', subUrl: 'https://cdn/a.vtt', mpvArgs: [] }

describe('internalPlayer', () => {
  it('opens the renderer player and resolves when it closes', async () => {
    const { streams, positions, events, player } = setup({ resume: { position: 600, duration: 1400 } })
    const done = player.play(info)
    expect(streams.register).toHaveBeenCalledWith({ url: 'https://cdn/x.m3u8', referrer: 'https://ref/', subUrl: 'https://cdn/a.vtt' })
    expect(events[0]).toEqual([EVENTS.playerOpen, { playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: 'http://127.0.0.1:9/s/t/p1/sub', resumeAt: 600, totalEpisodes: 12 }])
    expect(player.isActive()).toBe(true)
    player.progress({ playbackId: 'p1', position: 300, duration: 1400, maxPercent: 21 })
    expect(positions.save).toHaveBeenCalledWith('Show', '3', { position: 300, duration: 1400 })
    player.closed({ playbackId: 'other', maxPercent: 99, position: 1, duration: 1, reason: 'back' })
    expect(player.isActive()).toBe(true)
    player.closed({ playbackId: 'p1', maxPercent: 90, position: 1300, duration: 1400, reason: 'ended' })
    await expect(done).resolves.toEqual({ exitCode: 0, maxPercent: 90, position: 1300, duration: 1400, reason: 'ended' })
    expect(streams.unregister).toHaveBeenCalledWith('p1')
    expect(player.isActive()).toBe(false)
  })
  it('keeps the highest percent reported', async () => {
    const { player } = setup()
    const done = player.play(info)
    player.progress({ playbackId: 'p1', position: 1300, duration: 1400, maxPercent: 92 })
    player.closed({ playbackId: 'p1', maxPercent: 40, position: 500, duration: 1400, reason: 'back' })
    expect((await done).maxPercent).toBe(92)
  })
  it('stop closes the renderer player and resolves as back', async () => {
    const { events, player, streams } = setup()
    const done = player.play(info)
    player.stop()
    expect(events.at(-1)).toEqual([EVENTS.playerClose, { playbackId: 'p1' }])
    await expect(done).resolves.toMatchObject({ reason: 'back', maxPercent: 0 })
    expect(streams.unregister).toHaveBeenCalledWith('p1')
    player.stop()
  })
  it('plays local files without resume lookups for unknown episodes', async () => {
    const { streams, events, player, positions } = setup()
    const done = player.play({ file: 'D:\\A\\Show Episode 1.mp4', title: 'Show', episode: null, mpvArgs: [] })
    expect(streams.registerFile).toHaveBeenCalledWith('D:\\A\\Show Episode 1.mp4')
    expect(positions.get).not.toHaveBeenCalled()
    expect(events[0][1]).toMatchObject({ kind: 'file', src: 'http://127.0.0.1:9/s/t/f1/file', subtitleUrl: null, resumeAt: null })
    player.closed({ playbackId: 'f1', maxPercent: 10, position: 100, duration: 1400, reason: 'back' })
    await done
    expect(positions.save).not.toHaveBeenCalled()
  })
  it('never overwrites a saved resume point with a position below 10 seconds', async () => {
    const { player, positions } = setup({ resume: { position: 600, duration: 1400 } })
    const done = player.play(info)
    player.closed({ playbackId: 'p1', maxPercent: 0, position: 0, duration: 1400, reason: 'back' })
    await done
    expect(positions.save).not.toHaveBeenCalled()
  })
})
