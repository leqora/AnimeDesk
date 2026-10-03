import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

describe('renderer CSP', () => {
  it('allows media only from the app and the local stream server', () => {
    const html = fs.readFileSync('src/renderer/index.html', 'utf8')
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1]
    expect(csp).toBe("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: http://127.0.0.1:*; connect-src 'self' http://127.0.0.1:*; worker-src 'self' blob:")
  })
})
