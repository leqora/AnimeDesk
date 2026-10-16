// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderHookUi, makeFakeApi } from './helpers.jsx'
import { infoCache } from '../../../src/renderer/anilist/infoCache.js'
import { useAniListInfo } from '../../../src/renderer/anilist/useAniListInfo.js'
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
})
