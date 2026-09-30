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
      const s = { opts, done: new Promise((r) => { finish = r }), kill: vi.fn(() => finish({ ok: false, error: 'cancelled' })) }
      s.finish = (ok = true, writeFile = true) => {
        if (ok && writeFile) {
          fs.mkdirSync(opts.downloadDir, { recursive: true })
          // ani-cli names the file after its own title; NTFS forbids ":" so the fake swaps it
          fs.writeFileSync(path.join(opts.downloadDir, `${opts.query.replace(/:/g, ' ')} Episode ${opts.episodes}.mp4`), 'video')
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
