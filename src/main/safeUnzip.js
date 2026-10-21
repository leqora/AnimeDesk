// Safe zip extraction for downloaded tools (replaces extract-zip).
// Rejects anything but plain files and folders, unsafe names, too many
// entries and too many declared bytes. Every rejection message starts with
// "unsafe archive:".
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'

export const MAX_ENTRIES = 10000
export const MAX_TOTAL_BYTES = 2 * 1024 ** 3

const PREFIX = 'unsafe archive: '

function unsafe(reason, name = '') {
  const suffix = name ? ` (${String(name).slice(0, 200)})` : ''
  return new Error(PREFIX + reason + suffix)
}

function wrap(err, name) {
  if (err && typeof err.message === 'string' && err.message.startsWith(PREFIX)) return err
  return unsafe(err && err.message ? err.message : String(err), name)
}

/**
 * Pure per-entry validation. Does not depend on yauzl's own checks.
 * @returns {{ ok: true, kind: 'file' | 'dir' } | { ok: false, reason: string }}
 */
export function checkEntry(entry) {
  const name = entry.fileName
  if (entry.generalPurposeBitFlag & 1) return { ok: false, reason: 'encrypted entry' }

  let isDirType = false
  if (entry.versionMadeBy >> 8 === 3) {
    const type = (entry.externalFileAttributes >>> 16) & 0o170000
    if (type !== 0 && type !== 0o100000 && type !== 0o040000) {
      return { ok: false, reason: 'unsupported entry type' }
    }
    isDirType = type === 0o040000
  }

  if (typeof name !== 'string' || name === '') return { ok: false, reason: 'empty name' }
  if (name.includes(String.fromCharCode(92))) return { ok: false, reason: 'backslash in name' }
  if (name.includes(':')) return { ok: false, reason: 'colon in name' }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return { ok: false, reason: 'control character in name' }
  if (name.startsWith('/')) return { ok: false, reason: 'absolute path' }

  const isDir = name.endsWith('/')
  const segments = (isDir ? name.slice(0, -1) : name).split('/')
  for (const seg of segments) {
    if (seg === '') return { ok: false, reason: 'empty path segment' }
    if (/^\.+$/.test(seg)) return { ok: false, reason: 'dot-only path segment' }
    if (/[. ]$/.test(seg)) return { ok: false, reason: 'segment ends with dot or space' }
  }
  return { ok: true, kind: isDir || isDirType ? 'dir' : 'file' }
}

function openZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      file,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (err, zipfile) => (err ? reject(wrap(err)) : resolve(zipfile))
    )
  })
}

function openEntryStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => (err ? reject(wrap(err, entry.fileName)) : resolve(stream)))
  })
}

/**
 * @param {string} file
 * @param {string} destDir
 * @param {{ maxEntries?: number, maxTotalBytes?: number }} [opts]
 * @returns {Promise<void>}
 */
export async function safeUnzip(file, destDir, opts = {}) {
  const { maxEntries = MAX_ENTRIES, maxTotalBytes = MAX_TOTAL_BYTES } = opts
  const root = path.resolve(destDir)
  const zipfile = await openZip(file)

  try {
    await new Promise((resolve, reject) => {
      let count = 0
      let total = 0
      let failed = false
      const fail = (err, name) => {
        if (failed) return
        failed = true
        reject(wrap(err, name))
      }

      async function handle(entry) {
        count += 1
        if (count > maxEntries) throw unsafe('too many entries')
        const verdict = checkEntry(entry)
        if (!verdict.ok) throw unsafe(verdict.reason, entry.fileName)
        if (verdict.kind === 'file') {
          total += entry.uncompressedSize
          if (total > maxTotalBytes) throw unsafe('declared size too large', entry.fileName)
        }
        const segments = entry.fileName.replace(/\/$/, '').split('/')
        const target = path.resolve(root, ...segments)
        const rel = path.relative(root, target)
        if (!rel || path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)) {
          throw unsafe('path escapes destination', entry.fileName)
        }
        if (verdict.kind === 'dir') {
          await fs.promises.mkdir(target, { recursive: true })
          return
        }
        await fs.promises.mkdir(path.dirname(target), { recursive: true })
        const stream = await openEntryStream(zipfile, entry)
        await pipeline(stream, fs.createWriteStream(target, { flags: 'wx' }))
      }

      zipfile.on('error', (err) => fail(err))
      zipfile.on('end', () => {
        if (!failed) resolve()
      })
      zipfile.on('entry', (entry) => {
        handle(entry).then(
          () => {
            if (!failed) zipfile.readEntry()
          },
          (err) => fail(err, entry.fileName)
        )
      })
      zipfile.readEntry()
    })
  } finally {
    zipfile.close()
  }
}
