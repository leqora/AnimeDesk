import { describe, it, expect, vi } from 'vitest'
import { createLoader } from '../../../src/renderer/player/loadPlayer.js'

describe('createLoader', () => {
  it('imports once and shares the promise', async () => {
    const importer = vi.fn(async () => ({ PlayerView: 'x' }))
    const load = createLoader(importer)
    const [a, b] = await Promise.all([load(), load()])
    expect(a).toBe(b)
    expect(importer).toHaveBeenCalledTimes(1)
  })
  it('tries again after a failed import', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new Error('chunk')).mockResolvedValue({ PlayerView: 'x' })
    const load = createLoader(importer)
    await expect(load()).rejects.toThrow('chunk')
    await expect(load()).resolves.toEqual({ PlayerView: 'x' })
    expect(importer).toHaveBeenCalledTimes(2)
  })
})
