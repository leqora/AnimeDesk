import { it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBridgeServer } from '../../src/main/bridgeServer.js'
import { createAniCliBridge } from '../../src/main/aniCliBridge.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'
import { createDownloads } from '../../src/main/downloads.js'
import { BASH, describeBash } from '../helpers/bash.js'

const SRC_BRIDGES = path.resolve('resources/bridges')
// Bridges are copied into a folder whose path has a space, like C:\Program Files\AnimeDesk
// or a profile such as C:\Users\Nikola Lelekovic.
let BRIDGES
const FAKE = path.resolve('tests/fixtures/fake-ani-cli.sh')

it('fake ani-cli has LF line endings', () => {
  expect(fs.readFileSync(FAKE, 'utf8')).not.toContain('\r')
})

describeBash('AniCliBridge with fake ani-cli', () => {
  let server, bridge, tmp
  beforeAll(async () => { server = createBridgeServer(); await server.start() })
  afterAll(() => server.stop())
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk š '))
    const bridgesDir = path.join(tmp, 'Program Files', 'AnimeDesk', 'bridges')
    fs.cpSync(SRC_BRIDGES, bridgesDir, { recursive: true })
    BRIDGES = { menu: path.join(bridgesDir, 'menu-bridge.sh'), player: path.join(bridgesDir, 'animedesk-mpv-bridge.sh') }
    bridge = createAniCliBridge({
      toolManager: { toolPaths: () => ({ bash: BASH, aniCli: FAKE, gitRoot: path.resolve(path.dirname(BASH), '..'), ytDlp: null, ffmpeg: null, mpv: null }) },
      server, bridges: BRIDGES, getSettings: () => DEFAULT_SETTINGS, historyDir: path.join(tmp, 'hist'),
    })
  })

  it('asks for anime and episode, then hands the stream to the player', async () => {
    const menus = []
    let playArgs
    const s = bridge.startSession({
      query: 'fake anime',
      onMenu: async ({ prompt, lines }) => { menus.push({ prompt, lines }); return /anime/i.test(prompt) ? lines[0] : '2' },
      onPlay: async ({ args }) => { playArgs = args; return 0 },
    })
    const r = await s.done
    expect(r.ok).toBe(true)
    expect(menus[0]).toEqual({ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other Show'] })
    expect(menus[1]).toEqual({ prompt: 'Select episode: ', lines: ['1', '2', '3'] })
    expect(playArgs).toContain('--force-media-title=Fake Anime Episode 2')
  })
  it('reports cancelled when the user closes the menu', async () => {
    const r = await bridge.startSession({ query: 'fake', onMenu: async () => null }).done
    expect(r).toMatchObject({ ok: false, error: 'cancelled' })
  })
  it('maps "No results found!" to no-results', async () => {
    const r = await bridge.startSession({ query: 'nothing' }).done
    expect(r).toMatchObject({ ok: false, error: 'no-results' })
  })
  it('downloads into a folder with spaces and non-ASCII characters', async () => {
    const lines = []
    const dir = path.join(tmp, 'Moji anime', 'Fake Anime')
    fs.mkdirSync(dir, { recursive: true }) // the caller (downloads.js) owns creating the folder
    const r = await bridge.startSession({ query: 'fake', player: 'download', index: 1, episodes: 1, downloadDir: dir, onLine: (l) => lines.push(l) }).done
    expect(r.ok).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'Fake Anime Episode 1.mp4'), 'utf8')).toBe('video')
    expect(lines).toContain('[download]  50.0% of 10.00MiB')
  })
  it('downloads a title with characters Windows forbids (: / ?) end to end', async () => {
    const title = 'Re:Zero / Fate?'
    const tricky = createAniCliBridge({
      toolManager: { toolPaths: () => ({ bash: BASH, aniCli: FAKE, gitRoot: path.resolve(path.dirname(BASH), '..'), ytDlp: null, ffmpeg: null, mpv: null }) },
      server, bridges: BRIDGES, getSettings: () => DEFAULT_SETTINGS, historyDir: path.join(tmp, 'hist'),
      baseEnv: { ...process.env, FAKE_ANIME_TITLE: title },
    })
    const dir = path.join(tmp, 'Moji anime')
    const downloads = createDownloads({ file: path.join(tmp, 'downloads.json'), aniCli: tricky })
    downloads.enqueue({ title, aniCliTitle: title, episodes: ['1'], dir })
    const end = Date.now() + 15000
    while (!['done', 'error'].includes(downloads.queueItems()[0].status) && Date.now() < end) await new Promise((r) => setTimeout(r, 100))
    expect(downloads.queueItems()[0]).toMatchObject({ status: 'done', error: null })
    const [entry] = downloads.listDownloaded()
    expect(entry.missing).toBe(false)
    expect(entry.path.startsWith(path.join(dir, 'Re Zero Fate'))).toBe(true)
  })
  it('selfTest passes when a link is printed', async () => {
    expect(await bridge.selfTest()).toBe(true)
  })
  it('throws tools-missing when ani-cli is not installed', () => {
    const b = createAniCliBridge({ toolManager: { toolPaths: () => ({ bash: BASH, aniCli: null, gitRoot: null }) }, server, bridges: BRIDGES, getSettings: () => DEFAULT_SETTINGS, historyDir: tmp })
    expect(() => b.startSession({ query: 'x' })).toThrow('tools-missing')
  })
})
