import { describe, it, expect } from 'vitest';
import { pickMissedSequels, sequelsFromMedia, normTitle, MAX_CARDS } from '../../src/shared/sequels.js';

const entry = (o) => ({ id: 'e' + Math.random(), title: 'T', aniCliTitle: 'T', aniListId: null, status: 'completed', lastWatchedAt: null, updatedAt: '2026-01-01T00:00:00Z', ...o });
const seq = (id, o = {}) => ({ id, title: 'S' + id, romaji: 'Sx' + id, english: null, format: 'TV', status: 'FINISHED', year: 2020, episodes: 12, coverUrl: null, ...o });
const none = () => null;

describe('pickMissedSequels', () => {
  it('only completed entries are sources', () => {
    const es = ['watching', 'paused', 'planned', 'dropped'].map((s, i) => entry({ status: s, aniListId: i + 1 }));
    const map = { 1: [seq(101)], 2: [seq(102)], 3: [seq(103)], 4: [seq(104)] };
    expect(pickMissedSequels(es, map, [], none)).toEqual([]);
  });
  it('uses cached id when entry has no aniListId', () => {
    const es = [entry({ title: 'X', id: 'ex' })];
    const r = pickMissedSequels(es, { 21: [seq(5)] }, [], (t) => (t === 'X' ? 21 : null));
    expect(r.map((s) => s.id)).toEqual([5]);
    expect(r[0].fromTitle).toBe('X');
    expect(r[0].fromId).toBe('ex');
  });
  it('skips entries without any id', () => {
    expect(pickMissedSequels([entry({})], { 1: [seq(5)] }, [], none)).toEqual([]);
  });
  it('in library by aniListId', () => {
    const es = [entry({ aniListId: 1 }), entry({ aniListId: 5, status: 'planned' })];
    expect(pickMissedSequels(es, { 1: [seq(5)] }, [], none)).toEqual([]);
  });
  it('in library by title', () => {
    const es = [entry({ aniListId: 1 }), entry({ aniListId: null, status: 'planned', aniCliTitle: 'shingeki no kyojin season 2!', title: 'Other' })];
    const r = pickMissedSequels(es, { 1: [seq(5, { romaji: 'Shingeki no Kyojin Season 2' })] }, [], none);
    expect(r).toEqual([]);
  });
  it('hidden ids are excluded', () => {
    const es = [entry({ aniListId: 1 })];
    const r = pickMissedSequels(es, { 1: [seq(5), seq(6)] }, [5], none);
    expect(r.map((s) => s.id)).toEqual([6]);
  });
  it('dedupes by sequel id', () => {
    const es = [entry({ aniListId: 1 }), entry({ aniListId: 2 })];
    const r = pickMissedSequels(es, { 1: [seq(5), seq(5)], 2: [seq(5)] }, [], none);
    expect(r).toHaveLength(1);
  });
  it('orders by prequel lastWatchedAt then updatedAt desc', () => {
    const es = [
      entry({ aniListId: 1, lastWatchedAt: '2026-01-01T00:00:00Z' }),
      entry({ aniListId: 2, lastWatchedAt: '2026-03-01T00:00:00Z' }),
      entry({ aniListId: 3, lastWatchedAt: null, updatedAt: '2026-02-01T00:00:00Z' }),
      entry({ aniListId: 4, lastWatchedAt: null, updatedAt: '2026-05-01T00:00:00Z' }),
    ];
    const map = { 1: [seq(11)], 2: [seq(12)], 3: [seq(13)], 4: [seq(14)] };
    const ids = pickMissedSequels(es, map, [], none).map((s) => s.id);
    expect(ids).toEqual([12, 11, 14, 13]);
  });
  it('caps at 20', () => {
    const es = Array.from({ length: 30 }, (_, i) => entry({ aniListId: i + 1 }));
    const map = Object.fromEntries(es.map((e, i) => [i + 1, [seq(1000 + i)]]));
    expect(pickMissedSequels(es, map, [], none)).toHaveLength(MAX_CARDS);
    expect(MAX_CARDS).toBe(20);
  });
});

describe('sequelsFromMedia', () => {
  const edge = (o = {}, rel = 'SEQUEL') => ({ relationType: rel, node: { id: 9, type: 'ANIME', format: 'TV', status: 'FINISHED', seasonYear: 2021, episodes: 12, title: { romaji: 'Ro', english: 'En' }, coverImage: { large: 'u' }, ...o } });
  it('keeps only ANIME SEQUEL FINISHED/RELEASING non-MUSIC', () => {
    const media = { relations: { edges: [
      edge(), edge({ id: 2, status: 'RELEASING' }), edge({ id: 3, status: 'NOT_YET_RELEASED' }),
      edge({ id: 4, type: 'MANGA' }), edge({ id: 5, format: 'MUSIC' }), edge({ id: 6 }, 'PREQUEL'), edge({ id: 7, status: 'CANCELLED' }),
    ] } };
    const r = sequelsFromMedia(media);
    expect(r.map((s) => s.id)).toEqual([9, 2]);
    expect(r[0]).toEqual({ id: 9, title: 'En', romaji: 'Ro', english: 'En', format: 'TV', status: 'FINISHED', year: 2021, episodes: 12, coverUrl: 'u' });
  });
  it('title falls back to romaji', () => {
    const r = sequelsFromMedia({ relations: { edges: [edge({ title: { romaji: 'Ro', english: null }, seasonYear: null, episodes: null, coverImage: null })] } });
    expect(r[0].title).toBe('Ro');
    expect(r[0].year).toBeNull();
    expect(r[0].episodes).toBeNull();
    expect(r[0].coverUrl).toBeNull();
  });
  it('tolerates missing relations and null nodes', () => {
    expect(sequelsFromMedia({})).toEqual([]);
    expect(sequelsFromMedia(null)).toEqual([]);
    expect(sequelsFromMedia({ relations: {} })).toEqual([]);
    expect(sequelsFromMedia({ relations: { edges: [{ relationType: 'SEQUEL', node: null }, null, edge()] } }).map((s) => s.id)).toEqual([9]);
  });
});

describe('normTitle', () => {
  it('normalizes', () => {
    expect(normTitle('Ab-C!! 2')).toBe('abc2');
    expect(normTitle(null)).toBe('');
  });
});
