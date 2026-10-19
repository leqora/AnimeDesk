import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHealthStore } from '../../src/main/healthStore.js'

let dir, file, store
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'))
  file = path.join(dir, 'health.json')
  store = createHealthStore({ file })
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('healthStore', () => {
  it('read returns null without file', () => {
    expect(store.read()).toBeNull()
  })
  it('write then read round-trips', () => {
    const rec = { okAt: '2026-10-19T10:00:00.000Z', tools: { bash: null, 'ani-cli': '4.10' } }
    store.write(rec)
    expect(store.read()).toEqual(rec)
  })
  it('garbage file reads null and leaves a .corrupt copy', () => {
    fs.writeFileSync(file, '{not json')
    expect(store.read()).toBeNull()
    expect(fs.readdirSync(dir).some((n) => n.includes('.corrupt-'))).toBe(true)
  })
  it('read swallows read errors', () => {
    store.write({ okAt: 'x', tools: {} })
    const err = Object.assign(new Error('denied'), { code: 'EPERM' })
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw err })
    expect(store.read()).toBeNull()
  })
  it('clear removes the file and is idempotent', () => {
    store.write({ okAt: 'x', tools: {} })
    store.clear()
    expect(fs.existsSync(file)).toBe(false)
    expect(() => store.clear()).not.toThrow()
  })
})
