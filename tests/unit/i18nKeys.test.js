import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DICTS } from '../../src/renderer/i18n/index.js'

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? files(p) : /\.jsx?$/.test(e.name) ? [p] : []
  })
}

describe('i18n key coverage', () => {
  it('every literal t(\'key\') used in the renderer exists in sr and en', () => {
    const missing = []
    for (const f of files('src/renderer')) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) {
        for (const lang of ['sr', 'en']) if (!(m[1] in DICTS[lang])) missing.push(`${lang}:${m[1]} (${f})`)
      }
    }
    expect(missing).toEqual([])
  })
})
