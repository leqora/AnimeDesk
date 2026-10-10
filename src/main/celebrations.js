import { EVENTS } from '../shared/channels.js'

const HELD = new Set([EVENTS.levelUp, EVENTS.seriesCompleted])

// While an episode plays, an episode recorded at the threshold must not pop a level-up over the ending.
export function createCelebrations(send) {
  let holds = 0
  const queue = []
  return {
    notify(channel, payload) {
      if (holds > 0 && HELD.has(channel)) queue.push([channel, payload])
      else send(channel, payload)
    },
    hold() { holds++ },
    release() {
      if (holds === 0) return
      holds--
      if (holds === 0) for (const [channel, payload] of queue.splice(0)) send(channel, payload)
    },
  }
}
