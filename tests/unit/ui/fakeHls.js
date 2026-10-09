import { vi } from 'vitest'

export class FakeHls {
  static Events = { ERROR: 'hlsError', FRAG_CHANGED: 'hlsFragChanged' }
  static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' }
  static instances = []
  static get last() { return FakeHls.instances.at(-1) }
  constructor(config) {
    this.config = config; this.handlers = {}
    // a parsed manifest by default; set `levels = []` to simulate a playlist that never loaded
    this.levels = [{}]
    this.startLoad = vi.fn(); this.recoverMediaError = vi.fn(); this.swapAudioCodec = vi.fn(); this.destroy = vi.fn()
    this.loadSource = vi.fn((src) => { this.src = src })
    FakeHls.instances.push(this)
  }
  on(ev, cb) { this.handlers[ev] = cb }
  attachMedia(el) { this.media = el }
  emit(ev, data = {}) { this.handlers[ev]?.(ev, data) }
  emitError(type, fatal = true, details = 'x') { this.handlers[FakeHls.Events.ERROR]?.('hlsError', { type, fatal, details }) }
}
