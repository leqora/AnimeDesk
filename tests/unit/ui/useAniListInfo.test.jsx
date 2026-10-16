// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderHookUi, makeFakeApi } from './helpers.jsx'
import { infoCache } from '../../../src/renderer/anilist/infoCache.js'
import { useAniListInfo, LIVE_RETRY_MS, LIVE_GIVE_UP_MS } from '../../../src/renderer/anilist/useAniListInfo.js'
import { AIRED_GRACE_MS } from '../../../src/shared/airing.js'

afterEach(() => { vi.useRealTimers() })

const MIN = 60 * 1000
const airing = (airingAt, poster = 'p') => ({ id: 7, poster, nextAiring: { episode: 4, airingAt } })

describe('useAniListInfo', () => {
  it('starts from the cached value without loading', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ id: 1, poster: 'p' })) } })
    await infoCache(api).get('Frieren')
    const seen = []
    renderHookUi(() => { const v = useAniListInfo('Frieren'); seen.push(v); return v }, { api })
    expect(seen[0]).toEqual({ id: 1, poster: 'p' })
  })
  it('keeps the loading / null / falsy-title contract', async () => {
    const api = makeFakeApi()
    const { result } = renderHookUi(() => useAniListInfo('Nothing'), { api })
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBeNull())
    expect(renderHookUi(() => useAniListInfo(null), { api }).result.current).toBeNull()
  })
  it('live refetches after airingAt + 1 h', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    const forTitle = vi.fn()
      .mockResolvedValueOnce(airing(now + 5 * MIN, 'old'))
      .mockResolvedValue(airing(now + 7 * 24 * 60 * MIN, 'new'))
    const api = makeFakeApi({ anilist: { forTitle } })
    const { result } = renderHookUi(() => useAniListInfo('Show', null, { live: true }), { api })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.poster).toBe('old')
    expect(forTitle).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * MIN + AIRED_GRACE_MS + 31_000) })
    expect(forTitle).toHaveBeenCalledTimes(2)
    expect(result.current.poster).toBe('new')
  })
  it('a refetch by one hook updates another hook of the same series', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    const forTitle = vi.fn()
      .mockResolvedValueOnce(airing(now + 5 * MIN, 'old'))
      .mockResolvedValue(airing(now + 7 * 24 * 60 * MIN, 'new'))
    const api = makeFakeApi({ anilist: { forTitle } })
    const a = renderHookUi(() => useAniListInfo('Show', null, { live: true }), { api })
    const b = renderHookUi(() => useAniListInfo('Show'), { api })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(a.result.current.poster).toBe('old')
    expect(b.result.current.poster).toBe('old')
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * MIN + AIRED_GRACE_MS + 31_000) })
    expect(a.result.current.poster).toBe('new')
    expect(b.result.current.poster).toBe('new')
    expect(forTitle).toHaveBeenCalledTimes(2)
  })
  it('not live: no timer', async () => {
    vi.useFakeTimers()
    const forTitle = vi.fn(async () => airing(Date.now() + 5 * MIN))
    const api = makeFakeApi({ anilist: { forTitle } })
    renderHookUi(() => useAniListInfo('Show'), { api })
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * MIN + AIRED_GRACE_MS + 60_000) })
    expect(forTitle).toHaveBeenCalledTimes(1)
  })
  it('live ignores airing more than 24 h away', async () => {
    vi.useFakeTimers()
    const forTitle = vi.fn(async () => airing(Date.now() + 25 * 60 * MIN))
    const api = makeFakeApi({ anilist: { forTitle } })
    renderHookUi(() => useAniListInfo('Show', null, { live: true }), { api })
    await act(async () => { await vi.advanceTimersByTimeAsync(26 * 60 * MIN + AIRED_GRACE_MS) })
    expect(forTitle).toHaveBeenCalledTimes(1)
  })
  it('title change never renders the old info, and a late response for the old key is ignored', async () => {
    let resolveA
    const forTitle = vi.fn((title) => (title === 'A'
      ? new Promise((r) => { resolveA = r })
      : Promise.resolve({ id: 2, poster: 'B' })))
    const api = makeFakeApi({ anilist: { forTitle } })
    const seen = []
    const { rerender, result } = renderHookUi(({ title }) => { const v = useAniListInfo(title); seen.push([title, v]); return v }, { api, initialProps: { title: 'A' } })
    rerender({ title: 'B' })
    await waitFor(() => expect(result.current).toEqual({ id: 2, poster: 'B' }))
    await act(async () => { resolveA({ id: 1, poster: 'A' }) })
    expect(result.current).toEqual({ id: 2, poster: 'B' })
    expect(seen.filter(([title, v]) => title === 'B' && v?.poster === 'A')).toEqual([])
  })
  it('falls back to loading (not the previous info) when the key changes to an uncached one', async () => {
    const forTitle = vi.fn((title) => (title === 'A' ? Promise.resolve({ id: 1, poster: 'A' }) : new Promise(() => {})))
    const api = makeFakeApi({ anilist: { forTitle } })
    const { rerender, result } = renderHookUi(({ title }) => useAniListInfo(title), { api, initialProps: { title: 'A' } })
    await waitFor(() => expect(result.current.poster).toBe('A'))
    rerender({ title: 'B' })
    expect(result.current).toBeUndefined()
  })
  it('live timer is cleared on unmount', async () => {
    vi.useFakeTimers()
    const forTitle = vi.fn(async () => airing(Date.now() + 5 * MIN))
    const api = makeFakeApi({ anilist: { forTitle } })
    const { unmount } = renderHookUi(() => useAniListInfo('Show', null, { live: true }), { api })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * MIN + AIRED_GRACE_MS + 60_000) })
    expect(forTitle).toHaveBeenCalledTimes(1)
  })
  describe('live retries', () => {
    const HOUR = 60 * MIN
    const setup = (forTitle, opts = {}) => {
      const api = makeFakeApi({ anilist: { forTitle } })
      return renderHookUi(() => useAniListInfo('Show', null, { live: true }), { api, ...opts })
    }
    const at = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
    const LIVE = 5 * MIN + AIRED_GRACE_MS + 30_000 // first live fetch, relative to mount

    it('exports the retry schedule', () => {
      expect(LIVE_RETRY_MS).toEqual([5 * MIN, 15 * MIN, 60 * MIN])
      expect(LIVE_GIVE_UP_MS).toBe(24 * HOUR)
    })
    it('retries when the refetch still has the same past airingAt, then stops for a new one', async () => {
      vi.useFakeTimers()
      const t0 = Date.now()
      const same = airing(t0 + 5 * MIN)
      const forTitle = vi.fn()
        .mockResolvedValueOnce(same).mockResolvedValueOnce(same).mockResolvedValueOnce(same).mockResolvedValueOnce(same)
        .mockResolvedValue(airing(t0 + 7 * 24 * HOUR, 'new'))
      const { result } = setup(forTitle)
      await at(0)
      expect(forTitle).toHaveBeenCalledTimes(1)
      await at(LIVE)
      expect(forTitle).toHaveBeenCalledTimes(2)
      await at(5 * MIN)
      expect(forTitle).toHaveBeenCalledTimes(3)
      await at(15 * MIN)
      expect(forTitle).toHaveBeenCalledTimes(4)
      await at(60 * MIN)
      expect(forTitle).toHaveBeenCalledTimes(5)
      expect(result.current.poster).toBe('new')
      await at(5 * HOUR)
      expect(forTitle).toHaveBeenCalledTimes(5)
    })
    it('retries after a rejected refetch', async () => {
      vi.useFakeTimers()
      const t0 = Date.now()
      const forTitle = vi.fn()
        .mockResolvedValueOnce(airing(t0 + 5 * MIN))
        .mockRejectedValueOnce(new Error('net'))
        .mockResolvedValue(airing(t0 + 7 * 24 * HOUR, 'new'))
      const { result } = setup(forTitle)
      await at(0)
      await at(LIVE)
      expect(forTitle).toHaveBeenCalledTimes(2)
      await at(5 * MIN - 1000)
      expect(forTitle).toHaveBeenCalledTimes(2)
      await at(1000)
      expect(forTitle).toHaveBeenCalledTimes(3)
      expect(result.current.poster).toBe('new')
    })
    it('stops 24 h after airing', async () => {
      vi.useFakeTimers()
      const t0 = Date.now()
      const forTitle = vi.fn(async () => airing(t0 + 5 * MIN))
      setup(forTitle)
      await at(0)
      await at(5 * MIN + 25 * HOUR)
      const n = forTitle.mock.calls.length
      expect(n).toBeGreaterThan(4)
      await at(5 * HOUR)
      expect(forTitle).toHaveBeenCalledTimes(n)
    })
    it('a series already past airingAt + 24 h starts no chain', async () => {
      vi.useFakeTimers()
      const forTitle = vi.fn(async () => airing(Date.now() - 25 * HOUR))
      setup(forTitle)
      await at(30 * HOUR)
      expect(forTitle).toHaveBeenCalledTimes(1)
    })
    it('a series mounted past grace fetches immediately and keeps retrying', async () => {
      vi.useFakeTimers()
      const past = Date.now() - 2 * HOUR
      const forTitle = vi.fn(async () => airing(past))
      setup(forTitle)
      await at(0) // the immediate live fetch is served by the 60 s cache entry
      expect(forTitle).toHaveBeenCalledTimes(1)
      await at(5 * MIN)
      expect(forTitle).toHaveBeenCalledTimes(2)
      await at(15 * MIN)
      expect(forTitle).toHaveBeenCalledTimes(3)
    })
    it('a new airingAt clears the old retry chain', async () => {
      vi.useFakeTimers()
      const t0 = Date.now()
      const same = airing(t0 + 5 * MIN)
      const forTitle = vi.fn(async () => same)
      const api = makeFakeApi({ anilist: { forTitle } })
      const a = renderHookUi(() => useAniListInfo('Show', null, { live: true }), { api })
      await at(0)
      await at(LIVE)
      expect(forTitle).toHaveBeenCalledTimes(2)
      // another view delivers a new schedule through the shared cache
      forTitle.mockImplementation(async () => airing(t0 + 7 * 24 * HOUR, 'new'))
      await at(5 * MIN)
      expect(a.result.current.poster).toBe('new')
      const n = forTitle.mock.calls.length
      await at(3 * HOUR)
      expect(forTitle).toHaveBeenCalledTimes(n)
    })
  })
})
