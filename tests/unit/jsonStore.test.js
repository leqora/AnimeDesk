import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJson, writeJsonAtomic } from '../../src/main/jsonStore.js'

let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-json-')) })

describe('jsonStore', () => {
  it('returns a copy of the fallback when the file does not exist', () => {
    const fallback = { a: [] }
    const r = readJson(path.join(dir, 'x.json'), fallback)
    expect(r).toEqual({ data: { a: [] }, corrupt: false })
    r.data.a.push(1)
    expect(fallback.a).toEqual([])
  })
  it('writes atomically and reads back, creating folders', () => {
    const file = path.join(dir, 'sub', 'x.json')
    writeJsonAtomic(file, { n: 1 })
    expect(readJson(file, {}).data).toEqual({ n: 1 })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })
  it('backs up a corrupt file and starts fresh', () => {
    const file = path.join(dir, 'library.json')
    fs.writeFileSync(file, '{ broken')
    const r = readJson(file, { ok: true })
    expect(r.corrupt).toBe(true)
    expect(r.data).toEqual({ ok: true })
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.readFileSync(r.backup, 'utf8')).toBe('{ broken')
    expect(path.basename(r.backup)).toMatch(/^library\.corrupt-.+\.json$/)
  })
})
