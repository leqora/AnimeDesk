import { describe, it, expect, vi } from 'vitest'
import { createSeriesEpisodes } from '../../src/main/seriesEpisodes.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

const ANIZIP = {
  episodeCount: 6,
  episodes: Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [String(n), { titles: { en: `Tajna ${n}` }, image: `https://img.example/${n}.jpg`, overview: `Opis ${n}`, runtime: 24 }])),
}

function deps({ watched = [1, 2, 3], total = 6, inLibrary = true, spoilers = { reveal: { all: false, episodes: [] }, metaOff: false }, settings = {}, anizip = ANIZIP, cachedList = null } = {}) {
  const entry = inLibrary ? { id: 'a', title: 'Show', aniCliTitle: 'Show', aniListId: 77, totalEpisodes: total, watchedEpisodes: watched } : null
  return {
    library: { findByAniCliTitle: vi.fn(() => entry) },
    seriesPrefs: {
      resolve: vi.fn(() => ({ quality: 'best', mode: 'sub' })),
      getSpoilers: vi.fn(() => spoilers),
      setSpoilers: vi.fn(() => spoilers),
    },
    settings: { get: () => ({ ...DEFAULT_SETTINGS, ...settings }) },
    anilist: { getForTitle: vi.fn(async () => ({ id: 77, status: 'FINISHED' })) },
    episodeMeta: { get: vi.fn(async () => anizip), thumb: vi.fn(async () => 'data:image/jpeg;base64,AAA') },
    episodeLists: { get: vi.fn(() => cachedList) },
  }
}

describe('seriesEpisodes.forSeries', () => {
  it('shows watched episodes fully, previews the next one and hides the rest', async () => {
    const r = await createSeriesEpisodes(deps()).forSeries({ title: 'Show' })
    expect(r.source).toBe('synthetic')
    expect(r.meta).toBe('ok')
    expect(r.episodes.map((e) => e.visibility)).toEqual(['full', 'full', 'full', 'preview', 'hidden', 'hidden'])
    expect(r.episodes[0]).toEqual({ number: '1', runtime: 24, visibility: 'full', title: 'Tajna 1', hasThumb: true, overview: 'Opis 1' })
    expect(r.episodes[3]).toEqual({ number: '4', runtime: 24, visibility: 'preview', title: 'Tajna 4', hasThumb: true })
    expect(r.episodes[4]).toEqual({ number: '5', runtime: 24, visibility: 'hidden' })
  })
  it('GUARD: no hidden title, image URL or summary anywhere in the serialized answer', async () => {
    const r = await createSeriesEpisodes(deps()).forSeries({ title: 'Show' })
    const wire = JSON.stringify(r)
    for (const n of [5, 6]) {
      expect(wire).not.toContain(`Tajna ${n}`)
      expect(wire).not.toContain(`Opis ${n}`)
    }
    expect(wire).not.toContain('Opis 4') // the next episode has no summary
    expect(wire).not.toContain('img.example') // no image URL ever reaches the renderer
  })
  it('uses the menu list first, then the cached ani-cli list, then 1..max', async () => {
    const d = deps({ cachedList: ['0', '1', '2'] })
    const svc = createSeriesEpisodes(d)
    expect((await svc.forSeries({ title: 'Show', list: [' 1', '2 '] })).episodes.map((e) => e.number)).toEqual(['1', '2'])
    const cached = await svc.forSeries({ title: 'Show' })
    expect(cached.source).toBe('ani-cli')
    expect(cached.episodes.map((e) => e.number)).toEqual(['0', '1', '2'])
    expect(d.episodeLists.get).toHaveBeenCalledWith('Show', 'sub')
    await svc.forSeries({ title: 'Show', mode: 'dub' })
    expect(d.episodeLists.get).toHaveBeenLastCalledWith('Show', 'dub')
  })
  it('a series not in the library shows only episode 1', async () => {
    const r = await createSeriesEpisodes(deps({ inLibrary: false })).forSeries({ title: 'Show', list: ['1', '2', '3'] })
    expect(r.episodes.map((e) => e.visibility)).toEqual(['preview', 'hidden', 'hidden'])
    expect(JSON.stringify(r)).not.toContain('Tajna 2')
  })
  it('drops all metadata when the source counts more episodes than ani.zip', async () => {
    const r = await createSeriesEpisodes(deps()).forSeries({ title: 'Show', list: ['1', '2', '3', '4', '5', '6', '7'] })
    expect(r.meta).toBe('unreliable')
    expect(JSON.stringify(r)).not.toContain('Tajna')
    expect(r.episodes[0]).toEqual({ number: '1', runtime: null, visibility: 'full' })
  })
  it('a synthetic list that outgrows ani.zip (cross-season numbering) is unreliable', async () => {
    const r = await createSeriesEpisodes(deps({ total: 6, watched: [7, 8] })).forSeries({ title: 'Show' })
    expect(r.source).toBe('synthetic')
    expect(r.meta).toBe('unreliable')
    expect(JSON.stringify(r)).not.toContain('Tajna')
  })
  it('respects metaOff, missing ani.zip data and an unknown series', async () => {
    const off = deps({ spoilers: { reveal: { all: false, episodes: [] }, metaOff: true } })
    expect((await createSeriesEpisodes(off).forSeries({ title: 'Show' })).meta).toBe('off')
    expect(off.episodeMeta.get).not.toHaveBeenCalled()
    expect((await createSeriesEpisodes(deps({ anizip: null })).forSeries({ title: 'Show' })).meta).toBe('none')
    expect((await createSeriesEpisodes(deps({ anizip: { episodeCount: 0, episodes: {} } })).forSeries({ title: 'Show' })).meta).toBe('none')
    const unknown = deps({ inLibrary: false })
    unknown.anilist.getForTitle.mockResolvedValue(null)
    expect((await createSeriesEpisodes(unknown).forSeries({ title: 'Show', list: ['1'] })).meta).toBe('none')
  })
  it('applies reveals and the global switch', async () => {
    const one = await createSeriesEpisodes(deps({ spoilers: { reveal: { all: false, episodes: ['6'] }, metaOff: false } })).forSeries({ title: 'Show' })
    expect(one.episodes.map((e) => e.visibility)).toEqual(['full', 'full', 'full', 'preview', 'hidden', 'full'])
    const all = await createSeriesEpisodes(deps({ spoilers: { reveal: { all: true, episodes: [] }, metaOff: false } })).forSeries({ title: 'Show' })
    expect(all.episodes.every((e) => e.visibility === 'full')).toBe(true)
    const off = await createSeriesEpisodes(deps({ settings: { hideSpoilers: false } })).forSeries({ title: 'Show' })
    expect(off.episodes.every((e) => e.visibility === 'full')).toBe(true)
  })
  it('asks ani.zip as airing for a series that is still airing', async () => {
    const d = deps()
    d.anilist.getForTitle.mockResolvedValue({ id: 77, status: 'RELEASING' })
    await createSeriesEpisodes(d).forSeries({ title: 'Show' })
    expect(d.episodeMeta.get).toHaveBeenCalledWith(77, { airing: true })
  })
})

