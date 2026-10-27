import { describe, it, expect, vi } from 'vitest'
import { createBannerLookup } from '../../src/main/bannerLookup.js'

function setup(over = {}) {
  const deps = {
    library: { list: vi.fn(() => [{ id: 'e1', title: 'Show A', aniListId: 11 }, { id: 'e2', title: 'Show B' }]) },
    anilist: {
      getForTitle: vi.fn(async () => null),
      bannerUrlFor: vi.fn(async () => ({ id: 11, bannerUrl: 'https://s4.anilist.co/b.jpg' })),
    },
    discover: { bannerUrlOf: vi.fn(() => 'https://s4.anilist.co/d.jpg') },
    recommendations: { bannerUrlOf: vi.fn(() => 'https://s4.anilist.co/r.jpg') },
    banners: { ensure: vi.fn(async (u) => `animedesk-img://banner/${u.length}`) },
    ...over,
  }
  return { deps, lookup: createBannerLookup(deps) }
}

describe('createBannerLookup', () => {
  it('series from the library', async () => {
    const { deps, lookup } = setup()
    expect(await lookup.banner({ kind: 'series', entryId: 'e1' })).toBe('animedesk-img://banner/' + 'https://s4.anilist.co/b.jpg'.length)
    expect(deps.anilist.bannerUrlFor).toHaveBeenCalledWith('Show A', { aniListId: 11 })
    expect(deps.banners.ensure).toHaveBeenCalledWith('https://s4.anilist.co/b.jpg')
    await lookup.banner({ kind: 'series', entryId: 'e2' })
    expect(deps.anilist.bannerUrlFor).toHaveBeenLastCalledWith('Show B', { aniListId: null })
  })
  it('series: warms the AniList record via getForTitle before bannerUrlFor', async () => {
    const { deps, lookup } = setup()
    await lookup.banner({ kind: 'series', entryId: 'e1' })
    expect(deps.anilist.getForTitle).toHaveBeenCalledWith('Show A', { aniListId: 11 })
    expect(deps.anilist.getForTitle.mock.invocationCallOrder[0]).toBeLessThan(deps.anilist.bannerUrlFor.mock.invocationCallOrder[0])
    await lookup.banner({ kind: 'series', entryId: 'e2' })
    expect(deps.anilist.getForTitle).toHaveBeenLastCalledWith('Show B', { aniListId: null })
  })
  it('series: getForTitle rejecting still lets bannerUrlFor answer', async () => {
    const { deps, lookup } = setup()
    deps.anilist.getForTitle.mockRejectedValue(new Error('offline'))
    expect(await lookup.banner({ kind: 'series', entryId: 'e1' })).toMatch(/^animedesk-img:/)
    expect(deps.anilist.bannerUrlFor).toHaveBeenCalledTimes(1)
  })
  it('unknown entryId, bad kinds and ids → null without calls', async () => {
    const { deps, lookup } = setup()
    for (const req of [{ kind: 'series', entryId: 'zz' }, { kind: 'series', entryId: 5 }, { kind: 'other', id: 1 }, { kind: 'discover', id: -1 }, { kind: 'discover', id: '5' }, { kind: 'rec', id: 1.5 }, { kind: 'rec', id: 0 }, null, undefined, 'x']) {
      expect(await lookup.banner(req)).toBeNull()
    }
    expect(deps.anilist.getForTitle).not.toHaveBeenCalled()
    expect(deps.anilist.bannerUrlFor).not.toHaveBeenCalled()
    expect(deps.discover.bannerUrlOf).not.toHaveBeenCalled()
    expect(deps.recommendations.bannerUrlOf).not.toHaveBeenCalled()
    expect(deps.banners.ensure).not.toHaveBeenCalled()
  })
  it('discover/rec', async () => {
    const { deps, lookup } = setup()
    expect(await lookup.banner({ kind: 'discover', id: 7 })).toMatch(/^animedesk-img:/)
    expect(deps.discover.bannerUrlOf).toHaveBeenCalledWith(7)
    expect(deps.banners.ensure).toHaveBeenLastCalledWith('https://s4.anilist.co/d.jpg')
    expect(await lookup.banner({ kind: 'rec', id: 8 })).toMatch(/^animedesk-img:/)
    expect(deps.recommendations.bannerUrlOf).toHaveBeenCalledWith(8)
    deps.discover.bannerUrlOf.mockReturnValue(null)
    deps.banners.ensure.mockClear()
    expect(await lookup.banner({ kind: 'discover', id: 7 })).toBeNull()
    expect(deps.banners.ensure).not.toHaveBeenCalled()
  })
  it('bannerUrl null → null without ensure', async () => {
    const { deps, lookup } = setup()
    deps.anilist.bannerUrlFor.mockResolvedValue({ id: 11, bannerUrl: null })
    expect(await lookup.banner({ kind: 'series', entryId: 'e1' })).toBeNull()
    deps.anilist.bannerUrlFor.mockResolvedValue(null)
    expect(await lookup.banner({ kind: 'series', entryId: 'e1' })).toBeNull()
    expect(deps.banners.ensure).not.toHaveBeenCalled()
  })
  it('any failure → null', async () => {
    const { deps, lookup } = setup()
    deps.anilist.bannerUrlFor.mockRejectedValue(new Error('x'))
    expect(await lookup.banner({ kind: 'series', entryId: 'e1' })).toBeNull()
    deps.discover.bannerUrlOf.mockImplementation(() => { throw new Error('y') })
    expect(await lookup.banner({ kind: 'discover', id: 1 })).toBeNull()
    deps.recommendations.bannerUrlOf.mockReturnValue('u')
    deps.banners.ensure.mockRejectedValue(new Error('z'))
    expect(await lookup.banner({ kind: 'rec', id: 1 })).toBeNull()
  })
})
