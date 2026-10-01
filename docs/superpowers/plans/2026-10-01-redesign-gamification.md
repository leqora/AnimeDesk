# AnimeDesk v0.2 — Redesign & Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AnimeDesk a game-launcher look (sidebar, hero banner, glass + neon) and light gamification (XP/levels, profile stats, key sounds, level-up animation) without losing any v0.1 behaviour.

**Architecture:** Pure stat math lives in `src/shared/stats.js`; the main process gains a watch log (`watchLog.js`), a tracker that routes every watchlist change through the log (`tracker.js`) and a progress module that remembers the last level and emits level-up / series-completed events (`progress.js`). The renderer gets design tokens + bundled fonts, a sidebar shell, a home page with hero, a profile page, synthesized sounds and overlays.

**Tech Stack:** existing (Electron 44, React 19, Vitest 5, electron-vite 5) + `lucide-react` (ISC), `@fontsource/russo-one`, `@fontsource/exo-2`, `@fontsource/chakra-petch` (OFL).

**Spec:** `docs/superpowers/specs/2026-10-01-redesign-gamification-design.md` (and v0.1 spec `docs/superpowers/specs/2026-09-30-animedesk-design.md`, whose rules still apply).

## Global Constraints

- Branch: `feat/v0.2-redesign`. Git identity `leqora <dzonzi777@gmail.com>` (already configured). Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No-spoiler rule from v0.1 stays: AniList description hidden until clicked; episodes shown by number only.
- Every UI string goes through `t('key')`; `sr.json` and `en.json` keep identical keys (existing tests enforce it). Literal keys use single quotes.
- No emoji as icons — use `Icon` (lucide-react).
- Colors only as CSS custom properties defined in `:root` of `styles.css`; no raw hex in components or outside `:root`.
- Fonts bundled via `@fontsource` (no network): Russo One = headings/logo, Exo 2 = body, Chakra Petch = HUD labels. All have latin-ext (č ć š ž đ).
- XP = 10 × watched episodes + 50 × completed series + 5 × rated series. Level L needs `round(100 × (L − 1)^1.5)` total XP. Titles: LV1 rookie, LV5 watcher, LV10 veteran, LV20 elite, LV35 sensei, LV50 legend.
- Hours = Σ watched episodes × (AniList `duration` or 24) / 60, rounded.
- Streak counts consecutive local days with ≥1 watch-log entry ending today or yesterday. Activity = last 28 local days.
- Watch log entry only when an episode *becomes* watched; unmarking removes the latest entry for that episode; deleting a series removes its entries.
- First launch of v0.2 (no `profile.json`) records the current level without a level-up event.
- New settings defaults: `profileName: null` (display falls back to Windows user name), `soundKey: true`, `soundUi: false`, `soundVolume: 60` (0–100), `animations: true`.
- `animations: false` or `prefers-reduced-motion: reduce` → no motion; level-up becomes a toast.
- Only `transform` and `opacity` are animated.

## Review Focus

1. **Midnight / time zone** — an episode watched at 00:30 local time (22:30 UTC) must count for the local day, not the UTC day, for streak and activity. Pinned in Task 2 ("counts by local day across midnight").
2. **Upgrade with history** — a user who already watched 200 episodes in v0.1 must not get a level-up storm on first v0.2 start. Pinned in Task 5 ("first run records level without an event").
3. **Re-watching** — watching an already-watched episode again must not add XP or a log entry. Pinned in Task 6 ("re-watching does not log again").
4. **Bright posters** — a near-white or yellow poster must not produce a tint so light that white text on it is unreadable. Pinned in Task 8 ("clamps lightness of bright posters").
5. **Simultaneous events** — finishing the last episode can trigger series-completed and level-up together; the level-up sound must win, not be cut off. Pinned in Task 9 ("levelUp is not interrupted by lower priority sounds").

---

## File Map

```
src/shared/stats.js                 NEW  XP / level / stats (pure)
src/shared/domain.js                MOD  + nextEpisode(entry)
src/main/settings.js                MOD  new settings, systemName
src/main/paths.js                   MOD  + watchLog, profile paths
src/main/watchLog.js                NEW  watch log store
src/main/anilist.js                 MOD  + duration, getCached
src/main/progress.js                NEW  lastLevel + events
src/main/tracker.js                 NEW  library changes → log + progress
src/main/ipc.js, src/shared/channels.js, src/preload/index.js, src/main/index.js   MOD
src/renderer/styles.css             REWRITE tokens + glass + neon
src/renderer/main.jsx               MOD  font imports
src/renderer/components/Icon.jsx, XpBar.jsx, ProfileCard.jsx, Sidebar.jsx, Hero.jsx,
  LevelUpOverlay.jsx, Toast.jsx     NEW
src/renderer/components/Header.jsx  DELETE (replaced by Sidebar)
src/renderer/components/Poster.jsx  MOD  + usePosterInfo hook
src/renderer/theme/posterTint.js    NEW
src/renderer/sound.js               NEW
src/renderer/pages/HomePage.jsx, ProfilePage.jsx   NEW
src/renderer/pages/SearchPage.jsx, WatchlistPage.jsx, AnimeDetail.jsx, SettingsPage.jsx, App.jsx   MOD
src/renderer/i18n/sr.json, en.json  MOD  new keys
```

---

### Task 1: New settings

**Files:**
- Modify: `src/main/settings.js`, `tests/unit/settings.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS` gains `profileName: null, soundKey: true, soundUi: false, soundVolume: 60, animations: true`; `createSettings(file, { systemName = 'Player' } = {})`; `get()`/`update()` return settings plus a read-only `systemName` (never persisted).

- [ ] **Step 1: Update the defaults test and add new tests**

In `tests/unit/settings.test.js`, replace the `'has the agreed defaults'` test body with:
```js
    expect(DEFAULT_SETTINGS).toEqual({
      language: 'sr', autoTrack: true, watchedThreshold: 85, askOnClose: false,
      downloadDir: null, quality: 'best', mode: 'sub', autoUpdateTools: true,
      profileName: null, soundKey: true, soundUi: false, soundVolume: 60, animations: true,
    })
```
and append inside the `describe`:
```js
  it('validates the profile and sound settings', () => {
    expect(sanitizeSettings({ profileName: '  Nikola  ' }).profileName).toBe('Nikola')
    expect(sanitizeSettings({ profileName: '' }).profileName).toBeNull()
    expect(sanitizeSettings({ profileName: 'x'.repeat(40) }).profileName).toHaveLength(32)
    expect(sanitizeSettings({ soundVolume: 140 }).soundVolume).toBe(100)
    expect(sanitizeSettings({ soundVolume: -3 }).soundVolume).toBe(0)
    expect(sanitizeSettings({ soundVolume: 33.6 }).soundVolume).toBe(34)
    expect(sanitizeSettings({ soundKey: false, soundUi: true, animations: false })).toMatchObject({ soundKey: false, soundUi: true, animations: false })
    expect(sanitizeSettings({ soundUi: 'yes' }).soundUi).toBe(false)
  })
  it('exposes the system user name without persisting it', () => {
    const s = createSettings(file, { systemName: 'nikola' })
    expect(s.get().systemName).toBe('nikola')
    s.update({ language: 'en' })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).not.toHaveProperty('systemName')
    expect(s.update({ language: 'sr' }).systemName).toBe('nikola')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/settings.test.js`
Expected: FAIL — defaults mismatch, `systemName` undefined.

- [ ] **Step 3: Implement**

In `src/main/settings.js` add to `DEFAULT_SETTINGS` (after `autoUpdateTools: true,`):
```js
  profileName: null,
  soundKey: true,
  soundUi: false,
  soundVolume: 60,
  animations: true,
```
Add to `sanitizeSettings` before `return s`:
```js
  if (typeof input.profileName === 'string' && input.profileName.trim()) s.profileName = input.profileName.trim().slice(0, 32)
  if (typeof input.soundKey === 'boolean') s.soundKey = input.soundKey
  if (typeof input.soundUi === 'boolean') s.soundUi = input.soundUi
  if (Number.isFinite(input.soundVolume)) s.soundVolume = Math.min(100, Math.max(0, Math.round(input.soundVolume)))
  if (typeof input.animations === 'boolean') s.animations = input.animations
```
Replace `createSettings` with:
```js
export function createSettings(file, { systemName = 'Player' } = {}) {
  let current = sanitizeSettings(readJson(file, {}).data)
  const view = () => ({ ...current, systemName })
  return {
    get: view,
    update(patch) {
      current = sanitizeSettings({ ...current, ...patch })
      writeJsonAtomic(file, current)
      return view()
    },
  }
}
```

- [ ] **Step 4: Run to verify pass, then full suite**

Run: `npx vitest run tests/unit/settings.test.js` → PASS. Run: `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/settings.js tests/unit/settings.test.js
git commit -m "feat: profile name, sound and animation settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Stats math (pure)

**Files:**
- Create: `src/shared/stats.js`
- Modify: `src/shared/domain.js` (+ `nextEpisode`), `tests/unit/domain.test.js`
- Test: `tests/unit/stats.test.js`

**Interfaces:**
- Produces:
  - `xpNeeded(level) → number`, `titleFor(level) → 'rookie'|'watcher'|'veteran'|'elite'|'sensei'|'legend'`, `levelForXp(xp) → { level, title, xpIntoLevel, xpForNext }`, `xpFor(entries) → number`
  - `computeStats({ entries, log, infoById = {}, now, tzOffsetMinutes = 0 }) → { xp, level, title, xpIntoLevel, xpForNext, episodes, hours, completed, avgRating, topGenres: [{ genre, episodes }], streakDays, activity: [{ date, count }] }` — `infoById` is keyed by library entry id with `{ duration, genres }`; `tzOffsetMinutes` is `Date#getTimezoneOffset()` (CEST = -120).
  - `EMPTY_STATS` — `computeStats` of no data at a fixed date (for UI defaults).
  - `nextEpisode(entry) → number` (domain.js): first episode 1..max(totalEpisodes, watched) not watched, else 1.

- [ ] **Step 1: Write the failing tests**

`tests/unit/stats.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { xpNeeded, titleFor, levelForXp, xpFor, computeStats } from '../../src/shared/stats.js'

const e = (over) => ({ id: 'a', title: 'A', status: 'watching', rating: null, watchedEpisodes: [], ...over })
const NOW = '2026-10-02T08:00:00Z'

describe('levels', () => {
  it('uses round(100 × (L−1)^1.5) total XP per level', () => {
    expect(xpNeeded(1)).toBe(0)
    expect(xpNeeded(2)).toBe(100)
    expect(xpNeeded(10)).toBe(2700)
    expect(xpNeeded(50)).toBe(34300)
  })
  it('maps levels to titles at the agreed thresholds', () => {
    expect([1, 4, 5, 9, 10, 19, 20, 34, 35, 49, 50, 80].map(titleFor)).toEqual(
      ['rookie', 'rookie', 'watcher', 'watcher', 'veteran', 'veteran', 'elite', 'elite', 'sensei', 'sensei', 'legend', 'legend'])
  })
  it('finds level and progress inside the level', () => {
    expect(levelForXp(0)).toEqual({ level: 1, title: 'rookie', xpIntoLevel: 0, xpForNext: 100 })
    expect(levelForXp(99).level).toBe(1)
    expect(levelForXp(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: xpNeeded(3) - 100 })
    expect(levelForXp(2750)).toMatchObject({ level: 10, title: 'veteran', xpIntoLevel: 50 })
  })
  it('computes XP from episodes, completed and rated series', () => {
    expect(xpFor([e({ watchedEpisodes: [1, 2, 3] }), e({ status: 'completed', rating: 9, watchedEpisodes: [1] })])).toBe(30 + 10 + 50 + 5)
  })
  it('unwatching an episode lowers XP', () => {
    expect(xpFor([e({ watchedEpisodes: [1, 2] })])).toBeLessThan(xpFor([e({ watchedEpisodes: [1, 2, 3] })]))
  })
})

describe('computeStats', () => {
  it('returns a clean level 1 profile for a new install', () => {
    const s = computeStats({ entries: [], log: [], now: NOW })
    expect(s).toMatchObject({ xp: 0, level: 1, title: 'rookie', episodes: 0, hours: 0, completed: 0, avgRating: null, topGenres: [], streakDays: 0 })
    expect(s.activity).toHaveLength(28)
    expect(s.activity.at(-1)).toEqual({ date: '2026-10-02', count: 0 })
    expect(s.activity[0].date).toBe('2026-09-05')
  })
  it('estimates hours from AniList duration or 24 minutes', () => {
    const entries = [e({ id: 'a', watchedEpisodes: [1, 2] }), e({ id: 'b', watchedEpisodes: [1, 2, 3, 4, 5] })]
    const s = computeStats({ entries, log: [], infoById: { a: { duration: 45, genres: [] } }, now: NOW })
    expect(s.hours).toBe(Math.round((2 * 45 + 5 * 24) / 60))
  })
  it('averages ratings with one decimal, ignoring unrated', () => {
    const s = computeStats({ entries: [e({ rating: 8 }), e({ rating: 7 }), e({ rating: null })], log: [], now: NOW })
    expect(s.avgRating).toBe(7.5)
  })
  it('ranks genres by watched episodes and keeps the top 5', () => {
    const entries = [e({ id: 'a', watchedEpisodes: [1, 2, 3] }), e({ id: 'b', watchedEpisodes: [1] }), e({ id: 'c', watchedEpisodes: [1, 2] })]
    const infoById = {
      a: { genres: ['Action', 'Drama', 'G1', 'G2', 'G3', 'G4'] },
      b: { genres: ['Comedy'] },
      c: { genres: ['Drama'] },
    }
    const s = computeStats({ entries, log: [], infoById, now: NOW })
    expect(s.topGenres[0]).toEqual({ genre: 'Drama', episodes: 5 })
    expect(s.topGenres).toHaveLength(5)
    expect(s.topGenres.map((g) => g.genre)).not.toContain('Comedy')
  })
  it('counts by local day across midnight', () => {
    // 22:30 UTC is 00:30 the next day in CEST (offset -120)
    const log = [{ animeId: 'a', episode: 1, at: '2026-10-01T22:30:00Z' }]
    const s = computeStats({ entries: [], log, now: NOW, tzOffsetMinutes: -120 })
    expect(s.activity.at(-1)).toEqual({ date: '2026-10-02', count: 1 })
    expect(s.streakDays).toBe(1)
  })
  it('keeps a streak alive through yesterday and breaks it after a gap', () => {
    const at = (d) => ({ animeId: 'a', episode: 1, at: `${d}T12:00:00Z` })
    expect(computeStats({ entries: [], log: [at('2026-10-02'), at('2026-10-01'), at('2026-09-29')], now: NOW }).streakDays).toBe(2)
    expect(computeStats({ entries: [], log: [at('2026-10-01'), at('2026-09-30')], now: NOW }).streakDays).toBe(2)
    expect(computeStats({ entries: [], log: [at('2026-09-30')], now: NOW }).streakDays).toBe(0)
  })
})
```

