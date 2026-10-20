import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RULES_VERSION, MAX_SEEDS, MAX_RAIL, MAX_SIMILAR, FORMATS, STATUSES,
  toCase, isLaterPart, isSideStory, eligible,
  libraryIds, libraryTitles, inLibrary,
  seedsFrom, pickPersonal, pickTrending, pickSimilar, decideMode,
} from '../../src/shared/recommendations.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/recommendations.cases.json', import.meta.url), 'utf8'));

const base = { title: 'Show', romaji: 'Show', format: 'TV', status: 'FINISHED', year: 2020, isAdult: false, prequels: [], parent: false };
const c = (o) => ({ ...base, ...o });
const entry = (o) => ({ id: 'e' + Math.random(), title: 'T', aniCliTitle: 'T', aniListId: null, status: 'completed', rating: null, lastWatchedAt: null, updatedAt: '2026-01-01T00:00:00Z', ...o });
const item = (id, o = {}) => ({ id, title: 'I' + id, romaji: 'Ir' + id, english: null, format: 'TV', status: 'FINISHED', year: 2020, episodes: 12, genres: [], coverUrl: null, rank: 0, rating: 10, eligible: true, ...o });
const none = () => null;

describe('constants', () => {
  it('match the spec', () => {
    expect([RULES_VERSION, MAX_SEEDS, MAX_RAIL, MAX_SIMILAR]).toEqual([1, 50, 20, 8]);
    expect(FORMATS).toEqual(['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA']);
    expect(STATUSES).toEqual(['FINISHED', 'RELEASING']);
  });
});

describe('eligible (fixture)', () => {
  it('has 502 cases', () => expect(fixture.cases).toHaveLength(502));
  it('matches every fixture case', () => {
    const bad = fixture.cases.filter((x) => eligible(x) !== x.eligible).map((x) => x.id);
    expect(bad).toEqual([]);
  });
});

describe('eligible (branches)', () => {
  it('format / status / adult', () => {
    expect(eligible(c({}))).toBe(true);
    for (const f of ['SPECIAL', 'MUSIC', null]) expect(eligible(c({ format: f }))).toBe(false);
    for (const s of ['NOT_YET_RELEASED', 'CANCELLED', null]) expect(eligible(c({ status: s }))).toBe(false);
    expect(eligible(c({ status: 'RELEASING' }))).toBe(true);
    expect(eligible(c({ isAdult: true }))).toBe(false);
  });
  it('TV prequel with unknown year is a later part', () => {
    expect(isLaterPart(c({ prequels: [{ format: 'TV', year: null }] }))).toBe(true);
  });
  it('series with unknown year + TV prequel is later; + OVA prequel is not', () => {
    expect(isLaterPart(c({ year: null, prequels: [{ format: 'TV', year: 2010 }] }))).toBe(true);
    expect(isLaterPart(c({ year: null, prequels: [{ format: 'OVA', year: 2010 }] }))).toBe(false);
    expect(isLaterPart(c({ prequels: [{ format: 'OVA', year: null }] }))).toBe(false);
  });
  it('<= for TV/TV_SHORT/ONA, < for others', () => {
    expect(isLaterPart(c({ prequels: [{ format: 'TV', year: 2020 }] }))).toBe(true);
    expect(isLaterPart(c({ prequels: [{ format: 'TV_SHORT', year: 2020 }] }))).toBe(true);
    expect(isLaterPart(c({ prequels: [{ format: 'ONA', year: 2020 }] }))).toBe(true);
    expect(isLaterPart(c({ prequels: [{ format: 'OVA', year: 2020 }] }))).toBe(false);
    expect(isLaterPart(c({ prequels: [{ format: 'OVA', year: 2019 }] }))).toBe(true);
    expect(isLaterPart(c({ prequels: [{ format: 'MOVIE', year: 2021 }] }))).toBe(false);
    expect(isLaterPart(c({ prequels: [{ format: 'TV', year: 2021 }] }))).toBe(false);
  });
  it('titles that must NOT match', () => {
    for (const t of ['Lupin III', 'JoJo Part 1', 'Show Season 1', 'Mob Psycho 100 III']) {
      expect(isLaterPart(c({ title: t, romaji: 'x' }))).toBe(false);
    }
    expect(isLaterPart(c({ title: 'x', romaji: 'Ore no ii hanashi' }))).toBe(false);
  });
  it('titles that match', () => {
    for (const t of ['Date A Live II', 'Slime 2nd Season', 'Show Season 2', 'Show part 3', 'Show Cour 10', 'Show 3rd Season', 'Show 2nd Stage']) {
      expect(isLaterPart(c({ title: t, romaji: 'x' }))).toBe(true);
    }
    expect(isLaterPart(c({ title: 'x', romaji: 'Date A Live II' }))).toBe(true);
  });
  it('side story: parent or PV (case-sensitive)', () => {
    expect(isSideStory(c({ parent: true }))).toBe(true);
    expect(isSideStory(c({ title: 'Jujutsu Kaisen PV' }))).toBe(true);
    expect(isSideStory(c({ romaji: 'Foo PV' }))).toBe(true);
    expect(isSideStory(c({ title: 'Jujutsu Kaisen Pv' }))).toBe(false);
    expect(eligible(c({ parent: true }))).toBe(false);
  });
});

