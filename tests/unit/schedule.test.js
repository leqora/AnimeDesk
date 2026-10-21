// Time zone: dayWindow tests need a fixed zone with a DST switch. We set
// process.env.TZ = 'Europe/Belgrade' at the top of this file, before any Date
// is used (Node re-reads TZ on assignment), and restore it in afterAll.
const PREV_TZ = process.env.TZ
process.env.TZ = 'Europe/Belgrade'

import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { posterAllowed, shownInAll, dayWindow, groupDay, libraryMatch, clockChange } from '../../src/shared/schedule.js'

afterAll(() => {
  if (PREV_TZ === undefined) delete process.env.TZ
  else process.env.TZ = PREV_TZ
})

const fixture = JSON.parse(readFileSync(new URL('../fixtures/schedule.cases.json', import.meta.url), 'utf8'))
const H = 3_600_000

describe('fixture', () => {
  it('has 125 cases', () => expect(fixture.cases).toHaveLength(125))
  it('posterAllowed / shownInAll match every case', () => {
    for (const c of fixture.cases) {
      expect([c.id, posterAllowed(c), shownInAll(c)]).toEqual([c.id, c.expected.poster, c.expected.shown])
    }
  })
})

describe('dayWindow', () => {
  const now = new Date(2026, 9, 24, 10, 0).getTime()
  const w = dayWindow(now)
  it('starts at today local midnight with 7 days', () => {
    expect(w.from).toBe(new Date(2026, 9, 24).getTime())
    expect(w.days).toHaveLength(7)
    expect(w.days[0]).toBe(w.from)
  })
  it('is DST-safe across 2026-10-25', () => {
    expect(w.days[1]).toBe(new Date(2026, 9, 25).getTime())
    expect(w.days[2] - w.days[1]).toBe(25 * H)
    expect(w.to - w.from).toBe(7 * 24 * H + H)
    expect(new Set(w.days).size).toBe(7)
    expect(w.to).toBe(new Date(2026, 9, 31).getTime())
  })
  it('puts 23:30 local on the 25th into the 25th', () => {
    const t = new Date(2026, 9, 25, 23, 30).getTime()
    expect(t >= w.days[1] && t < w.days[2]).toBe(true)
  })
})

describe('groupDay', () => {
  const s = 1_000_000
  const e = s + 1000
  const it0 = (o) => ({ mediaId: 1, episode: 1, airingAt: s + 10, title: 'B', romaji: 'Br', english: null, format: 'TV', entryId: null, posterHidden: false, ...o })
  it('merges episodes of one media into one row with the earlier time', () => {
    const rows = groupDay([it0({ episode: 2, airingAt: s + 50 }), it0({ episode: 1, airingAt: s + 10 })], s, e)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ mediaId: 1, airingAt: s + 10, episodes: [1, 2], title: 'B', romaji: 'Br', format: 'TV', entryId: null })
  })
  it('excludes dayEnd, includes dayStart', () => {
    const rows = groupDay([it0({ mediaId: 1, airingAt: e }), it0({ mediaId: 2, airingAt: s })], s, e)
    expect(rows.map((r) => r.mediaId)).toEqual([2])
  })
  it('sorts by time then title', () => {
    const rows = groupDay([
      it0({ mediaId: 1, title: 'Zed', airingAt: s + 5 }),
      it0({ mediaId: 2, title: 'Abe', airingAt: s + 5 }),
      it0({ mediaId: 3, title: 'Mid', airingAt: s + 1 }),
    ], s, e)
    expect(rows.map((r) => r.mediaId)).toEqual([3, 2, 1])
  })
  it('groupDay orders equal times by title with a fixed collator, then mediaId', () => {
    const base = [
      it0({ mediaId: 4, title: 'beta', airingAt: s + 5 }),
      it0({ mediaId: 3, title: 'Alpha', airingAt: s + 5 }),
      it0({ mediaId: 2, title: 'Ábc', airingAt: s + 5 }),
      it0({ mediaId: 1, title: 'alpha', airingAt: s + 5 }),
    ]
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])))
    const orders = perms(base).map((p) => groupDay(p, s, e).map((r) => r.mediaId).join(','))
    expect(new Set(orders).size).toBe(1)
    // 'Ábc' folds to 'abc' (before 'alpha'); 'alpha' and 'Alpha' compare equal, so mediaId breaks the tie
    expect(orders[0]).toBe('2,1,3,4')
    // case alone never decides: the higher id comes first only when it really is later
    const tie = groupDay([it0({ mediaId: 7, title: 'alpha', airingAt: s + 5 }), it0({ mediaId: 6, title: 'Alpha', airingAt: s + 5 })], s, e)
    expect(tie.map((r) => r.mediaId)).toEqual([6, 7])
  })
  it('groupDay uses romaji when title is null', () => {
    const rows = groupDay([
      it0({ mediaId: 1, title: null, romaji: 'Zed', airingAt: s + 5 }),
      it0({ mediaId: 2, title: 'Omega', airingAt: s + 5 }),
    ], s, e)
    expect(rows.map((r) => r.mediaId)).toEqual([2, 1])
  })
  it('passes posterHidden through from the item', () => {
    const rows = groupDay([
      it0({ mediaId: 1, posterHidden: true }),
      it0({ mediaId: 2, posterHidden: false }),
      it0({ mediaId: 3 }),
    ], s, e)
    const by = Object.fromEntries(rows.map((r) => [r.mediaId, r.posterHidden]))
    expect(by).toEqual({ 1: true, 2: false, 3: false })
  })
})

