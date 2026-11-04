// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { renderUi, renderHookUi, makeFakeApi } from './helpers.jsx'
import { useAddToWatchlist } from '../../../src/renderer/library/useAddToWatchlist.js'
import { RecommendationCard } from '../../../src/renderer/components/RecommendationCard.jsx'
import { SequelCard } from '../../../src/renderer/components/SequelCard.jsx'

const item = (over = {}) => ({ id: 7, title: 'Alpha', romaji: 'Alpha R', format: 'TV', status: 'FINISHED', year: 2026, episodes: 12, genres: [], poster: null, fromTitle: 'Beta', ...over })
const ctx = (el) => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }); act(() => { el.dispatchEvent(ev) }); return ev }
const names = () => screen.queryAllByRole('menuitem').map((n) => n.textContent)

describe('useAddToWatchlist', () => {
  it('ignores a second call while the first is pending', async () => {
    let release
    const list = vi.fn(() => new Promise((r) => { release = r }))
    const api = makeFakeApi({ library: { list } })
    const { result } = renderHookUi(() => useAddToWatchlist({ id: 5, title: 'X' }), { api })
    let p1, p2
    act(() => { p1 = result.current.add(); p2 = result.current.add() })
    await act(async () => { release([]); await Promise.all([p1, p2]) })
    expect(api.library.add).toHaveBeenCalledTimes(1)
  })
  it('already in library: toast, added, no add', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [{ aniListId: 21 }]) } })
    const { result } = renderHookUi(() => useAddToWatchlist({ id: 21, title: 'One Piece' }), { api })
    await act(async () => { await result.current.add() })
    expect(api.library.add).not.toHaveBeenCalled()
    expect(result.current.added).toBe(true)
  })
  it('success adds planned entry', async () => {
    const api = makeFakeApi()
    const { result } = renderHookUi(() => useAddToWatchlist({ id: 154587, title: 'Frieren' }), { api })
    await act(async () => { await result.current.add() })
    expect(api.library.add).toHaveBeenCalledWith({ title: 'Frieren', aniListId: 154587, status: 'planned' })
    expect(result.current.added).toBe(true)
  })
  it('failure leaves added false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = makeFakeApi({ library: { add: vi.fn(async () => { throw new Error('x') }) } })
    const { result } = renderHookUi(() => useAddToWatchlist({ id: 1, title: 'Y' }), { api })
    await act(async () => { await result.current.add() })
    expect(result.current.added).toBe(false)
    warn.mockRestore()
  })
})

describe('RecommendationCard menu', () => {
  const rec = (props = {}) => renderUi(<RecommendationCard ready onSearch={vi.fn()} item={item()} {...props} />)
  it('search, add, not recommend', () => {
    const onSearch = vi.fn(); const onHide = vi.fn()
    rec({ onSearch, onHide })
    ctx(document.querySelector('[data-card-main]'))
    expect(names()).toEqual(['Traži', 'Dodaj u Watchlist', 'Ne preporučuj'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Traži' }))
    expect(onSearch).toHaveBeenCalledWith('Alpha R')
  })
  it('not recommend calls onHide(item, true)', () => {
    const onHide = vi.fn()
    rec({ onHide })
    ctx(document.querySelector('[data-card-main]'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ne preporučuj' }))
    expect(onHide).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), true)
  })
  it('open + inWatchlist: only Open', () => {
    rec({ onOpen: vi.fn(), inWatchlist: true })
    ctx(document.querySelector('[data-card-main]'))
    expect(names()).toEqual(['Otvori'])
  })
  it('after adding, the reopened menu lacks the add item', async () => {
    const { api } = rec({})
    const card = document.querySelector('[data-card-main]')
    ctx(card)
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Dodaj u Watchlist' })) })
    expect(api.library.add).toHaveBeenCalled()
    ctx(document.querySelector('[data-card-main]'))
    expect(names()).toEqual(['Traži'])
  })
  it('ready=false disables Search but Add works', async () => {
    const { api } = rec({ ready: false })
    ctx(document.querySelector('.rec-card'))
    expect(screen.getByRole('menuitem', { name: 'Traži' })).toHaveAttribute('aria-disabled', 'true')
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Dodaj u Watchlist' })) })
    expect(api.library.add).toHaveBeenCalled()
  })
  it('upcoming without hide and in watchlist: no menu, not prevented', () => {
    rec({ item: item({ status: 'NOT_YET_RELEASED' }), inWatchlist: true })
    const ev = ctx(document.querySelector('.rec-card'))
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('upcoming not in watchlist: only Add; no keyshortcut', () => {
    rec({ item: item({ status: 'NOT_YET_RELEASED' }) })
    expect(document.querySelector('[aria-keyshortcuts]')).toBeNull()
    ctx(document.querySelector('.rec-card'))
    expect(names()).toEqual(['Dodaj u Watchlist'])
  })
  it('main button has aria-keyshortcuts', () => {
    rec({})
    expect(document.querySelector('[data-card-main]')).toHaveAttribute('aria-keyshortcuts', 'Shift+F10')
  })
})

describe('SequelCard menu', () => {
  it('search, add, hide', () => {
    const onHide = vi.fn()
    renderUi(<SequelCard ready onSearch={vi.fn()} onHide={onHide} item={item()} />)
    ctx(document.querySelector('[data-card-main]'))
    expect(names()).toEqual(['Traži', 'Dodaj u Watchlist', 'Sakrij'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sakrij' }))
    expect(onHide).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), true)
  })
})
