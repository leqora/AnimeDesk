// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderHookUi, makeFakeApi } from './helpers.jsx'
import { useSeriesEpisodes } from '../../../src/renderer/episodes/useSeriesEpisodes.js'
import { useEpisodeView } from '../../../src/renderer/episodes/useEpisodeView.js'

const LIST = { episodes: [{ number: '1', runtime: 24, visibility: 'preview', title: 'Naslov 1', hasThumb: true }], source: 'menu', meta: 'ok' }

describe('useSeriesEpisodes', () => {
  it('loads the list, reloads on library changes and applies spoiler actions', async () => {
    let changed
    const api = makeFakeApi({
      episodes: { forSeries: vi.fn(async () => LIST), spoilers: vi.fn(async () => ({ ...LIST, source: 'x' })), thumb: vi.fn(async () => 'data:x') },
    })
    api.onLibraryChanged = vi.fn((cb) => { changed = cb; return () => {} })
    const { result } = renderHookUi(() => useSeriesEpisodes({ title: 'Show', list: ['1'] }), { api })
    await waitFor(() => expect(result.current.series).toEqual(LIST))
    expect(api.episodes.forSeries).toHaveBeenCalledWith({ title: 'Show', aniListId: null, mode: null, list: ['1'] })
    act(() => changed())
    await waitFor(() => expect(api.episodes.forSeries).toHaveBeenCalledTimes(2))
    await act(() => result.current.update({ episode: '1' }))
    expect(api.episodes.spoilers).toHaveBeenCalledWith({ title: 'Show', aniListId: null, mode: null, list: ['1'] }, { episode: '1' })
    expect(result.current.series.source).toBe('x')
    expect(await result.current.thumb('1')).toBe('data:x')
    expect(api.episodes.thumb).toHaveBeenCalledWith({ title: 'Show', aniListId: null, mode: null, list: ['1'], episode: '1' })
  })
  it('clears the series when the title changes and on a load error', async () => {
    let calls = 0
    const forSeries = vi.fn(() => (++calls === 1 ? Promise.resolve(LIST) : new Promise(() => {})))
    const api = makeFakeApi({ episodes: { forSeries } })
    const { result, rerender } = renderHookUi(({ title }) => useSeriesEpisodes({ title }), { api, initialProps: { title: 'A' } })
    await waitFor(() => expect(result.current.series).toEqual(LIST))
    rerender({ title: 'B' })
    await waitFor(() => expect(result.current.series).toBeNull())
    const bad = makeFakeApi({ episodes: { forSeries: vi.fn(async () => { throw new Error('x') }) } })
    const r2 = renderHookUi(() => useSeriesEpisodes({ title: 'C' }), { api: bad })
    await waitFor(() => expect(bad.episodes.forSeries).toHaveBeenCalled())
    expect(r2.result.current.series).toBeNull()
  })
  it('reloads when a spoiler update fails', async () => {
    const forSeries = vi.fn(async () => LIST)
    const api = makeFakeApi({ episodes: { forSeries, spoilers: vi.fn(async () => { throw new Error('x') }) } })
    const { result } = renderHookUi(() => useSeriesEpisodes({ title: 'Show' }), { api })
    await waitFor(() => expect(result.current.series).toEqual(LIST))
    await act(() => result.current.update({ episode: '1' }))
    await waitFor(() => expect(forSeries).toHaveBeenCalledTimes(2))
    expect(result.current.series).toEqual(LIST)
  })
  it('asks nothing without a title', async () => {
    const api = makeFakeApi()
    const { result } = renderHookUi(() => useSeriesEpisodes({ title: null }), { api })
    await new Promise((r) => setTimeout(r, 10))
    expect(api.episodes.forSeries).not.toHaveBeenCalled()
    expect(result.current.series).toBeNull()
  })
})

describe('useEpisodeView', () => {
  it('reads and saves the episode view', async () => {
    const api = makeFakeApi({ settings: { get: vi.fn(async () => ({ episodeView: 'list' })), update: vi.fn(async (p) => p) } })
    const { result } = renderHookUi(() => useEpisodeView(), { api })
    await waitFor(() => expect(result.current[0]).toBe('list'))
    act(() => result.current[1]('numbers'))
    expect(result.current[0]).toBe('numbers')
    expect(api.settings.update).toHaveBeenCalledWith({ episodeView: 'numbers' })
  })
})
