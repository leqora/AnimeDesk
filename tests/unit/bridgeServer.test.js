import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createBridgeServer } from '../../src/main/bridgeServer.js'

let server, url
const hex = (s) => Buffer.from(s, 'utf8').toString('hex')
const post = (path, { token = server.token, session = 's1', prompt, body = '' } = {}) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'x-animedesk-token': token, 'x-animedesk-session': session, ...(prompt != null ? { 'x-animedesk-prompt': hex(prompt) } : {}) },
    body,
  })

beforeEach(async () => { server = createBridgeServer(); const { port } = await server.start(); url = `http://127.0.0.1:${port}` })
afterEach(() => server.stop())

describe('bridgeServer', () => {
  it('forwards a menu request and returns the chosen line', async () => {
    let got
    server.registerSession('s1', { onMenu: async (req) => { got = req; return req.lines[1] }, onPlay: async () => 0 })
    const res = await post('/menu', { prompt: 'Select anime: ', body: '1 Fake Anime\n2 Šou\n' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('2 Šou')
    expect(got).toEqual({ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Šou'] })
  })
  it('returns 204 when the user cancels', async () => {
    server.registerSession('s1', { onMenu: async () => null, onPlay: async () => 0 })
    expect((await post('/menu', { prompt: 'x', body: 'a' })).status).toBe(204)
  })
  it('forwards play args and returns the exit code', async () => {
    let args
    server.registerSession('s1', { onMenu: async () => null, onPlay: async (r) => { args = r.args; return 3 } })
    const res = await post('/play', { body: '--referrer=https://r\n--force-media-title=A B Episode 2\nhttps://v\n' })
    expect(await res.text()).toBe('3')
    expect(args).toEqual(['--referrer=https://r', '--force-media-title=A B Episode 2', 'https://v'])
  })
  it('rejects a wrong token and unknown sessions', async () => {
    server.registerSession('s1', { onMenu: async () => 'x', onPlay: async () => 0 })
    expect((await post('/menu', { token: 'bad', prompt: 'x' })).status).toBe(403)
    expect((await post('/menu', { session: 'nope', prompt: 'x' })).status).toBe(404)
    server.unregisterSession('s1')
    expect((await post('/menu', { prompt: 'x' })).status).toBe(404)
  })
  it('rejects a token of a different length without throwing', async () => {
    server.registerSession('s1', { onMenu: async () => 'x', onPlay: async () => 0 })
    expect((await post('/menu', { token: 'short', prompt: 'x' })).status).toBe(403)
    expect((await post('/menu', { token: '', prompt: 'x' })).status).toBe(403)
  })
  it('rejects bodies over 1 MB', async () => {
    const onMenu = vi.fn(async () => 'x')
    server.registerSession('s1', { onMenu, onPlay: async () => 0 })
    const res = await post('/menu', { prompt: 'x', body: 'a'.repeat(1024 * 1024 + 1) })
    expect(res.status).toBe(413)
    expect(onMenu).not.toHaveBeenCalled()
  })
  it('stops even while a menu request is still waiting for the user', async () => {
    server.registerSession('s1', { onMenu: () => new Promise(() => {}), onPlay: async () => 0 })
    const pending = post('/menu', { prompt: 'x', body: 'a' }).catch(() => 'closed')
    await new Promise((r) => setTimeout(r, 100))
    const stopped = await Promise.race([server.stop().then(() => 'stopped'), new Promise((r) => setTimeout(() => r('hung'), 2000))])
    expect(stopped).toBe('stopped')
    expect(await pending).toBe('closed')
  })
})
