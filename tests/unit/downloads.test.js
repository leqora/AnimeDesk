import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDownloads, parseProgress } from '../../src/main/downloads.js'

let base, sessions, aniCli, dl, changes
function fakeAniCli() {
  sessions = []
  return {
    startSession: vi.fn((opts) => {
      let finish
      // Real ani-cli never creates the folder, so it must already exist when the session starts.
      const s = { opts, dirExisted: fs.existsSync(opts.downloadDir), done: new Promise((r) => { finish = r }), kill: vi.fn(() => finish({ ok: false, error: 'cancelled' })) }
      s.finish = (ok = true, writeFile = true) => {
        if (ok && writeFile) {
          // ani-cli names the file after its own raw title; like yt-dlp, parent folders of the output
          // are created (a "/" in the title makes a subfolder). NTFS forbids ":" so the fake swaps it.
          const out = path.join(opts.downloadDir, `${opts.query.replace(/:/g, ' ')} Episode ${opts.episodes}.mp4`)
          fs.mkdirSync(path.dirname(out), { recursive: true })
          fs.writeFileSync(out, 'video')
        }
        finish(ok ? { ok: true, error: null } : { ok: false, error: 'unknown' })
      }
      s.fail = (error) => finish({ ok: false, error })
      sessions.push(s)
      return s
    }),
  }
}
const flush = () => new Promise((r) => setTimeout(r, 10))

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-dls-'))
  aniCli = fakeAniCli()
  changes = 0
  let n = 0
  dl = createDownloads({ file: path.join(base, 'downloads.json'), aniCli, onChange: () => changes++, uuid: () => `d${++n}`, now: () => '2026-10-01T00:00:00Z' })
})

describe('parseProgress', () => {
  it('reads yt-dlp percentages', () => {
    expect(parseProgress('[download]  42.3% of ~ 250.00MiB at 3.00MiB/s ETA 01:02')).toBe(42.3)
    expect(parseProgress('[download] 100% of 10.00MiB')).toBe(100)
    expect(parseProgress('[hlsnative] Downloading m3u8 manifest')).toBeNull()
  })
})

