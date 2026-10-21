// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import yazl from 'yazl'
import { safeUnzip, checkEntry, MAX_ENTRIES, MAX_TOTAL_BYTES } from '../../src/main/safeUnzip.js'

const roots = []
function tmpRoot() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'safeunzip-'))
  roots.push(r)
  return r
}
afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true })
})

function makeZip(file, build) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    build(zip)
    zip.end()
    zip.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject)
  })
}

function listFiles(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    out.push(path.join(e.parentPath ?? e.path, e.name))
  }
  return out
}

describe('safeUnzip', () => {
  it('extracts files, nested folders and an empty folder byte for byte', async () => {
    const root = tmpRoot()
    const zipPath = path.join(root, 'ok.zip')
    const bin = crypto.randomBytes(64 * 1024)
    await makeZip(zipPath, (z) => {
      z.addBuffer(Buffer.from('hello'), 'a.txt', { mode: 0o100644 })
      z.addBuffer(bin, 'dir/b.bin')
      z.addBuffer(Buffer.from('deep'), 'dir/sub/c.txt')
      z.addEmptyDirectory('empty/')
    })
    const dest = path.join(root, 'out')
    await safeUnzip(zipPath, dest)
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('hello')
    expect(fs.readFileSync(path.join(dest, 'dir', 'b.bin')).equals(bin)).toBe(true)
    expect(fs.readFileSync(path.join(dest, 'dir', 'sub', 'c.txt'), 'utf8')).toBe('deep')
    expect(fs.statSync(path.join(dest, 'empty')).isDirectory()).toBe(true)
  })

  it('extracts a file whose name merely starts with two dots', async () => {
    const root = tmpRoot()
    const zipPath = path.join(root, 'dots.zip')
    await makeZip(zipPath, (z) => z.addBuffer(Buffer.from('x'), '..foo'))
    const dest = path.join(root, 'out')
    await safeUnzip(zipPath, dest)
    expect(fs.readFileSync(path.join(dest, '..foo'), 'utf8')).toBe('x')
  })
  it('rejects a symlink entry and writes nothing outside dest', async () => {
    const root = tmpRoot()
    const zipPath = path.join(root, 'link.zip')
    await makeZip(zipPath, (z) => {
      z.addBuffer(Buffer.from('first'), 'before.txt')
      z.addBuffer(Buffer.from('../../evil'), 'link', { mode: 0o120777 })
      z.addBuffer(Buffer.from('later'), 'after.txt')
    })
    const dest = path.join(root, 'out')
    await expect(safeUnzip(zipPath, dest)).rejects.toThrow(/^unsafe archive:/)
    expect(listFiles(root).some((f) => path.basename(f) === 'evil')).toBe(false)
    expect(fs.existsSync(path.join(dest, 'link'))).toBe(false)
    expect(fs.existsSync(path.join(dest, 'after.txt'))).toBe(false)
  })

  it('rejects more than maxEntries', async () => {
    const root = tmpRoot()
    const zipPath = path.join(root, 'many.zip')
    await makeZip(zipPath, (z) => {
      for (const n of ['1', '2', '3']) z.addBuffer(Buffer.from(n), `${n}.txt`)
    })
    await expect(safeUnzip(zipPath, path.join(root, 'out'), { maxEntries: 2 })).rejects.toThrow(
      /^unsafe archive:/
    )
  })

  it('rejects a declared total above maxTotalBytes', async () => {
    const root = tmpRoot()
    const zipPath = path.join(root, 'big.zip')
    await makeZip(zipPath, (z) => {
      z.addBuffer(Buffer.alloc(10, 1), 'one.bin')
      z.addBuffer(Buffer.alloc(10, 2), 'two.bin')
    })
    await expect(
      safeUnzip(zipPath, path.join(root, 'out'), { maxTotalBytes: 15 })
    ).rejects.toThrow(/^unsafe archive:/)
  })

  it('rejects a duplicate name and a name differing only in case', async () => {
    const root = tmpRoot()
    const dup = path.join(root, 'dup.zip')
    await makeZip(dup, (z) => {
      z.addBuffer(Buffer.from('1'), 'x.txt')
      z.addBuffer(Buffer.from('2'), 'x.txt')
    })
    await expect(safeUnzip(dup, path.join(root, 'out1'))).rejects.toThrow(/^unsafe archive:/)

    if (process.platform === 'win32') {
      const cased = path.join(root, 'case.zip')
      await makeZip(cased, (z) => {
        z.addBuffer(Buffer.from('1'), 'A.txt')
        z.addBuffer(Buffer.from('2'), 'a.txt')
      })
      await expect(safeUnzip(cased, path.join(root, 'out2'))).rejects.toThrow(/^unsafe archive:/)
    }
  })

  it("wraps yauzl's own errors", async () => {
    const root = tmpRoot()
    const bad = path.join(root, 'bad.zip')
    fs.writeFileSync(bad, Buffer.from('not a zip'))
    await expect(safeUnzip(bad, path.join(root, 'out'))).rejects.toThrow(/^unsafe archive:/)
  })

  it('exports the spec limits', () => {
    expect(MAX_ENTRIES).toBe(10000)
    expect(MAX_TOTAL_BYTES).toBe(2 * 1024 ** 3)
  })
})

describe('checkEntry', () => {
  const base = {
    versionMadeBy: 0x031e,
    externalFileAttributes: (0o100644 << 16) >>> 0,
    generalPurposeBitFlag: 0
  }
  const make = (fileName, extra = {}) => ({ ...base, fileName, ...extra })

  it.each(['a', 'a/b.txt'])('accepts file %j', (name) => {
    expect(checkEntry(make(name))).toEqual({ ok: true, kind: 'file' })
  })

  it('accepts a folder', () => {
    expect(checkEntry(make('dir/'))).toEqual({ ok: true, kind: 'dir' })
  })

  it('accepts a DOS-platform file', () => {
    expect(
      checkEntry(make('a.txt', { versionMadeBy: 20, externalFileAttributes: 0x20 }))
    ).toEqual({ ok: true, kind: 'file' })
  })

  it.each([
    '../x',
    'a/../../x',
    '/abs',
    'C:x',
    'a' + String.fromCharCode(92) + 'b',
    'a:b',
    '...',
    '.',
    'a./b',
    'a /b',
    'a\u0000b',
    'a\u0001b',
    'a//b',
    ''
  ])('rejects name %j', (name) => {
    const r = checkEntry(make(name))
    expect(r.ok).toBe(false)
    expect(typeof r.reason).toBe('string')
  })

  it('rejects an encrypted entry', () => {
    expect(checkEntry(make('a', { generalPurposeBitFlag: 1 })).ok).toBe(false)
  })

  it('rejects a Unix symlink', () => {
    expect(checkEntry(make('a', { externalFileAttributes: (0o120777 << 16) >>> 0 })).ok).toBe(false)
  })

  it('rejects a Unix character device', () => {
    expect(checkEntry(make('a', { externalFileAttributes: (0o020644 << 16) >>> 0 })).ok).toBe(false)
  })
})
