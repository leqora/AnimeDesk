import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLibrary } from '../../src/main/library.js'
import { createWatchLog } from '../../src/main/watchLog.js'
import { createTracker } from '../../src/main/tracker.js'

let library, watchLog, progress, tracker
beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-trk-'))
  library = createLibrary(path.join(dir, 'library.json'))
  watchLog = createWatchLog(path.join(dir, 'watchlog.json'))
  progress = { check: vi.fn() }
  tracker = createTracker({ library, watchLog, progress })
})
const eps = () => watchLog.list().map((e) => [e.episode, e.source])

describe('tracker', () => {
  it('logs an automatically watched episode and re-checks progress', () => {
    const entry = tracker.recordWatched({ aniCliTitle: 'Show', episode: '1' })
    expect(watchLog.list()[0]).toMatchObject({ animeId: entry.id, episode: 1, source: 'auto' })
    expect(progress.check).toHaveBeenCalledWith({ completedTitle: null })
  })
  it('re-watching does not log again', () => {
    tracker.recordWatched({ aniCliTitle: 'Show', episode: '1' })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: '1' })
    expect(eps()).toEqual([[1, 'auto']])
  })
  it('announces a series that just became completed', () => {
    const e = library.add({ title: 'Show', aniCliTitle: 'Show', totalEpisodes: 2 })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: 2 })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: 'Show' })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: null })
    expect(library.get(e.id).status).toBe('completed')
  })
  it('logs manual marks and removes the log on unmark', () => {
    const e = library.add({ title: 'Show' })
    tracker.update(e.id, { watchedEpisodes: [1, 2] })
    expect(eps()).toEqual([[1, 'manual'], [2, 'manual']])
    tracker.update(e.id, { watchedEpisodes: [2] })
    expect(eps()).toEqual([[2, 'manual']])
  })
  it('announces a manual switch to completed', () => {
    const e = library.add({ title: 'Show' })
    tracker.update(e.id, { status: 'completed' })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: 'Show' })
    tracker.update(e.id, { rating: 9 })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: null })
  })
  it('removing a series clears its log', () => {
    const e = tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
    tracker.recordWatched({ aniCliTitle: 'Other', episode: 1 })
    expect(tracker.remove(e.id)).toBe(true)
    expect(watchLog.list()).toHaveLength(1)
    expect(progress.check).toHaveBeenCalledTimes(3)
  })
  describe('restore', () => {
    let clock
    beforeEach(() => {
      clock = 1_000_000
      tracker = createTracker({ library, watchLog, progress, now: () => clock })
    })
    it('remove then restore brings back entry and its watch log', () => {
      const e = tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
      tracker.recordWatched({ aniCliTitle: 'Show', episode: 2 })
      tracker.recordWatched({ aniCliTitle: 'Other', episode: 1 })
      const before = watchLog.list().map((x) => x.id)
      const entry = library.get(e.id)
      tracker.remove(e.id)
      expect(library.get(e.id)).toBeNull()
      progress.check.mockClear()
      expect(tracker.restore(e.id)).toEqual({ ok: true, entry })
      expect(library.get(e.id)).toEqual(entry)
      expect(watchLog.list().map((x) => x.id).sort()).toEqual([...before].sort())
      expect(progress.check).toHaveBeenCalled()
      expect(tracker.restore(e.id)).toEqual({ ok: false, error: 'expired' })
    })
    it('restore after 10 minutes is expired', () => {
      const e = tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
      tracker.remove(e.id)
      clock += 10 * 60 * 1000 + 1
      expect(tracker.restore(e.id)).toEqual({ ok: false, error: 'expired' })
      expect(library.get(e.id)).toBeNull()
    })
    it('restore of an unknown id is expired', () => {
      expect(tracker.restore('nope')).toEqual({ ok: false, error: 'expired' })
    })
    it('restore conflicts when the series was re-created', () => {
      const e = tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
      tracker.remove(e.id)
      tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
      expect(tracker.restore(e.id)).toEqual({ ok: false, error: 'conflict' })
      expect(library.list().filter((x) => x.aniCliTitle === 'Show')).toHaveLength(1)
    })
    it('trash keeps at most 20 entries', () => {
      const ids = Array.from({ length: 21 }, (_, i) => library.add({ title: `S${i}` }).id)
      for (const id of ids) tracker.remove(id)
      expect(tracker.restore(ids[0])).toEqual({ ok: false, error: 'expired' })
      expect(tracker.restore(ids[1]).ok).toBe(true)
    })
  })
})
