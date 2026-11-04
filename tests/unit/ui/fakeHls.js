import { vi } from 'vitest'

export class FakeHls {
  static Events = { ERROR: 'hlsError', FRAG_CHANGED: 'hlsFragChanged', MANIFEST_PARSED: 'hlsManifestParsed' }
  static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' }
  static instances = []
  static get last() { return FakeHls.instances.at(-1) }
  constructor(config) {
    this.config = config; this.handlers = {}
    // like real hls.js: levels stay [] until the manifest is parsed. By default loadSource parses it synchronously;
    // `deferManifest = true` (see LazyHls) keeps it pending until a test emits MANIFEST_PARSED.
    this.levels = []; this.manifestParsed = false; this.manifestAborted = false
    // real hls.js 1.7: stopLoad() also aborts the in-progress manifest request
    this.stopLoad = vi.fn(() => { if (!this.manifestParsed) this.manifestAborted = true })
    this.startLoad = vi.fn(); this.recoverMediaError = vi.fn(); this.swapAudioCodec = vi.fn(); this.destroy = vi.fn()
    this.loadSource = vi.fn((src) => { this.src = src; if (!this.deferManifest) this.emit(FakeHls.Events.MANIFEST_PARSED) })
    FakeHls.instances.push(this)
  }
  on(ev, cb) { this.handlers[ev] = cb }
  attachMedia(el) { this.media = el }
  emit(ev, data = {}) {
    if (ev === FakeHls.Events.MANIFEST_PARSED) { this.manifestParsed = true; if (!this.levels.length) this.levels = [{}] }
    this.handlers[ev]?.(ev, data) }
  emitError(type, fatal = true, details = 'x') { this.handlers[FakeHls.Events.ERROR]?.('hlsError', { type, fatal, details }) }
}

// manifest stays unparsed until a test emits MANIFEST_PARSED
export class LazyHls extends FakeHls { deferManifest = true }