describe('downloads', () => {
  it('downloads with the series quality and mode', async () => {
    const resolvePrefs = vi.fn(() => ({ quality: '360', mode: 'dub' }))
    let n = 0
    dl = createDownloads({ file: path.join(base, 'downloads2.json'), aniCli, onChange: () => changes++, uuid: () => `p${++n}`, now: () => '2026-10-01T00:00:00Z', resolvePrefs })
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base })
    expect(resolvePrefs).toHaveBeenCalledWith('Show')
    expect(aniCli.startSession).toHaveBeenCalledWith(expect.objectContaining({ quality: '360', mode: 'dub' }))
  })
  it('stores the mode in the finished record only when it is known', async () => {
    const mk = (file, resolvePrefs) => createDownloads({ file: path.join(base, file), aniCli, onChange: () => {}, uuid: () => file, now: () => '2026-10-01T00:00:00Z', ...(resolvePrefs ? { resolvePrefs } : {}) })
    const withMode = mk('m1.json', () => ({ quality: 'best', mode: 'dub' }))
    withMode.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base })
    sessions.at(-1).finish()
    await flush()
    expect(withMode.listDownloaded()[0].mode).toBe('dub')
    const without = mk('m2.json')
    without.enqueue({ title: 'Other', aniCliTitle: 'Other', episodes: ['1'], dir: base })
    sessions.at(-1).finish()
    await flush()
    expect(without.listDownloaded()[0]).not.toHaveProperty('mode')
  })
  it('runs one episode at a time into a safe series folder', async () => {
    dl.enqueue({ title: 'Re:Zero', aniCliTitle: 'Re:Zero', episodes: ['1', '2'], dir: base })
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
    const opts = sessions[0].opts
    expect(opts).toMatchObject({ query: 'Re:Zero', player: 'download', episodes: '1', downloadDir: path.join(base, 'Re Zero') })
    await expect(opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other', '2 Re:Zero'] })).resolves.toBe('2 Re:Zero')
    expect(dl.queueItems().map((i) => i.status)).toEqual(['downloading', 'queued'])
    opts.onLine('[download]  42.0% of 10MiB')
    expect(dl.queueItems()[0].percent).toBe(42)
    sessions[0].finish()
    await flush()
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
    expect(dl.queueItems().map((i) => i.status)).toEqual(['done', 'downloading'])
    const [entry] = dl.listDownloaded()
    expect(entry).toMatchObject({ title: 'Re:Zero', episode: '1', path: path.join(base, 'Re Zero', 'Re Zero Episode 1.mp4'), size: 5, missing: false })
    expect(changes).toBeGreaterThan(0)
  })
  it('does not queue the same episode twice', () => {
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '2'], dir: base })
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['2', '3'], dir: base })
    expect(dl.queueItems().map((i) => i.episode)).toEqual(['1', '2', '3'])
  })
  it('re-queues a failed or paused episode instead of adding a copy', async () => {
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '2'], dir: base })
    dl.pause('d2')
    sessions[0].finish(false)
    await flush()
    expect(dl.queueItems().map((i) => i.status)).toEqual(['error', 'paused'])
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '2'], dir: base })
    expect(dl.queueItems().map((i) => [i.id, i.episode])).toEqual([['d1', '1'], ['d2', '2']])
    expect(dl.queueItems().map((i) => i.status)).toEqual(['downloading', 'queued'])
  })
  it('skips episodes that are already downloaded, unless the file is gone', async () => {
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base })
    sessions[0].finish()
    await flush()
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base })
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
    fs.rmSync(dl.listDownloaded()[0].path)
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base })
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
  })
  it('retries every failed item at once', async () => {
    dl.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '2'], dir: base })
    sessions[0].finish(false)
    await flush()
    sessions[1].finish(false)
    await flush()
    expect(dl.queueItems().map((i) => i.status)).toEqual(['error', 'error'])
    dl.retryFailed()
    expect(dl.queueItems().map((i) => i.status)).toEqual(['downloading', 'queued'])
  })
  it('creates the series folder before starting and finds files in nested folders', async () => {
    dl.enqueue({ title: 'Fate/stay night', aniCliTitle: 'Fate/stay night', episodes: ['1'], dir: base })
    expect(sessions[0].dirExisted).toBe(true)
    sessions[0].finish()
    await flush()
    expect(dl.queueItems()[0]).toMatchObject({ status: 'done', error: null })
    expect(dl.listDownloaded()[0].path).toBe(path.join(base, 'Fate stay night', 'Fate', 'stay night Episode 1.mp4'))
  })
  it('marks an item as error and moves on when the session cannot start (tool missing)', () => {
    const real = aniCli.startSession.getMockImplementation()
    aniCli.startSession.mockImplementationOnce(() => { throw new Error('tools-missing') })
    aniCli.startSession.mockImplementation(real)
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1', '2'], dir: base })
    expect(dl.queueItems().map((i) => [i.status, i.error])).toEqual([['error', 'tools-missing'], ['downloading', null]])
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
  })
  it('keeps the queue across an app restart, paused, without finished items', async () => {
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1', '2', '3'], dir: base })
    sessions[0].opts.onLine('[download]  40.0% of 10MiB')
    sessions[0].finish()
    await flush()
    sessions[1].opts.onLine('[download]  25.0% of 10MiB')
    // app closes here (episode 2 downloading, 3 queued) and starts again
    const after = createDownloads({ file: path.join(base, 'downloads.json'), aniCli: fakeAniCli() })
    expect(after.queueItems().map((i) => [i.episode, i.status])).toEqual([['2', 'paused'], ['3', 'paused']])
    after.resume(after.queueItems()[0].id)
    expect(after.queueItems()[0].status).toBe('downloading')
  })
  it('reports not-found when the stored title is no longer in the search results', async () => {
    dl.enqueue({ title: 'Gone', aniCliTitle: 'Gone', episodes: ['1'], dir: base })
    expect(await sessions[0].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other'] })).toBeNull()
    sessions[0].finish(false)
    await flush()
    expect(dl.queueItems()[0]).toMatchObject({ status: 'error', error: 'not-found' })
  })
  it('pauses (killing the session) and resumes', async () => {
    const [item] = dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    dl.pause(item.id)
    await flush()
    expect(sessions[0].kill).toHaveBeenCalled()
    expect(dl.queueItems()[0].status).toBe('paused')
    dl.resume(item.id)
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
    expect(dl.queueItems()[0].status).toBe('downloading')
  })
  it('cancel removes the item from the queue', async () => {
    const [item] = dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    dl.cancel(item.id)
    await flush()
    expect(dl.queueItems()).toEqual([])
  })
  it('marks errors and continues with the next item', async () => {
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1', '2'], dir: base })
    sessions[0].finish(false)
    await flush()
    expect(dl.queueItems()[0]).toMatchObject({ status: 'error', error: 'unknown' })
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
  })
  it('reports file-not-found when ani-cli succeeded but no file exists', async () => {
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    sessions[0].finish(true, false)
    await flush()
    expect(dl.queueItems()[0]).toMatchObject({ status: 'error', error: 'file-not-found' })
  })
  it('persists downloaded entries, flags missing files and deletes on request', async () => {
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    sessions[0].finish()
    await flush()
    const again = createDownloads({ file: path.join(base, 'downloads.json'), aniCli })
    const [entry] = again.listDownloaded()
    expect(again.getDownloaded(entry.id).path).toBe(entry.path)
    fs.rmSync(entry.path)
    expect(again.listDownloaded()[0].missing).toBe(true)
    expect(again.removeDownloaded(entry.id, { deleteFile: true })).toBe(true)
    expect(again.listDownloaded()).toEqual([])
  })
})

