import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPaths } from '../../src/main/paths.js'
import { createLibrary } from '../../src/main/library.js'
import { createWatchLog } from '../../src/main/watchLog.js'
import { createSeriesPrefs } from '../../src/main/seriesPrefs.js'
import { createPositions } from '../../src/main/positions.js'
import { createSettings } from '../../src/main/settings.js'
import { createProgress } from '../../src/main/progress.js'
import { createTracker } from '../../src/main/tracker.js'
import { createDataBackup } from '../../src/main/dataBackup.js'

const NOW = new Date(2026, 9, 19, 10, 0, 0).getTime()

function setup({ wrap = {}, fsImpl = fs } = {}) {
  const clock = { t: NOW }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-backup-'))
  const paths = createPaths(dir)
  const library = createLibrary(paths.library)
  const watchLog = createWatchLog(paths.watchLog)
  const seriesPrefs = createSeriesPrefs(paths.seriesPrefs)
  const positions = createPositions(paths.positions)
  const settings = createSettings(paths.settings)
  const notify = vi.fn()
  const progress = createProgress({ file: paths.profile, computeSnapshot: () => ({ level: library.list().length, title: 't', xp: 0 }), notify })
  progress.init()
  const tracker = createTracker({ library, watchLog, progress })
  const clearTrash = vi.spyOn(tracker, 'clearTrash')
  const onImported = vi.fn()
  let n = 0
  const backup = createDataBackup({
    paths, library: { ...library, ...(wrap.library ?? {}) }, watchLog, seriesPrefs, positions, settings, tracker, progress,
    appVersion: '0.12.0', fs: fsImpl, now: () => clock.t, uuid: () => `tok-${++n}`, onImported,
  })
  return { dir, paths, library, watchLog, seriesPrefs, positions, settings, progress, tracker, notify, clearTrash, onImported, backup, clock }
}

function seed(s, titles) {
  for (const t of titles) {
    const e = s.library.add({ title: t, aniCliTitle: t })
    s.library.update(e.id, { watchedEpisodes: [1, 2] })
    s.watchLog.append({ animeId: e.id, episode: 1, source: 'auto' })
  }
}

// A donor instance produces a valid file; tweak(obj) can then break it.
function donorFile(titles, tweak = (o) => o) {
  const d = setup()
  seed(d, titles)
  if (titles.length) {
    d.seriesPrefs.set(titles[0], { quality: '720' })
    d.positions.save(titles[0], 1, { position: 600, duration: 1400 })
  }
  d.settings.update({ language: 'en' })
  const file = path.join(d.dir, 'in.json')
  fs.writeFileSync(file, JSON.stringify(tweak(d.backup.build())))
  return file
}

const state = (s) => ({ lib: s.library.snapshot(), log: s.watchLog.snapshot(), prefs: s.seriesPrefs.snapshot(), pos: s.positions.snapshot(), set: s.settings.snapshot() })

describe('build / export', () => {
  it('build has the format fields and no local settings', () => {
    const s = setup()
    seed(s, ['Alpha'])
    const b = s.backup.build()
    expect(b).toMatchObject({ app: 'AnimeDesk', kind: 'backup', format: 1, appVersion: '0.12.0', createdAt: new Date(NOW).toISOString() })
    expect(Object.keys(b.data)).toEqual(['library', 'watchlog', 'seriesPrefs', 'positions', 'settings'])
    expect(Object.keys(b.data.library.anime)).toHaveLength(1)
    for (const k of ['lastSeenVersion', 'trayHintShown', 'fullscreen', 'systemName', 'isPackaged']) expect(b.data.settings).not.toHaveProperty(k)
    expect(b.data.settings.language).toBe('sr')
  })

  it('export never contains the AniList token', () => {
    const s = setup()
    seed(s, ['Alpha'])
    fs.writeFileSync(s.paths.anilistAuth, 'SECRET-TOKEN')
    fs.writeFileSync(s.paths.anilistSync, JSON.stringify({ queue: ['anilist-sync'] }))
    const out = path.join(s.dir, 'out.json')
    s.backup.exportTo(out)
    const text = fs.readFileSync(out, 'utf8')
    expect(text).not.toContain('SECRET-TOKEN')
    expect(text).not.toContain('anilist-sync')
    expect(JSON.parse(text).app).toBe('AnimeDesk')
  })

  it('writeCopy puts the file into paths.backups and returns its path', () => {
    const s = setup()
    const p = s.backup.writeCopy('auto-2026-10-19.json')
    expect(p).toBe(path.join(s.paths.backups, 'auto-2026-10-19.json'))
    expect(JSON.parse(fs.readFileSync(p, 'utf8')).kind).toBe('backup')
  })
})