describe('seriesEpisodes.thumb', () => {
  it('loads thumbnails only for episodes that may be shown', async () => {
    const d = deps()
    const svc = createSeriesEpisodes(d)
    expect(await svc.thumb({ title: 'Show', episode: '4' })).toBe('data:image/jpeg;base64,AAA')
    expect(d.episodeMeta.thumb).toHaveBeenCalledWith(77, '4')
    d.episodeMeta.thumb.mockClear()
    expect(await svc.thumb({ title: 'Show', episode: '5' })).toBeNull()
    expect(await svc.thumb({ title: 'Show', episode: '99' })).toBeNull()
    expect(await svc.thumb({ title: 'Show', episode: '../x' })).toBeNull()
    expect(d.episodeMeta.thumb).not.toHaveBeenCalled()
  })
  it('loads nothing when the metadata is unreliable or off', async () => {
    const d = deps()
    expect(await createSeriesEpisodes(d).thumb({ title: 'Show', list: ['1', '2', '3', '4', '5', '6', '7'], episode: '1' })).toBeNull()
    expect(d.episodeMeta.thumb).not.toHaveBeenCalled()
    const off = deps({ spoilers: { reveal: { all: false, episodes: [] }, metaOff: true } })
    expect(await createSeriesEpisodes(off).thumb({ title: 'Show', episode: '1' })).toBeNull()
    expect(off.episodeMeta.thumb).not.toHaveBeenCalled()
    const none = deps({ anizip: null })
    expect(await createSeriesEpisodes(none).thumb({ title: 'Show', episode: '1' })).toBeNull()
    expect(none.episodeMeta.thumb).not.toHaveBeenCalled()
  })
})

describe('seriesEpisodes.resilience', () => {
  it('survives an AniList failure when no id is known', async () => {
    const d = deps({ inLibrary: false })
    d.anilist.getForTitle.mockRejectedValue(new Error('down'))
    const r = await createSeriesEpisodes(d).forSeries({ title: 'Show', list: ['1', '2'] })
    expect(r.meta).toBe('none')
    expect(d.episodeMeta.get).not.toHaveBeenCalled()
  })
})

describe('seriesEpisodes.spoilers', () => {
  it('saves the action and returns the new list', async () => {
    const d = deps()
    const r = await createSeriesEpisodes(d).spoilers({ title: 'Show' }, { episode: '5' })
    expect(d.seriesPrefs.setSpoilers).toHaveBeenCalledWith('Show', { episode: '5' })
    expect(r.episodes).toHaveLength(6)
  })
})
