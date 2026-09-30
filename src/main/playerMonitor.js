import { spawn } from 'node:child_process'
import net from 'node:net'
import crypto from 'node:crypto'

export function decideWatched({ maxPercent, threshold, autoTrack, askOnClose }) {
  if (!autoTrack) return 'none'
  if (askOnClose) return 'ask'
  return maxPercent >= threshold ? 'watched' : 'none'
}

export function createPercentTracker() {
  let buf = ''
  let max = 0
  return {
    feed(chunk) {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        try {
          const m = JSON.parse(line)
          if (m.event === 'property-change' && m.name === 'percent-pos' && typeof m.data === 'number') max = Math.max(max, m.data)
        } catch {
          // mpv may send non-JSON noise; ignore it
        }
      }
    },
    get max() { return max },
  }
}

export function createPlayer({ getMpvPath, spawnImpl = spawn, connect = net.connect, retryMs = 250, maxRetries = 40 }) {
  return {
    play(args) {
      return new Promise((resolve, reject) => {
        const mpv = getMpvPath()
        if (!mpv) return reject(new Error('mpv-missing'))
        const pipe = `\\\\.\\pipe\\animedesk-mpv-${crypto.randomUUID()}`
        const child = spawnImpl(mpv, [`--input-ipc-server=${pipe}`, ...args], { stdio: 'ignore' })
        const tracker = createPercentTracker()
        let socket = null
        let tries = 0
        let exited = false

        const tryConnect = () => {
          if (exited) return
          socket = connect(pipe)
          socket.on('connect', () => socket.write('{"command":["observe_property",1,"percent-pos"]}\n'))
          socket.on('data', (d) => tracker.feed(d.toString()))
          socket.on('error', () => {
            socket.destroy()
            if (!exited && ++tries < maxRetries) setTimeout(tryConnect, retryMs)
          })
        }
        setTimeout(tryConnect, retryMs)

        child.on('error', reject)
        child.on('exit', (code) => {
          exited = true
          socket?.destroy()
          resolve({ exitCode: code ?? 0, maxPercent: tracker.max })
        })
      })
    },
  }
}