describe('libraryMatch', () => {
  const entry = (o) => ({ id: 'e' + Math.random(), title: 'Foo', aniCliTitle: 'Foo', aniListId: null, status: 'watching', ...o })
  const item = { mediaId: 10, title: 'Bar', romaji: 'Bar Romaji', english: 'Bar English' }
  const none = () => null
  it('matches by aniListId', () => {
    const e = entry({ aniListId: 10 })
    expect(libraryMatch(item, [entry({}), e], none)).toBe(e)
  })
  it('matches by getCachedId', () => {
    const e = entry({ title: 'Q' })
    expect(libraryMatch(item, [e], (t) => (t === 'Q' ? 10 : null))).toBe(e)
  })
  it('null getCachedId (close) with a different title is no match', () => {
    expect(libraryMatch(item, [entry({ title: 'Q', aniCliTitle: 'Q2' })], none)).toBeNull()
  })
  it('matches by normalized title (aniCliTitle and title)', () => {
    const a = entry({ title: 'x', aniCliTitle: 'bar-romaji!' })
    const b = entry({ title: 'BAR english', aniCliTitle: 'y' })
    expect(libraryMatch(item, [a], none)).toBe(a)
    expect(libraryMatch(item, [b], none)).toBe(b)
  })
  it('matches by item.title alone', () => {
    const it2 = { mediaId: 11, title: 'Only Title', romaji: 'Zzz', english: null }
    const e = entry({ title: 'x', aniCliTitle: 'only title' })
    expect(libraryMatch(it2, [e], none)).toBe(e)
  })
  it('ignores dropped entries even when ids match', () => {
    expect(libraryMatch(item, [entry({ aniListId: 10, status: 'dropped' })], none)).toBeNull()
  })
  it('id match wins over an earlier title match', () => {
    const t = entry({ aniCliTitle: 'Bar Romaji' })
    const i = entry({ aniListId: 10 })
    expect(libraryMatch(item, [t, i], none)).toBe(i)
  })
  it('handles empty input', () => {
    expect(libraryMatch(item, [], none)).toBeNull()
    expect(libraryMatch(item, null, none)).toBeNull()
  })
})

describe('clockChange', () => {
  const D = 24 * H
  const start = 1_000 * D
  const SWITCH = start + 3 * H
  const back = (ms) => (ms < SWITCH ? -120 : -60)
  const fwd = (ms) => (ms < SWITCH ? -60 : -120)
  it('detects clocks going back on the day containing the switch only', () => {
    expect(clockChange(start, start + D, back)).toBe('back')
    expect(clockChange(start - D, start, back)).toBeNull()
    expect(clockChange(start + D, start + 2 * D, back)).toBeNull()
  })
  it('detects clocks going forward', () => {
    expect(clockChange(start, start + D, fwd)).toBe('forward')
  })
  it('a switch exactly at dayStart means the whole day has the new offset', () => {
    expect(clockChange(SWITCH, SWITCH + D, back)).toBeNull()
  })
  it('detects a switch at dayEnd - 1', () => {
    const end = start + D
    const late = (ms) => (ms < end - 1 ? -120 : -60)
    expect(clockChange(start, end, late)).toBe('back')
  })
  it('uses the real zone by default (Europe/Belgrade 2026-10-25)', () => {
    const w = dayWindow(new Date(2026, 9, 21, 10).getTime())
    expect(clockChange(w.days[4], w.days[5])).toBe('back')
    expect(clockChange(w.days[3], w.days[4])).toBeNull()
  })
})
