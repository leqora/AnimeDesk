import { spawn } from 'node:child_process'
import net from 'node:net'
import crypto from 'node:crypto'
import { segmentAt, formatTime } from '../shared/player.js'

const SKIP_TEXT = {
  sr: { op: 'Preskočen uvod', ed: 'Preskočena odjavna špica', recap: 'Preskočen rezime' },
  en: { op: 'Skipped intro', ed: 'Skipped ending', recap: 'Skipped recap' },
}
const RESUME_TEXT = { sr: 'Nastavljeno od', en: 'Resumed from' }
const PROGRESS_MS = 5000

export function decideWatched({ maxPercent, threshold, autoTrack, askOnClose }) {
  if (!autoTrack) return 'none'
  if (askOnClose) return 'ask'
  return maxPercent >= threshold ? 'watched' : 'none'
}

export function createPercentTracker(onProperty = null) {
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
          if (m.event !== 'property-change') continue
          if (m.name === 'percent-pos' && typeof m.data === 'number') max = Math.max(max, m.data)
          onProperty?.(m)
        } catch {
          // mpv may send non-JSON noise; ignore it
        }
      }
    },
    get max() { return max },
  }
}

export function createPlayer({ getMpvPath, spawnImpl = spawn, connect = net.connect, retryMs = 250, maxRetries = 40, now = Date.now }) {
  const running = new Set()
  return {
    stop() {
      for (const child of running) child.kill()
    },
    play(args, { extraArgs = [], autoSkip = false, skips = null, language = 'sr', onProgress = null, resumeAt = null } = {}) {
      return new Promise((resolve, reject) => {
        const mpv = getMpvPath()
        if (!mpv) return reject(new Error('mpv-missing'))
        const pipe = `\\\\.\\pipe\\animedesk-mpv-${crypto.randomUUID()}`
        const child = spawnImpl(mpv, [`--input-ipc-server=${pipe}`, ...extraArgs, ...args], { stdio: 'ignore' })
        running.add(child)
        let socket = null
        let skipTimes = null
        const skipped = new Set()
        let position = 0
        let duration = 0
        let lastReport = null
        const onProperty = (m) => {
          if (m.name === 'duration' && typeof m.data === 'number') duration = m.data
          if (m.name === 'time-pos' && typeof m.data === 'number') {
            position = m.data
            if (onProgress && (lastReport === null || now() - lastReport >= PROGRESS_MS)) {
              lastReport = now()
              onProgress({ position, duration, maxPercent: tracker.max })
            }
          }
          if (m.name === 'duration' && typeof m.data === 'number' && autoSkip && skips && !skipTimes) {
            skips(m.data).then((s) => { skipTimes = s }).catch(() => {})
          }
          if (m.name === 'time-pos' && typeof m.data === 'number' && skipTimes) {
            const seg = segmentAt(m.data, skipTimes)
            if (seg && !skipped.has(seg)) {
              skipped.add(seg)
              socket.write(`${JSON.stringify({ command: ['seek', skipTimes[seg].end, 'absolute'] })}\n`)
              socket.write(`${JSON.stringify({ command: ['show-text', (SKIP_TEXT[language] ?? SKIP_TEXT.sr)[seg], 1500] })}\n`)
            }
          }
        }
        const tracker = createPercentTracker(onProperty)
        let tries = 0
        let exited = false

        const tryConnect = () => {
          if (exited) return
          socket = connect(pipe)
          socket.on('connect', () => {
            for (const [id, name] of [[1, 'percent-pos'], [2, 'time-pos'], [3, 'duration']]) socket.write(`${JSON.stringify({ command: ['observe_property', id, name] })}\n`)
            if (Number.isFinite(resumeAt) && resumeAt > 0) {
              socket.write(`${JSON.stringify({ command: ['show-text', `${RESUME_TEXT[language] ?? RESUME_TEXT.sr} ${formatTime(resumeAt)}`, 3000] })}\n`)
            }
          })
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
          running.delete(child)
          socket?.destroy()
          resolve({ exitCode: code ?? 0, maxPercent: tracker.max, position, duration })
        })
      })
    },
  }
}