describe('downloads episode lists', () => {
  it('remembers the episode list seen while downloading', async () => {
    const episodeLists = { set: vi.fn() }
    const d = createDownloads({ file: path.join(base, 'dl2.json'), aniCli, episodeLists, resolvePrefs: () => ({ quality: 'best', mode: 'sub' }), uuid: () => 'x1' })
    d.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['2'], dir: base })
    await flush()
    const s = sessions.at(-1)
    await s.opts.onMenu({ prompt: 'Select episode: ', lines: ['1', '2'] })
    expect(episodeLists.set).toHaveBeenCalledWith('Show', 'sub', ['1', '2'])
  })
})

describe('downloads onFinished', () => {
  const mk = (onFinished) => createDownloads({ file: path.join(base, 'fin.json'), aniCli, onChange: () => {}, uuid: () => 'f1', now: () => '2026-10-01T00:00:00Z', onFinished })
  it('fires once on done and on error', async () => {
    const onFinished = vi.fn()
    const d = mk(onFinished)
    d.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '2'], dir: base })
    sessions[0].finish(true); await flush()
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenLastCalledWith({ title: 'Show', episode: '1', status: 'done' })
    sessions[1].finish(false); await flush()
    expect(onFinished).toHaveBeenCalledTimes(2)
    expect(onFinished).toHaveBeenLastCalledWith({ title: 'Show', episode: '2', status: 'error' })
  })
  it('does not fire on cancel or pause', async () => {
    const onFinished = vi.fn()
    const d = mk(onFinished)
    d.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '2'], dir: base })
    const id1 = d.queueItems()[0].id
    d.pause(id1); await flush()
    const id2 = d.queueItems()[1].id
    d.cancel(id2); await flush()
    expect(onFinished).not.toHaveBeenCalled()
  })
  it('fires when the session cannot even start', () => {
    const onFinished = vi.fn()
    aniCli.startSession.mockImplementationOnce(() => { throw new Error('tools-missing') })
    const d = mk(onFinished)
    d.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base })
    expect(onFinished).toHaveBeenCalledWith({ title: 'Show', episode: '1', status: 'error' })
  })
  it('survives a throwing onFinished', async () => {
    const d = mk(() => { throw new Error('boom') })
    d.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base })
    sessions[0].finish(true); await flush()
    expect(d.queueItems()[0].status).toBe('done')
  })
})

