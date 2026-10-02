import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWhatsNew, readReleaseNotes } from '../../src/main/whatsNew.js'

function fakeSettings(lastSeenVersion) {
  let s = { lastSeenVersion }
  return { get: () => ({ ...s }), update: vi.fn((p) => { s = { ...s, ...p }; return { ...s } }) }
}
const readNotes = (v) => `Notes for ${v}`

describe('whatsNew', () => {
  it('records the version silently on a fresh install', () => {
    const settings = fakeSettings(null)
    const w = createWhatsNew({ settings, currentVersion: '0.3.0', readNotes })
    w.init()
    expect(settings.update).toHaveBeenCalledWith({ lastSeenVersion: '0.3.0' })
    expect(w.get()).toBeNull()
  })
  it('shows notes once after an update', () => {
    const settings = fakeSettings('0.3.0')
    const w = createWhatsNew({ settings, currentVersion: '0.3.1', readNotes })
    w.init()
    expect(w.get()).toEqual({ version: '0.3.1', notes: 'Notes for 0.3.1' })
    w.seen()
    expect(settings.get().lastSeenVersion).toBe('0.3.1')
    expect(w.get()).toBeNull()
    const again = createWhatsNew({ settings, currentVersion: '0.3.1', readNotes })
    again.init()
    expect(again.get()).toBeNull()
  })
  it('reads release notes files and returns null when missing or empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-notes-'))
    fs.writeFileSync(path.join(dir, 'v0.3.1.md'), '## Novo\n- Ažuriranje\n')
    fs.writeFileSync(path.join(dir, 'v0.3.2.md'), '   \n')
    expect(readReleaseNotes(dir, '0.3.1')).toBe('## Novo\n- Ažuriranje')
    expect(readReleaseNotes(dir, '0.3.2')).toBeNull()
    expect(readReleaseNotes(dir, '9.9.9')).toBeNull()
  })
})
