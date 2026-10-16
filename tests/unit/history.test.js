import { describe, it, expect } from 'vitest'
import {
  createHistory, push, replace, back, forward, canBack, canForward, current, setScroll, setState, sameRoute, MAX_ENTRIES,
} from '../../src/renderer/nav/history.js'

const home = { page: 'home', animeId: null }
const wl = { page: 'watchlist', animeId: null }
const detail = { page: 'watchlist', animeId: 'a' }

describe('history', () => {
  it('starts with one entry', () => {
    const h = createHistory(home)
    expect(h).toEqual({ entries: [{ route: home, scroll: 0, state: {} }], index: 0 })
    expect(canBack(h)).toBe(false)
    expect(canForward(h)).toBe(false)
  })
  it('pushes, goes back and forward', () => {
    let h = push(push(createHistory(home), wl), detail)
    expect(current(h).route).toEqual(detail)
    expect(canBack(h)).toBe(true)
    h = back(h)
    expect(current(h).route).toEqual(wl)
    expect(canForward(h)).toBe(true)
    h = forward(h)
    expect(current(h).route).toEqual(detail)
    expect(forward(h)).toBe(h)
    expect(back(createHistory(home)).index).toBe(0)
  })
  it('push after back drops forward entries', () => {
    let h = push(push(createHistory(home), wl), detail)
    h = push(back(back(h)), { page: 'settings', animeId: null })
    expect(h.entries.map((e) => e.route.page)).toEqual(['home', 'settings'])
    expect(canForward(h)).toBe(false)
  })
  it('push of the same route is a no-op', () => {
    const h = push(createHistory(home), wl)
    expect(push(h, { ...wl })).toBe(h)
    expect(sameRoute(detail, { page: 'watchlist', animeId: 'a' })).toBe(true)
    expect(sameRoute(wl, detail)).toBe(false)
  })
  it('keeps at most 50 entries', () => {
    let h = createHistory({ page: 'p', animeId: '0' })
    for (let i = 1; i < 80; i++) h = push(h, { page: 'p', animeId: String(i) })
    expect(MAX_ENTRIES).toBe(50)
    expect(h.entries).toHaveLength(50)
    expect(h.index).toBe(49)
    expect(current(h).route.animeId).toBe('79')
    expect(h.entries[0].route.animeId).toBe('30')
  })
  it('replace swaps the current route', () => {
    const h = replace(push(createHistory(home), detail), wl)
    expect(h.entries).toHaveLength(2)
    expect(current(h).route).toEqual(wl)
  })
  it('setScroll and setState write the current entry only', () => {
    let h = push(createHistory(home), wl)
    h = setState(setScroll(h, 300), 'filter', 'watching')
    expect(current(h)).toEqual({ route: wl, scroll: 300, state: { filter: 'watching' } })
    expect(h.entries[0]).toEqual({ route: home, scroll: 0, state: {} })
  })
})