describe('toCase', () => {
  const edge = (relationType, node) => ({ relationType, node });
  it('reduces a raw media', () => {
    const m = {
      id: 5, isAdult: false, format: 'TV', status: 'FINISHED', seasonYear: 2015,
      title: { romaji: 'Rom', english: 'Eng' },
      relations: { edges: [
        edge('PREQUEL', { id: 1, type: 'ANIME', format: 'OVA', seasonYear: 2010 }),
        edge('PREQUEL', { id: 2, type: 'MANGA', format: 'MANGA', seasonYear: 2000 }),
        edge('SEQUEL', { id: 3, type: 'ANIME', format: 'TV', seasonYear: 2020 }),
        edge('PARENT', { id: 4, type: 'ANIME', format: 'TV', seasonYear: 2012 }),
      ] },
    };
    expect(toCase(m)).toEqual({ title: 'Eng', romaji: 'Rom', format: 'TV', status: 'FINISHED', year: 2015, isAdult: false, prequels: [{ format: 'OVA', year: 2010 }], parent: true });
  });
  it('PARENT to a non-ANIME node is ignored; missing fields are null/false', () => {
    const m = { title: { romaji: 'R', english: null }, relations: { edges: [edge('PARENT', { type: 'MANGA' })] } };
    expect(toCase(m)).toEqual({ title: 'R', romaji: 'R', format: null, status: null, year: null, isAdult: false, prequels: [], parent: false });
    expect(toCase({ title: { romaji: 'R' } }).prequels).toEqual([]);
  });
});

describe('library helpers', () => {
  it('libraryIds uses aniListId or exact cached id, for any status', () => {
    const es = [
      entry({ aniListId: 7 }),
      entry({ title: 'Cached', status: 'planned' }),
      entry({ title: 'Nope', status: 'dropped' }),
    ];
    const ids = libraryIds(es, (t) => (t === 'Cached' ? 42 : null));
    expect([...ids].sort((a, b) => a - b)).toEqual([7, 42]);
  });
  it('libraryTitles + inLibrary', () => {
    const es = [entry({ title: 'Some Show!', aniCliTitle: 'Other Name' })];
    const titles = libraryTitles(es);
    expect(titles.has('someshow')).toBe(true);
    expect(titles.has('othername')).toBe(true);
    const ids = new Set([9]);
    expect(inLibrary(item(9), ids, titles)).toBe(true);
    expect(inLibrary(item(1, { romaji: 'some show' }), ids, titles)).toBe(true);
    expect(inLibrary(item(1, { romaji: 'x', english: 'Other-Name' }), ids, titles)).toBe(true);
    expect(inLibrary(item(1, { romaji: null, english: null }), ids, titles)).toBe(false);
  });
});

