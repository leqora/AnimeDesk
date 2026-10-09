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
