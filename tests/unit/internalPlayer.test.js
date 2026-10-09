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
    expect(events[0]).toEqual([EVENTS.playerOpen, { playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: 'http://127.0.0.1:9/s/t/p1/sub', resumeAt: 600, autoResume: false, qualityFallback: null, totalEpisodes: 12 }])
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
  it('passes the subtitles of a downloaded file to the player', async () => {
    const { streams, events, player } = setup()
    streams.registerFile.mockReturnValueOnce({ id: 'f2', fileUrl: 'http://127.0.0.1:9/s/t/f2/file', subtitleUrl: 'http://127.0.0.1:9/s/t/f2/sub' })
    const done = player.play({ file: 'D:\A\Show Episode 2.mp4', title: 'Show', episode: null, mpvArgs: [] })
    expect(events[0][1]).toMatchObject({ kind: 'file', src: 'http://127.0.0.1:9/s/t/f2/file', subtitleUrl: 'http://127.0.0.1:9/s/t/f2/sub' })
    player.closed({ playbackId: 'f2', maxPercent: 10, position: 100, duration: 1400, reason: 'back' })
    await done
  })
  it('resumes a recovery at the given second without asking', () => {
    const { positions, events, player } = setup({ resume: { position: 600, duration: 1400 } })
    player.play({ ...info, resume: { at: 5, auto: true, title: 'Show', episode: '3' }, qualityFallback: '720' })
    expect(positions.get).not.toHaveBeenCalled()
    expect(events[0][1]).toMatchObject({ resumeAt: 5, autoResume: true, qualityFallback: null })
  })
  it('does not repeat the quality notice after a recovery', () => {
    const { events, player } = setup()
    player.play({ ...info, resume: { at: 5, auto: true, title: 'Show', episode: '3' }, qualityFallback: '720' })
    expect(events[0][1]).toMatchObject({ qualityFallback: null })
  })
  it('reports the active playback', () => {
    const { player } = setup()
    expect(player.current()).toBeNull()
    player.play(info)
    expect(player.current()).toEqual({ playbackId: 'p1', title: 'Show', episode: '3' })
  })
  it('retry resolves with the snapshot position even below 10 s and tells the renderer to close', async () => {
    const { positions, events, player } = setup()
    const done = player.play(info)
    player.closed({ playbackId: 'p1', position: 4, duration: 1400, maxPercent: 0, reason: 'retry' })
    expect(events).toContainEqual([EVENTS.playerClose, { playbackId: 'p1' }])
    expect(positions.save).not.toHaveBeenCalled()
    await expect(done).resolves.toMatchObject({ reason: 'retry', position: 4 })
  })
  it('does not send playerClose for a normal close (the renderer closed itself)', () => {
    const { events, player } = setup()
    player.play(info)
    player.closed({ playbackId: 'p1', position: 700, duration: 1400, maxPercent: 50, reason: 'back' })
    expect(events.some(([c]) => c === EVENTS.playerClose)).toBe(false)
  })
  it('never overwrites a saved resume point with a position below 10 seconds', async () => {
    const { player, positions } = setup({ resume: { position: 600, duration: 1400 } })
    const done = player.play(info)
    player.closed({ playbackId: 'p1', maxPercent: 0, position: 0, duration: 1400, reason: 'back' })
    await done
    expect(positions.save).not.toHaveBeenCalled()
  })
})