describe('downloads waiting and timed retries', () => {
  const MIN = 60 * 1000
  const DAY = 24 * 60 * MIN
  let t, timers, onFinished, file, nextId
  const fakeSetTimeout = (fn, ms) => { const h = { fn, at: t + ms, cleared: false }; timers.push(h); return h }
  const fakeClearTimeout = (h) => { if (h) h.cleared = true }
  const advance = (ms) => {
    t += ms
    for (const h of [...timers].sort((a, b) => a.at - b.at)) {
      if (!h.cleared && !h.fired && h.at <= t) { h.fired = true; h.fn() }
    }
  }
  const live = () => timers.filter((h) => !h.cleared && !h.fired)
  const mk = (extra = {}) => createDownloads({
    file, aniCli, onChange: () => {}, onFinished, uuid: () => `w${++nextId}`, now: () => '2026-10-01T00:00:00Z',
    clock: () => t, setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, ...extra,
  })
  const add = (d, opts = {}) => d.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['1'], dir: base, auto: true, ...opts })
  const failWith = async (error) => { sessions.at(-1).fail(error); await flush() }
  let w
  beforeEach(() => {
    t = 1_000_000_000_000
    timers = []
    nextId = 0
    onFinished = vi.fn()
    file = path.join(base, 'wait.json')
    w = mk()
  })

  it('puts an auto item that hit a retryable error into waiting and starts the next one', async () => {
    add(w, { episodes: ['1', '2'] })
    await failWith('episode-not-released')
    expect(w.queueItems()[0]).toMatchObject({ status: 'waiting', auto: true, attempts: 1, firstTriedAt: t, retryAt: t + 30 * MIN })
    expect(w.queueItems()[1].status).toBe('downloading')
    expect(onFinished).not.toHaveBeenCalled()
  })
  it('re-queues when retryAt passes, then backs off to one hour', async () => {
    add(w)
    await failWith('no-sources')
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
    advance(30 * MIN)
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
    expect(w.queueItems()[0].status).toBe('downloading')
    await failWith('no-sources')
    expect(w.queueItems()[0]).toMatchObject({ status: 'waiting', attempts: 2, retryAt: t + 60 * MIN })
    expect(onFinished).not.toHaveBeenCalled()
  })
  it('does not wake up before retryAt', async () => {
    add(w)
    await failWith('blocked')
    advance(29 * MIN)
    expect(w.queueItems()[0].status).toBe('waiting')
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
  })
  it('gives up as error after three days and notifies once', async () => {
    add(w)
    await failWith('unknown')
    const first = w.queueItems()[0].firstTriedAt
    t = first + 3 * DAY
    w.resume(w.queueItems()[0].id)
    await failWith('episode-not-released')
    expect(w.queueItems()[0]).toMatchObject({ status: 'error', error: 'episode-not-released' })
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledWith({ title: 'Show', episode: '1', status: 'error' })
  })
  it('does not retry when the anime is not found or the error is permanent', async () => {
    add(w, { episodes: ['1', '2'] })
    expect(await sessions[0].opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other'] })).toBeNull()
    await failWith('unknown')
    expect(w.queueItems()[0]).toMatchObject({ status: 'error', error: 'not-found' })
    await failWith('tools-missing')
    expect(w.queueItems()[1]).toMatchObject({ status: 'error', error: 'tools-missing' })
    expect(onFinished).toHaveBeenCalledTimes(2)
  })
  it('keeps manual items on the old behaviour', async () => {
    add(w, { auto: false })
    await failWith('unknown')
    expect(w.queueItems()[0]).toMatchObject({ status: 'error', error: 'unknown' })
    expect(w.queueItems()[0].auto).toBeUndefined()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })
  it('keeps a waiting item across a restart and re-queues a past retryAt on its own', async () => {
    add(w)
    await failWith('unknown')
    t += 40 * MIN // app was closed past retryAt
    w.dispose() // the old process is gone
    const again = mk()
    expect(again.queueItems()[0]).toMatchObject({ status: 'waiting', retryAt: expect.any(Number) })
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
    advance(0)
    expect(again.queueItems()[0].status).toBe('downloading')
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
  })
  it('keeps a future retryAt waiting after a restart until the timer fires', async () => {
    add(w)
    await failWith('unknown')
    advance(10 * MIN)
    w.dispose()
    const again = mk()
    advance(0)
    expect(again.queueItems()[0].status).toBe('waiting')
    advance(20 * MIN)
    expect(again.queueItems()[0].status).toBe('downloading')
  })
  it('resume turns waiting into queued and starts it', async () => {
    add(w)
    await failWith('unknown')
    w.resume(w.queueItems()[0].id)
    expect(w.queueItems()[0].status).toBe('downloading')
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
  })
  it('retryFailed leaves waiting items alone', async () => {
    add(w, { episodes: ['1', '2'] })
    await failWith('unknown')
    sessions.at(-1).fail('tools-missing')
    await flush()
    w.retryFailed()
    expect(w.queueItems().map((i) => i.status)).toEqual(['waiting', 'downloading'])
  })
  it('cancel removes a waiting item and its timer never revives it', async () => {
    add(w)
    await failWith('unknown')
    w.cancel(w.queueItems()[0].id)
    expect(w.queueItems()).toEqual([])
    advance(DAY)
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
  })
  it('dispose stops the retry timer', async () => {
    add(w)
    await failWith('unknown')
    w.dispose()
    expect(live()).toEqual([])
    advance(DAY)
    expect(w.queueItems()[0].status).toBe('waiting')
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
  })
  it('enqueueing an episode that is already waiting changes nothing', async () => {
    add(w)
    await failWith('unknown')
    const before = w.queueItems()
    add(w)
    expect(w.queueItems()).toEqual(before)
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
  })
  it('an auto item interrupted by quitting comes back waiting for two minutes, a manual one paused', async () => {
    add(w, { episodes: ['1', '2'] })
    w.enqueue({ title: 'Other', aniCliTitle: 'Other', episodes: ['1'], dir: base })
    await failWith('unknown') // auto 1 waits with attempts 1
    const cycle = w.queueItems()[0]
    w.resume(cycle.id) // auto 1 is queued again behind auto 2, which is downloading; Other is queued
    expect(w.queueItems().map((i) => i.status)).toEqual(['queued', 'downloading', 'queued'])
    w.dispose()
    const again = mk()
    expect(again.queueItems()).toEqual([
      expect.objectContaining({ episode: '1', auto: true, status: 'waiting', retryAt: t + 2 * MIN, attempts: 1, firstTriedAt: cycle.firstTriedAt }),
      expect.objectContaining({ episode: '2', auto: true, status: 'waiting', retryAt: t + 2 * MIN }),
      expect.objectContaining({ title: 'Other', status: 'paused' }),
    ])
    expect(again.queueItems()[1].attempts).toBeUndefined()
    advance(2 * MIN - 1)
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
    advance(1)
    expect(aniCli.startSession).toHaveBeenCalledTimes(3)
    expect(again.queueItems().map((i) => i.status)).toEqual(['downloading', 'queued', 'paused'])
  })
  it('a session ending after dispose does not start the next item', async () => {
    add(w, { episodes: ['1', '2'] })
    w.dispose()
    sessions[0].finish(true)
    await flush()
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
    expect(w.queueItems()[1].status).toBe('queued')
  })
  it('the user resuming a failed auto item starts a new full waiting cycle', async () => {
    add(w)
    await failWith('unknown')
    t += 3 * 24 * 60 * MIN
    advance(0)
    await failWith('unknown') // gave up
    expect(w.queueItems()[0]).toMatchObject({ status: 'error', attempts: 2 })
    w.resume(w.queueItems()[0].id)
    expect(w.queueItems()[0]).toMatchObject({ status: 'downloading', attempts: 0, firstTriedAt: null })
    await failWith('unknown')
    expect(w.queueItems()[0]).toMatchObject({ status: 'waiting', attempts: 1, firstTriedAt: t, retryAt: t + 30 * MIN })
  })
  it('retryFailed also starts a new full waiting cycle for a failed auto item', async () => {
    add(w)
    await failWith('unknown')
    t += 3 * 24 * 60 * MIN
    advance(0)
    await failWith('unknown')
    expect(w.queueItems()[0].status).toBe('error')
    w.retryFailed()
    expect(w.queueItems()[0]).toMatchObject({ status: 'downloading', attempts: 0, firstTriedAt: null })
    await failWith('unknown')
    expect(w.queueItems()[0]).toMatchObject({ status: 'waiting', attempts: 1, firstTriedAt: t })
  })
  it('resuming a waiting auto item keeps its waiting cycle', async () => {
    add(w)
    await failWith('unknown')
    const first = w.queueItems()[0].firstTriedAt
    t += 5 * MIN
    w.resume(w.queueItems()[0].id)
    await failWith('unknown')
    expect(w.queueItems()[0]).toMatchObject({ status: 'waiting', attempts: 2, firstTriedAt: first })
  })
  it('an auto enqueue leaves an episode the user paused alone; a manual one re-queues it', () => {
    add(w, { episodes: ['1', '2'] })
    const second = w.queueItems()[1]
    w.pause(second.id)
    add(w, { episodes: ['2'] })
    expect(w.queueItems()[1].status).toBe('paused')
    w.enqueue({ title: 'Show', aniCliTitle: 'Show', episodes: ['2'], dir: base })
    expect(w.queueItems()[1].status).toBe('queued')
  })
  it('rearm() re-arms the retry timer from the current state', async () => {
    add(w)
    await failWith('unknown')
    for (const h of live()) h.cleared = true // a timer lost while the computer slept
    t += 40 * MIN
    w.rearm()
    expect(live()).toHaveLength(1)
    advance(0)
    expect(w.queueItems()[0].status).toBe('downloading')
  })
  it('pausing or killing an active item never turns it into waiting', async () => {
    add(w)
    w.pause(w.queueItems()[0].id)
    await flush()
    expect(w.queueItems()[0].status).toBe('paused')
    w.resume(w.queueItems()[0].id)
    w.cancel(w.queueItems()[0].id)
    await flush()
    expect(w.queueItems()).toEqual([])
  })
})
