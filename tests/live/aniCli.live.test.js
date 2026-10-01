import { it, expect } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import extractZip from 'extract-zip'
import { createPaths } from '../../src/main/paths.js'
import { createToolManager } from '../../src/main/toolManager.js'
import { getJson, download } from '../../src/main/http.js'
import { run } from '../../src/main/run.js'
import { createBridgeServer } from '../../src/main/bridgeServer.js'
import { createAniCliBridge } from '../../src/main/aniCliBridge.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

// Uses the real %APPDATA%\AnimeDesk (or ANIMEDESK_USER_DATA), installs missing tools, then runs the self-test.
it('real ani-cli returns a stream link for One Piece episode 1', async () => {
  const base = process.env.ANIMEDESK_USER_DATA ?? path.join(process.env.APPDATA ?? os.homedir(), 'AnimeDesk')
  const paths = createPaths(base)
  const toolManager = createToolManager({
    paths,
    http: { getJson, download },
    extractZip: (file, dir) => extractZip(file, { dir }),
    runExe: (file, args) => run(file, args).done,
  })
  const errors = await toolManager.installMissing((p) => { if (p.phase !== 'download') console.log(p.id, p.phase, p.message ?? '') })
  expect(errors).toEqual({})
  const server = createBridgeServer()
  await server.start()
  try {
    const aniCli = createAniCliBridge({
      toolManager, server,
      bridges: { menu: path.resolve('resources/bridges/menu-bridge.sh'), player: path.resolve('resources/bridges/animedesk-mpv-bridge.sh') },
      getSettings: () => DEFAULT_SETTINGS,
      historyDir: paths.aniCliHistory,
    })
    expect(await aniCli.selfTest({ timeoutMs: 60000 })).toBe(true)
  } finally {
    await server.stop()
  }
})
