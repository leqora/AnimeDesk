const KEY_SOUNDS = new Set(['levelUp', 'seriesCompleted', 'downloadDone'])
const PRIORITY = { levelUp: 3, seriesCompleted: 2, downloadDone: 2, click: 1, navigate: 1 }

function tone(ctx, out, freq, start, length, { type = 'sine', peak = 0.3, to = null } = {}) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + length)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + 0.01)
  env.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(env)
  env.connect(out)
  osc.start(start)
  osc.stop(start + length + 0.02)
}

// Each recipe schedules its notes and returns its duration in seconds.
const RECIPES = {
  levelUp(ctx, out, t) {
    tone(ctx, out, 523.25, t, 0.5, { type: 'triangle' })
    tone(ctx, out, 659.25, t + 0.12, 0.5, { type: 'triangle' })
    tone(ctx, out, 783.99, t + 0.24, 0.5, { type: 'triangle' })
    tone(ctx, out, 1567.98, t + 0.36, 0.4, { peak: 0.12 })
    return 0.8
  },
  seriesCompleted(ctx, out, t) {
    tone(ctx, out, 659.25, t, 0.25, { type: 'triangle' })
    tone(ctx, out, 880, t + 0.15, 0.45, { type: 'triangle' })
    return 0.6
  },
  downloadDone(ctx, out, t) {
    tone(ctx, out, 880, t, 0.15)
    tone(ctx, out, 1174.66, t + 0.12, 0.2)
    return 0.32
  },
  click(ctx, out, t) {
    tone(ctx, out, 2000, t, 0.03, { type: 'square', peak: 0.05 })
    return 0.04
  },
  navigate(ctx, out, t) {
    tone(ctx, out, 300, t, 0.15, { peak: 0.08, to: 900 })
    return 0.15
  },
}

export function createSound({ getSettings, audioContextFactory = () => new AudioContext() }) {
  let ctx = null
  let current = null // { name, until, out }

  function play(name) {
    const recipe = RECIPES[name]
    if (!recipe) return false
    const s = getSettings()
    if (KEY_SOUNDS.has(name) ? !s.soundKey : !s.soundUi) return false
    ctx ??= audioContextFactory()
    if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {})
    const now = ctx.currentTime
    if (current && current.until > now) {
      if (PRIORITY[current.name] > PRIORITY[name]) return false
      current.out.disconnect()
    }
    const out = ctx.createGain()
    out.gain.value = s.soundVolume / 100
    out.connect(ctx.destination)
    const length = recipe(ctx, out, now)
    current = { name, until: now + length, out }
    return true
  }

  return { play }
}
