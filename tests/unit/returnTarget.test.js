import { describe, it, expect } from 'vitest'
import { returnTarget } from '../../src/renderer/nav/returnTarget.js'

const home = { page: 'home', animeId: null }
const detail = { page: 'watchlist', animeId: 'a1' }

describe('returnTarget', () => {
  it('stays when there is no origin', () => {
    expect(returnTarget({ origin: null, behind: null, mode: 'origin', libraryEntryId: null })).toEqual({ kind: 'stay' })
  })
  it('stays when the origin is Home', () => {
    expect(returnTarget({ origin: home, behind: home, mode: 'origin', libraryEntryId: 'a1' })).toEqual({ kind: 'stay' })
  })
  it('goes back when the entry behind is the origin', () => {
    expect(returnTarget({ origin: detail, behind: detail, mode: 'origin', libraryEntryId: 'a1' })).toEqual({ kind: 'back' })
  })
  it('navigates to the origin when the entry behind is something else', () => {
    expect(returnTarget({ origin: detail, behind: { page: 'discover', animeId: null }, mode: 'origin', libraryEntryId: 'a1' })).toEqual({ kind: 'navigate', route: detail })
    expect(returnTarget({ origin: detail, behind: null, mode: 'origin', libraryEntryId: 'a1' })).toEqual({ kind: 'navigate', route: detail })
  })
  it('the episodes setting goes to the library series', () => {
    expect(returnTarget({ origin: home, behind: null, mode: 'episodes', libraryEntryId: 'a1' })).toEqual({ kind: 'navigate', route: detail })
  })
  it('the episodes setting falls back to the origin when the series is not in the library', () => {
    expect(returnTarget({ origin: { page: 'schedule', animeId: null }, behind: null, mode: 'episodes', libraryEntryId: null })).toEqual({ kind: 'navigate', route: { page: 'schedule', animeId: null } })
  })
})
