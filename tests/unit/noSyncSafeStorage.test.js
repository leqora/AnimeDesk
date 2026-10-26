import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '../../src')

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.jsx?$/.test(e.name) ? [p] : []
  })
}

// Electron 46 removes the synchronous safeStorage methods; only the async ones may be used.
describe('safeStorage', () => {
  it('no source file uses the synchronous API', () => {
    const files = sources(SRC)
    expect(files.length).toBeGreaterThan(10)
    const offenders = files.filter((f) => /safeStorage\.(isEncryptionAvailable|encryptString|decryptString)\b/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
