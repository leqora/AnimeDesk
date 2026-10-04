import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureMpvConfig } from '../../src/main/mpvConfig.js'

let root, uoscRoot, dir
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-mpvcfg-'))
  uoscRoot = path.join(root, 'tools', 'uosc')
  fs.mkdirSync(path.join(uoscRoot, 'scripts', 'uosc'), { recursive: true })
  fs.mkdirSync(path.join(uoscRoot, 'fonts'), { recursive: true })
  fs.writeFileSync(path.join(uoscRoot, 'scripts', 'uosc', 'main.lua'), 'v1')
  fs.writeFileSync(path.join(uoscRoot, 'fonts', 'uosc_icons.otf'), 'f')
  dir = path.join(root, 'mpv-config')
})

describe('ensureMpvConfig', () => {
  it('writes mpv.conf and copies uosc scripts and fonts', () => {
    expect(ensureMpvConfig({ dir, uoscRoot, version: '5.0' })).toBe(dir)
    expect(fs.readFileSync(path.join(dir, 'mpv.conf'), 'utf8')).toBe('osc=no\nosd-bar=no\n')
    expect(fs.readFileSync(path.join(dir, 'scripts', 'uosc', 'main.lua'), 'utf8')).toBe('v1')
    expect(fs.existsSync(path.join(dir, 'fonts', 'uosc_icons.otf'))).toBe(true)
  })
  it('recopies only when the uosc version changes', () => {
    ensureMpvConfig({ dir, uoscRoot, version: '5.0' })
    fs.writeFileSync(path.join(uoscRoot, 'scripts', 'uosc', 'main.lua'), 'v2')
    ensureMpvConfig({ dir, uoscRoot, version: '5.0' })
    expect(fs.readFileSync(path.join(dir, 'scripts', 'uosc', 'main.lua'), 'utf8')).toBe('v1')
    ensureMpvConfig({ dir, uoscRoot, version: '5.1' })
    expect(fs.readFileSync(path.join(dir, 'scripts', 'uosc', 'main.lua'), 'utf8')).toBe('v2')
  })
  it('returns null without uosc', () => {
    expect(ensureMpvConfig({ dir, uoscRoot: null, version: null })).toBeNull()
  })
})
