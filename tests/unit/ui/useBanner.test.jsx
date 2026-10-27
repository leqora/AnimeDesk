// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookUi, makeFakeApi } from './helpers.jsx'
import { useBanner } from '../../../src/renderer/anilist/useBanner.js'

describe('useBanner', () => {
  it('is undefined while waiting, then the url; a null request is null', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => 'animedesk-img://banner/ab12') } })
    const { result } = renderHookUi(() => useBanner({ kind: 'series', entryId: 'a' }), { api })
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe('animedesk-img://banner/ab12'))
    expect(renderHookUi(() => useBanner(null), { api }).result.current).toBeNull()
  })
  it('asks once per key, even for simultaneous users, and remembers the answer', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => null) } })
    const a = renderHookUi(() => useBanner({ kind: 'discover', id: 7 }), { api })
    const b = renderHookUi(() => useBanner({ kind: 'discover', id: 7 }), { api })
    await waitFor(() => expect(a.result.current).toBeNull())
    await waitFor(() => expect(b.result.current).toBeNull())
    const c = renderHookUi(() => useBanner({ kind: 'discover', id: 7 }), { api })
    expect(c.result.current).toBeNull() // from the cache, no spinner state
    expect(api.anilist.banner).toHaveBeenCalledTimes(1)
  })
  it('treats a failed call as no banner', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => { throw new Error('x') }) } })
    const { result } = renderHookUi(() => useBanner({ kind: 'rec', id: 1 }), { api })
    await waitFor(() => expect(result.current).toBeNull())
  })
})
