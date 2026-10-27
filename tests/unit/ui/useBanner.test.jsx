// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookUi, makeFakeApi } from './helpers.jsx'
import { useBanner, resetBanners } from '../../../src/renderer/anilist/useBanner.js'

describe('useBanner', () => {
  it('is undefined while waiting, then the url; a null request is null', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => 'animedesk-img://banner/ab12') } })
    const { result } = renderHookUi(() => useBanner({ kind: 'series', entryId: 'a' }), { api })
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe('animedesk-img://banner/ab12'))
    expect(renderHookUi(() => useBanner(null), { api }).result.current).toBeNull()
  })
  it('asks once per key, even for simultaneous users, and remembers a url', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => 'animedesk-img://banner/cd34') } })
    const a = renderHookUi(() => useBanner({ kind: 'discover', id: 7 }), { api })
    const b = renderHookUi(() => useBanner({ kind: 'discover', id: 7 }), { api })
    await waitFor(() => expect(a.result.current).toBe('animedesk-img://banner/cd34'))
    await waitFor(() => expect(b.result.current).toBe('animedesk-img://banner/cd34'))
    const c = renderHookUi(() => useBanner({ kind: 'discover', id: 7 }), { api })
    expect(c.result.current).toBe('animedesk-img://banner/cd34') // from the cache, no waiting state
    expect(api.anilist.banner).toHaveBeenCalledTimes(1)
  })
  it('does not remember null: a later view asks again and gets the url', async () => {
    const banner = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('animedesk-img://banner/ef56')
    const api = makeFakeApi({ anilist: { banner } })
    const a = renderHookUi(() => useBanner({ kind: 'series', entryId: 'x' }), { api })
    await waitFor(() => expect(a.result.current).toBeNull())
    const b = renderHookUi(() => useBanner({ kind: 'series', entryId: 'x' }), { api })
    await waitFor(() => expect(b.result.current).toBe('animedesk-img://banner/ef56'))
    expect(banner).toHaveBeenCalledTimes(2)
  })
  it('does not remember an error either', async () => {
    const banner = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('animedesk-img://banner/aa11')
    const api = makeFakeApi({ anilist: { banner } })
    const a = renderHookUi(() => useBanner({ kind: 'rec', id: 3 }), { api })
    await waitFor(() => expect(a.result.current).toBeNull())
    const b = renderHookUi(() => useBanner({ kind: 'rec', id: 3 }), { api })
    await waitFor(() => expect(b.result.current).toBe('animedesk-img://banner/aa11'))
  })
  it('resetBanners forgets remembered urls so the next mount asks again', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => 'animedesk-img://banner/zz99') } })
    const a = renderHookUi(() => useBanner({ kind: 'discover', id: 9 }), { api })
    await waitFor(() => expect(a.result.current).toBe('animedesk-img://banner/zz99'))
    resetBanners(api)
    const b = renderHookUi(() => useBanner({ kind: 'discover', id: 9 }), { api })
    expect(b.result.current).toBeUndefined()
    await waitFor(() => expect(b.result.current).toBe('animedesk-img://banner/zz99'))
    expect(api.anilist.banner).toHaveBeenCalledTimes(2)
  })
  it('treats a failed call as no banner', async () => {
    const api = makeFakeApi({ anilist: { banner: vi.fn(async () => { throw new Error('x') }) } })
    const { result } = renderHookUi(() => useBanner({ kind: 'rec', id: 1 }), { api })
    await waitFor(() => expect(result.current).toBeNull())
  })
})