describe('seedsFrom', () => {
  const idMap = { A: 1, B: 2, C: 3 };
  const get = (t) => idMap[t] ?? null;
  it('weights by rating', () => {
    const w = (rating) => seedsFrom([entry({ aniListId: 1, rating })], none).map((s) => s.weight);
    expect(w(10)).toEqual([3]);
    expect(w(8)).toEqual([3]);
    expect(w(7)).toEqual([2]);
    expect(w(6)).toEqual([]);
    expect(w(1)).toEqual([]);
  });
  it('weights by status when unrated', () => {
    const w = (status) => seedsFrom([entry({ aniListId: 1, status })], none).map((s) => s.weight);
    expect(w('completed')).toEqual([2]);
    expect(w('watching')).toEqual([1]);
    for (const s of ['planned', 'paused', 'dropped']) expect(w(s)).toEqual([]);
  });
  it('rating overrides status', () => {
    expect(seedsFrom([entry({ aniListId: 1, status: 'completed', rating: 5 })], none)).toEqual([]);
  });
  it('output shape', () => {
    const e = entry({ id: 'x', title: 'Name', aniListId: 5, rating: 9 });
    expect(seedsFrom([e], none)).toEqual([{ id: 5, weight: 3, entryId: 'x', title: 'Name' }]);
  });
  it('duplicate id keeps the higher weight', () => {
    const lo = entry({ id: 'lo', aniListId: 1, status: 'watching' });
    const hi = entry({ id: 'hi', aniListId: 1, rating: 9 });
    expect(seedsFrom([lo, hi], none)).toEqual([{ id: 1, weight: 3, entryId: 'hi', title: 'T' }]);
  });
  it('equal weight keeps the earlier entry in ordering (newer lastWatchedAt)', () => {
    const old = entry({ id: 'old', aniListId: 1, rating: 9, lastWatchedAt: '2026-01-01T00:00:00Z' });
    const neu = entry({ id: 'new', aniListId: 1, rating: 9, lastWatchedAt: '2026-03-01T00:00:00Z' });
    expect(seedsFrom([old, neu], none).map((s) => s.entryId)).toEqual(['new']);
  });
  it('skips entries without an id (close/none cached)', () => {
    expect(seedsFrom([entry({ title: 'A' }), entry({ title: 'zzz' })], get).map((s) => s.id)).toEqual([1]);
  });
  it('orders by weight, lastWatchedAt, updatedAt', () => {
    const es = [
      entry({ id: 'a', aniListId: 1, rating: 9, lastWatchedAt: '2026-01-01T00:00:00Z' }),
      entry({ id: 'b', aniListId: 2, rating: 9, lastWatchedAt: '2026-02-01T00:00:00Z' }),
      entry({ id: 'c', aniListId: 3, rating: 7, lastWatchedAt: '2026-05-01T00:00:00Z' }),
      entry({ id: 'd', aniListId: 4, rating: 9, lastWatchedAt: null, updatedAt: '2026-06-01T00:00:00Z' }),
      entry({ id: 'e', aniListId: 5, rating: 9, lastWatchedAt: null, updatedAt: '2026-07-01T00:00:00Z' }),
    ];
    // lastWatchedAt null counts as oldest, so dated ones come first
    expect(seedsFrom(es, none).map((s) => s.entryId)).toEqual(['b', 'a', 'e', 'd', 'c']);
  });
  it('caps at 50, cutting the lowest', () => {
    const es = Array.from({ length: 60 }, (_, i) => entry({ id: 'e' + i, aniListId: i + 1, rating: i < 55 ? 9 : 7, lastWatchedAt: new Date(2026, 0, 1 + i).toISOString() }));
    const out = seedsFrom(es, none);
    expect(out).toHaveLength(50);
    expect(out.every((s) => s.weight === 3)).toBe(true);
    expect(out[0].entryId).toBe('e54');
  });
});