Append to `tests/unit/domain.test.js` (and add `nextEpisode` to its import):
```js
describe('nextEpisode', () => {
  it('returns the first unwatched episode', () => {
    expect(nextEpisode({ totalEpisodes: 12, watchedEpisodes: [1, 2, 4] })).toBe(3)
    expect(nextEpisode({ totalEpisodes: null, watchedEpisodes: [1, 2] })).toBe(1)
    expect(nextEpisode({ totalEpisodes: 3, watchedEpisodes: [1, 2, 3] })).toBe(1)
    expect(nextEpisode({ totalEpisodes: null, watchedEpisodes: [] })).toBe(1)
  })
})
```
Note on the second case: with unknown total and watched [1,2], episodes 1..2 are all watched, so the helper returns 1 (same rule as v0.1 `AnimeDetail`). Keep that rule — do not invent episode 3.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/stats.test.js tests/unit/domain.test.js`
Expected: FAIL — module missing / `nextEpisode` not exported.

- [ ] **Step 3: Implement `src/shared/stats.js`**

```js
const TITLES = [[50, 'legend'], [35, 'sensei'], [20, 'elite'], [10, 'veteran'], [5, 'watcher'], [1, 'rookie']]
const DEFAULT_EPISODE_MINUTES = 24

export const xpNeeded = (level) => (level <= 1 ? 0 : Math.round(100 * (level - 1) ** 1.5))
export const titleFor = (level) => TITLES.find(([min]) => level >= min)[1]

export function levelForXp(xp) {
  let level = 1
  while (xpNeeded(level + 1) <= xp) level++
  const base = xpNeeded(level)
  return { level, title: titleFor(level), xpIntoLevel: xp - base, xpForNext: xpNeeded(level + 1) - base }
}

export function xpFor(entries) {
  return entries.reduce((sum, e) => sum
    + 10 * e.watchedEpisodes.length
    + (e.status === 'completed' ? 50 : 0)
    + (e.rating != null ? 5 : 0), 0)
}

// tzOffsetMinutes follows Date#getTimezoneOffset(): local = UTC - offset
const localDay = (iso, tz) => new Date(Date.parse(iso) - tz * 60000).toISOString().slice(0, 10)
const shiftDay = (day, delta) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function computeStats({ entries, log, infoById = {}, now, tzOffsetMinutes = 0 }) {
  const xp = xpFor(entries)
  const episodes = entries.reduce((s, e) => s + e.watchedEpisodes.length, 0)
  const minutes = entries.reduce((s, e) => s + e.watchedEpisodes.length * (infoById[e.id]?.duration || DEFAULT_EPISODE_MINUTES), 0)
  const rated = entries.filter((e) => e.rating != null)

  const genreCount = new Map()
  for (const e of entries) {
    for (const g of infoById[e.id]?.genres ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + e.watchedEpisodes.length)
  }
  const topGenres = [...genreCount]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([genre, n]) => ({ genre, episodes: n }))

  const perDay = new Map()
  for (const item of log) {
    const day = localDay(item.at, tzOffsetMinutes)
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  const today = localDay(now, tzOffsetMinutes)
  const activity = Array.from({ length: 28 }, (_, i) => {
    const date = shiftDay(today, i - 27)
    return { date, count: perDay.get(date) ?? 0 }
  })
  let day = perDay.has(today) ? today : perDay.has(shiftDay(today, -1)) ? shiftDay(today, -1) : null
  let streakDays = 0
  while (day && perDay.has(day)) { streakDays++; day = shiftDay(day, -1) }

  return {
    xp,
    ...levelForXp(xp),
    episodes,
    hours: Math.round(minutes / 60),
    completed: entries.filter((e) => e.status === 'completed').length,
    avgRating: rated.length ? Math.round((rated.reduce((s, e) => s + e.rating, 0) / rated.length) * 10) / 10 : null,
    topGenres,
    streakDays,
    activity,
  }
}

export const EMPTY_STATS = computeStats({ entries: [], log: [], now: '2000-01-01T00:00:00Z' })
```

Add to `src/shared/domain.js`:
```js
// First episode not yet watched among 1..max(totalEpisodes, highest watched); 1 when all are watched.
export function nextEpisode(entry) {
  const max = Math.max(entry.totalEpisodes ?? 0, ...entry.watchedEpisodes.map(Math.ceil), 1)
  for (let ep = 1; ep <= max; ep++) if (!entry.watchedEpisodes.includes(ep)) return ep
  return 1
}
```
In `src/renderer/pages/AnimeDetail.jsx`, replace the local `nextEp` computation (`const nextEp = episodes.find(...) ?? 1`) with `const nextEp = nextEpisode(entry)` and add `nextEpisode` to its import from `'../../shared/domain.js'`.

- [ ] **Step 4: Run to verify pass, then full suite**

Run: `npx vitest run tests/unit/stats.test.js tests/unit/domain.test.js` → PASS. Run: `npx vitest run` → all PASS (AnimeDetail "continues with the first unwatched episode" still passes).

- [ ] **Step 5: Commit**
```bash
git add src/shared/stats.js src/shared/domain.js src/renderer/pages/AnimeDetail.jsx tests/unit/stats.test.js tests/unit/domain.test.js
git commit -m "feat: XP, levels and watch statistics" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Watch log

**Files:**
- Create: `src/main/watchLog.js`
- Modify: `src/main/paths.js` (+ `watchLog`, `profile`), `tests/unit/paths.test.js`
- Test: `tests/unit/watchLog.test.js`

**Interfaces:**
- Produces: `createPaths(base)` gains `watchLog: <base>/watchlog.json`, `profile: <base>/profile.json`; `createWatchLog(file, { now?, uuid? }) → { wasCorrupt, list(), append({ animeId, episode, source }) → entry, removeLatest(animeId, episode) → boolean, removeAnime(animeId) → number }`. Entry: `{ id, animeId, episode: number, at: ISO, source: 'auto'|'manual' }`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/paths.test.js` inside the first test:
```js
    expect(p.watchLog).toBe(path.join('C:\\Data\\AnimeDesk', 'watchlog.json'))
    expect(p.profile).toBe(path.join('C:\\Data\\AnimeDesk', 'profile.json'))
```

`tests/unit/watchLog.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWatchLog } from '../../src/main/watchLog.js'

let file, log, n
beforeEach(() => {
  n = 0
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-log-')), 'watchlog.json')
  log = createWatchLog(file, { now: () => `2026-10-01T10:00:0${n}Z`, uuid: () => `w${++n}` })
})

