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
    anilist: { getForTitle: vi.fn(async () => ({ id: 77, status: 'FINISHED' })), getCached: vi.fn(() => ({ id: 77, status: 'FINISHED' })) },
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
    d.anilist.getCached.mockReturnValue({ id: 77, status: 'RELEASING' })
    await createSeriesEpisodes(d).forSeries({ title: 'Show' })
    expect(d.episodeMeta.get).toHaveBeenCalledWith(77, { airing: true })
  })
  it('never asks AniList over the network when the id is already known', async () => {
    const d = deps()
    d.anilist.getCached.mockReturnValue({ id: 77, status: 'RELEASING' })
    const svc = createSeriesEpisodes(d)
    await svc.forSeries({ title: 'Show' })
    await svc.thumb({ title: 'Show', episode: '1' })
    await svc.forSeries({ title: 'Other', aniListId: 5 })
    expect(d.anilist.getForTitle).not.toHaveBeenCalled()
    expect(d.episodeMeta.get).toHaveBeenCalledWith(77, { airing: true })
    expect(d.anilist.getCached).toHaveBeenCalledWith('Other', { aniListId: 5 })
  })
  it('still asks AniList by title when no id is known', async () => {
    const d = deps({ inLibrary: false })
    await createSeriesEpisodes(d).forSeries({ title: 'Show', list: ['1'] })
    expect(d.anilist.getForTitle).toHaveBeenCalledWith('Show', { aniListId: null })
    expect(d.anilist.getCached).not.toHaveBeenCalled()
  })
  it('asks AniList with the title without the "(N episodes)" suffix', async () => {
    const d = deps({ inLibrary: false })
    await createSeriesEpisodes(d).forSeries({ title: 'Show (3 episodes)', list: ['1'] })
    expect(d.anilist.getForTitle).toHaveBeenCalledWith('Show', { aniListId: null })
    const k = deps()
    await createSeriesEpisodes(k).forSeries({ title: 'Show (3 episodes)', aniListId: 9 })
    expect(k.anilist.getCached).toHaveBeenCalledWith('Show', { aniListId: 9 })
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

describe('seriesEpisodes marks', () => {
  const REC = { filler: [2, 5], recap: [3], count: 6, fetchedAt: 1, expired: false }
  function markDeps({ rec = REC, status = 'FINISHED', malId = 21, ensure, ...rest } = {}) {
    const d = deps(rest)
    d.anilist.getCached = vi.fn(() => ({ id: 77, malId, status }))
    d.fillerInfo = { cached: vi.fn(() => rec), ensure: ensure ?? vi.fn(async () => false) }
    d.onMarksChanged = vi.fn()
    return d
  }
  const run = (d, args = { title: 'Show' }) => createSeriesEpisodes(d).forSeries(args)

  it('marks ok: kind on rows (also hidden) and markCounts', async () => {
    const r = await run(markDeps())
    expect(r.marks).toBe('ok')
    expect(r.markCounts).toEqual({ filler: 2, recap: 1 })
    expect(r.episodes.map((e) => e.kind)).toEqual([undefined, 'filler', 'recap', undefined, 'filler', undefined])
    expect(r.episodes[4]).toEqual({ number: '5', runtime: 24, visibility: 'hidden', kind: 'filler' })
  })
  it('settings.episodeMarks false: marks off, fillerInfo untouched', async () => {
    const d = markDeps({ settings: { episodeMarks: false } })
    const r = await run(d)
    expect(r.marks).toBe('off')
    expect(r.markCounts).toEqual({ filler: 0, recap: 0 })
    expect(r.episodes.some((e) => 'kind' in e)).toBe(false)
    expect(d.fillerInfo.cached).not.toHaveBeenCalled()
    expect(d.fillerInfo.ensure).not.toHaveBeenCalled()
  })
  it('metaOff: marks off', async () => {
    const d = markDeps({ spoilers: { reveal: { all: false, episodes: [] }, metaOff: true } })
    expect((await run(d)).marks).toBe('off')
    expect(d.fillerInfo.cached).not.toHaveBeenCalled()
    expect(d.fillerInfo.ensure).not.toHaveBeenCalled()
  })
  it('Search path: no id, not in library, AniList by title supplies the malId', async () => {
    const d = markDeps({ inLibrary: false })
    d.anilist.getForTitle.mockResolvedValue({ id: 5, malId: 21, status: 'FINISHED', match: 'exact' })
    const r = await run(d, { title: 'Show', list: ['1', '2', '3', '4', '5', '6'] })
    expect(d.fillerInfo.cached).toHaveBeenCalledWith(21, { airing: false })
    expect(r.marks).toBe('ok')
    expect(r.markCounts).toEqual({ filler: 2, recap: 1 })
  })
  it('a RELEASING series asks the cache as airing', async () => {
    const d = markDeps({ status: 'RELEASING' })
    await run(d)
    expect(d.fillerInfo.cached).toHaveBeenCalledWith(21, { airing: true })
  })
  it('no malId: none, ensure not called', async () => {
    const d = markDeps({ malId: null })
    expect((await run(d)).marks).toBe('none')
    expect(d.fillerInfo.ensure).not.toHaveBeenCalled()
  })
  it('missing or expired cache: ensure called once with { airing }', async () => {
    const d = markDeps({ rec: null, status: 'RELEASING' })
    const r = await run(d)
    expect(r.marks).toBe('none')
    expect(d.fillerInfo.ensure).toHaveBeenCalledTimes(1)
    expect(d.fillerInfo.ensure).toHaveBeenCalledWith(21, { airing: true, onPartial: d.onMarksChanged })
    const e = markDeps({ rec: { ...REC, expired: true } })
    const r2 = await run(e)
    expect(r2.marks).toBe('ok') // stale data is still shown while it refreshes
    expect(e.fillerInfo.ensure).toHaveBeenCalledWith(21, { airing: false, onPartial: e.onMarksChanged })
    const m = markDeps({ rec: { missing: true, filler: [], recap: [], count: 0, expired: false } })
    expect((await run(m)).marks).toBe('none')
    expect(m.fillerInfo.ensure).not.toHaveBeenCalled()
    const x = markDeps({ rec: { missing: true, filler: [], recap: [], count: 0, expired: true } })
    expect((await run(x)).marks).toBe('none')
    expect(x.fillerInfo.ensure).toHaveBeenCalledWith(21, { airing: false, onPartial: x.onMarksChanged })
  })
  it('forSeries does not wait for ensure', async () => {
    const d = markDeps({ rec: null, ensure: vi.fn(() => new Promise(() => {})) })
    expect((await run(d)).marks).toBe('none')
  })
  it('the fast partial write reaches the renderer through the same onMarksChanged', async () => {
    const d = markDeps({ rec: null, ensure: vi.fn(async (_id, { onPartial }) => { onPartial(); return false }) })
    await run(d)
    await new Promise((r) => setTimeout(r, 0))
    expect(d.onMarksChanged).toHaveBeenCalledTimes(1)
  })
  it('ensure true calls onMarksChanged once; false does not', async () => {
    const yes = markDeps({ rec: null, ensure: vi.fn(async () => true) })
    await run(yes)
    await new Promise((r) => setTimeout(r, 0))
    expect(yes.onMarksChanged).toHaveBeenCalledTimes(1)
    const no = markDeps({ rec: null, ensure: vi.fn(async () => false) })
    await run(no)
    await new Promise((r) => setTimeout(r, 0))
    expect(no.onMarksChanged).not.toHaveBeenCalled()
  })
  it('thumb never calls cached or ensure', async () => {
    const d = markDeps({ watched: [1, 2, 3] })
    await createSeriesEpisodes(d).thumb({ title: 'Show', episode: '2' })
    expect(d.fillerInfo.cached).not.toHaveBeenCalled()
    expect(d.fillerInfo.ensure).not.toHaveBeenCalled()
  })
  it('unreliable: no kind on any row', async () => {
    const d = markDeps({ rec: { ...REC, count: 3 } })
    const r = await run(d)
    expect(r.marks).toBe('unreliable')
    expect(r.markCounts).toEqual({ filler: 0, recap: 0 })
    expect(r.episodes.some((e) => 'kind' in e)).toBe(false)
  })
})

describe('seriesEpisodes fuzzy title matches', () => {
  const titleOnly = (match, over = {}) => {
    const d = deps({ inLibrary: false, ...over })
    d.anilist.getForTitle = vi.fn(async () => ({ id: 77, malId: 21, status: 'FINISHED', match }))
    d.fillerInfo = { cached: vi.fn(() => null), ensure: vi.fn(async () => true) }
    return d
  }
  it('close match on the title-only path: no episode data, no marks, episodes still listed', async () => {
    const d = titleOnly('close')
    const r = await createSeriesEpisodes(d).forSeries({ title: 'Show', list: ['1', '2', '3'] })
    expect(d.episodeMeta.get).not.toHaveBeenCalled()
    expect(d.fillerInfo.ensure).not.toHaveBeenCalled()
    expect(r.meta).toBe('none')
    expect(r.marks).toBe('none')
    expect(r.episodes.map((e) => e.number)).toEqual(['1', '2', '3'])
  })
  it('a title-only hit without match is dropped too', async () => {
    const d = titleOnly(undefined)
    await createSeriesEpisodes(d).forSeries({ title: 'Show', list: ['1'] })
    expect(d.episodeMeta.get).not.toHaveBeenCalled()
  })
  it('exact match on the title-only path keeps episode data', async () => {
    const d = titleOnly('exact')
    const r = await createSeriesEpisodes(d).forSeries({ title: 'Show', list: ['1'] })
    expect(d.episodeMeta.get).toHaveBeenCalledWith(77, expect.anything())
    expect(r.meta).toBe('ok')
  })
  it('a known id is unaffected by the match field', async () => {
    const d = deps()
    d.anilist.getCached = vi.fn(() => ({ id: 77, status: 'FINISHED', match: 'close' }))
    await createSeriesEpisodes(d).forSeries({ title: 'Show' })
    expect(d.episodeMeta.get).toHaveBeenCalledWith(77, expect.anything())
  })
})
