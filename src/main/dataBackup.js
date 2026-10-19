import nodeFs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { writeJsonAtomic } from './jsonStore.js'
import { sanitizeLibrary } from './library.js'
import { sanitizeWatchLog } from './watchLog.js'
import { sanitizeSeriesPrefs } from './seriesPrefs.js'
import { sanitizePositions } from './positions.js'
import { LOCAL_SETTINGS } from './settings.js'
import { MAX_IMPORT_BYTES, IMPORT_TTL_MS, PRE_IMPORT_KEEP, toPrune, preImportName } from '../shared/backupRules.js'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Backup / import engine. Never touches the AniList token or other services; `onImported` is the only outward hook.
export function createDataBackup({
  paths, library, watchLog, seriesPrefs, positions, settings, tracker, progress,
  appVersion, fs = nodeFs, now = Date.now, uuid = () => crypto.randomUUID(), onImported = () => {},
}) {
  let pending = null // { token, candidate, expiresAt } — one at a time

  const wrap = (snaps) => ({
    app: 'AnimeDesk',
    kind: 'backup',
    format: 1,
    appVersion,
    createdAt: new Date(now()).toISOString(),
    data: { library: snaps.library, watchlog: snaps.watchlog, seriesPrefs: snaps.seriesPrefs, positions: snaps.positions, settings: snaps.settings },
  })
  const takeSnapshots = () => ({
    library: library.snapshot(),
    watchlog: watchLog.snapshot(),
    seriesPrefs: seriesPrefs.snapshot(),
    positions: positions.snapshot(),
    settings: settings.snapshot(),
  })

  const build = () => wrap(takeSnapshots())
  const exportTo = (file) => writeJsonAtomic(file, build())
  function writeCopy(name) {
    const file = path.join(paths.backups, name)
    writeJsonAtomic(file, build())
    return file
  }

  function readBackup(file) {
    let raw
    try {
      if (fs.statSync(file).size > MAX_IMPORT_BYTES) return { ok: false, error: 'too-large' }
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      return { ok: false, error: 'read-failed' }
    }
    let doc
    try { doc = JSON.parse(raw) } catch { return { ok: false, error: 'invalid' } }
    if (!isObject(doc) || doc.app !== 'AnimeDesk' || doc.kind !== 'backup') return { ok: false, error: 'invalid' }
    if (typeof doc.format !== 'number' || !Number.isFinite(doc.format) || doc.format < 1) return { ok: false, error: 'invalid' }
    if (doc.format > 1) return { ok: false, error: 'newer' }
    const data = doc.data
    if (!isObject(data) || !isObject(data.library) || !isObject(data.library.anime)) return { ok: false, error: 'invalid' }

    const inputCount = Object.keys(data.library.anime).length
    const lib = sanitizeLibrary(data.library, { now: () => new Date(now()).toISOString() })
    if (inputCount > 0 && lib.accepted === 0) return { ok: false, error: 'invalid' }
    const log = sanitizeWatchLog(data.watchlog, new Set(Object.keys(lib.db.anime)), { uuid })
    const candidate = {
      library: lib.db,
      watchlog: log,
      seriesPrefs: sanitizeSeriesPrefs(data.seriesPrefs),
      positions: sanitizePositions(data.positions),
      settings: isObject(data.settings) ? data.settings : {},
    }
    const token = uuid()
    pending = { token, candidate, expiresAt: now() + IMPORT_TTL_MS }
    return {
      ok: true,
      preview: {
        token,
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : null,
        appVersion: typeof doc.appVersion === 'string' ? doc.appVersion : null,
        series: lib.accepted,
        logEntries: log.entries.length,
        skipped: lib.skipped,
        current: { series: library.list().length, logEntries: watchLog.list().length },
      },
    }
  }

  const changedSettingKeys = (before, after) => {
    const skip = new Set([...LOCAL_SETTINGS, 'systemName', 'isPackaged'])
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].filter((k) => !skip.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
  }

  function applyImport(token) {
    if (!pending || pending.token !== token || now() > pending.expiresAt) {
      if (pending && pending.token === token) pending = null
      return { ok: false, error: 'expired' }
    }
    const { candidate } = pending
    pending = null // consumed from here on, whatever happens

    // Pre-import copy from the same snapshot objects that a rollback will use.
    const old = takeSnapshots()
    try {
      const file = path.join(paths.backups, preImportName(now()))
      writeJsonAtomic(file, wrap(old))
      for (const name of toPrune(fs.readdirSync(paths.backups), 'pre-import-', PRE_IMPORT_KEEP)) {
        try { fs.unlinkSync(path.join(paths.backups, name)) } catch (err) { console.warn('dataBackup: prune failed', err?.message) }
      }
    } catch (err) {
      console.warn('dataBackup: pre-import copy failed', err?.message)
      return { ok: false, error: 'backup-failed' }
    }

    const settingsBefore = settings.get()
    // Order: seriesPrefs, positions, watchLog, library, settings. Settings is last, so a failure there leaves it unchanged.
    const steps = [
      [() => seriesPrefs.replaceAll(candidate.seriesPrefs), () => seriesPrefs.replaceAll(old.seriesPrefs)],
      [() => positions.replaceAll(candidate.positions), () => positions.replaceAll(old.positions)],
      [() => watchLog.replaceAll(candidate.watchlog), () => watchLog.replaceAll(old.watchlog)],
      [() => library.replaceAll(candidate.library), () => library.replaceAll(old.library)],
      [() => settings.replace(candidate.settings), () => settings.replace(old.settings)],
    ]
    const done = []
    try {
      for (const [apply, undo] of steps) {
        apply()
        done.push(undo)
      }
    } catch (err) {
      console.warn('dataBackup: import failed, rolling back', err?.message)
      for (const undo of done.reverse()) {
        try { undo() } catch (e) { console.warn('dataBackup: rollback step failed', e?.message) }
      }
      return { ok: false, error: 'write-failed' }
    }

    tracker.clearTrash()
    progress.rebase()
    const after = settings.get()
    try { onImported(changedSettingKeys(settingsBefore, after)) } catch (err) { console.warn('dataBackup: onImported failed', err?.message) }
    return { ok: true, settings: after }
  }

  return { build, exportTo, writeCopy, readBackup, applyImport }
}
