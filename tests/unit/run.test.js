import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { run } from '../../src/main/run.js'

const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)) }
  throw new Error('timeout')
}
const isAlive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

describe('run', () => {
  it('collects output and emits lines split on \\r and \\n', async () => {
    const lines = []
    const p = run(process.execPath, ['-e', 'process.stdout.write("a\\r b\\nc\\n"); process.stderr.write("err")'], { onLine: (l) => lines.push(l) })
    const r = await p.done
    expect(r.code).toBe(0)
    expect(r.stderr).toBe('err')
    expect(lines).toHaveLength(4)
    expect(lines).toEqual(expect.arrayContaining(['a', ' b', 'c', 'err']))
  })
  it('kills the whole process tree (grandchildren too)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-run-'))
    const pidFile = path.join(dir, 'grandchild.pid')
    const inner = 'require("fs").writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 60000)'
    const outer = `require("child_process").spawn(process.execPath, ["-e", ${JSON.stringify(inner)}, ${JSON.stringify(pidFile)}], { stdio: "ignore" }); setTimeout(() => {}, 60000)`
    const p = run(process.execPath, ['-e', outer])
    await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').length > 0)
    const grandchild = Number(fs.readFileSync(pidFile, 'utf8'))
    p.kill()
    const r = await p.done
    expect(r.killed).toBe(true)
    await waitFor(() => !isAlive(grandchild))
  })
  it('times out', async () => {
    const r = await run(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 300 }).done
    expect(r.killed).toBe(true)
  })
  it('resolves (does not throw) when the command does not exist', async () => {
    const r = await run('definitely-not-a-command-xyz', []).done
    expect(r.code).toBe(-1)
  })
})
