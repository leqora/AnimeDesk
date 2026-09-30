import { it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBridgeServer } from '../../src/main/bridgeServer.js'
import { createAniCliBridge } from '../../src/main/aniCliBridge.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'
import { BASH, describeBash } from '../helpers/bash.js'

const BRIDGES = { menu: path.resolve('resources/bridges/menu-bridge.sh'), player: path.resolve('resources/bridges/animedesk-mpv-bridge.sh') }
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
    const r = await bridge.startSession({ query: 'fake', player: 'download', index: 1, episodes: 1, downloadDir: dir, onLine: (l) => lines.push(l) }).done
    expect(r.ok).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'Fake Anime Episode 1.mp4'), 'utf8')).toBe('video')
    expect(lines).toContain('[download]  50.0% of 10.00MiB')
  })
  it('selfTest passes when a link is printed', async () => {
    expect(await bridge.selfTest()).toBe(true)
  })
  it('throws tools-missing when ani-cli is not installed', () => {
    const b = createAniCliBridge({ toolManager: { toolPaths: () => ({ bash: BASH, aniCli: null, gitRoot: null }) }, server, bridges: BRIDGES, getSettings: () => DEFAULT_SETTINGS, historyDir: tmp })
    expect(() => b.startSession({ query: 'x' })).toThrow('tools-missing')
  })
})
