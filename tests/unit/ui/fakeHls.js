import { vi } from 'vitest'

export class FakeHls {
  static Events = { ERROR: 'hlsError' }
  static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' }
  static instances = []
  static get last() { return FakeHls.instances.at(-1) }
  constructor(config) { this.config = config; this.handlers = {}; this.startLoad = vi.fn(); this.recoverMediaError = vi.fn(); this.destroy = vi.fn(); FakeHls.instances.push(this) }
  on(ev, cb) { this.handlers[ev] = cb }
  loadSource(src) { this.src = src }
  attachMedia(el) { this.media = el }
  emitError(type, fatal = true) { this.handlers[FakeHls.Events.ERROR]?.('hlsError', { type, fatal, details: 'x' }) }
}