describe('watchLog', () => {
  it('appends entries and persists them', () => {
    expect(log.append({ animeId: 'a', episode: '5', source: 'auto' })).toEqual({ id: 'w1', animeId: 'a', episode: 5, at: '2026-10-01T10:00:01Z', source: 'auto' })
    expect(createWatchLog(file).list()).toHaveLength(1)
  })
  it('removes only the latest entry for an episode', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    log.append({ animeId: 'a', episode: 1, source: 'manual' })
    log.append({ animeId: 'a', episode: 2, source: 'auto' })
    expect(log.removeLatest('a', 1)).toBe(true)
    expect(log.list().map((x) => x.id)).toEqual(['w1', 'w3'])
    expect(log.removeLatest('a', 9)).toBe(false)
  })
  it('removes every entry of a series', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    log.append({ animeId: 'b', episode: 1, source: 'auto' })
    log.append({ animeId: 'a', episode: 2, source: 'auto' })
    expect(log.removeAnime('a')).toBe(2)
    expect(createWatchLog(file).list().map((x) => x.animeId)).toEqual(['b'])
  })
  it('survives a corrupt file', () => {
    fs.writeFileSync(file, '{')
    const l = createWatchLog(file)
    expect(l.wasCorrupt).toBe(true)
    expect(l.list()).toEqual([])
  })
  it('returns copies', () => {
    log.append({ animeId: 'a', episode: 1, source: 'auto' })
    log.list()[0].episode = 99
    expect(log.list()[0].episode).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/watchLog.test.js tests/unit/paths.test.js`
Expected: FAIL — module missing, paths undefined.

- [ ] **Step 3: Implement**

In `src/main/paths.js` `createPaths` add:
```js
    watchLog: path.join(baseDir, 'watchlog.json'),
    profile: path.join(baseDir, 'profile.json'),
```

`src/main/watchLog.js`:
```js
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

export function createWatchLog(file, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  const loaded = readJson(file, { version: 1, entries: [] })
  const db = loaded.data
  const save = () => writeJsonAtomic(file, db)

  return {
    wasCorrupt: loaded.corrupt,
    list: () => db.entries.map((e) => ({ ...e })),
    append({ animeId, episode, source }) {
      const entry = { id: uuid(), animeId, episode: Number(episode), at: now(), source }
      db.entries.push(entry)
      save()
      return { ...entry }
    },
    removeLatest(animeId, episode) {
      const ep = Number(episode)
      const i = db.entries.findLastIndex((e) => e.animeId === animeId && e.episode === ep)
      if (i < 0) return false
      db.entries.splice(i, 1)
      save()
      return true
    },
    removeAnime(animeId) {
      const before = db.entries.length
      db.entries = db.entries.filter((e) => e.animeId !== animeId)
      const removed = before - db.entries.length
      if (removed) save()
      return removed
    },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/watchLog.test.js tests/unit/paths.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/watchLog.js src/main/paths.js tests/unit/watchLog.test.js tests/unit/paths.test.js
git commit -m "feat: watch log for streaks and activity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: AniList episode duration and offline cache lookup

**Files:**
- Modify: `src/main/anilist.js`, `tests/unit/anilist.test.js`

**Interfaces:**
- Produces: `info.duration` (minutes per episode or `null`); `getCached(title, { aniListId } = {}) → info|null` — synchronous, never touches the network.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('anilist', …)` in `tests/unit/anilist.test.js`:
```js
  it('includes the episode duration', async () => {
    const withDuration = createAniList({ cacheDir, fetchImpl: mkFetch([media(7, 'Show', 'Show', { duration: 23 })]) })
    expect((await withDuration.getForTitle('Show')).duration).toBe(23)
    expect((await api.getForTitle('Frieren')).duration).toBeNull()
  })
  it('getCached reads only the cache and never fetches', async () => {
    const calls = fetchImpl.mock.calls.length
    expect(api.getCached('Attack on Titan')).toBeNull()
    expect(fetchImpl.mock.calls.length).toBe(calls)
    const info = await api.getForTitle('Attack on Titan')
    const before = fetchImpl.mock.calls.length
    expect(api.getCached('attack on titan')).toEqual(info)
    expect(api.getCached('whatever', { aniListId: 99 })).toBeNull()
    expect(fetchImpl.mock.calls.length).toBe(before)
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/anilist.test.js`
Expected: FAIL — `duration` undefined, `getCached` not a function.

- [ ] **Step 3: Implement**

In `src/main/anilist.js`:
- change the `FIELDS` line to:
```js
const FIELDS = 'id title { romaji english native } coverImage { large } genres seasonYear episodes duration description(asHtml: false)'
```
- in `toInfo`, after `episodes: m.episodes ?? null,` add:
```js
    duration: m.duration ?? null,
```
- inside `createAniList`, add before `async function getForTitle`:
```js
  const cacheKey = (title, aniListId) => (aniListId ? `id:${aniListId}` : `t:${norm(title)}`)

  // Synchronous, offline: used by the profile statistics so opening it never hits the network.
  function getCached(title, { aniListId = null } = {}) {
    return readJson(cacheFile(cacheKey(title, aniListId)), null).data
  }
```
- in `getForTitle`, replace `const key = aniListId ? \`id:${aniListId}\` : \`t:${norm(title)}\`` and `const file = cacheFile(key)` with:
```js
    const file = cacheFile(cacheKey(title, aniListId))
```
- change the return to `return { search, getForTitle, getCached }`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/anilist.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/anilist.js tests/unit/anilist.test.js
git commit -m "feat: AniList episode duration and offline cache lookup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Progress (last level + events)

**Files:**
- Create: `src/main/progress.js`
- Modify: `src/shared/channels.js`
- Test: `tests/unit/progress.test.js`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic`; a `computeSnapshot()` function returning the `computeStats` shape (Task 2).
- Produces:
  - channels: `INVOKE.statsGet = 'stats:get'`, `EVENTS.levelUp = 'event:level-up'`, `EVENTS.seriesCompleted = 'event:series-completed'`.
  - `createProgress({ file, computeSnapshot, notify }) → { init(), snapshot(), check({ completedTitle } = {}) → stats }`.
  - Events: `notify(EVENTS.seriesCompleted, { title, xp: 50 })` then `notify(EVENTS.levelUp, { level, title })` (title = title key, e.g. `'veteran'`).
  - `profile.json`: `{ "version": 1, "lastLevel": number }`.

- [ ] **Step 1: Add the channels**

In `src/shared/channels.js`, add to `INVOKE`: `statsGet: 'stats:get',` and to `EVENTS`: `levelUp: 'event:level-up',` and `seriesCompleted: 'event:series-completed',`.

- [ ] **Step 2: Write the failing test**

`tests/unit/progress.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createProgress } from '../../src/main/progress.js'
import { EVENTS } from '../../src/shared/channels.js'

let file, level, events, progress
const snap = () => ({ level, title: level >= 10 ? 'veteran' : 'rookie', xp: level * 100 })
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-prog-')), 'profile.json')
  level = 7
  events = []
  progress = createProgress({ file, computeSnapshot: snap, notify: (ch, p) => events.push([ch, p]) })
})

describe('progress', () => {
  it('first run records level without an event', () => {
    progress.init()
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ version: 1, lastLevel: 7 })
    expect(events).toEqual([])
    progress.check()
    expect(events).toEqual([])
  })
  it('check() on a missing file also records silently', () => {
    progress.check()
    expect(events).toEqual([])
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).lastLevel).toBe(7)
  })
  it('emits exactly one level-up when the level rises', () => {
    progress.init()
    level = 10
    progress.check()
    progress.check()
    expect(events).toEqual([[EVENTS.levelUp, { level: 10, title: 'veteran' }]])
  })
  it('records a lower level silently and levels up again later', () => {
    progress.init()
    level = 6
    progress.check()
    expect(events).toEqual([])
    level = 7
    progress.check()
    expect(events).toEqual([[EVENTS.levelUp, { level: 7, title: 'rookie' }]])
  })
  it('announces a completed series before a level-up', () => {
    progress.init()
    level = 8
    progress.check({ completedTitle: 'Show' })
    expect(events.map((e) => e[0])).toEqual([EVENTS.seriesCompleted, EVENTS.levelUp])
    expect(events[0][1]).toEqual({ title: 'Show', xp: 50 })
  })
  it('snapshot returns the current stats', () => {
    expect(progress.snapshot()).toEqual({ level: 7, title: 'rookie', xp: 700 })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/progress.test.js`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `src/main/progress.js`**

```js
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { EVENTS } from '../shared/channels.js'

export function createProgress({ file, computeSnapshot, notify }) {
  const saved = () => readJson(file, null).data
  const remember = (level) => writeJsonAtomic(file, { version: 1, lastLevel: level })

  // First v0.2 start: remember the current level so existing history does not trigger level-ups.
  function init() {
    if (!saved()) remember(computeSnapshot().level)
  }

  function check({ completedTitle = null } = {}) {
    const stats = computeSnapshot()
    const last = saved()
    if (completedTitle) notify(EVENTS.seriesCompleted, { title: completedTitle, xp: 50 })
    if (!last) remember(stats.level)
    else if (stats.level > last.lastLevel) {
      remember(stats.level)
      notify(EVENTS.levelUp, { level: stats.level, title: stats.title })
    } else if (stats.level < last.lastLevel) remember(stats.level)
    return stats
  }

  return { init, check, snapshot: computeSnapshot }
}
```

- [ ] **Step 5: Run to verify pass, then full suite**

Run: `npx vitest run tests/unit/progress.test.js` → PASS.

The new `INVOKE.statsGet` channel makes the existing ipc test "has a handler for every INVOKE channel" fail, so register its handler now. Add to `createHandlers` in `src/main/ipc.js`:
```js
    [INVOKE.statsGet]: () => s.progress.snapshot(),
```
and to `services()` in `tests/unit/ipc.test.js`: `progress: { snapshot: vi.fn(() => ({ level: 1 })), check: vi.fn() },`. Re-run `npx vitest run` → all PASS.

- [ ] **Step 6: Commit**
```bash
git add src/main/progress.js src/shared/channels.js src/main/ipc.js tests/unit/progress.test.js tests/unit/ipc.test.js
git commit -m "feat: remember last level and emit level-up / series-completed events" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tracker and main-process wiring

**Files:**
- Create: `src/main/tracker.js`
- Modify: `src/main/ipc.js`, `src/preload/index.js`, `src/main/index.js`, `tests/unit/ipc.test.js`
- Test: `tests/unit/tracker.test.js`

**Interfaces:**
- Consumes: library (v0.1), `createWatchLog` (Task 3), `createProgress` (Task 5), `anilist.getCached` (Task 4), `computeStats` (Task 2).
- Produces:
  - `createTracker({ library, watchLog, progress }) → { recordWatched(payload, source = 'auto') → entry, update(id, patch) → entry, remove(id) → boolean }`.
  - IPC: `libraryUpdate` → `tracker.update`, `libraryRemove` → `tracker.remove`, `libraryRecord` → `tracker.recordWatched(payload, 'auto')` (+ `libraryChanged`), `statsGet` → `progress.snapshot()`.
  - Preload: `window.animedesk.stats = { get(), onLevelUp(cb), onSeriesCompleted(cb) }` (each `on…` returns unsubscribe).
  - Watch service records through the tracker (`library: { recordWatched: (p) => tracker.recordWatched(p, 'auto') }`).

- [ ] **Step 1: Write the failing tracker test**

`tests/unit/tracker.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLibrary } from '../../src/main/library.js'
import { createWatchLog } from '../../src/main/watchLog.js'
import { createTracker } from '../../src/main/tracker.js'

let library, watchLog, progress, tracker
beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-trk-'))
  library = createLibrary(path.join(dir, 'library.json'))
  watchLog = createWatchLog(path.join(dir, 'watchlog.json'))
  progress = { check: vi.fn() }
  tracker = createTracker({ library, watchLog, progress })
})
const eps = () => watchLog.list().map((e) => [e.episode, e.source])

describe('tracker', () => {
  it('logs an automatically watched episode and re-checks progress', () => {
    const entry = tracker.recordWatched({ aniCliTitle: 'Show', episode: '1' })
    expect(watchLog.list()[0]).toMatchObject({ animeId: entry.id, episode: 1, source: 'auto' })
    expect(progress.check).toHaveBeenCalledWith({ completedTitle: null })
  })
  it('re-watching does not log again', () => {
    tracker.recordWatched({ aniCliTitle: 'Show', episode: '1' })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: '1' })
    expect(eps()).toEqual([[1, 'auto']])
  })
  it('announces a series that just became completed', () => {
    const e = library.add({ title: 'Show', aniCliTitle: 'Show', totalEpisodes: 2 })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: 2 })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: 'Show' })
    tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: null })
    expect(library.get(e.id).status).toBe('completed')
  })
  it('logs manual marks and removes the log on unmark', () => {
    const e = library.add({ title: 'Show' })
    tracker.update(e.id, { watchedEpisodes: [1, 2] })
    expect(eps()).toEqual([[1, 'manual'], [2, 'manual']])
    tracker.update(e.id, { watchedEpisodes: [2] })
    expect(eps()).toEqual([[2, 'manual']])
  })
  it('announces a manual switch to completed', () => {
    const e = library.add({ title: 'Show' })
    tracker.update(e.id, { status: 'completed' })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: 'Show' })
    tracker.update(e.id, { rating: 9 })
    expect(progress.check).toHaveBeenLastCalledWith({ completedTitle: null })
  })
  it('removing a series clears its log', () => {
    const e = tracker.recordWatched({ aniCliTitle: 'Show', episode: 1 })
    tracker.recordWatched({ aniCliTitle: 'Other', episode: 1 })
    expect(tracker.remove(e.id)).toBe(true)
    expect(watchLog.list()).toHaveLength(1)
    expect(progress.check).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/tracker.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/tracker.js`**

```js
// Every watchlist change that affects XP goes through here, so the watch log and level stay in sync.
export function createTracker({ library, watchLog, progress }) {
  const newlyCompleted = (before, after) => (after.status === 'completed' && before?.status !== 'completed' ? after.title : null)

  function recordWatched(payload, source = 'auto') {
    const before = library.findByAniCliTitle(payload.aniCliTitle)
    const ep = Number(payload.episode)
    const entry = library.recordWatched(payload)
    if (!before?.watchedEpisodes.includes(ep)) watchLog.append({ animeId: entry.id, episode: ep, source })
    progress.check({ completedTitle: newlyCompleted(before, entry) })
    return entry
  }

  function update(id, patch) {
    const before = library.get(id)
    const entry = library.update(id, patch)
    if ('watchedEpisodes' in patch && before) {
      for (const ep of entry.watchedEpisodes) if (!before.watchedEpisodes.includes(ep)) watchLog.append({ animeId: id, episode: ep, source: 'manual' })
      for (const ep of before.watchedEpisodes) if (!entry.watchedEpisodes.includes(ep)) watchLog.removeLatest(id, ep)
    }
    progress.check({ completedTitle: newlyCompleted(before, entry) })
    return entry
  }

  function remove(id) {
    const removed = library.remove(id)
    if (removed) {
      watchLog.removeAnime(id)
      progress.check()
    }
    return removed
  }

  return { recordWatched, update, remove }
}
```
Note: in the "announces a series that just became completed" test, the first `recordWatched` of a library entry added with status `planned` moves it to `watching` (v0.1 rule), the second reaches `totalEpisodes` → `completed`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/tracker.test.js` → PASS.

- [ ] **Step 5: Route IPC through the tracker (test first)**

In `tests/unit/ipc.test.js` `services()` add `tracker: { update: vi.fn(), remove: vi.fn(), recordWatched: vi.fn(() => ({ id: 'a' })) },`. In `'forwards arguments'` replace
```js
    expect(s.library.update).toHaveBeenCalledWith('id1', { rating: 8 })
```
with
```js
    expect(s.tracker.update).toHaveBeenCalledWith('id1', { rating: 8 })
    h[INVOKE.libraryRemove]('id1')
    expect(s.tracker.remove).toHaveBeenCalledWith('id1')
    h[INVOKE.statsGet]()
    expect(s.progress.snapshot).toHaveBeenCalled()
```
and in `'recordWatched notifies library-changed'` add after the call:
```js
    expect(s.tracker.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'A', episode: '1' }, 'auto')
```
Run `npx vitest run tests/unit/ipc.test.js` → FAIL (still calls `library.update`).

In `src/main/ipc.js` replace the three handlers:
```js
    [INVOKE.libraryUpdate]: (id, patch) => s.tracker.update(id, patch),
    [INVOKE.libraryRemove]: (id) => s.tracker.remove(id),
```
```js
    [INVOKE.libraryRecord]: (payload) => {
      const entry = s.tracker.recordWatched(payload, 'auto')
      s.send(EVENTS.libraryChanged)
      return entry
    },
```
Run `npx vitest run tests/unit/ipc.test.js` → PASS.

- [ ] **Step 6: Preload API**

In `src/preload/index.js`, add before `dialog:`:
```js
  stats: { get: invoke(INVOKE.statsGet), onLevelUp: on(EVENTS.levelUp), onSeriesCompleted: on(EVENTS.seriesCompleted) },
```

- [ ] **Step 7: Wire `src/main/index.js`**

- Add imports:
```js
import os from 'node:os'
import { createWatchLog } from './watchLog.js'
import { createProgress } from './progress.js'
import { createTracker } from './tracker.js'
import { computeStats } from '../shared/stats.js'
```
- Replace `const settings = createSettings(paths.settings)` with:
```js
  const settings = createSettings(paths.settings, { systemName: os.userInfo().username })
```
- Move `const anilist = createAniList({ cacheDir: paths.cache })` up so it is created right after `library`, then add after it:
```js
  const watchLog = createWatchLog(paths.watchLog)
  const computeSnapshot = () => {
    const entries = library.list()
    const infoById = {}
    for (const e of entries) {
      const info = anilist.getCached(e.title, { aniListId: e.aniListId })
      if (info) infoById[e.id] = info
    }
    const now = new Date()
    return computeStats({ entries, log: watchLog.list(), infoById, now: now.toISOString(), tzOffsetMinutes: now.getTimezoneOffset() })
  }
  const progress = createProgress({ file: paths.profile, computeSnapshot, notify: send })
  progress.init()
  const tracker = createTracker({ library, watchLog, progress })
```
- Change the watch service line to:
```js
  const watch = createWatchService({ aniCli, player, library: { recordWatched: (p) => tracker.recordWatched(p, 'auto') }, settings, notify: send })
```
- Change the `createHandlers({ … })` first line to:
```js
    settings, library, tracker, progress, anilist, toolManager, health, watch, downloads, send,
```

- [ ] **Step 8: Verify**

Run: `npx vitest run` → all PASS. Run: `npm run build` → builds without errors.

- [ ] **Step 9: Commit**
```bash
git add src/main/tracker.js src/main/ipc.js src/preload/index.js src/main/index.js tests/unit/tracker.test.js tests/unit/ipc.test.js
git commit -m "feat: route watchlist changes through the watch log and level tracking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Design tokens, bundled fonts, global styles and Icon

**Files:**
- Modify: `package.json` (deps), `src/renderer/main.jsx`
- Rewrite: `src/renderer/styles.css`
- Create: `src/renderer/components/Icon.jsx`
- Test: `tests/unit/styles.test.js`, `tests/unit/ui/Icon.test.jsx`

**Interfaces:**
- Produces: CSS tokens from spec §2.2 plus `--on-accent`, `--scrim`, `--glow-cyan`, `--font-display`, `--font-body`, `--font-hud`; utility class `.hud` (Chakra Petch label); every class used by the components of Tasks 10–14 (listed in the CSS below); `<Icon name size? />` with names `home, watchlist, downloads, profile, settings, play, info, check, flame, search, film, volume`.

- [ ] **Step 1: Install dependencies**

```bash
npm install -D lucide-react@^1.49 @fontsource/russo-one@^5.3 @fontsource/exo-2@^5.3 @fontsource/chakra-petch@^5.3
```
Expected: no ERESOLVE errors.

- [ ] **Step 2: Write the failing tests**

`tests/unit/styles.test.js`:
```js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const css = fs.readFileSync('src/renderer/styles.css', 'utf8')
const rootEnd = css.indexOf('}', css.indexOf(':root {'))

describe('styles.css', () => {
  it('defines every design token in :root', () => {
    const root = css.slice(0, rootEnd)
    for (const t of ['--bg', '--bg-elev', '--glass', '--glass-strong', '--glass-border', '--blur', '--text', '--text-muted',
      '--accent', '--accent-2', '--cta', '--ok', '--warn', '--bad', '--poster-tint', '--radius', '--radius-sm', '--glow', '--ease',
      '--font-display', '--font-body', '--font-hud']) {
      expect(root, t).toContain(`${t}:`)
    }
  })
  it('uses no raw hex colors outside :root', () => {
    expect(css.slice(rootEnd).match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
  })
  it('only animates transform and opacity', () => {
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) {
      for (const part of m[1].split(',')) expect(part.trim().split(/\s+/)[0], m[0]).toMatch(/^(transform|opacity|none)$/)
    }
  })
  it('honours reduced motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.reduce-motion')
  })
})
```

`tests/unit/ui/Icon.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon } from '../../../src/renderer/components/Icon.jsx'

describe('Icon', () => {
  it('renders a decorative svg', () => {
    const { container } = render(<Icon name="home" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '20')
  })
  it('renders nothing for an unknown name', () => {
    const { container } = render(<Icon name="nope" />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/styles.test.js tests/unit/ui/Icon.test.jsx`
Expected: FAIL — tokens missing / Icon module missing.

- [ ] **Step 4: Implement `src/renderer/components/Icon.jsx`**

```jsx
import { House, ListVideo, Download, UserRound, Settings, Play, Info, Check, Flame, Search, Film, Volume2 } from 'lucide-react'

const ICONS = {
  home: House, watchlist: ListVideo, downloads: Download, profile: UserRound, settings: Settings,
  play: Play, info: Info, check: Check, flame: Flame, search: Search, film: Film, volume: Volume2,
}

export function Icon({ name, size = 18 }) {
  const Component = ICONS[name]
  return Component ? <Component size={size} strokeWidth={1.75} aria-hidden="true" /> : null
}
```

- [ ] **Step 5: Fonts in `src/renderer/main.jsx`**

Add at the top (before `import './styles.css'`):
```js
import '@fontsource/russo-one/400.css'
import '@fontsource/exo-2/400.css'
import '@fontsource/exo-2/500.css'
import '@fontsource/exo-2/600.css'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
```

- [ ] **Step 6: Rewrite `src/renderer/styles.css`**

```css
:root {
  --bg: #0B0B16;
  --bg-elev: #141428;
  --glass: rgba(255, 255, 255, 0.06);
  --glass-strong: rgba(255, 255, 255, 0.10);
  --glass-border: rgba(255, 255, 255, 0.10);
  --blur: 16px;
  --text: #ECECF6;
  --text-muted: #A3A3C2;
  --accent: #8B5CF6;
  --accent-2: #22D3EE;
  --cta: #F43F5E;
  --ok: #22C55E;
  --warn: #EAB308;
  --bad: #EF4444;
  --on-accent: #FFFFFF;
  --scrim: rgba(5, 5, 12, 0.72);
  --poster-tint: var(--accent);
  --radius: 14px;
  --radius-sm: 8px;
  --glow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent);
  --glow-cyan: 0 0 14px color-mix(in srgb, var(--accent-2) 60%, transparent);
  --ease: cubic-bezier(.2, .8, .2, 1);
  --font-display: 'Russo One', 'Segoe UI', sans-serif;
  --font-body: 'Exo 2', 'Segoe UI', sans-serif;
  --font-hud: 'Chakra Petch', 'Consolas', monospace;
  color-scheme: dark;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 var(--font-body); }
h1, h2, h3 { font-family: var(--font-display); font-weight: 400; letter-spacing: .02em; margin: 0; }
h2 { font-size: 22px; }
h3 { font-size: 17px; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); padding: 7px 14px; cursor: pointer; transition: transform 150ms var(--ease), opacity 150ms var(--ease); }
button:hover:not(:disabled) { background: var(--glass-strong); border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
button:active:not(:disabled) { transform: translateY(1px); }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }
button:disabled { opacity: .45; cursor: not-allowed; }
button.primary { background: var(--cta); border-color: var(--cta); color: var(--on-accent); font-weight: 600; }
button.primary:hover:not(:disabled) { box-shadow: 0 0 16px color-mix(in srgb, var(--cta) 55%, transparent); }
button.danger { background: var(--bad); border-color: var(--bad); color: var(--on-accent); }
input, select, textarea { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); padding: 7px 10px; }
input[type="range"] { padding: 0; accent-color: var(--accent); }
input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
textarea { width: 100%; min-height: 80px; resize: vertical; }
.hud { font-family: var(--font-hud); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
.muted { color: var(--text-muted); }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.page { display: flex; flex-direction: column; gap: 18px; }

/* shell */
.app-shell { display: grid; grid-template-columns: 232px 1fr; height: 100vh; overflow: hidden; }
.content { overflow-y: auto; padding: 24px 28px 40px; }
.page-enter { animation: page-in 200ms var(--ease); }
@keyframes page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* sidebar */
.sidebar { display: flex; flex-direction: column; gap: 22px; padding: 22px 14px; background: color-mix(in srgb, var(--bg-elev) 85%, transparent); backdrop-filter: blur(var(--blur)); border-right: 1px solid var(--glass-border); }
.sidebar__logo { font-family: var(--font-display); font-size: 20px; letter-spacing: .06em; padding: 0 10px; background: linear-gradient(90deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sidebar__nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); position: relative; text-align: left; }
.nav-item--active { background: var(--glass-strong); border-color: var(--glass-border); }
.nav-item--active::before { content: ""; position: absolute; left: -14px; top: 8px; bottom: 8px; width: 3px; border-radius: 3px; background: var(--accent); box-shadow: var(--glow); }
.sidebar__footer { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }

/* semaphore */
.semaphore { display: flex; align-items: center; gap: 8px; width: 100%; font-family: var(--font-hud); font-size: 12px; text-align: left; }
.semaphore__label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.semaphore__dot, .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.semaphore--green .semaphore__dot, .dot--green { background: var(--ok); box-shadow: 0 0 10px var(--ok); }
.semaphore--yellow .semaphore__dot, .dot--yellow { background: var(--warn); box-shadow: 0 0 10px var(--warn); animation: breathe 1.6s ease-in-out infinite; }
.semaphore--red .semaphore__dot, .dot--red { background: var(--bad); box-shadow: 0 0 10px var(--bad); }
@keyframes breathe { 50% { opacity: .45; } }

/* profile card + xp */
.profile-card { display: flex; gap: 10px; align-items: center; width: 100%; padding: 10px; text-align: left; }
.profile-card__avatar, .avatar--lg { display: grid; place-items: center; flex: none; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--on-accent); font-family: var(--font-display); }
.profile-card__avatar { width: 38px; height: 38px; font-size: 14px; }
.profile-card__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.profile-card__level { font-size: 12px; color: var(--accent-2); }
.profile-card__title { font-size: 12px; color: var(--text-muted); }
.xp-bar { height: 6px; border-radius: 3px; background: var(--glass-strong); overflow: hidden; }
.xp-bar__fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); box-shadow: var(--glow-cyan); transform-origin: left; transition: transform 600ms var(--ease); }

/* notices */
.notice { padding: 10px 14px; border-radius: var(--radius-sm); background: var(--glass); border: 1px solid var(--glass-border); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.notice--warn { border-left: 3px solid var(--warn); }
.notice--error { border-left: 3px solid var(--bad); }
.details { width: 100%; white-space: pre-wrap; color: var(--text-muted); font-size: 12px; max-height: 200px; overflow: auto; }

/* hero */
.hero { position: relative; min-height: 280px; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--glass-border); display: flex; align-items: flex-end; }
.hero__bg { position: absolute; inset: -40px; background-size: cover; background-position: center; filter: blur(28px) saturate(1.3); transform: scale(1.1); opacity: .55; }
.hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, var(--bg) 15%, color-mix(in srgb, var(--poster-tint) 35%, transparent) 70%, transparent), linear-gradient(0deg, var(--bg), transparent 60%); }
.hero__body { position: relative; z-index: 1; display: flex; gap: 24px; align-items: flex-end; justify-content: space-between; width: 100%; padding: 28px; }
.hero__text { display: flex; flex-direction: column; gap: 10px; max-width: 60%; }
.hero__label { color: var(--accent-2); font-size: 13px; }
.hero__title { font-size: 34px; line-height: 1.15; }
.hero__poster { width: 150px; border-radius: var(--radius-sm); box-shadow: 0 10px 30px var(--scrim); }
.hero--welcome::after { background: radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 60%), linear-gradient(0deg, var(--bg), transparent); }

/* rails + cards */
.rail { display: flex; flex-direction: column; gap: 10px; }
.rail__track { display: grid; grid-auto-flow: column; grid-auto-columns: 150px; gap: 14px; overflow-x: auto; padding-bottom: 6px; }
.search-bar { display: flex; gap: 8px; }
.search-bar input { flex: 1; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
.card { display: flex; flex-direction: column; gap: 6px; padding: 8px; text-align: left; background: var(--glass); border-radius: var(--radius); transition: transform 180ms var(--ease), opacity 180ms var(--ease); }
.card:hover { transform: translateY(-2px); box-shadow: var(--glow); }
.card__title { font-weight: 600; }
.card__meta { color: var(--text-muted); font-size: 12px; font-family: var(--font-hud); letter-spacing: .05em; }
.poster { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--radius-sm); background: var(--glass-strong); display: block; }
.poster--empty { display: grid; place-items: center; color: var(--text-muted); background: linear-gradient(135deg, var(--glass-strong), var(--glass)); }

/* episodes */
.ep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(54px, 1fr)); gap: 6px; }
.ep { padding: 8px 0; text-align: center; font-family: var(--font-hud); font-weight: 600; }
.ep--watched { border-color: var(--accent-2); color: var(--accent-2); }
.ep--selected { background: var(--accent); border-color: var(--accent); color: var(--on-accent); box-shadow: var(--glow); }
.ep--note::after { content: "•"; margin-left: 2px; color: var(--warn); }

/* detail banner */
.banner { position: relative; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--glass-border); }
.banner::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, var(--bg) 5%, color-mix(in srgb, var(--poster-tint) 30%, transparent)); }
.banner__body { position: relative; z-index: 1; display: flex; gap: 20px; align-items: flex-end; padding: 24px; }
.banner .poster { width: 150px; }
.detail { display: flex; flex-direction: column; gap: 18px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field > span { color: var(--text-muted); font-size: 12px; font-family: var(--font-hud); text-transform: uppercase; letter-spacing: .08em; }
.check { display: flex; gap: 8px; align-items: center; }
.description { white-space: pre-wrap; background: var(--glass); padding: 12px; border-radius: var(--radius-sm); }

/* profile page */
.profile-head { display: flex; gap: 20px; align-items: center; }
.avatar--lg { width: 84px; height: 84px; font-size: 30px; box-shadow: var(--glow); }
.profile-head__meta { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.stat-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.stat-tile { padding: 14px; border-radius: var(--radius); background: var(--glass); border: 1px solid var(--glass-border); }
.stat-tile__value { font-family: var(--font-hud); font-size: 28px; font-weight: 600; color: var(--accent-2); }
.stat-tile__label { color: var(--text-muted); font-size: 13px; }
.genre-bars { display: flex; flex-direction: column; gap: 8px; }
.genre-bar { display: grid; grid-template-columns: 120px 1fr 40px; gap: 10px; align-items: center; }
.genre-bar__track { height: 8px; border-radius: 4px; background: var(--glass-strong); overflow: hidden; }
.genre-bar__fill { height: 100%; background: var(--accent); transform-origin: left; }
.streak { display: flex; gap: 8px; align-items: center; color: var(--warn); }
.activity-grid { display: grid; grid-template-columns: repeat(14, 18px); grid-auto-rows: 18px; gap: 4px; }
.activity-cell { border-radius: 4px; background: var(--glass); }
.activity-cell--l1 { background: color-mix(in srgb, var(--accent) 35%, transparent); }
.activity-cell--l2 { background: color-mix(in srgb, var(--accent) 65%, transparent); }
.activity-cell--l3 { background: var(--accent); box-shadow: var(--glow); }

/* modals, wizard, lists */
.modal { position: fixed; inset: 0; background: var(--scrim); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal__box { background: color-mix(in srgb, var(--bg-elev) 92%, transparent); border: 1px solid var(--glass-border); padding: 22px; border-radius: var(--radius); min-width: 400px; max-width: 580px; display: flex; flex-direction: column; gap: 12px; }
.tool-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.tool-row { display: flex; align-items: center; gap: 10px; }
.tool-row__name { flex: 1; }
.tool-row__state { color: var(--text-muted); font-family: var(--font-hud); font-size: 13px; }
.queue-item, .dl-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); }
.queue-item__title, .dl-item__title { flex: 1; }
.progress { width: 160px; height: 6px; background: var(--glass-strong); border-radius: 3px; overflow: hidden; }
.progress > div { height: 100%; background: var(--accent-2); }
.confirm { display: inline-flex; gap: 6px; align-items: center; }
.group { display: flex; gap: 14px; }
.group .poster { width: 84px; }
.group__items { flex: 1; display: flex; flex-direction: column; gap: 6px; }

/* level up + toast */
.levelup { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: var(--scrim); cursor: pointer; animation: fade-in 200ms var(--ease); }
.levelup__beam { position: absolute; left: 0; right: 0; top: 50%; height: 3px; background: linear-gradient(90deg, transparent, var(--accent-2), var(--accent), transparent); box-shadow: var(--glow-cyan); animation: beam 900ms var(--ease); }
.levelup__text { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; animation: pop 400ms var(--ease); }
.levelup__title { font-family: var(--font-display); font-size: 56px; letter-spacing: .08em; color: var(--accent-2); text-shadow: var(--glow-cyan); }
.levelup .xp-bar { width: 320px; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 25; display: flex; gap: 10px; align-items: center; padding: 12px 18px; border-radius: var(--radius); background: color-mix(in srgb, var(--bg-elev) 92%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent); box-shadow: var(--glow); animation: fade-in 200ms var(--ease); }
@keyframes fade-in { from { opacity: 0; } }
@keyframes beam { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes pop { from { opacity: 0; transform: scale(.9); } }

/* narrow window: icon-only sidebar */
@media (max-width: 960px) {
  .app-shell { grid-template-columns: 72px 1fr; }
  .nav-item__label, .sidebar__logo-text, .profile-card__meta, .semaphore__label { display: none; }
  .hero__text { max-width: 100%; }
  .hero__poster { display: none; }
}

/* reduced motion: OS setting or the in-app switch */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
.reduce-motion *, .reduce-motion *::before, .reduce-motion *::after { animation: none !important; transition: none !important; }
```

- [ ] **Step 7: Run to verify pass, then full suite and build**

Run: `npx vitest run tests/unit/styles.test.js tests/unit/ui/Icon.test.jsx` → PASS. Run: `npx vitest run` → all PASS. Run: `npm run build` → fonts appear as `.woff2` assets under `out/renderer/assets`.

- [ ] **Step 8: Commit**
```bash
git add package.json package-lock.json src/renderer/styles.css src/renderer/main.jsx src/renderer/components/Icon.jsx tests/unit/styles.test.js tests/unit/ui/Icon.test.jsx
git commit -m "feat: design tokens, glass + neon styles, bundled fonts and icons" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Poster tint

**Files:**
- Create: `src/renderer/theme/posterTint.js`
- Test: `tests/unit/posterTint.test.js`

**Interfaces:**
- Produces: `tintFromPixels(rgba: Uint8ClampedArray|number[]) → '#rrggbb'|null` (ignores transparent and grey pixels; saturation ≥ 0.55; lightness clamped to 0.30–0.50); `posterTint(dataUrl, { createCanvas?, loadImage? }) → Promise<string|null>` (cached per URL; `null` on any failure).

- [ ] **Step 1: Write the failing test**

`tests/unit/posterTint.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { tintFromPixels, posterTint } from '../../src/renderer/theme/posterTint.js'

const px = (...colors) => colors.flatMap(([r, g, b, a = 255]) => [r, g, b, a])
const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

describe('posterTint', () => {
  it('averages colorful pixels into a saturated tint', () => {
    const hex = tintFromPixels(px([200, 30, 40], [220, 40, 60]))
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(parseInt(hex.slice(1, 3), 16)).toBeGreaterThan(parseInt(hex.slice(3, 5), 16))
  })
  it('clamps lightness of bright posters', () => {
    expect(lightness(tintFromPixels(px([255, 240, 120], [250, 250, 90])))).toBeLessThanOrEqual(0.51)
  })
  it('lifts very dark posters', () => {
    expect(lightness(tintFromPixels(px([10, 10, 60], [5, 5, 40])))).toBeGreaterThanOrEqual(0.29)
  })
  it('returns null for grey or transparent images', () => {
    expect(tintFromPixels(px([120, 120, 120], [10, 10, 10]))).toBeNull()
    expect(tintFromPixels(px([200, 30, 40, 0]))).toBeNull()
  })
  it('returns null when the canvas is unavailable', async () => {
    const createCanvas = () => ({ getContext: () => null })
    expect(await posterTint('data:image/png;base64,AA', { createCanvas, loadImage: async () => ({}) })).toBeNull()
    expect(await posterTint(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/posterTint.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `src/renderer/theme/posterTint.js`**

```js
const cache = new Map()

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Average of the colorful pixels, made vivid but dark enough for light text on top.
export function tintFromPixels(data) {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    const [R, G, B, A] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (A < 128 || Math.max(R, G, B) - Math.min(R, G, B) < 24) continue
    r += R; g += G; b += B; n++
  }
  if (!n) return null
  const [h, s, l] = rgbToHsl(r / n, g / n, b / n)
  return hslToHex(h, Math.max(s, 0.55), Math.min(0.5, Math.max(0.3, l)))
}

const defaultLoadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

export async function posterTint(dataUrl, { createCanvas = () => document.createElement('canvas'), loadImage = defaultLoadImage } = {}) {
  if (!dataUrl) return null
  if (cache.has(dataUrl)) return cache.get(dataUrl)
  let tint = null
  try {
    const img = await loadImage(dataUrl)
    const canvas = createCanvas()
    canvas.width = 32
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0, 32, 48)
      tint = tintFromPixels(ctx.getImageData(0, 0, 32, 48).data)
    }
  } catch {
    tint = null
  }
  cache.set(dataUrl, tint)
  return tint
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/posterTint.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/renderer/theme/posterTint.js tests/unit/posterTint.test.js
git commit -m "feat: series tint color extracted from the poster" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Synthesized sounds

**Files:**
- Create: `src/renderer/sound.js`
- Test: `tests/unit/sound.test.js`

**Interfaces:**
- Produces: `createSound({ getSettings, audioContextFactory? }) → { play(name) → boolean }`; names `levelUp`, `seriesCompleted`, `downloadDone` (key sounds, need `soundKey`), `click`, `navigate` (UI sounds, need `soundUi`). Volume = `soundVolume / 100`. While a sound plays, a lower-priority sound is skipped; an equal/higher one replaces it. Priority: levelUp 3 > seriesCompleted, downloadDone 2 > click, navigate 1.

- [ ] **Step 1: Write the failing test**

`tests/unit/sound.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { createSound } from '../../src/renderer/sound.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

function fakeContext() {
  const param = () => ({ value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() })
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
  const ctx = {
    currentTime: 0,
    destination: {},
    gains: [],
    oscillators: 0,
    createGain() { const g = { ...node(), gain: param() }; ctx.gains.push(g); return g },
    createOscillator() { ctx.oscillators++; return { ...node(), type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn() } },
  }
  return ctx
}
const setup = (over = {}) => {
  const ctx = fakeContext()
  const factory = vi.fn(() => ctx)
  const sound = createSound({ getSettings: () => ({ ...DEFAULT_SETTINGS, ...over }), audioContextFactory: factory })
  return { ctx, factory, sound }
}

describe('sound', () => {
  it('plays key sounds by default at the configured volume', () => {
    const { ctx, sound } = setup({ soundVolume: 60 })
    expect(sound.play('downloadDone')).toBe(true)
    expect(ctx.gains[0].gain.value).toBe(0.6)
    expect(ctx.oscillators).toBeGreaterThan(0)
  })
  it('keeps interface sounds off by default', () => {
    const { factory, sound } = setup()
    expect(sound.play('click')).toBe(false)
    expect(factory).not.toHaveBeenCalled()
  })
  it('respects the switches', () => {
    expect(setup({ soundKey: false }).sound.play('levelUp')).toBe(false)
    expect(setup({ soundUi: true }).sound.play('navigate')).toBe(true)
  })
  it('levelUp is not interrupted by lower priority sounds', () => {
    const { ctx, sound } = setup({ soundUi: true })
    expect(sound.play('levelUp')).toBe(true)
    expect(sound.play('seriesCompleted')).toBe(false)
    expect(sound.play('click')).toBe(false)
    ctx.currentTime = 5
    expect(sound.play('click')).toBe(true)
  })
  it('a key sound replaces a playing interface sound', () => {
    const { ctx, sound } = setup({ soundUi: true })
    sound.play('navigate')
    const uiGain = ctx.gains[0]
    expect(sound.play('levelUp')).toBe(true)
    expect(uiGain.disconnect).toHaveBeenCalled()
  })
  it('ignores unknown names', () => {
    expect(setup().sound.play('boom')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/sound.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `src/renderer/sound.js`**

```js
const KEY_SOUNDS = new Set(['levelUp', 'seriesCompleted', 'downloadDone'])
const PRIORITY = { levelUp: 3, seriesCompleted: 2, downloadDone: 2, click: 1, navigate: 1 }

function tone(ctx, out, freq, start, length, { type = 'sine', peak = 0.3, to = null } = {}) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + length)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + 0.01)
  env.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(env)
  env.connect(out)
  osc.start(start)
  osc.stop(start + length + 0.02)
}

// Each recipe schedules its notes and returns its duration in seconds.
const RECIPES = {
  levelUp(ctx, out, t) {
    tone(ctx, out, 523.25, t, 0.5, { type: 'triangle' })
    tone(ctx, out, 659.25, t + 0.12, 0.5, { type: 'triangle' })
    tone(ctx, out, 783.99, t + 0.24, 0.5, { type: 'triangle' })
    tone(ctx, out, 1567.98, t + 0.36, 0.4, { peak: 0.12 })
    return 0.8
  },
  seriesCompleted(ctx, out, t) {
    tone(ctx, out, 659.25, t, 0.25, { type: 'triangle' })
    tone(ctx, out, 880, t + 0.15, 0.45, { type: 'triangle' })
    return 0.6
  },
  downloadDone(ctx, out, t) {
    tone(ctx, out, 880, t, 0.15)
    tone(ctx, out, 1174.66, t + 0.12, 0.2)
    return 0.32
  },
  click(ctx, out, t) {
    tone(ctx, out, 2000, t, 0.03, { type: 'square', peak: 0.05 })
    return 0.04
  },
  navigate(ctx, out, t) {
    tone(ctx, out, 300, t, 0.15, { peak: 0.08, to: 900 })
    return 0.15
  },
}

export function createSound({ getSettings, audioContextFactory = () => new AudioContext() }) {
  let ctx = null
  let current = null // { name, until, out }

  function play(name) {
    const recipe = RECIPES[name]
    if (!recipe) return false
    const s = getSettings()
    if (KEY_SOUNDS.has(name) ? !s.soundKey : !s.soundUi) return false
    ctx ??= audioContextFactory()
    const now = ctx.currentTime
    if (current && current.until > now) {
      if (PRIORITY[current.name] > PRIORITY[name]) return false
      current.out.disconnect()
    }
    const out = ctx.createGain()
    out.gain.value = s.soundVolume / 100
    out.connect(ctx.destination)
    const length = recipe(ctx, out, now)
    current = { name, until: now + length, out }
    return true
  }

  return { play }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/sound.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/renderer/sound.js tests/unit/sound.test.js
git commit -m "feat: synthesized key and interface sounds with priorities" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: XP bar, profile card and Profile page

**Files:**
- Create: `src/renderer/components/XpBar.jsx`, `src/renderer/components/ProfileCard.jsx`, `src/renderer/pages/ProfilePage.jsx`
- Modify: `src/renderer/i18n/sr.json`, `src/renderer/i18n/en.json`, `tests/unit/ui/helpers.jsx`
- Test: `tests/unit/ui/Profile.test.jsx`

**Interfaces:**
- Consumes: `EMPTY_STATS` and the stats shape (Task 2), `Icon` (Task 7).
- Produces:
  - `<XpBar into total />` — `role="progressbar"`, fill uses `transform: scaleX(ratio)`.
  - `initials(name) → string` (max 2 letters, uppercase, `'?'` for empty) and `<ProfileCard name stats onClick />` (exported from `ProfileCard.jsx`).
  - `<ProfilePage stats name lang />`.
  - Fake API in `helpers.jsx` gains `stats: { get, onLevelUp, onSeriesCompleted }`.

- [ ] **Step 1: Add i18n keys**

Add to `src/renderer/i18n/sr.json`:
```json
  "app.name": "ANIMEDESK",
  "nav.home": "Početna",
  "nav.profile": "Profil",
  "title.rookie": "Početnik",
  "title.watcher": "Gledalac",
  "title.veteran": "Veteran",
  "title.elite": "Elita",
  "title.sensei": "Sensei",
  "title.legend": "Legenda",
  "profile.level": "LV {level}",
  "profile.xp": "{into} / {total} XP",
  "profile.toNext": "do sledećeg nivoa",
  "profile.empty": "Odgledaj prvu epizodu da počneš.",
  "profile.episodes": "Epizode",
  "profile.hours": "Sati gledanja",
  "profile.completed": "Završene serije",
  "profile.avgRating": "Prosečna ocena",
  "profile.genres": "Omiljeni žanrovi",
  "profile.noGenres": "Žanrovi se pojavljuju kad aplikacija preuzme podatke o serijama.",
  "profile.streak": "Niz dana: {days}",
  "profile.activity": "Aktivnost · poslednje 4 nedelje",
  "profile.activityCell": "{date}: {count} ep."
```
Add to `src/renderer/i18n/en.json`:
```json
  "app.name": "ANIMEDESK",
  "nav.home": "Home",
  "nav.profile": "Profile",
  "title.rookie": "Rookie",
  "title.watcher": "Watcher",
  "title.veteran": "Veteran",
  "title.elite": "Elite",
  "title.sensei": "Sensei",
  "title.legend": "Legend",
  "profile.level": "LV {level}",
  "profile.xp": "{into} / {total} XP",
  "profile.toNext": "to next level",
  "profile.empty": "Watch your first episode to get started.",
  "profile.episodes": "Episodes",
  "profile.hours": "Hours watched",
  "profile.completed": "Completed series",
  "profile.avgRating": "Average rating",
  "profile.genres": "Favourite genres",
  "profile.noGenres": "Genres appear once the app has fetched series details.",
  "profile.streak": "Day streak: {days}",
  "profile.activity": "Activity · last 4 weeks",
  "profile.activityCell": "{date}: {count} ep."
```
(Insert before the closing `}`; keep valid JSON — the previous last line needs a trailing comma.)

In `tests/unit/i18n.test.js`, change the nav line of `DYNAMIC` to
```js
  ...['search', 'home', 'watchlist', 'downloads', 'profile', 'settings'].map((p) => `nav.${p}`),
  ...['rookie', 'watcher', 'veteran', 'elite', 'sensei', 'legend'].map((x) => `title.${x}`),
```

- [ ] **Step 2: Extend the fake API**

In `tests/unit/ui/helpers.jsx`, add the import `import { EMPTY_STATS } from '../../../src/shared/stats.js'` and, before `dialog:`, the line:
```js
    stats: { get: vi.fn(async () => ({ ...EMPTY_STATS })), onLevelUp: sub(), onSeriesCompleted: sub() },
```

- [ ] **Step 3: Write the failing tests**

`tests/unit/ui/Profile.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { XpBar } from '../../../src/renderer/components/XpBar.jsx'
import { ProfileCard, initials } from '../../../src/renderer/components/ProfileCard.jsx'
import { ProfilePage } from '../../../src/renderer/pages/ProfilePage.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'

const stats = {
  ...EMPTY_STATS, xp: 3100, level: 11, title: 'veteran', xpIntoLevel: 1240, xpForNext: 1500,
  episodes: 1240, hours: 42, completed: 7, avgRating: 8.5, streakDays: 5,
  topGenres: [{ genre: 'Action', episodes: 40 }, { genre: 'Drama', episodes: 20 }],
  activity: EMPTY_STATS.activity.map((d, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, count: i === 27 ? 4 : 0 })),
}

describe('XpBar', () => {
  it('fills proportionally and clamps', () => {
    const { container, rerender } = renderUi(<XpBar into={50} total={100} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(0.5)')
    rerender(<XpBar into={500} total={100} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(1)')
    rerender(<XpBar into={5} total={0} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(0)')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5')
  })
})

describe('ProfileCard', () => {
  it('makes initials', () => {
    expect(initials('Nikola Lelekovic')).toBe('NL')
    expect(initials('nikola')).toBe('N')
    expect(initials('  ')).toBe('?')
  })
  it('shows level and title and opens the profile', () => {
    const onClick = vi.fn()
    renderUi(<ProfileCard name="Nikola Lelekovic" stats={stats} onClick={onClick} />)
    const card = screen.getByRole('button')
    expect(card).toHaveTextContent('NL')
    expect(card).toHaveTextContent('LV 11')
    expect(card).toHaveTextContent('Veteran')
    fireEvent.click(card)
    expect(onClick).toHaveBeenCalled()
  })
})

describe('ProfilePage', () => {
  it('shows stats formatted for Serbian', () => {
    renderUi(<ProfilePage stats={stats} name="Nikola" lang="sr" />)
    expect(screen.getByRole('heading', { name: 'Nikola' })).toBeInTheDocument()
    expect(screen.getByText('1.240 / 1.500 XP')).toBeInTheDocument()
    expect(screen.getByText('1.240')).toBeInTheDocument()
    expect(screen.getByText('~42')).toBeInTheDocument()
    expect(screen.getByText('8,5')).toBeInTheDocument()
    expect(screen.getByText('Niz dana: 5')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    const cells = screen.getAllByTestId('activity-cell')
    expect(cells).toHaveLength(28)
    expect(cells[27]).toHaveClass('activity-cell--l3')
    expect(cells[0]).toHaveClass('activity-cell--l0')
    expect(screen.queryByText('Odgledaj prvu epizodu da počneš.')).not.toBeInTheDocument()
  })
  it('shows the empty state for a new install', () => {
    renderUi(<ProfilePage stats={EMPTY_STATS} name="Nikola" lang="en" />, { lang: 'en' })
    expect(screen.getByText('Watch your first episode to get started.')).toBeInTheDocument()
    expect(screen.getByText('LV 1 · Rookie')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run tests/unit/ui/Profile.test.jsx tests/unit/i18n.test.js`
Expected: FAIL — modules missing (i18n passes once keys exist).

- [ ] **Step 5: Implement**

`src/renderer/components/XpBar.jsx`:
```jsx
export function XpBar({ into, total }) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, into / total)) : 0
  return (
    <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={into}>
      <div className="xp-bar__fill" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  )
}
```

`src/renderer/components/ProfileCard.jsx`:
```jsx
import { useT } from '../i18n/I18nContext.jsx'
import { XpBar } from './XpBar.jsx'

export function initials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
}

export function ProfileCard({ name, stats, onClick }) {
  const t = useT()
  return (
    <button type="button" className="profile-card" onClick={onClick}>
      <span className="profile-card__avatar">{initials(name)}</span>
      <span className="profile-card__meta">
        <span className="profile-card__level hud">{t('profile.level', { level: stats.level })}</span>
        <span className="profile-card__title">{t(`title.${stats.title}`)}</span>
        <XpBar into={stats.xpIntoLevel} total={stats.xpForNext} />
      </span>
    </button>
  )
}
```

`src/renderer/pages/ProfilePage.jsx`:
```jsx
import { useT } from '../i18n/I18nContext.jsx'
import { XpBar } from '../components/XpBar.jsx'
import { Icon } from '../components/Icon.jsx'
import { initials } from '../components/ProfileCard.jsx'

const activityLevel = (count) => (count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3)

export function ProfilePage({ stats, name, lang }) {
  const t = useT()
  const locale = lang === 'en' ? 'en-US' : 'sr-RS'
  const fmt = (n) => n.toLocaleString(locale)
  const maxGenre = Math.max(1, ...stats.topGenres.map((g) => g.episodes))
  const tiles = [
    ['episodes', fmt(stats.episodes)],
    ['hours', `~${fmt(stats.hours)}`],
    ['completed', fmt(stats.completed)],
    ['avgRating', stats.avgRating == null ? '—' : stats.avgRating.toLocaleString(locale)],
  ]
  return (
    <section className="page">
      <div className="profile-head">
        <span className="avatar--lg">{initials(name)}</span>
        <div className="profile-head__meta">
          <h2>{name}</h2>
          <span className="hud">{t('profile.level', { level: stats.level })} · {t(`title.${stats.title}`)}</span>
          <XpBar into={stats.xpIntoLevel} total={stats.xpForNext} />
          <span className="muted hud">{t('profile.xp', { into: fmt(stats.xpIntoLevel), total: fmt(stats.xpForNext) })}</span>
          <span className="muted">{t('profile.toNext')}</span>
        </div>
      </div>
      {stats.xp === 0 && <p className="notice">{t('profile.empty')}</p>}
      <div className="stat-tiles">
        {tiles.map(([key, value]) => (
          <div key={key} className="stat-tile">
            <div className="stat-tile__value">{value}</div>
            <div className="stat-tile__label">{t(`profile.${key}`)}</div>
          </div>
        ))}
      </div>
      <h3>{t('profile.genres')}</h3>
      {stats.topGenres.length === 0 ? <p className="muted">{t('profile.noGenres')}</p> : (
        <div className="genre-bars">
          {stats.topGenres.map((g) => (
            <div key={g.genre} className="genre-bar">
              <span>{g.genre}</span>
              <div className="genre-bar__track"><div className="genre-bar__fill" style={{ transform: `scaleX(${g.episodes / maxGenre})` }} /></div>
              <span className="hud muted">{g.episodes}</span>
            </div>
          ))}
        </div>
      )}
      <div className="streak"><Icon name="flame" size={20} /><span className="hud">{t('profile.streak', { days: stats.streakDays })}</span></div>
      <h3>{t('profile.activity')}</h3>
      <div className="activity-grid">
        {stats.activity.map((d) => (
          <span key={d.date} data-testid="activity-cell" className={`activity-cell activity-cell--l${activityLevel(d.count)}`} title={t('profile.activityCell', { date: d.date, count: d.count })} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Run to verify pass, then full suite**

Run: `npx vitest run tests/unit/ui/Profile.test.jsx tests/unit/i18n.test.js` → PASS. Run `npx vitest run` → all PASS.

- [ ] **Step 7: Commit**
```bash
git add src/renderer/components/XpBar.jsx src/renderer/components/ProfileCard.jsx src/renderer/pages/ProfilePage.jsx src/renderer/i18n tests/unit/ui/Profile.test.jsx tests/unit/ui/helpers.jsx tests/unit/i18n.test.js
git commit -m "feat: XP bar, profile card and profile page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Sidebar and app shell

**Files:**
- Create: `src/renderer/components/Sidebar.jsx`
- Delete: `src/renderer/components/Header.jsx`
- Modify: `src/renderer/App.jsx`, `tests/unit/ui/components.test.jsx`, `tests/unit/ui/App.test.jsx`
- Test: `tests/unit/ui/Sidebar.test.jsx`

**Interfaces:**
- Consumes: `Semaphore` (v0.1), `ProfileCard`, `ProfilePage` (Task 10), `Icon` (Task 7), `EMPTY_STATS`, `api.stats.get` (Task 6).
- Produces: `<Sidebar page onNavigate health onSemaphoreClick profileName stats />` with pages `home | watchlist | downloads | profile | settings`; App pages renamed: `'search'` → `'home'`, new `'profile'`. App keeps `stats` state (refreshed on mount, on every page change and on `onLibraryChanged`) and `displayName = settings.profileName || settings.systemName`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/ui/Sidebar.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { Sidebar } from '../../../src/renderer/components/Sidebar.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'

const props = (over = {}) => ({ page: 'home', onNavigate: vi.fn(), health: { light: 'green', reason: 'ok' }, onSemaphoreClick: vi.fn(), profileName: 'Nikola', stats: EMPTY_STATS, ...over })

describe('Sidebar', () => {
  it('lists the five pages and marks the active one', () => {
    renderUi(<Sidebar {...props({ page: 'watchlist' })} />)
    for (const name of ['Početna', 'Watchlist', 'Preuzeto', 'Profil', 'Podešavanja']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watchlist' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Početna' })).not.toHaveAttribute('aria-current')
  })
  it('navigates, opens the wizard from the semaphore and the profile from the card', () => {
    const p = props()
    renderUi(<Sidebar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preuzeto' }))
    expect(p.onNavigate).toHaveBeenCalledWith('downloads')
    fireEvent.click(screen.getByRole('button', { name: /Sve radi/ }))
    expect(p.onSemaphoreClick).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /LV 1/ }))
    expect(p.onNavigate).toHaveBeenLastCalledWith('profile')
  })
})
```

In `tests/unit/ui/components.test.jsx` delete the `Header` import line and the whole `describe('Header', …)` block.

Append to `tests/unit/ui/App.test.jsx` (inside the describe):
```jsx
  it('shows the profile card from stats and opens the profile page', async () => {
    const api = makeFakeApi({ stats: { get: vi.fn(async () => ({ ...EMPTY_STATS, level: 11, title: 'veteran', xp: 3000 })) } })
    api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, profileName: null, systemName: 'nikola' })
    render(<App api={api} />)
    const card = await screen.findByRole('button', { name: /LV 11/ })
    expect(card).toHaveTextContent('N')
    fireEvent.click(card)
    expect(await screen.findByRole('heading', { name: 'nikola' })).toBeInTheDocument()
    expect(api.stats.get.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
```
and add to its imports:
```jsx
import { EMPTY_STATS } from '../../../src/shared/stats.js'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/ui/Sidebar.test.jsx tests/unit/ui/App.test.jsx tests/unit/ui/components.test.jsx`
Expected: FAIL — `Sidebar.jsx` missing; App has no profile card.

- [ ] **Step 3: Implement `src/renderer/components/Sidebar.jsx`**

```jsx
import { useT } from '../i18n/I18nContext.jsx'
import { Semaphore } from './Semaphore.jsx'
import { ProfileCard } from './ProfileCard.jsx'
import { Icon } from './Icon.jsx'

const PAGES = ['home', 'watchlist', 'downloads', 'profile', 'settings']

export function Sidebar({ page, onNavigate, health, onSemaphoreClick, profileName, stats }) {
  const t = useT()
  return (
    <aside className="sidebar">
      <div className="sidebar__logo"><span className="sidebar__logo-text">{t('app.name')}</span></div>
      <nav className="sidebar__nav">
        {PAGES.map((p) => (
          <button
            key={p}
            type="button"
            className={p === page ? 'nav-item nav-item--active' : 'nav-item'}
            aria-current={p === page ? 'page' : undefined}
            aria-label={t(`nav.${p}`)}
            onClick={() => onNavigate(p)}
          >
            <Icon name={p} size={20} />
            <span className="nav-item__label">{t(`nav.${p}`)}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar__footer">
        <Semaphore health={health} onClick={onSemaphoreClick} />
        <ProfileCard name={profileName} stats={stats} onClick={() => onNavigate('profile')} />
      </div>
    </aside>
  )
}
```
Then delete `src/renderer/components/Header.jsx` (`git rm src/renderer/components/Header.jsx`).

- [ ] **Step 4: Update `src/renderer/App.jsx`**

- Replace `import { Header } from './components/Header.jsx'` with:
```jsx
import { Sidebar } from './components/Sidebar.jsx'
import { ProfilePage } from './pages/ProfilePage.jsx'
import { EMPTY_STATS } from '../shared/stats.js'
```
- Change `const [page, setPage] = useState('search')` to `useState('home')` and add `const [stats, setStats] = useState(EMPTY_STATS)`.
- After the first `useEffect`, add:
```jsx
  useEffect(() => {
    const refresh = () => api.stats.get().then(setStats)
    refresh()
    return api.onLibraryChanged(refresh)
  }, [api, page])
```
- Change `continueWatching` to set page `'home'`: `const continueWatching = (params) => { setPendingWatch(params); setPage('home') }`.
- Replace everything inside `<I18nProvider …>` up to `{wizardOpen && …}` with:
```jsx
        <div className="app-shell">
          <Sidebar
            page={page}
            onNavigate={setPage}
            health={health}
            onSemaphoreClick={() => setWizardOpen(true)}
            profileName={settings.profileName || settings.systemName}
            stats={stats}
          />
          <main className="content">
            <div key={page} className="page-enter">
              {corrupt && <CorruptBanner />}
              {page === 'home' && (
                <SearchPage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} />
              )}
              {page === 'watchlist' && <WatchlistPage ready={ready} onContinue={continueWatching} />}
              {page === 'downloads' && <DownloadsPage />}
              {page === 'profile' && <ProfilePage stats={stats} name={settings.profileName || settings.systemName} lang={settings.language} />}
              {page === 'settings' && <SettingsPage settings={settings} onSettings={updateSettings} />}
            </div>
          </main>
        </div>
```
(`systemName` is always present from the main process; in tests the fake `settings.get` returns `DEFAULT_SETTINGS` without it, so the name falls back to `undefined` → initials `'?'` — acceptable in tests.)

- [ ] **Step 5: Run to verify pass, then full suite and e2e**

Run: `npx vitest run` → all PASS. Run: `npm run test:e2e` → PASS (wizard still opens).

- [ ] **Step 6: Commit**
```bash
git add -A src/renderer tests/unit/ui
git commit -m "feat: launcher sidebar with semaphore and profile card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Hero banner and Home page

**Files:**
- Create: `src/renderer/components/Hero.jsx`, `src/renderer/pages/HomePage.jsx`, `src/renderer/theme/usePosterTint.js`
- Modify: `src/renderer/components/Poster.jsx` (+ `usePosterInfo`, film icon placeholder), `src/renderer/pages/SearchPage.jsx` (input `id="search-input"`), `src/renderer/pages/WatchlistPage.jsx` (`initialOpenId`), `src/renderer/App.jsx`, i18n files
- Test: `tests/unit/ui/Home.test.jsx`

**Interfaces:**
- Consumes: `nextEpisode` (Task 2), `posterTint` (Task 8), `XpBar` (Task 10), `Icon` (Task 7).
- Produces:
  - `usePosterInfo(title, aniListId = null) → info|null` (skips when `title` is falsy) exported from `Poster.jsx`.
  - `usePosterTint(dataUrl) → '#rrggbb'|null`.
  - `pickHeroEntry(entries) → entry|null` (status `watching` with `lastWatchedAt`, most recent first) and `watchingNow(entries) → entry[]` (status `watching`, most recent first, max 10), exported from `HomePage.jsx`.
  - `<Hero entry ready onContinue onDetails onSearch />`, `<HomePage ready settings onSettings onOpenWizard pendingWatch onPendingHandled onContinue onOpenAnime />`.
  - `<WatchlistPage ready onContinue initialOpenId? />`.

- [ ] **Step 1: Add i18n keys**

`sr.json`:
```json
  "home.continue": "Nastavi gledanje",
  "home.continueEp": "Nastavi EP {episode}",
  "home.details": "Detalji",
  "home.welcome": "Šta gledamo danas?",
  "home.welcomeSub": "Pretraži anime i kreni sa gledanjem.",
  "home.searchCta": "Pretraži",
  "home.watchingNow": "Gledam sada",
  "home.episodeOf": "EP {watched} / {total}"
```
`en.json`:
```json
  "home.continue": "Continue watching",
  "home.continueEp": "Continue EP {episode}",
  "home.details": "Details",
  "home.welcome": "What are we watching today?",
  "home.welcomeSub": "Search for an anime and start watching.",
  "home.searchCta": "Search",
  "home.watchingNow": "Watching now",
  "home.episodeOf": "EP {watched} / {total}"
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/ui/Home.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { Hero } from '../../../src/renderer/components/Hero.jsx'
import { HomePage, pickHeroEntry, watchingNow } from '../../../src/renderer/pages/HomePage.jsx'
import { WatchlistPage } from '../../../src/renderer/pages/WatchlistPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const entry = (over = {}) => ({ id: 'a', title: 'Show', aniCliTitle: 'Show', aniListId: null, status: 'watching', rating: null, comment: '', totalEpisodes: 12, watchedEpisodes: [1, 2], episodeNotes: {}, lastWatchedAt: '2026-10-01T10:00:00Z', ...over })

describe('home helpers', () => {
  it('picks the most recently watched series', () => {
    const list = [entry({ id: 'a', lastWatchedAt: '2026-09-01T00:00:00Z' }), entry({ id: 'b' }), entry({ id: 'c', status: 'completed', lastWatchedAt: '2026-10-05T00:00:00Z' }), entry({ id: 'd', lastWatchedAt: null })]
    expect(pickHeroEntry(list).id).toBe('b')
    expect(pickHeroEntry([entry({ status: 'planned' })])).toBeNull()
    expect(watchingNow(list).map((e) => e.id)).toEqual(['b', 'a', 'd'])
    expect(watchingNow(Array.from({ length: 14 }, (_, i) => entry({ id: `x${i}` })))).toHaveLength(10)
  })
})

describe('Hero', () => {
  it('continues with the next episode when ready', () => {
    const onContinue = vi.fn()
    const onDetails = vi.fn()
    const { rerender } = renderUi(<Hero entry={entry()} ready={false} onContinue={onContinue} onDetails={onDetails} onSearch={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Show' })).toBeInTheDocument()
    expect(screen.getByText('EP 2 / 12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nastavi EP 3/ })).toBeDisabled()
    rerender(<Hero entry={entry()} ready onContinue={onContinue} onDetails={onDetails} onSearch={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Nastavi EP 3/ }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '3' })
    fireEvent.click(screen.getByRole('button', { name: /Detalji/ }))
    expect(onDetails).toHaveBeenCalledWith('a')
  })
  it('welcomes a new user and focuses search', () => {
    const onSearch = vi.fn()
    renderUi(<Hero entry={null} ready onContinue={() => {}} onDetails={() => {}} onSearch={onSearch} />)
    expect(screen.getByRole('heading', { name: 'Šta gledamo danas?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pretraži/ }))
    expect(onSearch).toHaveBeenCalled()
  })
})

describe('HomePage', () => {
  it('shows hero, the watching-now rail and the search', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry(), entry({ id: 'b', title: 'Other', aniCliTitle: 'Other', lastWatchedAt: '2026-09-01T00:00:00Z' })]) } })
    const onOpenAnime = vi.fn()
    renderUi(<HomePage ready settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} onOpenWizard={() => {}} pendingWatch={null} onPendingHandled={() => {}} onContinue={() => {}} onOpenAnime={onOpenAnime} />, { api })
    expect(await screen.findByRole('heading', { name: 'Show' })).toBeInTheDocument()
    const rail = screen.getByRole('region', { name: 'Gledam sada' })
    fireEvent.click(rail.querySelectorAll('button.card')[1])
    expect(onOpenAnime).toHaveBeenCalledWith('b')
    expect(screen.getByRole('button', { name: 'Traži' })).toBeInTheDocument()
  })
})

describe('WatchlistPage initialOpenId', () => {
  it('opens the requested series directly', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry()]) } })
    renderUi(<WatchlistPage ready onContinue={() => {}} initialOpenId="a" />, { api })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nazad' })).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/ui/Home.test.jsx` → FAIL (modules missing).

- [ ] **Step 4: Implement**

`src/renderer/theme/usePosterTint.js`:
```js
import { useEffect, useState } from 'react'
import { posterTint } from './posterTint.js'

export function usePosterTint(dataUrl) {
  const [tint, setTint] = useState(null)
  useEffect(() => {
    let live = true
    setTint(null)
    if (dataUrl) posterTint(dataUrl).then((value) => { if (live) setTint(value) })
    return () => { live = false }
  }, [dataUrl])
  return tint
}
```

Replace `src/renderer/components/Poster.jsx` with:
```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { Icon } from './Icon.jsx'

export function usePosterInfo(title, aniListId = null) {
  const api = useApi()
  const [info, setInfo] = useState(null)
  useEffect(() => {
    let live = true
    setInfo(null)
    if (title) api.anilist.forTitle(title, aniListId).then((value) => { if (live) setInfo(value ?? null) }).catch(() => {})
    return () => { live = false }
  }, [api, title, aniListId])
  return info
}

export function Poster({ title, aniListId = null }) {
  const info = usePosterInfo(title, aniListId)
  return info?.poster
    ? <img className="poster" src={info.poster} alt="" />
    : <div className="poster poster--empty" aria-hidden="true"><Icon name="film" size={28} /></div>
}
```

`src/renderer/components/Hero.jsx`:
```jsx
import { useT } from '../i18n/I18nContext.jsx'
import { usePosterInfo } from './Poster.jsx'
import { usePosterTint } from '../theme/usePosterTint.js'
import { XpBar } from './XpBar.jsx'
import { Icon } from './Icon.jsx'
import { nextEpisode } from '../../shared/domain.js'

export function Hero({ entry, ready, onContinue, onDetails, onSearch }) {
  const t = useT()
  const info = usePosterInfo(entry?.title ?? null, entry?.aniListId ?? null)
  const tint = usePosterTint(info?.poster ?? null)

  if (!entry) {
    return (
      <section className="hero hero--welcome">
        <div className="hero__body">
          <div className="hero__text">
            <h1 className="hero__title">{t('home.welcome')}</h1>
            <p className="muted">{t('home.welcomeSub')}</p>
            <div className="row">
              <button type="button" className="primary" onClick={onSearch}><Icon name="search" /> {t('home.searchCta')}</button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const key = entry.aniCliTitle ?? entry.title
  const next = nextEpisode(entry)
  const watched = entry.watchedEpisodes.length
  return (
    <section className="hero" style={tint ? { '--poster-tint': tint } : undefined}>
      {info?.poster && <div className="hero__bg" style={{ backgroundImage: `url(${info.poster})` }} />}
      <div className="hero__body">
        <div className="hero__text">
          <span className="hero__label hud">{t('home.continue')}</span>
          <h1 className="hero__title">{entry.title}</h1>
          <span className="hud muted">{t('home.episodeOf', { watched, total: entry.totalEpisodes ?? '?' })}</span>
          {entry.totalEpisodes ? <XpBar into={watched} total={entry.totalEpisodes} /> : null}
          <div className="row">
            <button type="button" className="primary" disabled={!ready} onClick={() => onContinue({ query: key, anime: key, episode: String(next) })}>
              <Icon name="play" /> {t('home.continueEp', { episode: next })}
            </button>
            <button type="button" onClick={() => onDetails(entry.id)}><Icon name="info" /> {t('home.details')}</button>
          </div>
        </div>
        {info?.poster && <img className="hero__poster" src={info.poster} alt="" />}
      </div>
    </section>
  )
}
```

`src/renderer/pages/HomePage.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Hero } from '../components/Hero.jsx'
import { Poster } from '../components/Poster.jsx'
import { SearchPage } from './SearchPage.jsx'

const byRecent = (a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? ''))

export const pickHeroEntry = (entries) => entries.filter((e) => e.status === 'watching' && e.lastWatchedAt).sort(byRecent)[0] ?? null
export const watchingNow = (entries) => entries.filter((e) => e.status === 'watching').sort(byRecent).slice(0, 10)

export function HomePage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled, onContinue, onOpenAnime }) {
  const api = useApi()
  const t = useT()
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const load = () => api.library.list().then(setEntries)
    load()
    return api.onLibraryChanged(load)
  }, [api])

  const rail = watchingNow(entries)
  return (
    <div className="page">
      <Hero entry={pickHeroEntry(entries)} ready={ready} onContinue={onContinue} onDetails={onOpenAnime} onSearch={() => document.getElementById('search-input')?.focus()} />
      {rail.length > 0 && (
        <section className="rail" aria-label={t('home.watchingNow')}>
          <h3 className="hud">{t('home.watchingNow')}</h3>
          <div className="rail__track">
            {rail.map((e) => (
              <button key={e.id} type="button" className="card" onClick={() => onOpenAnime(e.id)}>
                <Poster title={e.title} aniListId={e.aniListId} />
                <span className="card__title">{e.title}</span>
                <span className="card__meta">{t('home.episodeOf', { watched: e.watchedEpisodes.length, total: e.totalEpisodes ?? '?' })}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <SearchPage ready={ready} settings={settings} onSettings={onSettings} onOpenWizard={onOpenWizard} pendingWatch={pendingWatch} onPendingHandled={onPendingHandled} />
    </div>
  )
}
```

In `src/renderer/pages/SearchPage.jsx`, add `id="search-input"` to the search `<input …>`.

In `src/renderer/pages/WatchlistPage.jsx`, change the signature to `export function WatchlistPage({ ready, onContinue, initialOpenId = null })` and `const [openId, setOpenId] = useState(null)` to `useState(initialOpenId)`.

In `src/renderer/App.jsx`:
- add `import { HomePage } from './pages/HomePage.jsx'` (remove the now-unused `SearchPage` import);
- add `const [openAnimeId, setOpenAnimeId] = useState(null)`;
- define `const navigate = (p) => { setOpenAnimeId(null); setPage(p) }` and `const openAnime = (id) => { setOpenAnimeId(id); setPage('watchlist') }`; pass `onNavigate={navigate}` to `Sidebar`;
- replace the `page === 'home'` branch with:
```jsx
              {page === 'home' && (
                <HomePage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} onContinue={continueWatching} onOpenAnime={openAnime} />
              )}
```
- change the watchlist branch to `<WatchlistPage ready={ready} onContinue={continueWatching} initialOpenId={openAnimeId} />`.

- [ ] **Step 5: Run to verify pass, then full suite**

Run: `npx vitest run tests/unit/ui/Home.test.jsx` → PASS. Run: `npx vitest run` → all PASS.

- [ ] **Step 6: Commit**
```bash
git add -A src/renderer tests/unit/ui
git commit -m "feat: home page with continue-watching hero and watching-now rail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Level-up overlay, toasts and sounds in the app

**Files:**
- Create: `src/renderer/components/LevelUpOverlay.jsx`, `src/renderer/components/Toast.jsx`
- Modify: `src/renderer/App.jsx`, i18n files
- Test: `tests/unit/ui/Celebrations.test.jsx`

**Interfaces:**
- Consumes: `createSound` (Task 9), `api.stats.onLevelUp / onSeriesCompleted` (Task 6), `api.downloads.onChange` (v0.1), `XpBar` (Task 10).
- Produces:
  - `<LevelUpOverlay level title onDone ms=2000 />` — `role="dialog"`, closes on timeout, click or Escape.
  - `<Toast onDone ms=3000 icon?>{children}</Toast>` — `role="status"`.
  - `App({ api, sound })` — `sound` is injectable for tests (defaults to `createSound`). Plays `levelUp`, `seriesCompleted`, `downloadDone` (when a queue item newly reaches `done`), `navigate` (page change) and `click` (any button click; silent unless `soundUi`). The shell gets class `reduce-motion` when `settings.animations === false` or the OS asks for reduced motion; then a level-up is shown as a toast.

- [ ] **Step 1: Add i18n keys**

`sr.json`: `"levelup.title": "LEVEL UP"`, `"toast.levelUp": "LEVEL UP · LV {level} · {title}"`, `"toast.completed": "ZAVRŠENO · {title} · +{xp} XP"`.
`en.json`: `"levelup.title": "LEVEL UP"`, `"toast.levelUp": "LEVEL UP · LV {level} · {title}"`, `"toast.completed": "COMPLETED · {title} · +{xp} XP"`.

- [ ] **Step 2: Write the failing tests**

`tests/unit/ui/Celebrations.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { LevelUpOverlay } from '../../../src/renderer/components/LevelUpOverlay.jsx'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

function setup(settings = {}) {
  const handlers = {}
  const capture = (name) => vi.fn((cb) => { handlers[name] = cb; return () => {} })
  const api = makeFakeApi({
    stats: { onLevelUp: capture('levelUp'), onSeriesCompleted: capture('completed') },
    downloads: { onChange: capture('downloads') },
  })
  api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings })
  const sound = { play: vi.fn(() => true) }
  render(<App api={api} sound={sound} />)
  return { api, sound, handlers }
}
afterEach(() => vi.useRealTimers())

describe('LevelUpOverlay', () => {
  it('closes after the timeout and on Escape', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    renderUi(<LevelUpOverlay level={11} title="veteran" onDone={onDone} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('LEVEL UP')
    expect(screen.getByRole('dialog')).toHaveTextContent('LV 11 · Veteran')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDone).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(2000))
    expect(onDone).toHaveBeenCalledTimes(2)
  })
})

describe('App celebrations', () => {
  it('shows the level-up overlay with sound and closes it on click', async () => {
    const { sound, handlers, api } = setup()
    await waitFor(() => expect(handlers.levelUp).toBeDefined())
    act(() => handlers.levelUp({ level: 11, title: 'veteran' }))
    expect(sound.play).toHaveBeenCalledWith('levelUp')
    const dialog = screen.getByRole('dialog', { name: 'LEVEL UP' })
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog', { name: 'LEVEL UP' })).not.toBeInTheDocument()
    expect(api.stats.get.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
  it('uses a toast instead of the overlay when animations are off', async () => {
    const { handlers } = setup({ animations: false })
    await waitFor(() => expect(handlers.levelUp).toBeDefined())
    act(() => handlers.levelUp({ level: 11, title: 'veteran' }))
    expect(screen.queryByRole('dialog', { name: 'LEVEL UP' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('LEVEL UP · LV 11 · Veteran')
    expect(document.querySelector('.app-shell')).toHaveClass('reduce-motion')
  })
  it('announces a completed series', async () => {
    const { sound, handlers } = setup()
    await waitFor(() => expect(handlers.completed).toBeDefined())
    act(() => handlers.completed({ title: 'Show', xp: 50 }))
    expect(sound.play).toHaveBeenCalledWith('seriesCompleted')
    expect(screen.getByRole('status')).toHaveTextContent('ZAVRŠENO · Show · +50 XP')
  })
  it('plays the download sound once per finished item', async () => {
    const { sound, handlers } = setup()
    await waitFor(() => expect(handlers.downloads).toBeDefined())
    act(() => handlers.downloads([{ id: 'd1', status: 'downloading' }]))
    act(() => handlers.downloads([{ id: 'd1', status: 'done' }]))
    act(() => handlers.downloads([{ id: 'd1', status: 'done' }, { id: 'd2', status: 'queued' }]))
    expect(sound.play.mock.calls.filter((c) => c[0] === 'downloadDone')).toHaveLength(1)
  })
  it('plays the navigate sound on page change', async () => {
    const { sound } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Preuzeto' }))
    expect(sound.play).toHaveBeenCalledWith('navigate')
    expect(sound.play).toHaveBeenCalledWith('click')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/ui/Celebrations.test.jsx` → FAIL (modules missing / no overlay).

- [ ] **Step 4: Implement the components**

`src/renderer/components/LevelUpOverlay.jsx`:
```jsx
import { useEffect } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

export function LevelUpOverlay({ level, title, onDone, ms = 2000 }) {
  const t = useT()
  useEffect(() => {
    const timer = setTimeout(onDone, ms)
    const onKey = (e) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey) }
  }, [])
  return (
    <div className="levelup" role="dialog" aria-label={t('levelup.title')} onClick={onDone}>
      <div className="levelup__beam" />
      <div className="levelup__text">
        <span className="levelup__title">{t('levelup.title')}</span>
        <span className="hud">{t('profile.level', { level })} · {t(`title.${title}`)}</span>
      </div>
    </div>
  )
}
```

`src/renderer/components/Toast.jsx`:
```jsx
import { useEffect } from 'react'
import { Icon } from './Icon.jsx'

export function Toast({ children, onDone, ms = 3000, icon = 'check' }) {
  useEffect(() => {
    const timer = setTimeout(onDone, ms)
    return () => clearTimeout(timer)
  }, [children])
  return (
    <div className="toast" role="status">
      <Icon name={icon} />
      <span className="hud">{children}</span>
    </div>
  )
}
```

- [ ] **Step 5: Wire `src/renderer/App.jsx`**

- Imports: change the React import to `import { useEffect, useMemo, useRef, useState } from 'react'` and add:
```jsx
import { LevelUpOverlay } from './components/LevelUpOverlay.jsx'
import { Toast } from './components/Toast.jsx'
import { createSound } from './sound.js'
```
- Add, above `export default function App`:
```jsx
const SILENT = { soundKey: false, soundUi: false, soundVolume: 0 }

function Celebrations({ levelUp, toast, motionOff, onLevelUpDone, onToastDone }) {
  const t = useT()
  return (
    <>
      {levelUp && !motionOff && <LevelUpOverlay level={levelUp.level} title={levelUp.title} onDone={onLevelUpDone} />}
      {levelUp && motionOff && (
        <Toast onDone={onLevelUpDone} icon="flame">{t('toast.levelUp', { level: levelUp.level, title: t(`title.${levelUp.title}`) })}</Toast>
      )}
      {!levelUp && toast && <Toast onDone={onToastDone}>{t('toast.completed', { title: toast.title, xp: toast.xp })}</Toast>}
    </>
  )
}
```
- Change the signature to `export default function App({ api, sound: injectedSound })` and add at the top of the body:
```jsx
  const settingsRef = useRef(null)
  const sound = useMemo(() => injectedSound ?? createSound({ getSettings: () => settingsRef.current ?? SILENT }), [injectedSound])
  const doneIds = useRef(new Set())
  const [levelUp, setLevelUp] = useState(null)
  const [toast, setToast] = useState(null)
```
- After the existing effects add:
```jsx
  useEffect(() => {
    const refresh = () => api.stats.get().then(setStats)
    const offs = [
      api.stats.onLevelUp((p) => { sound.play('levelUp'); setLevelUp(p); refresh() }),
      api.stats.onSeriesCompleted((p) => { sound.play('seriesCompleted'); setToast(p); refresh() }),
      api.downloads.onChange((queue) => {
        const done = queue.filter((i) => i.status === 'done').map((i) => i.id)
        if (done.some((id) => !doneIds.current.has(id))) sound.play('downloadDone')
        doneIds.current = new Set(done)
      }),
    ]
    const onClick = (e) => { if (e.target.closest?.('button')) sound.play('click') }
    document.addEventListener('click', onClick, true)
    return () => { offs.forEach((off) => off()); document.removeEventListener('click', onClick, true) }
  }, [api, sound])
```
- After `if (!settings) return null` add:
```jsx
  settingsRef.current = settings
  const motionOff = !settings.animations || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
```
- Change `navigate` to play the sound: `const navigate = (p) => { if (p !== page) sound.play('navigate'); setOpenAnimeId(null); setPage(p) }`.
- Change `<div className="app-shell">` to `<div className={motionOff ? 'app-shell reduce-motion' : 'app-shell'}>`.
- After `{ask && <AskDialog … />}` add:
```jsx
        <Celebrations levelUp={levelUp} toast={toast} motionOff={motionOff} onLevelUpDone={() => setLevelUp(null)} onToastDone={() => setToast(null)} />
```

- [ ] **Step 6: Run to verify pass, then full suite**

Run: `npx vitest run tests/unit/ui/Celebrations.test.jsx` → PASS. Run: `npx vitest run` → all PASS.

- [ ] **Step 7: Commit**
```bash
git add -A src/renderer tests/unit/ui/Celebrations.test.jsx
git commit -m "feat: level-up overlay, toasts and sounds for key moments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Series banner and new settings section

**Files:**
- Modify: `src/renderer/pages/AnimeDetail.jsx`, `src/renderer/pages/SettingsPage.jsx`, `src/renderer/App.jsx`, i18n files, `tests/unit/ui/Watchlist.test.jsx`, `tests/unit/ui/SettingsPage.test.jsx`

**Interfaces:**
- Consumes: `usePosterTint` (Task 12), `Icon` (Task 7), `sound` in App (Task 13).
- Produces: `<SettingsPage settings onSettings onTestSound? />`; AnimeDetail shows a `.banner` with the blurred poster and tint.

- [ ] **Step 1: Add i18n keys**

`sr.json`:
```json
  "settings.profileSection": "Profil i zvuk",
  "settings.profileName": "Ime na profilu",
  "settings.soundKey": "Ključni zvuci (level up, završena serija, preuzimanje)",
  "settings.soundUi": "Zvuci interfejsa (klikovi, prelazi)",
  "settings.soundVolume": "Jačina zvuka",
  "settings.soundTest": "Probaj",
  "settings.animations": "Animacije"
```
`en.json`:
```json
  "settings.profileSection": "Profile & sound",
  "settings.profileName": "Profile name",
  "settings.soundKey": "Key sounds (level up, completed series, download)",
  "settings.soundUi": "Interface sounds (clicks, transitions)",
  "settings.soundVolume": "Volume",
  "settings.soundTest": "Test",
  "settings.animations": "Animations"
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/ui/SettingsPage.test.jsx` (inside the describe):
```jsx
  it('edits profile name, sounds and animations', async () => {
    const onSettings = vi.fn()
    const onTestSound = vi.fn()
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS, systemName: 'nikola' }} onSettings={onSettings} onTestSound={onTestSound} />)
    const name = screen.getByLabelText('Ime na profilu')
    expect(name).toHaveAttribute('placeholder', 'nikola')
    fireEvent.change(name, { target: { value: '  Nikola L  ' } })
    fireEvent.blur(name)
    expect(onSettings).toHaveBeenLastCalledWith({ profileName: 'Nikola L' })
    fireEvent.click(screen.getByLabelText('Ključni zvuci (level up, završena serija, preuzimanje)'))
    expect(onSettings).toHaveBeenLastCalledWith({ soundKey: false })
    fireEvent.click(screen.getByLabelText('Zvuci interfejsa (klikovi, prelazi)'))
    expect(onSettings).toHaveBeenLastCalledWith({ soundUi: true })
    fireEvent.change(screen.getByLabelText('Jačina zvuka'), { target: { value: '25' } })
    expect(onSettings).toHaveBeenLastCalledWith({ soundVolume: 25 })
    fireEvent.click(screen.getByLabelText('Animacije'))
    expect(onSettings).toHaveBeenLastCalledWith({ animations: false })
    fireEvent.click(screen.getByRole('button', { name: /Probaj/ }))
    expect(onTestSound).toHaveBeenCalled()
  })
  it('clears the profile name back to the Windows name', () => {
    const onSettings = vi.fn()
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS, profileName: 'Nikola' }} onSettings={onSettings} />)
    const name = screen.getByLabelText('Ime na profilu')
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.blur(name)
    expect(onSettings).toHaveBeenLastCalledWith({ profileName: null })
  })
```

Append to `describe('AnimeDetail', …)` in `tests/unit/ui/Watchlist.test.jsx`:
```jsx
  it('shows a banner with the blurred poster', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ ...info, poster: 'data:image/png;base64,AA' })) } })
    const { container } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => expect(container.querySelector('.banner .hero__bg')).not.toBeNull())
    expect(container.querySelector('.banner .hero__bg').style.backgroundImage).toContain('data:image/png;base64,AA')
    expect(within(container.querySelector('.banner')).getByRole('heading', { name: 'Frieren' })).toBeInTheDocument()
  })
```
and add `within` to that file's `@testing-library/react` import.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/ui/SettingsPage.test.jsx tests/unit/ui/Watchlist.test.jsx` → FAIL (no such fields / no banner).

- [ ] **Step 4: Implement the banner in `AnimeDetail.jsx`**

- Add imports: `import { usePosterTint } from '../theme/usePosterTint.js'`.
- After the `info` state line add: `const tint = usePosterTint(info?.poster ?? null)`.
- Replace:
```jsx
      <div className="detail">
        <Poster title={entry.title} aniListId={entry.aniListId} />
        <div className="page">
          <h2>{entry.title}</h2>
```
with:
```jsx
      <div className="banner" style={tint ? { '--poster-tint': tint } : undefined}>
        {info?.poster && <div className="hero__bg" style={{ backgroundImage: `url(${info.poster})` }} />}
        <div className="banner__body">
          <Poster title={entry.title} aniListId={entry.aniListId} />
          <h2>{entry.title}</h2>
        </div>
      </div>
      <div className="detail">
        <div className="page">
```
(The closing `</div>` tags after this block stay as they are — the structure count is unchanged.)

- [ ] **Step 5: Implement the settings section in `SettingsPage.jsx`**

- Add `import { Icon } from '../components/Icon.jsx'`.
- Change the signature to `export function SettingsPage({ settings, onSettings, onTestSound = () => {} })` and add `const [name, setName] = useState(settings.profileName ?? '')`.
- Insert before `<h3>{t('settings.tools')}</h3>`:
```jsx
      <h3>{t('settings.profileSection')}</h3>
      <label className="field">
        <span>{t('settings.profileName')}</span>
        <input
          aria-label={t('settings.profileName')}
          placeholder={settings.systemName ?? ''}
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const v = name.trim(); if (v !== (settings.profileName ?? '')) onSettings({ profileName: v || null }) }}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.soundKey} onChange={(e) => onSettings({ soundKey: e.target.checked })} />
        {t('settings.soundKey')}
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.soundUi} onChange={(e) => onSettings({ soundUi: e.target.checked })} />
        {t('settings.soundUi')}
      </label>
      <div className="row">
        <label className="field">
          <span>{t('settings.soundVolume')}</span>
          <input type="range" min="0" max="100" aria-label={t('settings.soundVolume')} value={settings.soundVolume} onChange={(e) => onSettings({ soundVolume: Number(e.target.value) })} />
        </label>
        <button type="button" onClick={onTestSound}><Icon name="volume" /> {t('settings.soundTest')}</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.animations} onChange={(e) => onSettings({ animations: e.target.checked })} />
        {t('settings.animations')}
      </label>
```
- In `App.jsx`, pass `onTestSound={() => sound.play('levelUp')}` to `SettingsPage`.

- [ ] **Step 6: Run to verify pass, then full suite**

Run: `npx vitest run tests/unit/ui/SettingsPage.test.jsx tests/unit/ui/Watchlist.test.jsx` → PASS. Run: `npx vitest run` → all PASS.

- [ ] **Step 7: Commit**
```bash
git add -A src/renderer tests/unit/ui
git commit -m "feat: series banner and profile/sound/animation settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Final verification

**Files:** none new (fixes only if something fails).

- [ ] **Step 1: Full suite and i18n coverage**

Run: `npx vitest run`
Expected: all PASS, including `tests/unit/i18nKeys.test.js` (every literal key exists in sr and en) and `tests/unit/styles.test.js`.

- [ ] **Step 2: Build, smoke and live tests**

Run: `npm run test:e2e` → 1 passed (wizard visible in the new shell).
Run: `npm run test:live` → PASS (real ani-cli still returns a link).

- [ ] **Step 3: Drive the real app**

With the real `%APPDATA%\AnimeDesk` (tools installed), use Playwright `_electron` to: wait for the semaphore to turn green; check the sidebar has 5 nav items and the profile card shows `LV`; open Profil and check 28 activity cells; open Podešavanja and toggle "Animacije" off and on; on Početna search a title and reach the episode grid; cancel. Report each check's result; do not open or read screenshots.

- [ ] **Step 4: Commit any fixes** (each with its own failing test first), then stop for the final review.

---

## Spec coverage

| Spec section | Task |
|---|---|
| §2.2 tokens, §2.3 fonts, §2.4 icons | 7 |
| §2.5 poster tint | 8, 12, 14 |
| §3.1 sidebar, semaphore, profile card | 10, 11 |
| §3.2 Home (hero, watching now, search) | 12 |
| §3.3 Watchlist / series page | 12 (initialOpenId), 14 (banner) |
| §3.5 Profile page | 10 |
| §4.1 watch log | 3, 6 |
| §4.2 profile.json | 5 |
| §4.3 AniList duration / getCached | 4 |
| §4.4 settings | 1, 14 |
| §5 stats, levels, titles | 2 |
| §5.1 events | 5, 6, 13 |
| §6.1 sounds | 9, 13 |
| §6.2 animations, reduced motion | 7, 13 |
| §6.3 settings UI | 14 |
| §7 i18n | 10, 12, 13, 14 (+ existing coverage test) |
| §9 testing | every task, 15 |
