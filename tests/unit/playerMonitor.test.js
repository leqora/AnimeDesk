import { describe, it, expect } from 'vitest'
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
  it('rejects when mpv is missing', async () => {
    await expect(createPlayer({ getMpvPath: () => null }).play([])).rejects.toThrow('mpv-missing')
  })
})