describe('readBackup', () => {
  it('too-large uses statSync and does not read', () => {
    const readFileSync = vi.fn()
    const s = setup({ fsImpl: { ...fs, statSync: () => ({ size: 51 * 1024 * 1024 }), readFileSync } })
    expect(s.backup.readBackup('x.json')).toEqual({ ok: false, error: 'too-large' })
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('missing file is read-failed', () => {
    const s = setup()
    expect(s.backup.readBackup(path.join(s.dir, 'nope.json'))).toEqual({ ok: false, error: 'read-failed' })
  })

  it('non-JSON, wrong app/kind, missing library are invalid; newer format is newer', () => {
    const s = setup()
    const f = path.join(s.dir, 'bad.json')
    fs.writeFileSync(f, 'not json{')
    expect(s.backup.readBackup(f)).toEqual({ ok: false, error: 'invalid' })
    const check = (tweak, error) => {
      fs.writeFileSync(f, JSON.stringify(tweak(structuredClone(s.backup.build()))))
      expect(s.backup.readBackup(f)).toEqual({ ok: false, error })
    }
    check((o) => ({ ...o, app: 'X' }), 'invalid')
    check((o) => ({ ...o, kind: 'other' }), 'invalid')
    check((o) => { delete o.data.library; return o }, 'invalid')
    check((o) => { o.data.library.anime = []; return o }, 'invalid')
    check((o) => ({ ...o, format: 2 }), 'newer')
  })

  it('preview counts and skipped, without titles', () => {
    const file = donorFile(['Alpha', 'Beta', 'Gamma'], (o) => {
      o.data.library.anime.broken = { id: 'broken', title: '' }
      return o
    })
    const s = setup()
    seed(s, ['One'])
    const r = s.backup.readBackup(file)
    expect(r.ok).toBe(true)
    expect(r.preview).toMatchObject({ series: 3, logEntries: 3, skipped: 1, appVersion: '0.12.0', current: { series: 1, logEntries: 1 } })
    expect(typeof r.preview.token).toBe('string')
    expect(JSON.stringify(r.preview)).not.toContain('Alpha')
  })

  it('rejects a file whose entries are all invalid, leaving the current library alone', () => {
    const file = donorFile(['Alpha'], (o) => {
      o.data.library.anime = { a: { id: 'a', title: '' }, b: 5 }
      return o
    })
    const s = setup()
    seed(s, ['One'])
    expect(s.backup.readBackup(file)).toEqual({ ok: false, error: 'invalid' })
    expect(s.library.list()).toHaveLength(1)
  })

  it('allows an explicitly empty library', () => {
    const file = donorFile([])
    const s = setup()
    const r = s.backup.readBackup(file)
    expect(r.ok).toBe(true)
    expect(r.preview.series).toBe(0)
  })

  it('token expires after 10 minutes and a new pick replaces the previous token', () => {
    const file = donorFile(['Alpha'])
    const s = setup()
    const a = s.backup.readBackup(file).preview.token
    const b = s.backup.readBackup(file).preview.token
    expect(b).not.toBe(a)
    expect(s.backup.applyImport(a)).toEqual({ ok: false, error: 'expired' })
    s.clock.t += 10 * 60 * 1000 + 1
    expect(s.backup.applyImport(b)).toEqual({ ok: false, error: 'expired' })
    expect(s.library.list()).toHaveLength(0)
  })
})

describe('applyImport', () => {
  it('unknown token is expired and touches nothing', () => {
    const s = setup()
    seed(s, ['One'])
    expect(s.backup.applyImport('nope')).toEqual({ ok: false, error: 'expired' })
    expect(fs.existsSync(s.paths.backups)).toBe(false)
  })

  it('replaces all five stores and returns settings; a token is single use', () => {
    const file = donorFile(['Alpha', 'Beta'])
    const s = setup()
    seed(s, ['Old'])
    s.settings.update({ fullscreen: true })
    const { token } = s.backup.readBackup(file).preview
    const r = s.backup.applyImport(token)
    expect(r.ok).toBe(true)
    expect(r.settings.language).toBe('en')
    expect(r.settings.fullscreen).toBe(true)
    expect(s.library.list().map((e) => e.title).sort()).toEqual(['Alpha', 'Beta'])
    expect(s.watchLog.list()).toHaveLength(2)
    expect(Object.keys(s.seriesPrefs.snapshot().series)).toHaveLength(1)
    expect(Object.keys(s.positions.snapshot().items)).toHaveLength(1)
    expect(s.backup.applyImport(token)).toEqual({ ok: false, error: 'expired' })
    expect(Object.keys(JSON.parse(fs.readFileSync(s.paths.library, 'utf8')).anime)).toHaveLength(2)
  })

  it('writes a pre-import copy equal to the old data and prunes to 5', () => {
    const file = donorFile(['Alpha'])
    const s = setup()
    seed(s, ['Old'])
    fs.mkdirSync(s.paths.backups, { recursive: true })
    for (let i = 1; i <= 6; i++) fs.writeFileSync(path.join(s.paths.backups, `pre-import-2026-01-0${i}T00-00-00.json`), '{}')
    fs.writeFileSync(path.join(s.paths.backups, 'auto-2026-01-01.json'), '{}')
    const before = s.backup.build()
    const { token } = s.backup.readBackup(file).preview
    expect(s.backup.applyImport(token).ok).toBe(true)
    const names = fs.readdirSync(s.paths.backups).sort()
    const pre = names.filter((n) => n.startsWith('pre-import-'))
    expect(pre).toHaveLength(5)
    expect(pre).toContain('pre-import-2026-10-19T10-00-00.json')
    expect(names).toContain('auto-2026-01-01.json')
    const copy = JSON.parse(fs.readFileSync(path.join(s.paths.backups, 'pre-import-2026-10-19T10-00-00.json'), 'utf8'))
    expect(copy.data).toEqual(before.data)
  })

  it('backup-failed leaves everything untouched', () => {
    const file = donorFile(['Alpha'])
    const s = setup()
    seed(s, ['Old'])
    fs.writeFileSync(s.paths.backups, 'i am a file')
    const before = state(s)
    const { token } = s.backup.readBackup(file).preview
    expect(s.backup.applyImport(token)).toEqual({ ok: false, error: 'backup-failed' })
    expect(state(s)).toEqual(before)
    expect(s.onImported).not.toHaveBeenCalled()
    expect(s.backup.applyImport(token)).toEqual({ ok: false, error: 'expired' })
  })

  it('rolls back all stores when one write fails', () => {
    const file = donorFile(['Alpha', 'Beta'])
    let first = true
    const s = setup({ wrap: { library: { replaceAll: () => { if (first) { first = false; throw new Error('disk') } } } } })
    seed(s, ['Old'])
    s.seriesPrefs.set('Old', { quality: '480' })
    s.positions.save('Old', 1, { position: 300, duration: 1400 })
    const before = state(s)
    const { token } = s.backup.readBackup(file).preview
    expect(s.backup.applyImport(token)).toEqual({ ok: false, error: 'write-failed' })
    expect(state(s)).toEqual(before)
    expect(JSON.parse(fs.readFileSync(s.paths.seriesPrefs, 'utf8'))).toEqual(before.prefs)
    expect(s.onImported).not.toHaveBeenCalled()
    expect(s.clearTrash).not.toHaveBeenCalled()
  })

  it('import does not celebrate and rebases the level', () => {
    const file = donorFile(['A', 'B', 'C'])
    const s = setup()
    const { token } = s.backup.readBackup(file).preview
    expect(s.backup.applyImport(token).ok).toBe(true)
    expect(s.notify).not.toHaveBeenCalled()
    expect(JSON.parse(fs.readFileSync(s.paths.profile, 'utf8')).lastLevel).toBe(3)
  })

  it('trash is cleared', () => {
    const file = donorFile(['Alpha'])
    const s = setup()
    seed(s, ['Old'])
    const id = s.library.list()[0].id
    s.tracker.remove(id)
    const { token } = s.backup.readBackup(file).preview
    s.backup.applyImport(token)
    expect(s.clearTrash).toHaveBeenCalled()
    expect(s.tracker.restore(id)).toEqual({ ok: false, error: 'expired' })
  })

  it('onImported receives changed keys only', () => {
    const file = donorFile(['Alpha'])
    const s = setup()
    const { token } = s.backup.readBackup(file).preview
    s.backup.applyImport(token)
    expect(s.onImported).toHaveBeenCalledTimes(1)
    expect(s.onImported).toHaveBeenCalledWith(['language'])
  })
})