describe('pickPersonal', () => {
  const seed = (id, weight, entryId = 'e' + id, title = 'S' + id) => ({ id, weight, entryId, title });
  it('a multi-seed item outranks a single better-ranked one', () => {
    const seeds = [seed(1, 2), seed(2, 2)];
    // 10: 2*10 = 20 ; 11: 2*6 + 2*6 = 24
    const recs = { 1: [item(10, { rank: 0 }), item(11, { rank: 4 })], 2: [item(11, { rank: 4 })] };
    expect(pickPersonal(seeds, recs, [], [], none).map((i) => i.id)).toEqual([11, 10]);
    // 11: 2*4 + 2*4 = 16 < 20
    const recs2 = { 1: [item(10, { rank: 0 }), item(11, { rank: 6 })], 2: [item(11, { rank: 6 })] };
    expect(pickPersonal(seeds, recs2, [], [], none).map((i) => i.id)).toEqual([10, 11]);
  });
  it('tie on score -> rating sum -> id', () => {
    const recs = { 1: [item(30, { rank: 0, rating: 5 }), item(20, { rank: 0, rating: 9 }), item(10, { rank: 0, rating: 5 })] };
    expect(pickPersonal([seed(1, 1)], recs, [], [], none).map((i) => i.id)).toEqual([20, 10, 30]);
  });
  it('filters: rating<=0, not eligible, hidden, library by id/cached/title, seeds', () => {
    const recs = { 1: [
      item(2, { rating: 0 }), item(3, { rating: -1 }), item(4, { eligible: false }), item(5), item(6),
      item(7), item(8, { romaji: 'Lib Title' }), item(1), item(9),
    ] };
    const es = [entry({ aniListId: 6 }), entry({ title: 'Cached' }), entry({ title: 'libtitle' })];
    const get = (t) => (t === 'Cached' ? 7 : null);
    expect(pickPersonal([seed(1, 3)], recs, es, [5], get).map((i) => i.id)).toEqual([9]);
  });
  it('excludes every seed, not just the one that recommended it', () => {
    const recs = { 1: [item(2), item(3)], 2: [item(3)] };
    expect(pickPersonal([seed(1, 3), seed(2, 3)], recs, [], [], none).map((i) => i.id)).toEqual([3]);
  });
  it('fromTitle/fromId = biggest contributor, tie -> earlier seed', () => {
    const seeds = [seed(1, 2, 'ea', 'A'), seed(2, 3, 'eb', 'B'), seed(3, 3, 'ec', 'C')];
    const recs = { 1: [item(10, { rank: 0 })], 2: [item(10, { rank: 5 }), item(11, { rank: 5 })], 3: [item(11, { rank: 5 })] };
    const by = Object.fromEntries(pickPersonal(seeds, recs, [], [], none).map((i) => [i.id, i]));
    expect(by[10].fromTitle).toBe('A'); // 20 vs 15
    expect(by[10].fromId).toBe('ea');
    expect(by[11].fromTitle).toBe('B'); // 15 vs 15 -> earlier
    expect(by[11].fromId).toBe('eb');
  });
  it('keeps the item shape and ignores seeds with no records', () => {
    const out = pickPersonal([seed(1, 3), seed(2, 3)], { 1: [item(10)] }, [], [], none);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 10, title: 'I10', genres: [], fromTitle: 'S1', fromId: 'e1' });
  });
  it('caps at 20', () => {
    const recs = { 1: Array.from({ length: 30 }, (_, i) => item(100 + i, { rank: i % 10 })) };
    expect(pickPersonal([seed(1, 3)], recs, [], [], none)).toHaveLength(20);
  });
});

describe('pickTrending', () => {
  it('keeps order, filters, no source', () => {
    const items = [item(1, { rating: null }), item(2, { eligible: false, rating: null }), item(3, { rating: null }), item(4, { rating: null }), item(5, { rating: null, romaji: 'Mine' }), item(6, { rating: null })];
    const es = [entry({ aniListId: 3 }), entry({ title: 'mine' })];
    const out = pickTrending(items, es, [4], none);
    expect(out.map((i) => i.id)).toEqual([1, 6]);
    expect(out[0]).toMatchObject({ fromTitle: null, fromId: null });
  });
  it('caps at 20 in order', () => {
    const many = Array.from({ length: 30 }, (_, i) => item(i + 1, { rating: null }));
    expect(pickTrending(many, [], [], none).map((i) => i.id)).toEqual(many.slice(0, 20).map((i) => i.id));
  });
});

describe('pickSimilar', () => {
  it('caps at 8, keeps order, filters', () => {
    const recs = Array.from({ length: 12 }, (_, i) => item(i + 1));
    expect(pickSimilar(recs, [], [], none).map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const mixed = [item(1, { rating: 0 }), item(2, { eligible: false }), item(3), item(4), item(5, { romaji: 'In Lib' }), item(6), item(7)];
    const es = [entry({ aniListId: 3 }), entry({ title: 'inlib' }), entry({ title: 'C' })];
    expect(pickSimilar(mixed, es, [6], (t) => (t === 'C' ? 4 : null)).map((i) => i.id)).toEqual([7]);
  });
});

describe('decideMode', () => {
  it('no seeds -> trending + hint', () => expect(decideMode([], [])).toEqual({ mode: 'trending', hint: true }));
  it('seeds + empty personal -> trending, no hint', () => expect(decideMode([{ id: 1 }], [])).toEqual({ mode: 'trending', hint: false }));
  it('seeds + items -> personal', () => expect(decideMode([{ id: 1 }], [item(1)])).toEqual({ mode: 'personal', hint: false }));
});
