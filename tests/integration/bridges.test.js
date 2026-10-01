import { it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { run } from '../../src/main/run.js'
import { toMsysPath } from '../../src/main/paths.js'
import { createBridgeServer } from '../../src/main/bridgeServer.js'
import { BASH, describeBash } from '../helpers/bash.js'

const MENU = path.resolve('resources/bridges/menu-bridge.sh')
const PLAYER = path.resolve('resources/bridges/animedesk-mpv-bridge.sh')

it('shell scripts have LF line endings (no CR)', () => {
  for (const f of fs.readdirSync('resources/bridges')) {
    expect(fs.readFileSync(path.join('resources/bridges', f), 'utf8'), f).not.toContain('\r')
  }
})

describeBash('bridge scripts via real bash', () => {
  let server, env
  beforeAll(async () => {
    server = createBridgeServer()
    const { port, token } = await server.start()
    const gitRoot = path.resolve(path.dirname(BASH), '..')
    const base = { ...process.env }
    const pathKey = Object.keys(base).find((k) => k.toUpperCase() === 'PATH')
    const oldPath = base[pathKey]
    delete base[pathKey]
    env = {
      ...base,
      PATH: [path.join(gitRoot, 'usr', 'bin'), path.join(gitRoot, 'mingw64', 'bin'), oldPath].join(';'),
      ANIMEDESK_PORT: String(port), ANIMEDESK_TOKEN: token, ANIMEDESK_SESSION: 'int',
    }
  })
  afterAll(() => server.stop())

  it('menu-bridge sends the list and prints the chosen line', async () => {
    let seen
    server.registerSession('int', { onMenu: async (r) => { seen = r; return r.lines[0] }, onPlay: async () => 0 })
    const script = `printf '1 Fake Anime\\n2 Other\\n' | "${toMsysPath(MENU)}" "Select anime: "`
    const r = await run(BASH, ['-c', script], { env }).done
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe('1 Fake Anime')
    expect(seen).toEqual({ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other'] })
  })
  it('menu-bridge exits 1 on cancel', async () => {
    server.registerSession('int', { onMenu: async () => null, onPlay: async () => 0 })
    const r = await run(BASH, ['-c', `printf 'x\\n' | "${toMsysPath(MENU)}" "p"`], { env }).done
    expect(r.code).toBe(1)
  })
  it('mpv bridge forwards args and exits with the player exit code', async () => {
    let args
    server.registerSession('int', { onMenu: async () => null, onPlay: async (r) => { args = r.args; return 4 } })
    const script = `"${toMsysPath(PLAYER)}" --referrer=https://r "--force-media-title=Fake Anime Episode 2" https://v`
    const r = await run(BASH, ['-c', script], { env }).done
    expect(r.code).toBe(4)
    expect(args).toEqual(['--referrer=https://r', '--force-media-title=Fake Anime Episode 2', 'https://v'])
  })
})
