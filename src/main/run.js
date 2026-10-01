import { spawn } from 'node:child_process'

function killTree(child) {
  if (child.exitCode !== null || child.pid == null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

export function run(cmd, args = [], { env, cwd, timeoutMs, onLine } = {}) {
  const child = spawn(cmd, args, { env, cwd, windowsHide: true })
  let stdout = ''
  let stderr = ''
  let buf = ''
  let killed = false
  let timer = null

  const emit = (chunk) => {
    if (!onLine) return
    buf += chunk
    const parts = buf.split(/[\r\n]+/)
    buf = parts.pop()
    for (const p of parts) if (p) onLine(p)
  }
  child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; emit(s) })
  child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; emit(s) })

  const done = new Promise((resolve) => {
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + String(err), killed }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (buf && onLine) onLine(buf)
      resolve({ code: code ?? -1, stdout, stderr, killed })
    })
  })

  const kill = () => { killed = true; killTree(child) }
  if (timeoutMs) timer = setTimeout(kill, timeoutMs)
  return { done, kill, child }
}
