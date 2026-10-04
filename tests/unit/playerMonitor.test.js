import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { decideWatched, createPercentTracker, createPlayer } from '../../src/main/playerMonitor.js'

describe('decideWatched', () => {
  it('uses the threshold', () => {
    expect(decideWatched({ maxPercent: 85, threshold: 85, autoTrack: true, askOnClose: false })).toBe('watched')
    expect(decideWatched({ maxPercent: 84.9, threshold: 85, autoTrack: true, askOnClose: false })).toBe('none')
    expect(decideWatched({ maxPercent: 60, threshold: 50, autoTrack: true, askOnClose: false })).toBe('watched')
  })
  it('asks on close instead of using the threshold', () => {
    expect(decideWatched({ maxPercent: 5, threshold: 85, autoTrack: true, askOnClose: true })).toBe('ask')
  })
  it('does nothing when auto tracking is off', () => {
    expect(decideWatched({ maxPercent: 100, threshold: 85, autoTrack: false, askOnClose: true })).toBe('none')
  })
})

describe('createPercentTracker', () => {
  it('keeps the maximum percent-pos across split chunks and ignores noise', () => {
    const t = createPercentTracker()
    t.feed('{"event":"property-change","id":1,"name":"percent-pos","data":10.5}\n{"event":"prop')
    t.feed('erty-change","id":1,"name":"percent-pos","data":90}\n{"event":"seek"}\nnot json\n')
    t.feed('{"event":"property-change","id":1,"name":"percent-pos","data":30}\n')
    expect(t.max).toBe(90)
  })
})

describe('createPlayer', () => {
  it('spawns mpv with an IPC pipe, observes progress and resolves on exit', async () => {
    const child = new EventEmitter()
    let spawned
    const socket = new EventEmitter()
    socket.written = []
    socket.write = (s) => socket.written.push(s)
    socket.destroy = () => {}
    const player = createPlayer({
      getMpvPath: () => 'C:\\mpv\\mpv.exe',
      spawnImpl: (cmd, args) => { spawned = { cmd, args }; return child },
      connect: () => { setTimeout(() => { socket.emit('connect'); socket.emit('data', Buffer.from('{"event":"property-change","name":"percent-pos","data":88}\n')); child.emit('exit', 0) }, 5); return socket },
      retryMs: 1,
    })
    const r = await player.play(['--force-media-title=A Episode 1', 'https://v'])
    expect(spawned.cmd).toBe('C:\\mpv\\mpv.exe')
    expect(spawned.args[0]).toMatch(/^--input-ipc-server=\\\\\.\\pipe\\animedesk-mpv-/)
    expect(spawned.args.slice(1)).toEqual(['--force-media-title=A Episode 1', 'https://v'])
    expect(socket.written[0]).toBe('{"command":["observe_property",1,"percent-pos"]}\n')
    expect(r).toEqual({ exitCode: 0, maxPercent: 88 })
  })
  it('stop() closes a running mpv', async () => {
    const child = new EventEmitter()
    child.kill = vi.fn(() => child.emit('exit', 1))
    const socket = () => { const s = new EventEmitter(); s.write = () => {}; s.destroy = () => {}; return s }
    const player = createPlayer({ getMpvPath: () => 'mpv.exe', spawnImpl: () => child, connect: socket, retryMs: 1, maxRetries: 1 })
    const playing = player.play(['https://v'])
    player.stop()
    expect(child.kill).toHaveBeenCalled()
    expect((await playing).exitCode).toBe(1)
  })
  describe('auto-skip', () => {
    function setupPlayer() {
      const child = new EventEmitter()
      const socket = new EventEmitter()
      socket.write = vi.fn()
      socket.destroy = () => {}
      const spawnImpl = vi.fn(() => child)
      const player = createPlayer({ getMpvPath: () => 'mpv.exe', spawnImpl, connect: () => { setTimeout(() => socket.emit('connect'), 1); return socket }, retryMs: 1 })
      const connected = () => new Promise((r) => setTimeout(r, 15))
      return { player, socket, child, spawnImpl, connected }
    }
    it('auto-skips each segment once through mpv IPC', async () => {
      const { player, socket, child, connected } = setupPlayer()
      const skips = vi.fn(async () => ({ op: { start: 3, end: 93 }, ed: null, recap: null }))
      const done = player.play(['https://v'], { autoSkip: true, skips })
      await connected()
      socket.emit('data', Buffer.from('{"event":"property-change","id":3,"name":"duration","data":1400}\n'))
      await Promise.resolve()
      expect(skips).toHaveBeenCalledWith(1400)
      await new Promise((r) => setTimeout(r, 0))
      socket.emit('data', Buffer.from('{"event":"property-change","id":2,"name":"time-pos","data":5}\n'))
      expect(socket.write).toHaveBeenCalledWith('{"command":["seek",93,"absolute"]}\n')
      expect(socket.write).toHaveBeenCalledWith('{"command":["show-text","Preskočen uvod",1500]}\n')
      socket.write.mockClear()
      socket.emit('data', Buffer.from('{"event":"property-change","id":2,"name":"time-pos","data":10}\n'))
      expect(socket.write).not.toHaveBeenCalledWith(expect.stringContaining('seek'))
      child.emit('exit', 0)
      await done
    })
    it('shows the skip message in the app language', async () => {
      const { player, socket, child, connected } = setupPlayer()
      const skips = vi.fn(async () => ({ op: null, ed: null, recap: { start: 0, end: 60 } }))
      const done = player.play(['https://v'], { autoSkip: true, skips, language: 'en' })
      await connected()
      socket.emit('data', Buffer.from('{"event":"property-change","id":3,"name":"duration","data":1400}\n'))
      await new Promise((r) => setTimeout(r, 0))
      socket.emit('data', Buffer.from('{"event":"property-change","id":2,"name":"time-pos","data":5}\n'))
      expect(socket.write).toHaveBeenCalledWith('{"command":["show-text","Skipped recap",1500]}\n')
      child.emit('exit', 0)
      await done
    })
    it('passes extra args before the media args and does not skip without autoSkip', async () => {
      const { player, socket, child, spawnImpl, connected } = setupPlayer()
      const skips = vi.fn()
      const done = player.play(['https://v'], { extraArgs: ['--config-dir=C:/cfg'], skips })
      expect(spawnImpl.mock.calls.at(-1)[1]).toEqual([expect.stringMatching(/^--input-ipc-server=/), '--config-dir=C:/cfg', 'https://v'])
      await connected()
      socket.emit('data', Buffer.from('{"event":"property-change","id":3,"name":"duration","data":1400}\n'))
      expect(skips).not.toHaveBeenCalled()
      child.emit('exit', 0)
      await done
    })
  })
  it('rejects when mpv is missing', async () => {
    await expect(createPlayer({ getMpvPath: () => null }).play([])).rejects.toThrow('mpv-missing')
  })
})
