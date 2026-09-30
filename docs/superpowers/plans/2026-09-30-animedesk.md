# AnimeDesk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows desktop app (Electron) that is a GUI for the original ani-cli script, with a personal watchlist (status, rating, comment, per-episode notes), download queue and a self-installing/self-healing tool setup.

**Architecture:** Electron main process holds small single-purpose modules (tool manager, ani-cli bridge, player monitor, downloads, library, AniList, health check). ani-cli is driven only through its official env vars `ANI_CLI_MENU` / `ANI_CLI_PLAYER`, pointing at two tiny shell "bridges" that talk to the app over a token-protected localhost HTTP server. React renderer talks to main through a typed preload API.

**Tech Stack:** Electron ^44, electron-vite ^5 (requires vite ^7), vite ^7.3, React ^19, @vitejs/plugin-react ^5.2, Vitest ^5, jsdom, @testing-library/react, Playwright, electron-builder ^26, extract-zip ^2. Node 24. JavaScript (no TypeScript).

**Spec:** `docs/superpowers/specs/2026-09-30-animedesk-design.md`

## Global Constraints

- Platform: Windows only (v1). Paths handed to bash must be converted with `toMsysPath`.
- Package is NOT `"type": "module"`; source uses ESM syntax and is bundled by electron-vite; config files use `.mjs`.
- User data dir: `%APPDATA%/AnimeDesk` (override with env `ANIMEDESK_USER_DATA`, used by tests).
- ani-cli is never modified or re-implemented; only env vars `ANI_CLI_MENU`, `ANI_CLI_PLAYER`, `ANI_CLI_NO_DETACH=1`, `ANI_CLI_EXIT_AFTER_PLAY=1`, `ANI_CLI_DOWNLOAD_DIR`, `ANI_CLI_QUALITY`, `ANI_CLI_MODE`, `ANI_CLI_HIST_DIR`, `ANI_CLI_LOG=0` and CLI flags `-S`, `-e`.
- Player bridge file name MUST contain `mpv` (`animedesk-mpv-bridge.sh`) — ani-cli picks the mpv code path by name.
- All `.sh` files must have LF line endings (`.gitattributes`).
- No-spoiler rule: AniList description hidden until the user clicks "Prikaži opis"; episodes shown only by number, never by episode title.
- UI languages: `sr` (default) and `en`; every UI string goes through `t('key')`; both dictionaries have identical keys.
- Settings defaults: language `sr`, autoTrack `true`, watchedThreshold `85` (clamped 50–100), askOnClose `false`, downloadDir `null`, quality `best`, mode `sub`, autoUpdateTools `true`.
- Rating: integer 1–10 or `null`. Statuses: `watching | completed | planned | paused | dropped`.
- JSON files written atomically (write `.tmp`, then rename); corrupt file → renamed to `<name>.corrupt-<timestamp>.json`, start fresh, user notified.
- Health check self-test: `ani-cli -S 1 -e 1 one piece` with `ANI_CLI_PLAYER=debug`, 30 s timeout; re-check every 6 h while state is `source-down`; daily auto-update check of ani-cli and yt-dlp when enabled.
- Git identity for commits in this repo: `leqora <dzonzi777@gmail.com>` (already configured locally). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **CRLF in bridge scripts** — a Windows checkout with `core.autocrlf` turns `.sh` files into CRLF and bash fails with `$'\r': command not found`; expected: scripts always LF. Pinned by the "no CR in shell scripts" test in Task 6.
2. **Paths with spaces / non-ASCII** (e.g. download folder `D:\Moji anime\Šou`) — expected: download lands in exactly that folder. Pinned by the download integration test in Task 7 (temp dir containing a space and `š`).
3. **Anime titles with characters illegal in Windows folder names** (`Re:Zero`, `Fate/stay night`) — expected: a valid series folder is created. Pinned by `safeDirName` tests in Task 1 and the downloads folder test in Task 9.
4. **Pausing a download leaves yt-dlp running** (killing bash does not kill grandchildren on Windows) — expected: pause stops all writing. Pinned by the process-tree kill test in Task 5.
5. **Windows env key is `Path`, not `PATH`** — spreading `process.env` and adding `PATH` yields two keys and the child may see the wrong one, so tools are "not found". Pinned by the `buildEnv` test in Task 7.

---

## File Map

```
package.json, electron.vite.config.mjs, vitest.config.mjs, vitest.live.config.mjs,
playwright.config.mjs, electron-builder.yml, .gitignore, .gitattributes, README.md
resources/bridges/menu-bridge.sh            ani-cli menu → app (HTTP)
resources/bridges/animedesk-mpv-bridge.sh   ani-cli player → app (HTTP)
src/shared/domain.js      STATUSES, TOOL_IDS, normalizeTitle, animeLineTitle
src/shared/channels.js    IPC channel names (INVOKE, EVENTS)
src/main/paths.js         createPaths, toMsysPath, safeDirName
src/main/jsonStore.js     readJson, writeJsonAtomic
src/main/settings.js      DEFAULT_SETTINGS, sanitizeSettings, createSettings
src/main/library.js       createLibrary (watchlist)
src/main/run.js           run (spawn + line output + tree kill)
src/main/http.js          getJson, download, isOnline
src/main/toolSources.js   SOURCES, AUTO_UPDATE_TOOLS, resolveDownload, systemBashCandidates
src/main/toolManager.js   createToolManager, findSystemBash, findFile
src/main/bridgeServer.js  createBridgeServer
src/main/aniCliBridge.js  createAniCliBridge, buildEnv, mapError, autoAnswer, parsePlayerArgs…
src/main/playerMonitor.js decideWatched, createPercentTracker, createPlayer
src/main/watchService.js  createWatchService
src/main/downloads.js     createDownloads, parseProgress
src/main/anilist.js       createAniList, bestMatch, cleanDescription
src/main/healthCheck.js   createHealthCheck, healthState, shouldDailyCheck
src/main/ipc.js           createHandlers, registerIpc
src/main/index.js         Electron entry, wiring
src/preload/index.js      window.animedesk API
src/renderer/index.html, main.jsx, App.jsx, api.js, styles.css
src/renderer/i18n/        index.js, I18nContext.jsx, sr.json, en.json
src/renderer/components/  Semaphore, Header, ReadyNotice, Poster, ConfirmButton, AskDialog
src/renderer/pages/       SetupWizard, SearchPage, WatchlistPage, AnimeDetail, DownloadsPage, SettingsPage
tests/setup.js, tests/helpers/bash.js, tests/fixtures/fake-ani-cli.sh
tests/unit/*.test.js, tests/unit/ui/*.test.jsx, tests/integration/*.test.js, tests/live/, tests/e2e/
```

---

### Task 1: Project scaffold, shared domain, paths, JSON store

**Files:**
- Create: `package.json`, `.gitignore`, `.gitattributes`, `electron.vite.config.mjs`, `vitest.config.mjs`, `tests/setup.js`
- Create: `src/shared/domain.js`, `src/main/paths.js`, `src/main/jsonStore.js`
- Test: `tests/unit/paths.test.js`, `tests/unit/jsonStore.test.js`, `tests/unit/domain.test.js`

**Interfaces:**
- Produces: `STATUSES: string[]`, `TOOL_IDS: string[]`, `normalizeTitle(t): string`, `animeLineTitle(line): string` (domain.js); `createPaths(baseDir) → {base, tools, manifest, cache, aniCliHistory, library, settings, downloads}`, `toMsysPath(p): string`, `safeDirName(name): string` (paths.js); `readJson(file, fallback) → {data, corrupt, backup?}`, `writeJsonAtomic(file, data): void` (jsonStore.js).

- [ ] **Step 1: Create package.json and install dependencies**

`package.json`:
```json
{
  "name": "animedesk",
  "productName": "AnimeDesk",
  "version": "0.1.0",
  "description": "Desktop GUI for ani-cli with a personal anime watchlist",
  "main": "./out/main/index.js",
  "author": "leqora <dzonzi777@gmail.com>",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:live": "vitest run --config vitest.live.config.mjs",
    "test:e2e": "npm run build && playwright test",
    "dist": "npm run build && electron-builder --win --publish never"
  }
}
```

Run:
```bash
npm install extract-zip@^2
npm install -D electron@^44 electron-vite@^5 vite@^7.3 @vitejs/plugin-react@^5.2 react@^19 react-dom@^19 vitest@^5 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test electron-builder@^26
```
Expected: install finishes without `ERESOLVE` errors.

- [ ] **Step 2: Config files**

`.gitignore`:
```
node_modules/
out/
dist/
test-results/
playwright-report/
```

`.gitattributes`:
```
* text=auto
*.sh text eol=lf
```

`electron.vite.config.mjs`:
```js
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react()] },
})
```

`vitest.config.mjs`:
```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.{js,jsx}', 'tests/integration/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 20000,
  },
})
```

`tests/setup.js`:
```js
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Write failing tests**

`tests/unit/domain.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { normalizeTitle, animeLineTitle, STATUSES, TOOL_IDS } from '../../src/shared/domain.js'

describe('domain', () => {
  it('strips the "(N episodes)" suffix', () => {
    expect(normalizeTitle('One Piece (1100 episodes)')).toBe('One Piece')
    expect(normalizeTitle('  Frieren  ')).toBe('Frieren')
  })
  it('takes the title out of an ani-cli menu line', () => {
    expect(animeLineTitle('3 Re:Zero kara Hajimeru')).toBe('Re:Zero kara Hajimeru')
    expect(animeLineTitle('12 86')).toBe('86')
  })
  it('lists statuses and tools', () => {
    expect(STATUSES).toEqual(['watching', 'completed', 'planned', 'paused', 'dropped'])
    expect(TOOL_IDS).toEqual(['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg'])
  })
})
```

`tests/unit/paths.test.js`:
```js
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createPaths, toMsysPath, safeDirName } from '../../src/main/paths.js'

describe('paths', () => {
  it('builds all app paths under the base dir', () => {
    const p = createPaths('C:\\Data\\AnimeDesk')
    expect(p.library).toBe(path.join('C:\\Data\\AnimeDesk', 'library.json'))
    expect(p.manifest).toBe(path.join('C:\\Data\\AnimeDesk', 'tools', 'manifest.json'))
    expect(p.cache).toBe(path.join('C:\\Data\\AnimeDesk', 'cache', 'anilist'))
  })
  it('converts Windows paths to MSYS paths, keeping spaces and unicode', () => {
    expect(toMsysPath('C:\\Users\\Nikola\\Moji anime\\Šou')).toBe('/c/Users/Nikola/Moji anime/Šou')
    expect(toMsysPath('d:/x/y')).toBe('/d/x/y')
    expect(toMsysPath('/already/posix')).toBe('/already/posix')
  })
  it('makes a valid Windows folder name from any title', () => {
    expect(safeDirName('Re:Zero')).toBe('Re Zero')
    expect(safeDirName('Fate/stay night')).toBe('Fate stay night')
    expect(safeDirName('What?! <Title>.')).toBe('What ! Title')
    expect(safeDirName('???')).toBe('Anime')
  })
})
```

`tests/unit/jsonStore.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJson, writeJsonAtomic } from '../../src/main/jsonStore.js'

let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-json-')) })

describe('jsonStore', () => {
  it('returns a copy of the fallback when the file does not exist', () => {
    const fallback = { a: [] }
    const r = readJson(path.join(dir, 'x.json'), fallback)
    expect(r).toEqual({ data: { a: [] }, corrupt: false })
    r.data.a.push(1)
    expect(fallback.a).toEqual([])
  })
  it('writes atomically and reads back, creating folders', () => {
    const file = path.join(dir, 'sub', 'x.json')
    writeJsonAtomic(file, { n: 1 })
    expect(readJson(file, {}).data).toEqual({ n: 1 })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })
  it('backs up a corrupt file and starts fresh', () => {
    const file = path.join(dir, 'library.json')
    fs.writeFileSync(file, '{ broken')
    const r = readJson(file, { ok: true })
    expect(r.corrupt).toBe(true)
    expect(r.data).toEqual({ ok: true })
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.readFileSync(r.backup, 'utf8')).toBe('{ broken')
    expect(path.basename(r.backup)).toMatch(/^library\.corrupt-.+\.json$/)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/unit/domain.test.js tests/unit/paths.test.js tests/unit/jsonStore.test.js`
Expected: FAIL — cannot resolve `../../src/shared/domain.js` etc.

- [ ] **Step 5: Implement**

`src/shared/domain.js`:
```js
export const STATUSES = ['watching', 'completed', 'planned', 'paused', 'dropped']
export const TOOL_IDS = ['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg']

export function normalizeTitle(title) {
  return String(title).replace(/\s*\(\d+\s+episodes?\)\s*$/i, '').trim()
}

// ani-cli shows anime menu lines as "<n> <title>"
export function animeLineTitle(line) {
  return String(line).replace(/^\s*\d+\s+/, '').trim()
}
```

`src/main/paths.js`:
```js
import path from 'node:path'

export function createPaths(baseDir) {
  return {
    base: baseDir,
    tools: path.join(baseDir, 'tools'),
    manifest: path.join(baseDir, 'tools', 'manifest.json'),
    cache: path.join(baseDir, 'cache', 'anilist'),
    aniCliHistory: path.join(baseDir, 'ani-cli-history'),
    library: path.join(baseDir, 'library.json'),
    settings: path.join(baseDir, 'settings.json'),
    downloads: path.join(baseDir, 'downloads.json'),
  }
}

export function toMsysPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p)
  if (!m) return p.replace(/\\/g, '/')
  return `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`
}

export function safeDirName(name) {
  const cleaned = String(name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || 'Anime'
}
```

`src/main/jsonStore.js`:
```js
import fs from 'node:fs'
import path from 'node:path'

export function readJson(file, fallback) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { data: structuredClone(fallback), corrupt: false }
    throw err
  }
  try {
    return { data: JSON.parse(raw), corrupt: false }
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = `${file.replace(/\.json$/, '')}.corrupt-${stamp}.json`
    fs.renameSync(file, backup)
    return { data: structuredClone(fallback), corrupt: true, backup }
  }
}

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/domain.test.js tests/unit/paths.test.js tests/unit/jsonStore.test.js`
Expected: PASS (3 files).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with shared domain, paths and JSON store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings

**Files:**
- Create: `src/main/settings.js`
- Test: `tests/unit/settings.test.js`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic` (Task 1).
- Produces: `DEFAULT_SETTINGS` (frozen object), `sanitizeSettings(input) → settings`, `createSettings(file) → { get(): settings, update(patch): settings }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/settings.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_SETTINGS, sanitizeSettings, createSettings } from '../../src/main/settings.js'

let file
beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-set-')), 'settings.json') })

describe('settings', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      language: 'sr', autoTrack: true, watchedThreshold: 85, askOnClose: false,
      downloadDir: null, quality: 'best', mode: 'sub', autoUpdateTools: true,
    })
  })
  it('clamps the threshold and ignores invalid values', () => {
    const s = sanitizeSettings({ watchedThreshold: 120, language: 'de', mode: 'raw', quality: '4k', autoTrack: 'yes' })
    expect(s.watchedThreshold).toBe(100)
    expect(s.language).toBe('sr')
    expect(s.mode).toBe('sub')
    expect(s.quality).toBe('best')
    expect(s.autoTrack).toBe(true)
    expect(sanitizeSettings({ watchedThreshold: 10 }).watchedThreshold).toBe(50)
    expect(sanitizeSettings({ watchedThreshold: 72.6 }).watchedThreshold).toBe(73)
  })
  it('persists updates and allows clearing the download folder', () => {
    const s = createSettings(file)
    s.update({ language: 'en', downloadDir: 'D:\\Anime' })
    expect(createSettings(file).get()).toMatchObject({ language: 'en', downloadDir: 'D:\\Anime' })
    s.update({ downloadDir: null })
    expect(createSettings(file).get().downloadDir).toBeNull()
  })
  it('get() returns a copy', () => {
    const s = createSettings(file)
    s.get().language = 'en'
    expect(s.get().language).toBe('sr')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/settings.test.js`
Expected: FAIL — cannot resolve `src/main/settings.js`.

- [ ] **Step 3: Implement**

`src/main/settings.js`:
```js
import { readJson, writeJsonAtomic } from './jsonStore.js'

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'sr',
  autoTrack: true,
  watchedThreshold: 85,
  askOnClose: false,
  downloadDir: null,
  quality: 'best',
  mode: 'sub',
  autoUpdateTools: true,
})

const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']

export function sanitizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS }
  if (input.language === 'sr' || input.language === 'en') s.language = input.language
  if (typeof input.autoTrack === 'boolean') s.autoTrack = input.autoTrack
  if (Number.isFinite(input.watchedThreshold)) {
    s.watchedThreshold = Math.min(100, Math.max(50, Math.round(input.watchedThreshold)))
  }
  if (typeof input.askOnClose === 'boolean') s.askOnClose = input.askOnClose
  if (typeof input.downloadDir === 'string' && input.downloadDir) s.downloadDir = input.downloadDir
  if (QUALITIES.includes(input.quality)) s.quality = input.quality
  if (input.mode === 'sub' || input.mode === 'dub') s.mode = input.mode
  if (typeof input.autoUpdateTools === 'boolean') s.autoUpdateTools = input.autoUpdateTools
  return s
}

export function createSettings(file) {
  let current = sanitizeSettings(readJson(file, {}).data)
  return {
    get: () => ({ ...current }),
    update(patch) {
      current = sanitizeSettings({ ...current, ...patch })
      writeJsonAtomic(file, current)
      return { ...current }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/settings.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.js tests/unit/settings.test.js
git commit -m "feat: settings with defaults, validation and persistence" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Library (watchlist)

**Files:**
- Create: `src/main/library.js`
- Test: `tests/unit/library.test.js`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic`, `STATUSES`, `normalizeTitle` (Task 1).
- Produces: `createLibrary(file, { now?, uuid? }) → { wasCorrupt: boolean, list(), get(id), findByAniCliTitle(title), add({title, aniCliTitle?, aniListId?, status?, totalEpisodes?}), update(id, patch), remove(id): boolean, setEpisodeNote(id, episode, text), recordWatched({aniCliTitle, title?, episode, totalEpisodes?}) }`. All methods return deep copies. Entry shape exactly as spec §3.5.

- [ ] **Step 1: Write the failing test**

`tests/unit/library.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLibrary } from '../../src/main/library.js'

let file, lib, n
const opts = () => ({ now: () => `2026-10-01T00:00:0${n}Z`, uuid: () => `id-${++n}` })
beforeEach(() => {
  n = 0
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-lib-')), 'library.json')
  lib = createLibrary(file, opts())
})

describe('library', () => {
  it('adds an entry with defaults and persists it', () => {
    const e = lib.add({ title: 'Frieren' })
    expect(e).toMatchObject({ id: 'id-1', title: 'Frieren', status: 'planned', rating: null, comment: '', watchedEpisodes: [], episodeNotes: {}, lastWatchedAt: null })
    expect(createLibrary(file).list()).toHaveLength(1)
  })
  it('rejects invalid rating, status and empty title', () => {
    const e = lib.add({ title: 'X' })
    expect(() => lib.update(e.id, { rating: 11 })).toThrow()
    expect(() => lib.update(e.id, { rating: 7.5 })).toThrow()
    expect(() => lib.update(e.id, { status: 'binging' })).toThrow()
    expect(() => lib.add({ title: '  ' })).toThrow()
    expect(lib.update(e.id, { rating: null }).rating).toBeNull()
  })
  it('updates editable fields, sorts and de-duplicates watched episodes', () => {
    const e = lib.add({ title: 'X' })
    const u = lib.update(e.id, { rating: 9, comment: 'odlično', watchedEpisodes: [3, 1, 3, '2'], id: 'hack' })
    expect(u).toMatchObject({ id: e.id, rating: 9, comment: 'odlično', watchedEpisodes: [1, 2, 3] })
  })
  it('stores and deletes per-episode notes', () => {
    const e = lib.add({ title: 'X' })
    expect(lib.setEpisodeNote(e.id, 5, 'plakao').episodeNotes).toEqual({ 5: 'plakao' })
    expect(lib.setEpisodeNote(e.id, '5', '   ').episodeNotes).toEqual({})
  })
  it('recordWatched creates a watching entry for an unknown title', () => {
    const e = lib.recordWatched({ aniCliTitle: 'Dandadan (12 episodes)', episode: '1' })
    expect(e).toMatchObject({ title: 'Dandadan', aniCliTitle: 'Dandadan', status: 'watching', watchedEpisodes: [1] })
    expect(e.lastWatchedAt).not.toBeNull()
  })
  it('recordWatched moves paused to watching and last episode to completed', () => {
    const e = lib.add({ title: 'Show', aniCliTitle: 'Show', totalEpisodes: 3 })
    lib.update(e.id, { status: 'paused' })
    expect(lib.recordWatched({ aniCliTitle: 'show', episode: 2 }).status).toBe('watching')
    expect(lib.recordWatched({ aniCliTitle: 'Show', episode: 3 }).status).toBe('completed')
    expect(lib.recordWatched({ aniCliTitle: 'Show', episode: 1 }).status).toBe('completed')
  })
  it('recordWatched fills totalEpisodes only when unknown', () => {
    lib.recordWatched({ aniCliTitle: 'A', episode: 1, totalEpisodes: 12 })
    expect(lib.findByAniCliTitle('A').totalEpisodes).toBe(12)
    lib.recordWatched({ aniCliTitle: 'A', episode: 2, totalEpisodes: 24 })
    expect(lib.findByAniCliTitle('A').totalEpisodes).toBe(12)
  })
  it('keeps decimal episodes like 12.5', () => {
    expect(lib.recordWatched({ aniCliTitle: 'B', episode: '12.5' }).watchedEpisodes).toEqual([12.5])
  })
  it('removes entries', () => {
    const e = lib.add({ title: 'X' })
    expect(lib.remove(e.id)).toBe(true)
    expect(lib.list()).toEqual([])
    expect(lib.remove('nope')).toBe(false)
  })
  it('reports a corrupt file', () => {
    fs.writeFileSync(file, 'nope')
    const l = createLibrary(file)
    expect(l.wasCorrupt).toBe(true)
    expect(l.list()).toEqual([])
  })
  it('returns copies so callers cannot mutate state', () => {
    const e = lib.add({ title: 'X' })
    lib.get(e.id).watchedEpisodes.push(99)
    expect(lib.get(e.id).watchedEpisodes).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/library.test.js`
Expected: FAIL — cannot resolve `src/main/library.js`.

- [ ] **Step 3: Implement**

`src/main/library.js`:
```js
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { STATUSES, normalizeTitle } from '../shared/domain.js'

const EDITABLE = ['title', 'aniCliTitle', 'aniListId', 'status', 'rating', 'comment', 'totalEpisodes', 'watchedEpisodes']

function uniqSorted(eps) {
  return [...new Set(eps.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
}

function validatePatch(patch) {
  const out = {}
  for (const k of EDITABLE) if (k in patch) out[k] = patch[k]
  if ('title' in out) {
    out.title = String(out.title ?? '').trim()
    if (!out.title) throw new Error('title required')
  }
  if ('status' in out && !STATUSES.includes(out.status)) throw new Error(`invalid status: ${out.status}`)
  if ('rating' in out && out.rating !== null && !(Number.isInteger(out.rating) && out.rating >= 1 && out.rating <= 10)) {
    throw new Error('rating must be an integer 1-10 or null')
  }
  if ('totalEpisodes' in out && out.totalEpisodes !== null && !(Number.isInteger(out.totalEpisodes) && out.totalEpisodes > 0)) {
    throw new Error('totalEpisodes must be a positive integer or null')
  }
  if ('comment' in out) out.comment = String(out.comment ?? '')
  if ('watchedEpisodes' in out) out.watchedEpisodes = uniqSorted(out.watchedEpisodes)
  return out
}

export function createLibrary(file, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  const loaded = readJson(file, { version: 1, anime: {} })
  const db = loaded.data
  const save = () => writeJsonAtomic(file, db)
  const copy = (e) => (e ? structuredClone(e) : null)
  const key = (t) => normalizeTitle(t).toLowerCase()

  function findRaw(title) {
    const k = key(title)
    return Object.values(db.anime).find((e) => key(e.aniCliTitle ?? e.title) === k) ?? null
  }

  function mustGet(id) {
    const e = db.anime[id]
    if (!e) throw new Error(`unknown anime id: ${id}`)
    return e
  }

  function add({ title, aniCliTitle = null, aniListId = null, status = 'planned', totalEpisodes = null }) {
    const ts = now()
    const entry = {
      id: uuid(), title: '', aniCliTitle, aniListId, status, rating: null, comment: '',
      totalEpisodes, watchedEpisodes: [], episodeNotes: {}, addedAt: ts, updatedAt: ts, lastWatchedAt: null,
    }
    Object.assign(entry, validatePatch({ title, status, totalEpisodes }))
    db.anime[entry.id] = entry
    save()
    return copy(entry)
  }

  function update(id, patch) {
    const e = mustGet(id)
    Object.assign(e, validatePatch(patch), { updatedAt: now() })
    save()
    return copy(e)
  }

  function remove(id) {
    if (!db.anime[id]) return false
    delete db.anime[id]
    save()
    return true
  }

  function setEpisodeNote(id, episode, text) {
    const e = mustGet(id)
    const k = String(Number(episode))
    const t = String(text ?? '').trim()
    if (t) e.episodeNotes[k] = t
    else delete e.episodeNotes[k]
    e.updatedAt = now()
    save()
    return copy(e)
  }

  function recordWatched({ aniCliTitle, title, episode, totalEpisodes = null }) {
    const ep = Number(episode)
    let e = findRaw(aniCliTitle)
    if (!e) {
      const clean = normalizeTitle(aniCliTitle)
      e = db.anime[add({ title: title ?? clean, aniCliTitle: clean, status: 'watching' }).id]
    }
    if (e.totalEpisodes == null && Number.isInteger(totalEpisodes) && totalEpisodes > 0) e.totalEpisodes = totalEpisodes
    e.watchedEpisodes = uniqSorted([...e.watchedEpisodes, ep])
    if (e.status !== 'completed') e.status = 'watching'
    if (e.totalEpisodes != null && ep >= e.totalEpisodes) e.status = 'completed'
    e.lastWatchedAt = e.updatedAt = now()
    save()
    return copy(e)
  }

  return {
    wasCorrupt: loaded.corrupt,
    list: () => Object.values(db.anime).map(copy),
    get: (id) => copy(db.anime[id]),
    findByAniCliTitle: (title) => copy(findRaw(title)),
    add, update, remove, setEpisodeNote, recordWatched,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/library.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/library.js tests/unit/library.test.js
git commit -m "feat: watchlist library with auto status, ratings and episode notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: i18n (sr + en)

**Files:**
- Create: `src/renderer/i18n/sr.json`, `src/renderer/i18n/en.json`, `src/renderer/i18n/index.js`, `src/renderer/i18n/I18nContext.jsx`
- Test: `tests/unit/i18n.test.js`

**Interfaces:**
- Produces: `DICTS`, `createT(lang) → t(key, vars?)` (index.js); `I18nProvider({lang, children})`, `useT() → t` (I18nContext.jsx).
- Rule for later tasks: only literal keys `t('a.b')` with single quotes, or the dynamic families listed in the test (`nav.*`, `health.*`, `tool.*`, `status.*`, `sort.*`, `dstatus.*`, `error.*`, `settings.mode.*`, `lang.*`). Task 18 adds a test that scans all renderer sources for literal keys.

- [ ] **Step 1: Write the failing test**

`tests/unit/i18n.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { DICTS, createT } from '../../src/renderer/i18n/index.js'
import { STATUSES, TOOL_IDS } from '../../src/shared/domain.js'

const DYNAMIC = [
  ...['search', 'watchlist', 'downloads', 'settings'].map((p) => `nav.${p}`),
  ...['green', 'checking', 'updating', 'missing-tools', 'source-down', 'offline'].map((r) => `health.${r}`),
  ...TOOL_IDS.map((id) => `tool.${id}`),
  ...['installed', 'missing', 'installing', 'error'].map((s) => `tool.${s}`),
  ...STATUSES.map((s) => `status.${s}`),
  ...['title', 'rating', 'lastWatched'].map((s) => `sort.${s}`),
  ...['queued', 'downloading', 'paused', 'done', 'error'].map((s) => `dstatus.${s}`),
  ...['no-results', 'episode-not-released', 'blocked', 'cancelled', 'unknown', 'file-not-found'].map((e) => `error.${e}`),
  'settings.mode.sub', 'settings.mode.dub', 'lang.sr', 'lang.en',
]

describe('i18n', () => {
  it('sr and en have exactly the same keys', () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(Object.keys(DICTS.sr).sort())
  })
  it('contains every dynamic key family', () => {
    for (const k of DYNAMIC) expect(DICTS.sr, k).toHaveProperty([k])
  })
  it('interpolates variables and falls back to the key', () => {
    const t = createT('en')
    expect(t('detail.progress', { watched: 3, total: 12 })).toBe('Progress: 3 / 12')
    expect(t('does.not.exist')).toBe('does.not.exist')
    expect(createT('xx')('nav.search')).toBe('Pretraga')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/i18n.test.js`
Expected: FAIL — cannot resolve `src/renderer/i18n/index.js`.

- [ ] **Step 3: Implement dictionaries and helpers**

`src/renderer/i18n/sr.json`:
```json
{
  "nav.search": "Pretraga",
  "nav.watchlist": "Watchlist",
  "nav.downloads": "Preuzeto",
  "nav.settings": "Podešavanja",
  "health.green": "Sve radi",
  "health.checking": "Provera…",
  "health.updating": "Ažuriranje…",
  "health.missing-tools": "Potrebna instalacija",
  "health.source-down": "Izvor trenutno ne radi — čeka se popravka od ani-cli tima",
  "health.offline": "Nema internet konekcije",
  "health.recheck": "Proveri ponovo",
  "health.openWizard": "Otvori instalaciju",
  "gate.blocked": "Potrebno je instalirati komponente da bi se nastavilo",
  "wizard.title": "Podešavanje",
  "wizard.intro": "Da bi gledao anime, potrebne su sledeće komponente:",
  "wizard.installAll": "Instaliraj sve",
  "wizard.retry": "Pokušaj ponovo",
  "wizard.done": "Sve je instalirano",
  "wizard.close": "Zatvori",
  "tool.bash": "bash (Git)",
  "tool.ani-cli": "ani-cli (izvor)",
  "tool.mpv": "mpv (plejer)",
  "tool.yt-dlp": "yt-dlp (preuzimanje)",
  "tool.ffmpeg": "ffmpeg (obrada videa)",
  "tool.installed": "instalirano",
  "tool.missing": "nije instaliran",
  "tool.installing": "instalira se…",
  "tool.error": "greška",
  "search.placeholder": "Naziv animea…",
  "search.button": "Traži",
  "search.selectAnime": "Izaberi anime",
  "search.selectEpisode": "Izaberi epizodu",
  "search.watch": "Gledaj",
  "search.download": "Preuzmi izabrane",
  "search.addToWatchlist": "Dodaj u watchlist",
  "search.cancel": "Otkaži",
  "search.searching": "Pretraga…",
  "search.playing": "Pušta se: {title} — epizoda {episode}",
  "search.queued": "Dodato u red za preuzimanje: {count}",
  "search.added": "Dodato u watchlist",
  "search.alreadyInList": "Već je u watchlist-i",
  "error.no-results": "Nema rezultata.",
  "error.episode-not-released": "Epizoda još nije izašla.",
  "error.blocked": "Sajt je privremeno blokirao zahtev. Pokušaj kasnije.",
  "error.cancelled": "Otkazano.",
  "error.unknown": "Došlo je do greške.",
  "error.file-not-found": "Preuzimanje je završeno, ali fajl nije pronađen.",
  "error.showDetails": "Prikaži detalje",
  "watchlist.empty": "Watchlist je prazna.",
  "watchlist.all": "Sve",
  "watchlist.sort": "Sortiraj",
  "watchlist.addManual": "Dodaj ručno",
  "watchlist.titlePrompt": "Naziv animea",
  "status.watching": "Gledam",
  "status.completed": "Završeno",
  "status.planned": "Planiram",
  "status.paused": "Pauzirano",
  "status.dropped": "Odustao",
  "sort.title": "Naziv",
  "sort.rating": "Ocena",
  "sort.lastWatched": "Poslednje gledano",
  "detail.status": "Status",
  "detail.rating": "Ocena",
  "detail.noRating": "Bez ocene",
  "detail.comment": "Komentar",
  "detail.progress": "Napredak: {watched} / {total}",
  "detail.episodes": "Epizode",
  "detail.note": "Beleška za epizodu {episode}",
  "detail.markWatched": "Označi kao odgledano",
  "detail.unmarkWatched": "Ukloni oznaku odgledano",
  "detail.continue": "Nastavi gledanje",
  "detail.showDescription": "Prikaži opis",
  "detail.hideDescription": "Sakrij opis",
  "detail.delete": "Ukloni iz watchlist-e",
  "detail.confirmDelete": "Sigurno ukloniti?",
  "detail.save": "Sačuvaj",
  "detail.back": "Nazad",
  "detail.genres": "Žanrovi",
  "detail.year": "Godina",
  "ask.markWatched": "Označi epizodu {episode} ({title}) kao odgledanu?",
  "ask.yes": "Da",
  "ask.no": "Ne",
  "downloads.queue": "Red preuzimanja",
  "downloads.done": "Preuzeto",
  "downloads.empty": "Nema preuzetih epizoda.",
  "downloads.episode": "Epizoda {episode}",
  "downloads.play": "Pusti",
  "downloads.openFolder": "Otvori folder",
  "downloads.delete": "Obriši",
  "downloads.confirmDelete": "Obrisati fajl sa diska?",
  "downloads.missing": "Fajl ne postoji",
  "downloads.removeEntry": "Ukloni sa liste",
  "downloads.pause": "Pauza",
  "downloads.resume": "Nastavi",
  "downloads.cancel": "Otkaži",
  "downloads.rememberFolder": "Zapamti ovaj folder",
  "dstatus.queued": "Čeka",
  "dstatus.downloading": "Preuzima {percent}%",
  "dstatus.paused": "Pauzirano",
  "dstatus.done": "Gotovo",
  "dstatus.error": "Greška",
  "settings.title": "Podešavanja",
  "settings.language": "Jezik",
  "settings.autoTrack": "Automatsko praćenje gledanja",
  "settings.threshold": "Epizoda je odgledana posle (%)",
  "settings.askOnClose": "Pitaj pri zatvaranju plejera (umesto praga)",
  "settings.downloadDir": "Folder za preuzimanje",
  "settings.downloadDirNone": "Nije postavljen (pita svaki put)",
  "settings.change": "Promeni",
  "settings.clear": "Poništi",
  "settings.quality": "Kvalitet",
  "settings.mode": "Audio",
  "settings.mode.sub": "Titlovano (sub)",
  "settings.mode.dub": "Sinhronizovano (dub)",
  "settings.autoUpdate": "Automatsko ažuriranje ani-cli i yt-dlp",
  "settings.tools": "Verzije alata",
  "settings.checkUpdates": "Proveri ažuriranja",
  "settings.checking": "Proveravam…",
  "library.corrupt": "Fajl sa watchlist-om je bio oštećen; sačuvana je kopija i počinje se od prazne liste.",
  "lang.sr": "Srpski",
  "lang.en": "English"
}
```

`src/renderer/i18n/en.json`:
```json
{
  "nav.search": "Search",
  "nav.watchlist": "Watchlist",
  "nav.downloads": "Downloads",
  "nav.settings": "Settings",
  "health.green": "All systems go",
  "health.checking": "Checking…",
  "health.updating": "Updating…",
  "health.missing-tools": "Setup required",
  "health.source-down": "Source is down — waiting for an ani-cli fix",
  "health.offline": "No internet connection",
  "health.recheck": "Check again",
  "health.openWizard": "Open setup",
  "gate.blocked": "Components must be installed to continue",
  "wizard.title": "Setup",
  "wizard.intro": "To watch anime, the following components are needed:",
  "wizard.installAll": "Install all",
  "wizard.retry": "Retry",
  "wizard.done": "Everything is installed",
  "wizard.close": "Close",
  "tool.bash": "bash (Git)",
  "tool.ani-cli": "ani-cli (source)",
  "tool.mpv": "mpv (player)",
  "tool.yt-dlp": "yt-dlp (downloader)",
  "tool.ffmpeg": "ffmpeg (video processing)",
  "tool.installed": "installed",
  "tool.missing": "not installed",
  "tool.installing": "installing…",
  "tool.error": "error",
  "search.placeholder": "Anime title…",
  "search.button": "Search",
  "search.selectAnime": "Choose anime",
  "search.selectEpisode": "Choose episode",
  "search.watch": "Watch",
  "search.download": "Download selected",
  "search.addToWatchlist": "Add to watchlist",
  "search.cancel": "Cancel",
  "search.searching": "Searching…",
  "search.playing": "Playing: {title} — episode {episode}",
  "search.queued": "Added to download queue: {count}",
  "search.added": "Added to watchlist",
  "search.alreadyInList": "Already in your watchlist",
  "error.no-results": "No results.",
  "error.episode-not-released": "Episode not released yet.",
  "error.blocked": "The site temporarily blocked the request. Try again later.",
  "error.cancelled": "Cancelled.",
  "error.unknown": "Something went wrong.",
  "error.file-not-found": "Download finished, but the file was not found.",
  "error.showDetails": "Show details",
  "watchlist.empty": "Your watchlist is empty.",
  "watchlist.all": "All",
  "watchlist.sort": "Sort",
  "watchlist.addManual": "Add manually",
  "watchlist.titlePrompt": "Anime title",
  "status.watching": "Watching",
  "status.completed": "Completed",
  "status.planned": "Planned",
  "status.paused": "Paused",
  "status.dropped": "Dropped",
  "sort.title": "Title",
  "sort.rating": "Rating",
  "sort.lastWatched": "Last watched",
  "detail.status": "Status",
  "detail.rating": "Rating",
  "detail.noRating": "No rating",
  "detail.comment": "Comment",
  "detail.progress": "Progress: {watched} / {total}",
  "detail.episodes": "Episodes",
  "detail.note": "Note for episode {episode}",
  "detail.markWatched": "Mark as watched",
  "detail.unmarkWatched": "Unmark watched",
  "detail.continue": "Continue watching",
  "detail.showDescription": "Show description",
  "detail.hideDescription": "Hide description",
  "detail.delete": "Remove from watchlist",
  "detail.confirmDelete": "Really remove?",
  "detail.save": "Save",
  "detail.back": "Back",
  "detail.genres": "Genres",
  "detail.year": "Year",
  "ask.markWatched": "Mark episode {episode} ({title}) as watched?",
  "ask.yes": "Yes",
  "ask.no": "No",
  "downloads.queue": "Download queue",
  "downloads.done": "Downloaded",
  "downloads.empty": "No downloaded episodes.",
  "downloads.episode": "Episode {episode}",
  "downloads.play": "Play",
  "downloads.openFolder": "Open folder",
  "downloads.delete": "Delete",
  "downloads.confirmDelete": "Delete the file from disk?",
  "downloads.missing": "File missing",
  "downloads.removeEntry": "Remove from list",
  "downloads.pause": "Pause",
  "downloads.resume": "Resume",
  "downloads.cancel": "Cancel",
  "downloads.rememberFolder": "Remember this folder",
  "dstatus.queued": "Queued",
  "dstatus.downloading": "Downloading {percent}%",
  "dstatus.paused": "Paused",
  "dstatus.done": "Done",
  "dstatus.error": "Error",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.autoTrack": "Automatic watch tracking",
  "settings.threshold": "Episode counts as watched after (%)",
  "settings.askOnClose": "Ask when the player closes (instead of threshold)",
  "settings.downloadDir": "Download folder",
  "settings.downloadDirNone": "Not set (ask every time)",
  "settings.change": "Change",
  "settings.clear": "Clear",
  "settings.quality": "Quality",
  "settings.mode": "Audio",
  "settings.mode.sub": "Subtitled (sub)",
  "settings.mode.dub": "Dubbed (dub)",
  "settings.autoUpdate": "Auto-update ani-cli and yt-dlp",
  "settings.tools": "Tool versions",
  "settings.checkUpdates": "Check for updates",
  "settings.checking": "Checking…",
  "library.corrupt": "The watchlist file was damaged; a backup was saved and a new list was started.",
  "lang.sr": "Srpski",
  "lang.en": "English"
}
```

`src/renderer/i18n/index.js`:
```js
import sr from './sr.json'
import en from './en.json'

export const DICTS = { sr, en }

export function createT(lang) {
  const dict = DICTS[lang] ?? DICTS.sr
  return (key, vars = {}) => {
    const s = dict[key] ?? DICTS.en[key] ?? key
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
  }
}
```

`src/renderer/i18n/I18nContext.jsx`:
```jsx
import { createContext, useContext, useMemo } from 'react'
import { createT } from './index.js'

const I18nCtx = createContext(createT('sr'))

export function I18nProvider({ lang, children }) {
  const t = useMemo(() => createT(lang), [lang])
  return <I18nCtx.Provider value={t}>{children}</I18nCtx.Provider>
}

export const useT = () => useContext(I18nCtx)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/i18n.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/i18n tests/unit/i18n.test.js
git commit -m "feat: Serbian and English dictionaries with t() helper" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Process runner, HTTP helpers and ToolManager

**Files:**
- Create: `src/main/run.js`, `src/main/http.js`, `src/main/toolSources.js`, `src/main/toolManager.js`
- Test: `tests/unit/run.test.js`, `tests/unit/http.test.js`, `tests/unit/toolSources.test.js`, `tests/unit/toolManager.test.js`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic`, `createPaths`, `TOOL_IDS` (Task 1).
- Produces:
  - `run(cmd, args?, { env?, cwd?, timeoutMs?, onLine? }) → { done: Promise<{code, stdout, stderr, killed}>, kill(): void, child }` — `kill()` kills the whole process tree (Windows: `taskkill /T /F`).
  - `getJson(url) → Promise<any>`, `download(url, dest, onProgress?) → Promise<void>` (`onProgress({received, total})`, writes `dest.part` then renames), `isOnline() → Promise<boolean>`.
  - `SOURCES`, `AUTO_UPDATE_TOOLS = ['ani-cli','yt-dlp']`, `resolveDownload(toolId, release) → {url, name, version}`, `systemBashCandidates(env) → string[]`.
  - `createToolManager({ paths, http: {getJson, download}, extractZip(file, dir), runExe(file, args) → Promise<{code, stderr}>, env?, exists? }) → { status(), missing(): string[], install(id, onProgress?), installMissing(onProgress?) → Promise<{[id]: errorMessage}>, updatesAvailable(ids?) → Promise<string[]>, updateAll(ids?, onProgress?) → Promise<string[]>, toolPaths() → {bash, aniCli, mpv, ytDlp, ffmpeg, gitRoot}, lastUpdateCheck(): string|null, markUpdateCheck(iso) }`.
  - `findSystemBash(env?, exists?) → string|null`, `findFile(dir, name) → string|null`.
  - Progress events: `{ id, phase: 'download'|'extract'|'done'|'error', received?, total?, message? }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/run.test.js`:
```js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { run } from '../../src/main/run.js'

const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)) }
  throw new Error('timeout')
}
const isAlive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

describe('run', () => {
  it('collects output and emits lines split on \\r and \\n', async () => {
    const lines = []
    const p = run(process.execPath, ['-e', 'process.stdout.write("a\\r b\\nc\\n"); process.stderr.write("err")'], { onLine: (l) => lines.push(l) })
    const r = await p.done
    expect(r.code).toBe(0)
    expect(r.stderr).toBe('err')
    expect(lines).toHaveLength(4)
    expect(lines).toEqual(expect.arrayContaining(['a', ' b', 'c', 'err']))
  })
  it('kills the whole process tree (grandchildren too)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-run-'))
    const pidFile = path.join(dir, 'grandchild.pid')
    const inner = 'require("fs").writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 60000)'
    const outer = `require("child_process").spawn(process.execPath, ["-e", ${JSON.stringify(inner)}, ${JSON.stringify(pidFile)}], { stdio: "ignore" }); setTimeout(() => {}, 60000)`
    const p = run(process.execPath, ['-e', outer])
    await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').length > 0)
    const grandchild = Number(fs.readFileSync(pidFile, 'utf8'))
    p.kill()
    const r = await p.done
    expect(r.killed).toBe(true)
    await waitFor(() => !isAlive(grandchild))
  })
  it('times out', async () => {
    const r = await run(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 300 }).done
    expect(r.killed).toBe(true)
  })
  it('resolves (does not throw) when the command does not exist', async () => {
    const r = await run('definitely-not-a-command-xyz', []).done
    expect(r.code).toBe(-1)
  })
})
```

`tests/unit/http.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getJson, download } from '../../src/main/http.js'

let server, base
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/json') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
    if (req.url === '/file') return res.writeHead(200, { 'content-length': '10' }).end('0123456789')
    res.writeHead(404).end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => server.close())

describe('http', () => {
  it('gets JSON', async () => {
    expect(await getJson(`${base}/json`)).toEqual({ ok: true })
  })
  it('downloads with progress and no leftover .part file', async () => {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-dl-')), 'sub', 'f.bin')
    const progress = []
    await download(`${base}/file`, dest, (p) => progress.push(p))
    expect(fs.readFileSync(dest, 'utf8')).toBe('0123456789')
    expect(fs.existsSync(`${dest}.part`)).toBe(false)
    expect(progress.at(-1)).toEqual({ received: 10, total: 10 })
  })
  it('throws on HTTP errors and leaves no file', async () => {
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-dl-')), 'f.bin')
    await expect(download(`${base}/missing`, dest)).rejects.toThrow(/404/)
    expect(fs.existsSync(dest)).toBe(false)
    await expect(getJson(`${base}/missing`)).rejects.toThrow(/404/)
  })
})
```

`tests/unit/toolSources.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { resolveDownload, systemBashCandidates, AUTO_UPDATE_TOOLS } from '../../src/main/toolSources.js'

const rel = (tag, ...names) => ({ tag_name: tag, assets: names.map((name) => ({ name, browser_download_url: `https://x/${name}` })) })

describe('toolSources', () => {
  it('picks the right asset for every tool', () => {
    expect(resolveDownload('mpv', rel('v0.41.0', 'mpv-v0.41.0-aarch64-pc-windows-msvc.zip', 'mpv-v0.41.0-x86_64-pc-windows-msvc.zip')).name)
      .toBe('mpv-v0.41.0-x86_64-pc-windows-msvc.zip')
    expect(resolveDownload('ffmpeg', rel('9.0.2', 'ffmpeg-9.0.2-full_build.zip', 'ffmpeg-9.0.2-essentials_build.zip')).name)
      .toBe('ffmpeg-9.0.2-essentials_build.zip')
    expect(resolveDownload('bash', rel('v2.56.0.windows.1', 'Git-2.56.0-64-bit.exe', 'PortableGit-2.56.0-64-bit.7z.exe')).name)
      .toBe('PortableGit-2.56.0-64-bit.7z.exe')
    expect(resolveDownload('ani-cli', rel('v5.1', 'ani-cli'))).toEqual({ url: 'https://x/ani-cli', name: 'ani-cli', version: 'v5.1' })
    expect(resolveDownload('yt-dlp', rel('2026.08.19', 'yt-dlp', 'yt-dlp.exe')).name).toBe('yt-dlp.exe')
  })
  it('throws a clear error when no asset matches', () => {
    expect(() => resolveDownload('mpv', rel('v1', 'readme.txt'))).toThrow(/mpv/)
  })
  it('only ever looks for Git for Windows bash, never WSL bash in System32', () => {
    const c = systemBashCandidates({ ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\N\\AppData\\Local' })
    expect(c).toContain('C:\\Program Files\\Git\\bin\\bash.exe')
    expect(c.some((p) => /system32/i.test(p))).toBe(false)
  })
  it('auto-updates ani-cli and yt-dlp', () => {
    expect(AUTO_UPDATE_TOOLS).toEqual(['ani-cli', 'yt-dlp'])
  })
})
```

`tests/unit/toolManager.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPaths } from '../../src/main/paths.js'
import { createToolManager, findSystemBash } from '../../src/main/toolManager.js'

const RELEASES = {
  'git-for-windows/git': { tag_name: 'v2.56.0.windows.1', assets: [{ name: 'PortableGit-2.56.0-64-bit.7z.exe', browser_download_url: 'u/git' }] },
  'pystardust/ani-cli': { tag_name: 'v5.1', assets: [{ name: 'ani-cli', browser_download_url: 'u/ani' }] },
  'mpv-player/mpv': { tag_name: 'v0.41.0', assets: [{ name: 'mpv-v0.41.0-x86_64-pc-windows-msvc.zip', browser_download_url: 'u/mpv' }] },
  'yt-dlp/yt-dlp': { tag_name: '2026.08.19', assets: [{ name: 'yt-dlp.exe', browser_download_url: 'u/ytdlp' }] },
  'GyanD/codexffmpeg': { tag_name: '9.0.2', assets: [{ name: 'ffmpeg-9.0.2-essentials_build.zip', browser_download_url: 'u/ffmpeg' }] },
}

let base, paths, releases, tm, events
function make(extra = {}) {
  return createToolManager({
    paths,
    env: { ProgramFiles: path.join(base, 'no-pf'), 'ProgramFiles(x86)': path.join(base, 'no-pf') },
    http: {
      getJson: async (url) => structuredClone(releases[url.match(/repos\/(.+)\/releases/)[1]]),
      download: async (url, dest, onProgress) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, url); onProgress({ received: 5, total: 10 }) },
    },
    extractZip: async (file, dir) => {
      const inner = path.join(dir, 'pkg', 'bin')
      fs.mkdirSync(inner, { recursive: true })
      const exe = file.includes('mpv') ? 'mpv.exe' : 'ffmpeg.exe'
      fs.writeFileSync(path.join(inner, exe), 'exe')
    },
    runExe: async (file, args) => {
      const out = args.find((a) => a.startsWith('-o')).slice(2)
      fs.mkdirSync(path.join(out, 'bin'), { recursive: true })
      fs.writeFileSync(path.join(out, 'bin', 'bash.exe'), 'bash')
      return { code: 0, stderr: '' }
    },
    ...extra,
  })
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-tm-'))
  paths = createPaths(base)
  releases = structuredClone(RELEASES)
  events = []
  tm = make()
})

describe('toolManager', () => {
  it('reports everything missing on a clean machine', () => {
    expect(tm.missing()).toEqual(['bash', 'ani-cli', 'mpv', 'yt-dlp', 'ffmpeg'])
    expect(tm.status().mpv).toEqual({ installed: false, path: null, version: null })
  })
  it('installs all tools, records versions and exposes paths', async () => {
    const errors = await tm.installMissing((e) => events.push(e))
    expect(errors).toEqual({})
    expect(tm.missing()).toEqual([])
    const p = tm.toolPaths()
    expect(p.bash).toBe(path.join(paths.tools, 'bash', 'bin', 'bash.exe'))
    expect(p.gitRoot).toBe(path.join(paths.tools, 'bash'))
    expect(p.aniCli).toBe(path.join(paths.tools, 'ani-cli', 'ani-cli'))
    expect(p.mpv).toBe(path.join(paths.tools, 'mpv', 'pkg', 'bin', 'mpv.exe'))
    expect(p.ytDlp).toBe(path.join(paths.tools, 'yt-dlp', 'yt-dlp.exe'))
    expect(fs.existsSync(p.ffmpeg)).toBe(true)
    expect(tm.status()['ani-cli'].version).toBe('v5.1')
    expect(events).toContainEqual({ id: 'mpv', phase: 'download', received: 5, total: 10 })
    expect(events).toContainEqual({ id: 'mpv', phase: 'done' })
  })
  it('uses an existing Git for Windows bash instead of downloading PortableGit', () => {
    const gitBash = path.join(base, 'pf', 'Git', 'bin', 'bash.exe')
    fs.mkdirSync(path.dirname(gitBash), { recursive: true })
    fs.writeFileSync(gitBash, '')
    const t = make({ env: { ProgramFiles: path.join(base, 'pf'), 'ProgramFiles(x86)': path.join(base, 'no-pf') } })
    expect(t.missing()).not.toContain('bash')
    expect(t.status().bash).toEqual({ installed: true, path: gitBash, version: 'system' })
    expect(t.toolPaths().gitRoot).toBe(path.join(base, 'pf', 'Git'))
  })
  it('keeps going when one tool fails and reports its error', async () => {
    releases['mpv-player/mpv'].assets = []
    const errors = await tm.installMissing((e) => events.push(e))
    expect(Object.keys(errors)).toEqual(['mpv'])
    expect(tm.missing()).toEqual(['mpv'])
    expect(events.some((e) => e.id === 'mpv' && e.phase === 'error')).toBe(true)
  })
  it('detects and applies updates only for tools with a new tag', async () => {
    await tm.installMissing()
    expect(await tm.updatesAvailable()).toEqual([])
    releases['pystardust/ani-cli'].tag_name = 'v5.2'
    expect(await tm.updatesAvailable()).toEqual(['ani-cli'])
    expect(await tm.updateAll()).toEqual(['ani-cli'])
    expect(tm.status()['ani-cli'].version).toBe('v5.2')
  })
  it('remembers the last update check', () => {
    expect(tm.lastUpdateCheck()).toBeNull()
    tm.markUpdateCheck('2026-10-01T00:00:00Z')
    expect(make().lastUpdateCheck()).toBe('2026-10-01T00:00:00Z')
  })
  it('treats a tool whose file was deleted as missing', async () => {
    await tm.installMissing()
    fs.rmSync(tm.toolPaths().ytDlp)
    expect(tm.missing()).toEqual(['yt-dlp'])
  })
  it('findSystemBash returns null when Git is not installed', () => {
    expect(findSystemBash({ ProgramFiles: path.join(base, 'nothing') }, () => false)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/run.test.js tests/unit/http.test.js tests/unit/toolSources.test.js tests/unit/toolManager.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/main/run.js`**

```js
import { spawn } from 'node:child_process'

function killTree(child) {
  if (child.exitCode !== null || child.pid == null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

export function run(cmd, args = [], { env, cwd, timeoutMs, onLine } = {}) {
  const child = spawn(cmd, args, { env, cwd, windowsHide: true })
  let stdout = ''
  let stderr = ''
  let buf = ''
  let killed = false
  let timer = null

  const emit = (chunk) => {
    if (!onLine) return
    buf += chunk
    const parts = buf.split(/[\r\n]+/)
    buf = parts.pop()
    for (const p of parts) if (p) onLine(p)
  }
  child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; emit(s) })
  child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; emit(s) })

  const done = new Promise((resolve) => {
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + String(err), killed }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (buf && onLine) onLine(buf)
      resolve({ code: code ?? -1, stdout, stderr, killed })
    })
  })

  const kill = () => { killed = true; killTree(child) }
  if (timeoutMs) timer = setTimeout(kill, timeoutMs)
  return { done, kill, child }
}
```

- [ ] **Step 4: Implement `src/main/http.js`**

```js
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'

const UA = 'AnimeDesk'

export async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

export async function download(url, dest, onProgress = () => {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const part = `${dest}.part`
  const out = fs.createWriteStream(part)
  let received = 0
  try {
    for await (const chunk of res.body) {
      received += chunk.length
      if (!out.write(chunk)) await once(out, 'drain')
      onProgress({ received, total })
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
  } catch (err) {
    out.destroy()
    fs.rmSync(part, { force: true })
    throw err
  }
  fs.renameSync(part, dest)
}

export async function isOnline(timeoutMs = 5000) {
  try {
    const res = await fetch('https://api.github.com', { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
    return res.status < 500
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Implement `src/main/toolSources.js`**

```js
export const SOURCES = {
  bash: { repo: 'git-for-windows/git', asset: /^PortableGit-[\d.]+-64-bit\.7z\.exe$/, kind: 'sfx', exe: 'bin/bash.exe' },
  'ani-cli': { repo: 'pystardust/ani-cli', asset: /^ani-cli$/, kind: 'file' },
  mpv: { repo: 'mpv-player/mpv', asset: /^mpv-v?[\d.]+-x86_64-pc-windows-msvc\.zip$/, kind: 'zip', exe: 'mpv.exe' },
  'yt-dlp': { repo: 'yt-dlp/yt-dlp', asset: /^yt-dlp\.exe$/, kind: 'file' },
  ffmpeg: { repo: 'GyanD/codexffmpeg', asset: /^ffmpeg-[\d.]+-essentials_build\.zip$/, kind: 'zip', exe: 'ffmpeg.exe' },
}

export const AUTO_UPDATE_TOOLS = ['ani-cli', 'yt-dlp']

export function resolveDownload(toolId, release) {
  const src = SOURCES[toolId]
  const asset = (release.assets ?? []).find((a) => src.asset.test(a.name))
  if (!asset) throw new Error(`No download found for ${toolId} in release ${release.tag_name}`)
  return { url: asset.browser_download_url, name: asset.name, version: release.tag_name }
}

// Only Git for Windows locations — never C:\Windows\System32\bash.exe (WSL).
export function systemBashCandidates(env) {
  return [
    `${env.ProgramFiles ?? 'C:\\Program Files'}\\Git\\bin\\bash.exe`,
    `${env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Git\\bin\\bash.exe`,
    env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe`,
  ].filter(Boolean)
}
```

- [ ] **Step 6: Implement `src/main/toolManager.js`**

```js
import fs from 'node:fs'
import path from 'node:path'
import { TOOL_IDS } from '../shared/domain.js'
import { SOURCES, AUTO_UPDATE_TOOLS, resolveDownload, systemBashCandidates } from './toolSources.js'
import { readJson, writeJsonAtomic } from './jsonStore.js'

export function findSystemBash(env = process.env, exists = fs.existsSync) {
  return systemBashCandidates(env).find((p) => exists(p)) ?? null
}

export function findFile(dir, name) {
  const want = name.toLowerCase()
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === want) return full
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    }
  }
  return null
}

export function createToolManager({ paths, http, extractZip, runExe, env = process.env, exists = fs.existsSync }) {
  const load = () => readJson(paths.manifest, { tools: {}, lastUpdateCheck: null }).data
  const save = (m) => writeJsonAtomic(paths.manifest, m)

  function exePath(id) {
    const m = load().tools[id]
    if (m && exists(m.path)) return m.path
    if (id === 'bash') return findSystemBash(env, exists)
    return null
  }

  function status() {
    const tools = load().tools
    return Object.fromEntries(TOOL_IDS.map((id) => {
      const p = exePath(id)
      const version = p ? (tools[id] && tools[id].path === p ? tools[id].version : 'system') : null
      return [id, { installed: !!p, path: p, version }]
    }))
  }

  const missing = () => TOOL_IDS.filter((id) => !exePath(id))
  const latest = (id) => http.getJson(`https://api.github.com/repos/${SOURCES[id].repo}/releases/latest`)

  async function install(id, onProgress = () => {}) {
    const src = SOURCES[id]
    const { url, name, version } = resolveDownload(id, await latest(id))
    const dir = path.join(paths.tools, id)
    const staging = `${dir}.new`
    fs.rmSync(staging, { recursive: true, force: true })
    fs.mkdirSync(staging, { recursive: true })
    const file = path.join(staging, name)
    await http.download(url, file, ({ received, total }) => onProgress({ id, phase: 'download', received, total }))
    if (src.kind === 'zip' || src.kind === 'sfx') {
      onProgress({ id, phase: 'extract' })
      if (src.kind === 'zip') await extractZip(file, staging)
      else {
        const r = await runExe(file, [`-o${staging}`, '-y'])
        if (r.code !== 0) throw new Error(`${id}: extraction failed (${r.stderr})`)
      }
      fs.rmSync(file, { force: true })
    }
    fs.rmSync(dir, { recursive: true, force: true })
    fs.renameSync(staging, dir)
    const exe = src.kind === 'zip' ? findFile(dir, src.exe)
      : src.kind === 'sfx' ? path.join(dir, src.exe)
      : path.join(dir, name)
    if (!exe || !exists(exe)) throw new Error(`${id}: executable not found after install`)
    const m = load()
    m.tools[id] = { version, path: exe, installedAt: new Date().toISOString() }
    save(m)
    onProgress({ id, phase: 'done' })
  }

  async function installMissing(onProgress = () => {}) {
    const errors = {}
    for (const id of missing()) {
      try {
        await install(id, onProgress)
      } catch (err) {
        errors[id] = err.message
        onProgress({ id, phase: 'error', message: err.message })
      }
    }
    return errors
  }

  async function updatesAvailable(ids = AUTO_UPDATE_TOOLS) {
    const out = []
    for (const id of ids) {
      const m = load().tools[id]
      if (!m) continue
      if ((await latest(id)).tag_name !== m.version) out.push(id)
    }
    return out
  }

  async function updateAll(ids = AUTO_UPDATE_TOOLS, onProgress = () => {}) {
    const ids2 = await updatesAvailable(ids)
    for (const id of ids2) await install(id, onProgress)
    return ids2
  }

  function toolPaths() {
    const bash = exePath('bash')
    return {
      bash,
      aniCli: exePath('ani-cli'),
      mpv: exePath('mpv'),
      ytDlp: exePath('yt-dlp'),
      ffmpeg: exePath('ffmpeg'),
      gitRoot: bash ? path.resolve(path.dirname(bash), '..') : null,
    }
  }

  return {
    status, missing, install, installMissing, updatesAvailable, updateAll, toolPaths,
    lastUpdateCheck: () => load().lastUpdateCheck ?? null,
    markUpdateCheck: (iso) => { const m = load(); m.lastUpdateCheck = iso; save(m) },
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/run.test.js tests/unit/http.test.js tests/unit/toolSources.test.js tests/unit/toolManager.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/run.js src/main/http.js src/main/toolSources.js src/main/toolManager.js tests/unit/run.test.js tests/unit/http.test.js tests/unit/toolSources.test.js tests/unit/toolManager.test.js
git commit -m "feat: tool manager that installs and updates bash, ani-cli, mpv, yt-dlp, ffmpeg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bridge server and bridge scripts

**Files:**
- Create: `src/main/bridgeServer.js`, `resources/bridges/menu-bridge.sh`, `resources/bridges/animedesk-mpv-bridge.sh`, `tests/helpers/bash.js`
- Test: `tests/unit/bridgeServer.test.js`, `tests/integration/bridges.test.js`

**Interfaces:**
- Consumes: `findSystemBash` (Task 5), `toMsysPath` (Task 1).
- Produces: `createBridgeServer() → { token, port (getter), start(): Promise<{port, token}>, stop(): Promise<void>, registerSession(id, { onMenu({prompt, lines}) → Promise<string|null>, onPlay({args}) → Promise<number> }), unregisterSession(id) }`.
- HTTP contract (used by the scripts): `POST /menu` and `POST /play` on `127.0.0.1:$ANIMEDESK_PORT`, headers `x-animedesk-token`, `x-animedesk-session`, and for menu `x-animedesk-prompt` (UTF-8 prompt, hex-encoded). Body = lines. `/menu` → 200 with the chosen line, or 204 when cancelled. `/play` → 200 with the exit code as text. Wrong token → 403, unknown session → 404.
- `tests/helpers/bash.js` exports `BASH` (path or null) and `describeBash` (skips when Git Bash is missing).

- [ ] **Step 1: Write the failing tests**

`tests/helpers/bash.js`:
```js
import { describe } from 'vitest'
import { findSystemBash } from '../../src/main/toolManager.js'

export const BASH = findSystemBash(process.env)
export const describeBash = BASH ? describe : describe.skip
```

`tests/unit/bridgeServer.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createBridgeServer } from '../../src/main/bridgeServer.js'

let server, url
const hex = (s) => Buffer.from(s, 'utf8').toString('hex')
const post = (path, { token = server.token, session = 's1', prompt, body = '' } = {}) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'x-animedesk-token': token, 'x-animedesk-session': session, ...(prompt != null ? { 'x-animedesk-prompt': hex(prompt) } : {}) },
    body,
  })

beforeEach(async () => { server = createBridgeServer(); const { port } = await server.start(); url = `http://127.0.0.1:${port}` })
afterEach(() => server.stop())

describe('bridgeServer', () => {
  it('forwards a menu request and returns the chosen line', async () => {
    let got
    server.registerSession('s1', { onMenu: async (req) => { got = req; return req.lines[1] }, onPlay: async () => 0 })
    const res = await post('/menu', { prompt: 'Select anime: ', body: '1 Fake Anime\n2 Šou\n' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('2 Šou')
    expect(got).toEqual({ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Šou'] })
  })
  it('returns 204 when the user cancels', async () => {
    server.registerSession('s1', { onMenu: async () => null, onPlay: async () => 0 })
    expect((await post('/menu', { prompt: 'x', body: 'a' })).status).toBe(204)
  })
  it('forwards play args and returns the exit code', async () => {
    let args
    server.registerSession('s1', { onMenu: async () => null, onPlay: async (r) => { args = r.args; return 3 } })
    const res = await post('/play', { body: '--referrer=https://r\n--force-media-title=A B Episode 2\nhttps://v\n' })
    expect(await res.text()).toBe('3')
    expect(args).toEqual(['--referrer=https://r', '--force-media-title=A B Episode 2', 'https://v'])
  })
  it('rejects a wrong token and unknown sessions', async () => {
    server.registerSession('s1', { onMenu: async () => 'x', onPlay: async () => 0 })
    expect((await post('/menu', { token: 'bad', prompt: 'x' })).status).toBe(403)
    expect((await post('/menu', { session: 'nope', prompt: 'x' })).status).toBe(404)
    server.unregisterSession('s1')
    expect((await post('/menu', { prompt: 'x' })).status).toBe(404)
  })
})
```

`tests/integration/bridges.test.js`:
```js
import { it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { run } from '../../src/main/run.js'
import { toMsysPath } from '../../src/main/paths.js'
import { createBridgeServer } from '../../src/main/bridgeServer.js'
import { BASH, describeBash } from '../helpers/bash.js'

const MENU = path.resolve('resources/bridges/menu-bridge.sh')
const PLAYER = path.resolve('resources/bridges/animedesk-mpv-bridge.sh')

it('shell scripts have LF line endings (no CR)', () => {
  for (const f of fs.readdirSync('resources/bridges')) {
    expect(fs.readFileSync(path.join('resources/bridges', f), 'utf8'), f).not.toContain('\r')
  }
})

describeBash('bridge scripts via real bash', () => {
  let server, env
  beforeAll(async () => {
    server = createBridgeServer()
    const { port, token } = await server.start()
    const gitRoot = path.resolve(path.dirname(BASH), '..')
    const base = { ...process.env }
    const pathKey = Object.keys(base).find((k) => k.toUpperCase() === 'PATH')
    const oldPath = base[pathKey]
    delete base[pathKey]
    env = {
      ...base,
      PATH: [path.join(gitRoot, 'usr', 'bin'), path.join(gitRoot, 'mingw64', 'bin'), oldPath].join(';'),
      ANIMEDESK_PORT: String(port), ANIMEDESK_TOKEN: token, ANIMEDESK_SESSION: 'int',
    }
  })
  afterAll(() => server.stop())

  it('menu-bridge sends the list and prints the chosen line', async () => {
    let seen
    server.registerSession('int', { onMenu: async (r) => { seen = r; return r.lines[0] }, onPlay: async () => 0 })
    const script = `printf '1 Fake Anime\\n2 Other\\n' | "${toMsysPath(MENU)}" "Select anime: "`
    const r = await run(BASH, ['-c', script], { env }).done
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe('1 Fake Anime')
    expect(seen).toEqual({ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other'] })
  })
  it('menu-bridge exits 1 on cancel', async () => {
    server.registerSession('int', { onMenu: async () => null, onPlay: async () => 0 })
    const r = await run(BASH, ['-c', `printf 'x\\n' | "${toMsysPath(MENU)}" "p"`], { env }).done
    expect(r.code).toBe(1)
  })
  it('mpv bridge forwards args and exits with the player exit code', async () => {
    let args
    server.registerSession('int', { onMenu: async () => null, onPlay: async (r) => { args = r.args; return 4 } })
    const script = `"${toMsysPath(PLAYER)}" --referrer=https://r "--force-media-title=Fake Anime Episode 2" https://v`
    const r = await run(BASH, ['-c', script], { env }).done
    expect(r.code).toBe(4)
    expect(args).toEqual(['--referrer=https://r', '--force-media-title=Fake Anime Episode 2', 'https://v'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/bridgeServer.test.js tests/integration/bridges.test.js`
Expected: FAIL — `bridgeServer.js` missing, `resources/bridges` missing.

- [ ] **Step 3: Implement `src/main/bridgeServer.js`**

```js
import http from 'node:http'
import crypto from 'node:crypto'

const decodeHex = (hex) => Buffer.from(hex ?? '', 'hex').toString('utf8')

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function createBridgeServer() {
  const token = crypto.randomBytes(16).toString('hex')
  const sessions = new Map()
  let server = null
  let port = null

  async function handle(req, res) {
    if (req.method !== 'POST' || req.headers['x-animedesk-token'] !== token) return res.writeHead(403).end()
    const session = sessions.get(req.headers['x-animedesk-session'])
    if (!session) return res.writeHead(404).end()
    const lines = (await readBody(req)).split(/\r?\n/).filter(Boolean)
    try {
      if (req.url === '/menu') {
        const answer = await session.onMenu({ prompt: decodeHex(req.headers['x-animedesk-prompt']), lines })
        if (answer == null) return res.writeHead(204).end()
        return res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(answer)
      }
      if (req.url === '/play') {
        const code = await session.onPlay({ args: lines })
        return res.writeHead(200, { 'content-type': 'text/plain' }).end(String(code ?? 0))
      }
      return res.writeHead(404).end()
    } catch (err) {
      return res.writeHead(500).end(String(err.message))
    }
  }

  return {
    token,
    get port() { return port },
    start() {
      return new Promise((resolve) => {
        server = http.createServer((req, res) => { handle(req, res) })
        server.requestTimeout = 0 // the user may take minutes to pick an episode
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port
          resolve({ port, token })
        })
      })
    },
    stop() {
      return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()))
    },
    registerSession: (id, handlers) => sessions.set(id, handlers),
    unregisterSession: (id) => sessions.delete(id),
  }
}
```

Note: `server.close()` waits for open connections; menu requests hang while a user decides. `stop()` is only called on app quit, after sessions are gone, so this is fine.

- [ ] **Step 4: Create the bridge scripts (LF line endings!)**

`resources/bridges/menu-bridge.sh`:
```sh
#!/bin/sh
# ani-cli calls this as its menu program: menu-bridge.sh [extra flags...] "<prompt>"
# The menu entries arrive on stdin; the chosen line must be printed to stdout.
for prompt; do :; done
prompt_hex=$(printf '%s' "$prompt" | od -An -tx1 | tr -d ' \n')
answer=$(curl -sS --fail -X POST \
  -H "x-animedesk-token: $ANIMEDESK_TOKEN" \
  -H "x-animedesk-session: $ANIMEDESK_SESSION" \
  -H "x-animedesk-prompt: $prompt_hex" \
  --data-binary @- \
  "http://127.0.0.1:$ANIMEDESK_PORT/menu") || exit 1
[ -n "$answer" ] || exit 1
printf '%s\n' "$answer"
```

`resources/bridges/animedesk-mpv-bridge.sh`:
```sh
#!/bin/sh
# ani-cli calls this as its player (the name must contain "mpv"):
#   animedesk-mpv-bridge.sh --referrer=... [--sub-file=...] --force-media-title=... <url>
# AnimeDesk starts the real mpv and answers with its exit code when it closes.
code=$(printf '%s\n' "$@" | curl -sS --fail -X POST \
  -H "x-animedesk-token: $ANIMEDESK_TOKEN" \
  -H "x-animedesk-session: $ANIMEDESK_SESSION" \
  --data-binary @- \
  "http://127.0.0.1:$ANIMEDESK_PORT/play") || exit 2
exit "${code:-0}"
```

After creating them, verify: `git add --renormalize resources/bridges` and `node -e "for (const f of ['menu-bridge.sh','animedesk-mpv-bridge.sh']) if (require('fs').readFileSync('resources/bridges/'+f,'utf8').includes('\r')) throw f"` prints nothing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/bridgeServer.test.js tests/integration/bridges.test.js`
Expected: PASS (bash tests run on this machine because Git for Windows is installed).

- [ ] **Step 6: Commit**

```bash
git add src/main/bridgeServer.js resources/bridges tests/helpers/bash.js tests/unit/bridgeServer.test.js tests/integration/bridges.test.js
git commit -m "feat: localhost bridge server and ani-cli menu/player bridge scripts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: AniCliBridge

**Files:**
- Create: `src/main/aniCliBridge.js`, `tests/fixtures/fake-ani-cli.sh`
- Test: `tests/unit/aniCliBridge.test.js`, `tests/integration/aniCliBridge.test.js`

**Interfaces:**
- Consumes: `run` (Task 5), `toMsysPath` (Task 1), bridge server (Task 6), `toolManager.toolPaths()` (Task 5), settings object shape (Task 2).
- Produces:
  - `stripAnsi(s)`, `mapError(stderr) → 'no-results'|'episode-not-released'|'blocked'|'unknown'`
  - `menuKind(prompt) → 'anime'|'episode'|'other'`
  - `autoAnswer(prompt, lines, { anime?, episode? }) → string|null` (anime matched by `animeLineTitle`, case-insensitive; episode matched exactly)
  - `parsePlayerArgs(args) → { mpvArgs: string[], title: string, episode: string|null, url: string|null }`
  - `buildEnv({ baseEnv, tools, bridges, server, sessionId, player, downloadDir, settings, historyDir }) → env`
  - `createAniCliBridge({ toolManager, server, bridges: {menu, player}, getSettings, historyDir, runImpl?, baseEnv? }) → { startSession(opts), selfTest({timeoutMs?}) → Promise<boolean> }`
  - `startSession({ query, player: 'play'|'download'|'debug' = 'play', episodes?, index?, downloadDir?, onMenu?, onPlay?, onLine?, timeoutMs? }) → { sessionId, done: Promise<{ok, code, stdout, stderr, error: null|'cancelled'|'no-results'|'episode-not-released'|'blocked'|'unknown'}>, kill() }`. Throws `Error('tools-missing')` when bash or ani-cli is missing.

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/aniCliBridge.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { mapError, menuKind, autoAnswer, parsePlayerArgs, buildEnv, stripAnsi } from '../../src/main/aniCliBridge.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

describe('aniCliBridge helpers', () => {
  it('maps ani-cli errors (with ANSI colors) to codes', () => {
    expect(mapError('\x1b[2K\r\x1b[1;31mNo results found!\x1b[0m\n')).toBe('no-results')
    expect(mapError('Episode not released!')).toBe('episode-not-released')
    expect(mapError('Blocked by cloudflare.')).toBe('blocked')
    expect(mapError('weird')).toBe('unknown')
    expect(stripAnsi('\x1b[1;36mhi\x1b[0m')).toBe('hi')
  })
  it('classifies menus by prompt', () => {
    expect(menuKind('Select anime: ')).toBe('anime')
    expect(menuKind('Select episode: ')).toBe('episode')
    expect(menuKind('Select Quality: ')).toBe('other')
  })
  it('auto-answers known anime and episodes', () => {
    expect(autoAnswer('Select anime: ', ['1 Other', '2 Fake Anime'], { anime: 'fake anime' })).toBe('2 Fake Anime')
    expect(autoAnswer('Select anime: ', ['1 Other'], { anime: 'Fake Anime' })).toBeNull()
    expect(autoAnswer('Select episode: ', ['1', '2', '12.5'], { episode: '12.5' })).toBe('12.5')
    expect(autoAnswer('Select episode: ', ['1', '2'], {})).toBeNull()
  })
  it('parses player args from ani-cli', () => {
    const p = parsePlayerArgs(['--referrer=https://r', '--force-media-title=Re:Zero Episode 12.5', 'https://v.m3u8'])
    expect(p).toEqual({ mpvArgs: ['--referrer=https://r', '--force-media-title=Re:Zero Episode 12.5', 'https://v.m3u8'], title: 'Re:Zero', episode: '12.5', url: 'https://v.m3u8' })
  })
  it('builds env with a single PATH key and MSYS paths', () => {
    const env = buildEnv({
      baseEnv: { Path: 'C:\\Windows', OTHER: '1' },
      tools: { gitRoot: 'C:\\Git', ytDlp: 'C:\\T\\yt-dlp\\yt-dlp.exe', ffmpeg: 'C:\\T\\ff\\bin\\ffmpeg.exe' },
      bridges: { menu: 'C:\\App\\bridges\\menu-bridge.sh', player: 'C:\\App\\bridges\\animedesk-mpv-bridge.sh' },
      server: { port: 5555, token: 'tok' },
      sessionId: 'sid',
      player: 'play',
      downloadDir: 'D:\\Moji anime\\Šou',
      settings: { ...DEFAULT_SETTINGS, quality: '720', mode: 'dub' },
      historyDir: 'C:\\Data\\hist',
    })
    expect(Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')).toEqual(['PATH'])
    expect(env.PATH.split(';')).toEqual(['C:\\Git\\usr\\bin', 'C:\\Git\\mingw64\\bin', 'C:\\T\\yt-dlp', 'C:\\T\\ff\\bin', 'C:\\Windows'])
    expect(env).toMatchObject({
      OTHER: '1',
      ANI_CLI_MENU: '/c/App/bridges/menu-bridge.sh',
      ANI_CLI_PLAYER: '/c/App/bridges/animedesk-mpv-bridge.sh',
      ANI_CLI_NO_DETACH: '1', ANI_CLI_EXIT_AFTER_PLAY: '1', ANI_CLI_LOG: '0',
      ANI_CLI_QUALITY: '720', ANI_CLI_MODE: 'dub',
      ANI_CLI_HIST_DIR: '/c/Data/hist',
      ANI_CLI_DOWNLOAD_DIR: '/d/Moji anime/Šou',
      ANIMEDESK_PORT: '5555', ANIMEDESK_TOKEN: 'tok', ANIMEDESK_SESSION: 'sid',
    })
    const dl = buildEnv({ baseEnv: {}, tools: { gitRoot: 'C:\\Git' }, bridges: { menu: 'm', player: 'p' }, server: { port: 1, token: 't' }, sessionId: 's', player: 'download', settings: DEFAULT_SETTINGS, historyDir: 'h' })
    expect(dl.ANI_CLI_PLAYER).toBe('download')
    expect(dl).not.toHaveProperty('ANI_CLI_DOWNLOAD_DIR')
  })
})
```

- [ ] **Step 2: Write the fake ani-cli and the failing integration test**

`tests/fixtures/fake-ani-cli.sh` (LF line endings):
```sh
#!/bin/sh
# Mimics exactly the parts of ani-cli AnimeDesk relies on:
# menus go through "$ANI_CLI_MENU" "<prompt>" with entries on stdin,
# playback goes through "$ANI_CLI_PLAYER" (mpv-style args), download and debug modes.
index=""; ep_no=""; query=""
while [ $# -gt 0 ]; do
  case "$1" in
    -S) index="$2"; shift ;;
    -e) ep_no="$2"; shift ;;
    *) query="${query:+$query }$1" ;;
  esac
  shift
done
if [ "$query" = "nothing" ]; then printf '\033[1;31mNo results found!\033[0m\n' >&2; exit 1; fi
list=$(printf '1\tid1\tFake Anime\n2\tid2\tOther Show')
if [ -n "$index" ]; then
  result=$(printf '%s\n' "$list" | sed -n "${index}p")
else
  choice=$(printf '%s\n' "$list" | cut -f 1,3 | tr '\t' ' ' | "$ANI_CLI_MENU" "Select anime: " | cut -d ' ' -f 1)
  result=$(printf '%s\n' "$list" | awk -F '\t' -v n="$choice" '$1 == n')
fi
[ -z "$result" ] && { printf 'Invalid anime selection\n' >&2; exit 1; }
title=$(printf '%s' "$result" | cut -f 3)
[ -z "$ep_no" ] && ep_no=$(printf '1\n2\n3\n' | "$ANI_CLI_MENU" "Select episode: " | cut -d ' ' -f 1)
[ -z "$ep_no" ] && { printf 'Invalid episode selection\n' >&2; exit 1; }
case "$ANI_CLI_PLAYER" in
  debug) printf 'All links:\nx\nSelected link:\nhttps://example.invalid/%s.m3u8\nSubtitles:\n\n' "$ep_no" ;;
  download)
    mkdir -p "$ANI_CLI_DOWNLOAD_DIR"
    printf '[download]  50.0%% of 10.00MiB\n'
    printf 'video' > "$ANI_CLI_DOWNLOAD_DIR/$title Episode $ep_no.mp4"
    printf '[download] 100%% of 10.00MiB\n' ;;
  *)
    "$ANI_CLI_PLAYER" --referrer=https://ref.invalid --force-media-title="$title Episode $ep_no" "https://example.invalid/$ep_no.m3u8"
    exit $? ;;
esac
```

`tests/integration/aniCliBridge.test.js`:
```js
import { it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBridgeServer } from '../../src/main/bridgeServer.js'
import { createAniCliBridge } from '../../src/main/aniCliBridge.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'
import { BASH, describeBash } from '../helpers/bash.js'

const BRIDGES = { menu: path.resolve('resources/bridges/menu-bridge.sh'), player: path.resolve('resources/bridges/animedesk-mpv-bridge.sh') }
const FAKE = path.resolve('tests/fixtures/fake-ani-cli.sh')

it('fake ani-cli has LF line endings', () => {
  expect(fs.readFileSync(FAKE, 'utf8')).not.toContain('\r')
})

describeBash('AniCliBridge with fake ani-cli', () => {
  let server, bridge, tmp
  beforeAll(async () => { server = createBridgeServer(); await server.start() })
  afterAll(() => server.stop())
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk š '))
    bridge = createAniCliBridge({
      toolManager: { toolPaths: () => ({ bash: BASH, aniCli: FAKE, gitRoot: path.resolve(path.dirname(BASH), '..'), ytDlp: null, ffmpeg: null, mpv: null }) },
      server, bridges: BRIDGES, getSettings: () => DEFAULT_SETTINGS, historyDir: path.join(tmp, 'hist'),
    })
  })

  it('asks for anime and episode, then hands the stream to the player', async () => {
    const menus = []
    let playArgs
    const s = bridge.startSession({
      query: 'fake anime',
      onMenu: async ({ prompt, lines }) => { menus.push({ prompt, lines }); return /anime/i.test(prompt) ? lines[0] : '2' },
      onPlay: async ({ args }) => { playArgs = args; return 0 },
    })
    const r = await s.done
    expect(r.ok).toBe(true)
    expect(menus[0]).toEqual({ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other Show'] })
    expect(menus[1]).toEqual({ prompt: 'Select episode: ', lines: ['1', '2', '3'] })
    expect(playArgs).toContain('--force-media-title=Fake Anime Episode 2')
  })
  it('reports cancelled when the user closes the menu', async () => {
    const r = await bridge.startSession({ query: 'fake', onMenu: async () => null }).done
    expect(r).toMatchObject({ ok: false, error: 'cancelled' })
  })
  it('maps "No results found!" to no-results', async () => {
    const r = await bridge.startSession({ query: 'nothing' }).done
    expect(r).toMatchObject({ ok: false, error: 'no-results' })
  })
  it('downloads into a folder with spaces and non-ASCII characters', async () => {
    const lines = []
    const dir = path.join(tmp, 'Moji anime', 'Fake Anime')
    const r = await bridge.startSession({ query: 'fake', player: 'download', index: 1, episodes: 1, downloadDir: dir, onLine: (l) => lines.push(l) }).done
    expect(r.ok).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'Fake Anime Episode 1.mp4'), 'utf8')).toBe('video')
    expect(lines).toContain('[download]  50.0% of 10.00MiB')
  })
  it('selfTest passes when a link is printed', async () => {
    expect(await bridge.selfTest()).toBe(true)
  })
  it('throws tools-missing when ani-cli is not installed', () => {
    const b = createAniCliBridge({ toolManager: { toolPaths: () => ({ bash: BASH, aniCli: null, gitRoot: null }) }, server, bridges: BRIDGES, getSettings: () => DEFAULT_SETTINGS, historyDir: tmp })
    expect(() => b.startSession({ query: 'x' })).toThrow('tools-missing')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/aniCliBridge.test.js tests/integration/aniCliBridge.test.js`
Expected: FAIL — `src/main/aniCliBridge.js` missing.

- [ ] **Step 4: Implement `src/main/aniCliBridge.js`**

```js
import path from 'node:path'
import crypto from 'node:crypto'
import { toMsysPath } from './paths.js'
import { run } from './run.js'
import { animeLineTitle } from '../shared/domain.js'

export function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

export function mapError(stderr) {
  const s = stripAnsi(stderr)
  if (/No results found/i.test(s)) return 'no-results'
  if (/Episode not released|Out of range/i.test(s)) return 'episode-not-released'
  if (/Blocked by cloudflare/i.test(s)) return 'blocked'
  return 'unknown'
}

export function menuKind(prompt) {
  if (/anime/i.test(prompt)) return 'anime'
  if (/episode/i.test(prompt)) return 'episode'
  return 'other'
}

export function autoAnswer(prompt, lines, { anime = null, episode = null } = {}) {
  const kind = menuKind(prompt)
  if (kind === 'anime' && anime) {
    const want = anime.trim().toLowerCase()
    return lines.find((l) => animeLineTitle(l).toLowerCase() === want) ?? null
  }
  if (kind === 'episode' && episode != null) {
    return lines.find((l) => l.trim() === String(episode)) ?? null
  }
  return null
}

export function parsePlayerArgs(args) {
  const titleArg = args.find((a) => a.startsWith('--force-media-title='))
  const full = titleArg ? titleArg.slice('--force-media-title='.length) : ''
  const m = /^(.*) Episode (\S+)$/.exec(full)
  const url = [...args].reverse().find((a) => !a.startsWith('--')) ?? null
  return { mpvArgs: args, title: m ? m[1] : full, episode: m ? m[2] : null, url }
}

export function buildEnv({ baseEnv, tools, bridges, server, sessionId, player, downloadDir, settings, historyDir }) {
  const env = { ...baseEnv }
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH')
  const oldPath = pathKey ? env[pathKey] : ''
  if (pathKey) delete env[pathKey]
  const dirs = [
    tools.gitRoot && path.join(tools.gitRoot, 'usr', 'bin'),
    tools.gitRoot && path.join(tools.gitRoot, 'mingw64', 'bin'),
    tools.ytDlp && path.dirname(tools.ytDlp),
    tools.ffmpeg && path.dirname(tools.ffmpeg),
    oldPath,
  ].filter(Boolean)
  Object.assign(env, {
    PATH: dirs.join(';'),
    ANI_CLI_MENU: toMsysPath(bridges.menu),
    ANI_CLI_PLAYER: player === 'play' ? toMsysPath(bridges.player) : player,
    ANI_CLI_NO_DETACH: '1',
    ANI_CLI_EXIT_AFTER_PLAY: '1',
    ANI_CLI_LOG: '0',
    ANI_CLI_QUALITY: settings.quality,
    ANI_CLI_MODE: settings.mode,
    ANI_CLI_HIST_DIR: toMsysPath(historyDir),
    ANIMEDESK_PORT: String(server.port),
    ANIMEDESK_TOKEN: server.token,
    ANIMEDESK_SESSION: sessionId,
  })
  if (downloadDir) env.ANI_CLI_DOWNLOAD_DIR = toMsysPath(downloadDir)
  return env
}

export function createAniCliBridge({ toolManager, server, bridges, getSettings, historyDir, runImpl = run, baseEnv = process.env }) {
  function startSession({
    query, player = 'play', episodes = null, index = null, downloadDir = null,
    onMenu = async () => null, onPlay = async () => 0, onLine, timeoutMs,
  }) {
    const tools = toolManager.toolPaths()
    if (!tools.bash || !tools.aniCli) throw new Error('tools-missing')
    const sessionId = crypto.randomUUID()
    let cancelled = false
    server.registerSession(sessionId, {
      onMenu: async (req) => {
        const answer = await onMenu(req)
        if (answer == null) cancelled = true
        return answer
      },
      onPlay,
    })
    const args = [toMsysPath(tools.aniCli)]
    if (index != null) args.push('-S', String(index))
    if (episodes != null) args.push('-e', String(episodes))
    args.push(...String(query).trim().split(/\s+/))
    const env = buildEnv({ baseEnv, tools, bridges, server, sessionId, player, downloadDir, settings: getSettings(), historyDir })
    const proc = runImpl(tools.bash, args, { env, onLine, timeoutMs })
    const done = proc.done.then((r) => {
      server.unregisterSession(sessionId)
      const ok = r.code === 0
      const error = ok ? null : (cancelled || r.killed ? 'cancelled' : mapError(r.stderr))
      return { ok, code: r.code, stdout: r.stdout, stderr: stripAnsi(r.stderr), error }
    })
    return { sessionId, done, kill: () => { cancelled = true; proc.kill() } }
  }

  async function selfTest({ timeoutMs = 30000 } = {}) {
    try {
      const s = startSession({ query: 'one piece', player: 'debug', index: 1, episodes: 1, onMenu: async ({ lines }) => lines[0] ?? null, timeoutMs })
      const r = await s.done
      return r.ok && /Selected link:\s*\n\s*https?:\/\//.test(stripAnsi(r.stdout))
    } catch {
      return false
    }
  }

  return { startSession, selfTest }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/aniCliBridge.test.js tests/integration/aniCliBridge.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/aniCliBridge.js tests/fixtures/fake-ani-cli.sh tests/unit/aniCliBridge.test.js tests/integration/aniCliBridge.test.js
git commit -m "feat: drive the original ani-cli through its menu and player env vars" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Player monitor, IPC channel names and WatchService

**Files:**
- Create: `src/main/playerMonitor.js`, `src/shared/channels.js`, `src/main/watchService.js`
- Test: `tests/unit/playerMonitor.test.js`, `tests/unit/watchService.test.js`

**Interfaces:**
- Consumes: `autoAnswer`, `menuKind`, `parsePlayerArgs` (Task 7); library `recordWatched` (Task 3); settings `get()` (Task 2).
- Produces:
  - `decideWatched({ maxPercent, threshold, autoTrack, askOnClose }) → 'watched'|'ask'|'none'`
  - `createPercentTracker() → { feed(chunk), max }`
  - `createPlayer({ getMpvPath, spawnImpl?, connect?, retryMs?, maxRetries? }) → { play(args: string[]) → Promise<{ exitCode, maxPercent }> }` — spawns mpv with `--input-ipc-server=\\.\pipe\animedesk-mpv-<uuid>` prepended, observes `percent-pos`.
  - `INVOKE` and `EVENTS` channel maps (channels.js, exact values below).
  - `createWatchService({ aniCli, player, library, settings, notify(channel, payload) }) → { watch({query, anime?, episode?}) → {sessionId}, answerMenu(requestId, line|null), cancel(sessionId), playLocal({file, title, episode}) → Promise<decision>, afterPlayback({title, episode, maxPercent}) → decision }`
  - Events emitted: `EVENTS.menu {requestId, sessionId, kind, prompt, lines}`, `EVENTS.playing {title, episode}`, `EVENTS.ask {aniCliTitle, episode}`, `EVENTS.libraryChanged`, `EVENTS.sessionEnd {sessionId, result: {ok, error, stderr}}`.

- [ ] **Step 1: Create `src/shared/channels.js`** (plain constants, no test of its own; Task 12 tests that every INVOKE channel has a handler)

```js
export const INVOKE = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  libraryList: 'library:list',
  libraryAdd: 'library:add',
  libraryUpdate: 'library:update',
  libraryRemove: 'library:remove',
  libraryNote: 'library:note',
  libraryRecord: 'library:record',
  libraryWasCorrupt: 'library:was-corrupt',
  anilistForTitle: 'anilist:for-title',
  anilistSearch: 'anilist:search',
  toolsStatus: 'tools:status',
  toolsInstallMissing: 'tools:install-missing',
  toolsCheckUpdates: 'tools:check-updates',
  healthGet: 'health:get',
  healthRecheck: 'health:recheck',
  watchStart: 'watch:start',
  watchCancel: 'watch:cancel',
  menuAnswer: 'menu:answer',
  downloadsEnqueue: 'downloads:enqueue',
  downloadsPause: 'downloads:pause',
  downloadsResume: 'downloads:resume',
  downloadsCancel: 'downloads:cancel',
  downloadsQueue: 'downloads:queue',
  downloadsList: 'downloads:list',
  downloadsRemove: 'downloads:remove',
  downloadsPlay: 'downloads:play',
  downloadsOpenFolder: 'downloads:open-folder',
  dialogPickFolder: 'dialog:pick-folder',
}

export const EVENTS = {
  health: 'event:health',
  toolProgress: 'event:tool-progress',
  menu: 'event:menu',
  ask: 'event:ask',
  playing: 'event:playing',
  sessionEnd: 'event:session-end',
  libraryChanged: 'event:library-changed',
  downloads: 'event:downloads',
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/playerMonitor.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { decideWatched, createPercentTracker, createPlayer } from '../../src/main/playerMonitor.js'

describe('decideWatched', () => {
  it('uses the threshold', () => {
    expect(decideWatched({ maxPercent: 85, threshold: 85, autoTrack: true, askOnClose: false })).toBe('watched')
    expect(decideWatched({ maxPercent: 84.9, threshold: 85, autoTrack: true, askOnClose: false })).toBe('none')
    expect(decideWatched({ maxPercent: 60, threshold: 50, autoTrack: true, askOnClose: false })).toBe('watched')
  })
  it('asks on close instead of using the threshold', () => {
    expect(decideWatched({ maxPercent: 5, threshold: 85, autoTrack: true, askOnClose: true })).toBe('ask')
  })
  it('does nothing when auto tracking is off', () => {
    expect(decideWatched({ maxPercent: 100, threshold: 85, autoTrack: false, askOnClose: true })).toBe('none')
  })
})

describe('createPercentTracker', () => {
  it('keeps the maximum percent-pos across split chunks and ignores noise', () => {
    const t = createPercentTracker()
    t.feed('{"event":"property-change","id":1,"name":"percent-pos","data":10.5}\n{"event":"prop')
    t.feed('erty-change","id":1,"name":"percent-pos","data":90}\n{"event":"seek"}\nnot json\n')
    t.feed('{"event":"property-change","id":1,"name":"percent-pos","data":30}\n')
    expect(t.max).toBe(90)
  })
})

describe('createPlayer', () => {
  it('spawns mpv with an IPC pipe, observes progress and resolves on exit', async () => {
    const child = new EventEmitter()
    let spawned
    const socket = new EventEmitter()
    socket.written = []
    socket.write = (s) => socket.written.push(s)
    socket.destroy = () => {}
    const player = createPlayer({
      getMpvPath: () => 'C:\\mpv\\mpv.exe',
      spawnImpl: (cmd, args) => { spawned = { cmd, args }; return child },
      connect: () => { setTimeout(() => { socket.emit('connect'); socket.emit('data', Buffer.from('{"event":"property-change","name":"percent-pos","data":88}\n')); child.emit('exit', 0) }, 5); return socket },
      retryMs: 1,
    })
    const r = await player.play(['--force-media-title=A Episode 1', 'https://v'])
    expect(spawned.cmd).toBe('C:\\mpv\\mpv.exe')
    expect(spawned.args[0]).toMatch(/^--input-ipc-server=\\\\\.\\pipe\\animedesk-mpv-/)
    expect(spawned.args.slice(1)).toEqual(['--force-media-title=A Episode 1', 'https://v'])
    expect(socket.written[0]).toBe('{"command":["observe_property",1,"percent-pos"]}\n')
    expect(r).toEqual({ exitCode: 0, maxPercent: 88 })
  })
  it('rejects when mpv is missing', async () => {
    await expect(createPlayer({ getMpvPath: () => null }).play([])).rejects.toThrow('mpv-missing')
  })
})
```

`tests/unit/watchService.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { createWatchService } from '../../src/main/watchService.js'
import { EVENTS } from '../../src/shared/channels.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

function setup({ settings = {}, maxPercent = 90, menus = [] } = {}) {
  const events = []
  let resolveDone
  const aniCli = {
    startSession: vi.fn((opts) => {
      const done = new Promise((r) => { resolveDone = r })
      queueMicrotask(async () => {
        for (const m of menus) m.answer = await opts.onMenu(m)
        await opts.onPlay({ args: ['--force-media-title=Fake Anime Episode 2', 'https://v'] })
        resolveDone({ ok: true, error: null, stderr: '' })
      })
      return { sessionId: 'sid', done, kill: vi.fn() }
    }),
  }
  const player = { play: vi.fn(async () => ({ exitCode: 0, maxPercent })) }
  const library = { recordWatched: vi.fn() }
  const svc = createWatchService({
    aniCli, player, library,
    settings: { get: () => ({ ...DEFAULT_SETTINGS, ...settings }) },
    notify: (ch, p) => events.push([ch, p]),
  })
  return { svc, aniCli, player, library, events, menus }
}
const flush = () => new Promise((r) => setTimeout(r, 20))

describe('watchService', () => {
  it('records the episode when watched past the threshold', async () => {
    const { svc, library, events, player } = setup({ maxPercent: 90 })
    svc.watch({ query: 'fake' })
    await flush()
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=Fake Anime Episode 2', 'https://v'])
    expect(library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Fake Anime', episode: '2' })
    expect(events.map((e) => e[0])).toEqual([EVENTS.playing, EVENTS.libraryChanged, EVENTS.sessionEnd])
  })
  it('does not record below the threshold', async () => {
    const { svc, library } = setup({ maxPercent: 50 })
    svc.watch({ query: 'fake' })
    await flush()
    expect(library.recordWatched).not.toHaveBeenCalled()
  })
  it('asks the UI when askOnClose is on', async () => {
    const { svc, library, events } = setup({ settings: { askOnClose: true } })
    svc.watch({ query: 'fake' })
    await flush()
    expect(library.recordWatched).not.toHaveBeenCalled()
    expect(events).toContainEqual([EVENTS.ask, { aniCliTitle: 'Fake Anime', episode: '2' }])
  })
  it('forwards unknown menus to the UI and resolves them with answerMenu', async () => {
    const menus = [{ prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other'] }]
    const { svc, events } = setup({ menus })
    svc.watch({ query: 'fake' })
    await flush()
    const [, req] = events.find((e) => e[0] === EVENTS.menu)
    expect(req).toMatchObject({ sessionId: 'sid', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Fake Anime', '2 Other'] })
    svc.answerMenu(req.requestId, '2 Other')
    await flush()
    expect(menus[0].answer).toBe('2 Other')
  })
  it('auto-answers menus it already knows (continue watching)', async () => {
    const menus = [{ prompt: 'Select anime: ', lines: ['1 Other', '2 Fake Anime'] }]
    const { svc, events, aniCli } = setup({ menus })
    svc.watch({ query: 'Fake Anime', anime: 'Fake Anime', episode: '3' })
    await flush()
    expect(menus[0].answer).toBe('2 Fake Anime')
    expect(events.some((e) => e[0] === EVENTS.menu)).toBe(false)
    expect(aniCli.startSession.mock.calls[0][0]).toMatchObject({ query: 'Fake Anime', player: 'play', episodes: '3' })
  })
  it('plays local files and applies the same rule', async () => {
    const { svc, player, library } = setup({ maxPercent: 99 })
    expect(await svc.playLocal({ file: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1' })).toBe('watched')
    expect(player.play).toHaveBeenCalledWith(['--force-media-title=A Episode 1', 'D:\\A\\A Episode 1.mp4'])
    expect(library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'A', episode: '1' })
  })
  it('cancel kills the session and resolves pending menus with null', async () => {
    const menus = [{ prompt: 'Select anime: ', lines: ['1 X'] }]
    const { svc, aniCli } = setup({ menus })
    const { sessionId } = svc.watch({ query: 'x' })
    await flush()
    svc.cancel(sessionId)
    await flush()
    expect(menus[0].answer).toBeNull()
    expect(aniCli.startSession.mock.results[0].value.kill).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/playerMonitor.test.js tests/unit/watchService.test.js`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement `src/main/playerMonitor.js`**

```js
import { spawn } from 'node:child_process'
import net from 'node:net'
import crypto from 'node:crypto'

export function decideWatched({ maxPercent, threshold, autoTrack, askOnClose }) {
  if (!autoTrack) return 'none'
  if (askOnClose) return 'ask'
  return maxPercent >= threshold ? 'watched' : 'none'
}

export function createPercentTracker() {
  let buf = ''
  let max = 0
  return {
    feed(chunk) {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        try {
          const m = JSON.parse(line)
          if (m.event === 'property-change' && m.name === 'percent-pos' && typeof m.data === 'number') max = Math.max(max, m.data)
        } catch {
          // mpv may send non-JSON noise; ignore it
        }
      }
    },
    get max() { return max },
  }
}

export function createPlayer({ getMpvPath, spawnImpl = spawn, connect = net.connect, retryMs = 250, maxRetries = 40 }) {
  return {
    play(args) {
      return new Promise((resolve, reject) => {
        const mpv = getMpvPath()
        if (!mpv) return reject(new Error('mpv-missing'))
        const pipe = `\\\\.\\pipe\\animedesk-mpv-${crypto.randomUUID()}`
        const child = spawnImpl(mpv, [`--input-ipc-server=${pipe}`, ...args], { stdio: 'ignore' })
        const tracker = createPercentTracker()
        let socket = null
        let tries = 0
        let exited = false

        const tryConnect = () => {
          if (exited) return
          socket = connect(pipe)
          socket.on('connect', () => socket.write('{"command":["observe_property",1,"percent-pos"]}\n'))
          socket.on('data', (d) => tracker.feed(d.toString()))
          socket.on('error', () => {
            socket.destroy()
            if (!exited && ++tries < maxRetries) setTimeout(tryConnect, retryMs)
          })
        }
        setTimeout(tryConnect, retryMs)

        child.on('error', reject)
        child.on('exit', (code) => {
          exited = true
          socket?.destroy()
          resolve({ exitCode: code ?? 0, maxPercent: tracker.max })
        })
      })
    },
  }
}
```

- [ ] **Step 5: Implement `src/main/watchService.js`**

```js
import crypto from 'node:crypto'
import { EVENTS } from '../shared/channels.js'
import { autoAnswer, menuKind, parsePlayerArgs } from './aniCliBridge.js'
import { decideWatched } from './playerMonitor.js'

export function createWatchService({ aniCli, player, library, settings, notify }) {
  const pending = new Map() // requestId -> { sessionId, resolve }
  const sessions = new Map() // sessionId -> session

  function afterPlayback({ title, episode, maxPercent }) {
    const s = settings.get()
    const decision = decideWatched({ maxPercent, threshold: s.watchedThreshold, autoTrack: s.autoTrack, askOnClose: s.askOnClose })
    if (episode == null) return 'none'
    if (decision === 'watched') {
      library.recordWatched({ aniCliTitle: title, episode })
      notify(EVENTS.libraryChanged)
    }
    if (decision === 'ask') notify(EVENTS.ask, { aniCliTitle: title, episode })
    return decision
  }

  function answerMenu(requestId, line) {
    const p = pending.get(requestId)
    if (!p) return
    pending.delete(requestId)
    p.resolve(line ?? null)
  }

  function watch({ query, anime = null, episode = null }) {
    let sessionId = null
    const session = aniCli.startSession({
      query,
      player: 'play',
      episodes: episode,
      onMenu: ({ prompt, lines }) => {
        const auto = autoAnswer(prompt, lines, { anime, episode })
        if (auto) return Promise.resolve(auto)
        return new Promise((resolve) => {
          const requestId = crypto.randomUUID()
          pending.set(requestId, { sessionId, resolve })
          notify(EVENTS.menu, { requestId, sessionId, kind: menuKind(prompt), prompt, lines })
        })
      },
      onPlay: async ({ args }) => {
        const info = parsePlayerArgs(args)
        notify(EVENTS.playing, { title: info.title, episode: info.episode })
        const r = await player.play(info.mpvArgs)
        afterPlayback({ title: info.title, episode: info.episode, maxPercent: r.maxPercent })
        return r.exitCode
      },
    })
    sessionId = session.sessionId
    sessions.set(sessionId, session)
    session.done.then((result) => {
      sessions.delete(sessionId)
      notify(EVENTS.sessionEnd, { sessionId, result: { ok: result.ok, error: result.error, stderr: result.stderr } })
    })
    return { sessionId }
  }

  function cancel(sessionId) {
    for (const [requestId, p] of pending) if (p.sessionId === sessionId) answerMenu(requestId, null)
    sessions.get(sessionId)?.kill()
  }

  async function playLocal({ file, title, episode }) {
    const r = await player.play([`--force-media-title=${title} Episode ${episode}`, file])
    return afterPlayback({ title, episode: String(episode), maxPercent: r.maxPercent })
  }

  return { watch, answerMenu, cancel, playLocal, afterPlayback }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/playerMonitor.test.js tests/unit/watchService.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/channels.js src/main/playerMonitor.js src/main/watchService.js tests/unit/playerMonitor.test.js tests/unit/watchService.test.js
git commit -m "feat: mpv progress tracking and watch flow with automatic watchlist updates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Downloads (queue + downloaded list)

**Files:**
- Create: `src/main/downloads.js`
- Test: `tests/unit/downloads.test.js`

**Interfaces:**
- Consumes: `aniCli.startSession` (Task 7), `autoAnswer` (Task 7), `safeDirName` (Task 1), `readJson`/`writeJsonAtomic` (Task 1).
- Produces:
  - `parseProgress(line) → number|null`
  - `createDownloads({ file, aniCli, onChange?, now?, uuid? }) → { enqueue({title, aniCliTitle, episodes: string[], dir}) → queueItems, pause(id), resume(id), cancel(id), queueItems() → item[], listDownloaded() → entry[], getDownloaded(id) → entry|null, removeDownloaded(id, {deleteFile}) → boolean }`
  - Queue item: `{ id, title, aniCliTitle, episode, dir, status: 'queued'|'downloading'|'paused'|'done'|'error', percent, error }`.
  - Downloaded entry: `{ id, title, episode, path, size, downloadedAt, missing }` (`missing` computed on read). Persisted in `downloads.json` as `{ version: 1, items: [...] }` without `missing`.
  - Only one download session runs at a time. Files land in `<dir>/<safeDirName(title)>/`.

- [ ] **Step 1: Write the failing test**

`tests/unit/downloads.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDownloads, parseProgress } from '../../src/main/downloads.js'

let base, sessions, aniCli, dl, changes
function fakeAniCli() {
  sessions = []
  return {
    startSession: vi.fn((opts) => {
      let finish
      const s = { opts, done: new Promise((r) => { finish = r }), kill: vi.fn(() => finish({ ok: false, error: 'cancelled' })) }
      s.finish = (ok = true, writeFile = true) => {
        if (ok && writeFile) {
          fs.mkdirSync(opts.downloadDir, { recursive: true })
          // ani-cli names the file after its own title; NTFS forbids ":" so the fake swaps it
          fs.writeFileSync(path.join(opts.downloadDir, `${opts.query.replace(/:/g, ' ')} Episode ${opts.episodes}.mp4`), 'video')
        }
        finish(ok ? { ok: true, error: null } : { ok: false, error: 'unknown' })
      }
      sessions.push(s)
      return s
    }),
  }
}
const flush = () => new Promise((r) => setTimeout(r, 10))

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-dls-'))
  aniCli = fakeAniCli()
  changes = 0
  let n = 0
  dl = createDownloads({ file: path.join(base, 'downloads.json'), aniCli, onChange: () => changes++, uuid: () => `d${++n}`, now: () => '2026-10-01T00:00:00Z' })
})

describe('parseProgress', () => {
  it('reads yt-dlp percentages', () => {
    expect(parseProgress('[download]  42.3% of ~ 250.00MiB at 3.00MiB/s ETA 01:02')).toBe(42.3)
    expect(parseProgress('[download] 100% of 10.00MiB')).toBe(100)
    expect(parseProgress('[hlsnative] Downloading m3u8 manifest')).toBeNull()
  })
})

describe('downloads', () => {
  it('runs one episode at a time into a safe series folder', async () => {
    dl.enqueue({ title: 'Re:Zero', aniCliTitle: 'Re:Zero', episodes: ['1', '2'], dir: base })
    expect(aniCli.startSession).toHaveBeenCalledTimes(1)
    const opts = sessions[0].opts
    expect(opts).toMatchObject({ query: 'Re:Zero', player: 'download', episodes: '1', downloadDir: path.join(base, 'Re Zero') })
    await expect(opts.onMenu({ prompt: 'Select anime: ', lines: ['1 Other', '2 Re:Zero'] })).resolves.toBe('2 Re:Zero')
    expect(dl.queueItems().map((i) => i.status)).toEqual(['downloading', 'queued'])
    opts.onLine('[download]  42.0% of 10MiB')
    expect(dl.queueItems()[0].percent).toBe(42)
    sessions[0].finish()
    await flush()
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
    expect(dl.queueItems().map((i) => i.status)).toEqual(['done', 'downloading'])
    const [entry] = dl.listDownloaded()
    expect(entry).toMatchObject({ title: 'Re:Zero', episode: '1', path: path.join(base, 'Re Zero', 'Re Zero Episode 1.mp4'), size: 5, missing: false })
    expect(changes).toBeGreaterThan(0)
  })
  it('pauses (killing the session) and resumes', async () => {
    const [item] = dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    dl.pause(item.id)
    await flush()
    expect(sessions[0].kill).toHaveBeenCalled()
    expect(dl.queueItems()[0].status).toBe('paused')
    dl.resume(item.id)
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
    expect(dl.queueItems()[0].status).toBe('downloading')
  })
  it('cancel removes the item from the queue', async () => {
    const [item] = dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    dl.cancel(item.id)
    await flush()
    expect(dl.queueItems()).toEqual([])
  })
  it('marks errors and continues with the next item', async () => {
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1', '2'], dir: base })
    sessions[0].finish(false)
    await flush()
    expect(dl.queueItems()[0]).toMatchObject({ status: 'error', error: 'unknown' })
    expect(aniCli.startSession).toHaveBeenCalledTimes(2)
  })
  it('reports file-not-found when ani-cli succeeded but no file exists', async () => {
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    sessions[0].finish(true, false)
    await flush()
    expect(dl.queueItems()[0]).toMatchObject({ status: 'error', error: 'file-not-found' })
  })
  it('persists downloaded entries, flags missing files and deletes on request', async () => {
    dl.enqueue({ title: 'A', aniCliTitle: 'A', episodes: ['1'], dir: base })
    sessions[0].finish()
    await flush()
    const again = createDownloads({ file: path.join(base, 'downloads.json'), aniCli })
    const [entry] = again.listDownloaded()
    expect(again.getDownloaded(entry.id).path).toBe(entry.path)
    fs.rmSync(entry.path)
    expect(again.listDownloaded()[0].missing).toBe(true)
    expect(again.removeDownloaded(entry.id, { deleteFile: true })).toBe(true)
    expect(again.listDownloaded()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/downloads.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/downloads.js`**

```js
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'
import { safeDirName } from './paths.js'
import { autoAnswer } from './aniCliBridge.js'

export function parseProgress(line) {
  const m = /\[download\]\s+([\d.]+)%/.exec(line)
  return m ? Number(m[1]) : null
}

function findEpisodeFile(dir, episode) {
  let names
  try { names = fs.readdirSync(dir) } catch { return null }
  const name = names.find((n) => n.endsWith(` Episode ${episode}.mp4`))
  return name ? path.join(dir, name) : null
}

export function createDownloads({ file, aniCli, onChange = () => {}, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() }) {
  const db = readJson(file, { version: 1, items: [] }).data
  const save = () => writeJsonAtomic(file, db)
  let queue = []
  let active = null // { item, session }

  const emit = () => onChange()

  function start(item) {
    const targetDir = path.join(item.dir, safeDirName(item.title))
    item.status = 'downloading'
    item.percent = 0
    item.error = null
    const session = aniCli.startSession({
      query: item.aniCliTitle,
      player: 'download',
      episodes: item.episode,
      downloadDir: targetDir,
      onMenu: async ({ prompt, lines }) => autoAnswer(prompt, lines, { anime: item.aniCliTitle, episode: item.episode }),
      onLine: (line) => {
        const p = parseProgress(line)
        if (p != null) { item.percent = p; emit() }
      },
    })
    active = { item, session }
    emit()
    session.done.then((r) => {
      active = null
      if (item.status === 'downloading') {
        if (r.ok) {
          const found = findEpisodeFile(targetDir, item.episode)
          if (found) {
            db.items.push({ id: uuid(), title: item.title, episode: item.episode, path: found, size: fs.statSync(found).size, downloadedAt: now() })
            save()
            item.status = 'done'
            item.percent = 100
          } else {
            item.status = 'error'
            item.error = 'file-not-found'
          }
        } else {
          item.status = 'error'
          item.error = r.error ?? 'unknown'
        }
      }
      emit()
      pump()
    })
  }

  function pump() {
    if (active) return
    const next = queue.find((i) => i.status === 'queued')
    if (next) start(next)
  }

  function enqueue({ title, aniCliTitle, episodes, dir }) {
    for (const episode of episodes) {
      queue.push({ id: uuid(), title, aniCliTitle, episode: String(episode), dir, status: 'queued', percent: 0, error: null })
    }
    emit()
    pump()
    return queueItems()
  }

  function pause(id) {
    const item = queue.find((i) => i.id === id)
    if (!item) return
    if (item.status === 'downloading' && active?.item === item) {
      item.status = 'paused'
      active.session.kill()
    } else if (item.status === 'queued') {
      item.status = 'paused'
    }
    emit()
  }

  function resume(id) {
    const item = queue.find((i) => i.id === id)
    if (!item || !['paused', 'error'].includes(item.status)) return
    item.status = 'queued'
    emit()
    pump()
  }

  function cancel(id) {
    const item = queue.find((i) => i.id === id)
    if (!item) return
    queue = queue.filter((i) => i !== item)
    if (active?.item === item) {
      item.status = 'cancelled'
      active.session.kill()
    }
    emit()
  }

  const queueItems = () => queue.map((i) => ({ ...i }))
  const withMissing = (e) => ({ ...e, missing: !fs.existsSync(e.path) })

  return {
    enqueue, pause, resume, cancel, queueItems,
    listDownloaded: () => db.items.map(withMissing),
    getDownloaded: (id) => { const e = db.items.find((x) => x.id === id); return e ? withMissing(e) : null },
    removeDownloaded(id, { deleteFile = false } = {}) {
      const e = db.items.find((x) => x.id === id)
      if (!e) return false
      if (deleteFile) fs.rmSync(e.path, { force: true })
      db.items = db.items.filter((x) => x !== e)
      save()
      return true
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/downloads.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/downloads.js tests/unit/downloads.test.js
git commit -m "feat: download queue with progress, pause/resume and downloaded list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: AniList client with cache

**Files:**
- Create: `src/main/anilist.js`
- Test: `tests/unit/anilist.test.js`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic` (Task 1).
- Produces:
  - `cleanDescription(html) → string`, `bestMatch(title, media[]) → media|null`
  - `createAniList({ cacheDir, fetchImpl? }) → { search(title) → Promise<info[]>, getForTitle(title, { aniListId? }) → Promise<info|null> }`
  - `info = { id, title, romaji, genres: string[], year: number|null, episodes: number|null, description: string, coverUrl: string|null, poster: string|null }` — `poster` is a `data:` URL (so the renderer needs no network and it works offline from cache).
  - `getForTitle` never throws: network failure → cached value or `null`.

- [ ] **Step 1: Write the failing test**

`tests/unit/anilist.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAniList, bestMatch, cleanDescription } from '../../src/main/anilist.js'

const media = (id, romaji, english, extra = {}) => ({
  id, title: { romaji, english, native: null }, coverImage: { large: `https://img/${id}.jpg` },
  genres: ['Action'], seasonYear: 2020, episodes: 12, description: 'Line one<br><br>Line <i>two</i>', ...extra,
})

let cacheDir, fetchImpl, api
function mkFetch(list) {
  return vi.fn(async (url, init) => {
    if (url.startsWith('https://img/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    const body = JSON.parse(init.body)
    if (body.variables.id) return Response.json({ data: { Media: list.find((m) => m.id === body.variables.id) ?? null } })
    return Response.json({ data: { Page: { media: list } } })
  })
}
beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-al-'))
  fetchImpl = mkFetch([media(1, 'Shingeki no Kyojin', 'Attack on Titan'), media(2, 'Frieren', 'Frieren: Beyond Journey’s End')])
  api = createAniList({ cacheDir, fetchImpl })
})

describe('anilist', () => {
  it('cleans HTML out of descriptions', () => {
    expect(cleanDescription('Line one<br><br>Line <i>two</i>')).toBe('Line one\n\nLine two')
    expect(cleanDescription(null)).toBe('')
  })
  it('prefers an exact title match on any title, else the first result', () => {
    const list = [media(1, 'A', 'B'), media(2, 'Shingeki no Kyojin', 'Attack on Titan')]
    expect(bestMatch('attack on titan', list).id).toBe(2)
    expect(bestMatch('Something else', list).id).toBe(1)
    expect(bestMatch('x', [])).toBeNull()
  })
  it('returns info with an embedded poster and caches it', async () => {
    const info = await api.getForTitle('Attack on Titan')
    expect(info).toMatchObject({ id: 1, title: 'Attack on Titan', romaji: 'Shingeki no Kyojin', genres: ['Action'], year: 2020, episodes: 12, description: 'Line one\n\nLine two' })
    expect(info.poster).toBe('data:image/jpeg;base64,AQID')
    const calls = fetchImpl.mock.calls.length
    const again = createAniList({ cacheDir, fetchImpl })
    expect(await again.getForTitle('attack on titan')).toEqual(info)
    expect(fetchImpl.mock.calls.length).toBe(calls)
  })
  it('fetches by id when the user linked a specific entry', async () => {
    expect((await api.getForTitle('whatever', { aniListId: 2 })).id).toBe(2)
  })
  it('returns null instead of throwing when offline and nothing is cached', async () => {
    const offline = createAniList({ cacheDir, fetchImpl: async () => { throw new Error('offline') } })
    expect(await offline.getForTitle('X')).toBeNull()
  })
  it('search returns info objects without posters', async () => {
    const r = await api.search('fri')
    expect(r.map((i) => i.id)).toEqual([1, 2])
    expect(r[0].poster).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/anilist.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/anilist.js`**

```js
import path from 'node:path'
import crypto from 'node:crypto'
import { readJson, writeJsonAtomic } from './jsonStore.js'

const ENDPOINT = 'https://graphql.anilist.co'
const FIELDS = 'id title { romaji english native } coverImage { large } genres seasonYear episodes description(asHtml: false)'
const SEARCH = `query ($search: String) { Page(perPage: 10) { media(search: $search, type: ANIME) { ${FIELDS} } } }`
const BY_ID = `query ($id: Int) { Media(id: $id, type: ANIME) { ${FIELDS} } }`

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export function cleanDescription(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function bestMatch(title, results) {
  const n = norm(title)
  return results.find((r) => [r.title.romaji, r.title.english, r.title.native].some((t) => t && norm(t) === n)) ?? results[0] ?? null
}

function toInfo(m) {
  return {
    id: m.id,
    title: m.title.english ?? m.title.romaji,
    romaji: m.title.romaji,
    genres: m.genres ?? [],
    year: m.seasonYear ?? null,
    episodes: m.episodes ?? null,
    description: cleanDescription(m.description),
    coverUrl: m.coverImage?.large ?? null,
    poster: null,
  }
}

export function createAniList({ cacheDir, fetchImpl = fetch }) {
  async function gql(query, variables) {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
    return (await res.json()).data
  }

  async function posterDataUrl(url) {
    if (!url) return null
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  }

  const cacheFile = (key) => path.join(cacheDir, `${crypto.createHash('sha1').update(key).digest('hex')}.json`)

  async function search(title) {
    const data = await gql(SEARCH, { search: title })
    return data.Page.media.map(toInfo)
  }

  async function getForTitle(title, { aniListId = null } = {}) {
    const key = aniListId ? `id:${aniListId}` : `t:${norm(title)}`
    const file = cacheFile(key)
    const cached = readJson(file, null).data
    if (cached) return cached
    try {
      let m
      if (aniListId) m = (await gql(BY_ID, { id: aniListId })).Media
      else m = bestMatch(title, (await gql(SEARCH, { search: title })).Page.media)
      if (!m) return null
      const info = toInfo(m)
      info.poster = await posterDataUrl(info.coverUrl).catch(() => null)
      writeJsonAtomic(file, info)
      return info
    } catch {
      return null
    }
  }

  return { search, getForTitle }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/anilist.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/anilist.js tests/unit/anilist.test.js
git commit -m "feat: AniList metadata with offline cache and embedded posters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Health check (semaphore logic)

**Files:**
- Create: `src/main/healthCheck.js`
- Test: `tests/unit/healthCheck.test.js`

**Interfaces:**
- Consumes: `toolManager.missing()`, `toolManager.updateAll(ids)`, `toolManager.lastUpdateCheck()`, `toolManager.markUpdateCheck(iso)` (Task 5); `aniCli.selfTest()` (Task 7); `AUTO_UPDATE_TOOLS` (Task 5).
- Produces:
  - `healthState(reason, extra?) → { light: 'green'|'yellow'|'red', reason, ...extra }` with reasons `ok→green`, `checking|updating→yellow`, `missing-tools|source-down|offline→red`.
  - `shouldDailyCheck(lastIso|null, nowIso) → boolean` (≥ 24 h).
  - `createHealthCheck({ toolManager, aniCli, isOnline, onState? }) → { run() → Promise<state>, get() → state, dailyUpdate({ enabled, now }) → Promise<string[]> }`. Concurrent `run()` calls share one run.

- [ ] **Step 1: Write the failing test**

`tests/unit/healthCheck.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { createHealthCheck, healthState, shouldDailyCheck } from '../../src/main/healthCheck.js'

function setup({ missing = [], online = true, tests = [true], updates = [] } = {}) {
  const states = []
  const toolManager = {
    missing: () => missing,
    updateAll: vi.fn(async () => updates),
    lastUpdateCheck: vi.fn(() => null),
    markUpdateCheck: vi.fn(),
  }
  const aniCli = { selfTest: vi.fn(async () => tests.shift() ?? false) }
  const hc = createHealthCheck({ toolManager, aniCli, isOnline: async () => online, onState: (s) => states.push(s.reason) })
  return { hc, states, toolManager, aniCli }
}

describe('healthState', () => {
  it('maps reasons to lights', () => {
    expect(healthState('ok').light).toBe('green')
    expect(healthState('checking').light).toBe('yellow')
    expect(healthState('updating').light).toBe('yellow')
    expect(healthState('missing-tools', { missing: ['mpv'] })).toEqual({ light: 'red', reason: 'missing-tools', missing: ['mpv'] })
    expect(healthState('source-down').light).toBe('red')
    expect(healthState('offline').light).toBe('red')
  })
})

describe('healthCheck', () => {
  it('is red with the list when tools are missing, without touching the network', async () => {
    const { hc, aniCli } = setup({ missing: ['mpv', 'ffmpeg'] })
    expect(await hc.run()).toEqual({ light: 'red', reason: 'missing-tools', missing: ['mpv', 'ffmpeg'] })
    expect(aniCli.selfTest).not.toHaveBeenCalled()
  })
  it('is red when offline', async () => {
    const { hc } = setup({ online: false })
    expect((await hc.run()).reason).toBe('offline')
  })
  it('is green when the self-test passes', async () => {
    const { hc, states } = setup()
    expect((await hc.run()).light).toBe('green')
    expect(states).toEqual(['checking', 'ok'])
  })
  it('updates ani-cli/yt-dlp and retests when the self-test fails', async () => {
    const { hc, states, toolManager } = setup({ tests: [false, true], updates: ['ani-cli'] })
    expect((await hc.run()).reason).toBe('ok')
    expect(toolManager.updateAll).toHaveBeenCalledWith(['ani-cli', 'yt-dlp'])
    expect(states).toEqual(['checking', 'updating', 'ok'])
  })
  it('is source-down when there is no update or it does not help', async () => {
    expect((await setup({ tests: [false], updates: [] }).hc.run()).reason).toBe('source-down')
    expect((await setup({ tests: [false, false], updates: ['ani-cli'] }).hc.run()).reason).toBe('source-down')
  })
  it('is source-down when updating throws', async () => {
    const s = setup({ tests: [false] })
    s.toolManager.updateAll.mockRejectedValue(new Error('rate limited'))
    expect((await s.hc.run()).reason).toBe('source-down')
  })
  it('shares one run between concurrent callers', async () => {
    const { hc, aniCli } = setup()
    await Promise.all([hc.run(), hc.run()])
    expect(aniCli.selfTest).toHaveBeenCalledTimes(1)
  })
  it('daily update runs at most once per 24h and only when enabled', async () => {
    expect(shouldDailyCheck(null, '2026-10-01T00:00:00Z')).toBe(true)
    expect(shouldDailyCheck('2026-10-01T00:00:00Z', '2026-10-01T23:59:00Z')).toBe(false)
    expect(shouldDailyCheck('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z')).toBe(true)
    const { hc, toolManager } = setup({ updates: ['yt-dlp'] })
    expect(await hc.dailyUpdate({ enabled: false, now: '2026-10-01T00:00:00Z' })).toEqual([])
    expect(await hc.dailyUpdate({ enabled: true, now: '2026-10-01T00:00:00Z' })).toEqual(['yt-dlp'])
    expect(toolManager.markUpdateCheck).toHaveBeenCalledWith('2026-10-01T00:00:00Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/healthCheck.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/healthCheck.js`**

```js
import { AUTO_UPDATE_TOOLS } from './toolSources.js'

const LIGHT = {
  ok: 'green',
  checking: 'yellow',
  updating: 'yellow',
  'missing-tools': 'red',
  'source-down': 'red',
  offline: 'red',
}

export function healthState(reason, extra = {}) {
  return { light: LIGHT[reason], reason, ...extra }
}

export function shouldDailyCheck(last, now) {
  return !last || Date.parse(now) - Date.parse(last) >= 24 * 60 * 60 * 1000
}

export function createHealthCheck({ toolManager, aniCli, isOnline, onState = () => {} }) {
  let state = healthState('checking')
  let running = null

  const set = (s) => { state = s; onState(s); return s }
  const safeTest = async () => { try { return await aniCli.selfTest() } catch { return false } }

  async function check() {
    const missing = toolManager.missing()
    if (missing.length) return set(healthState('missing-tools', { missing }))
    set(healthState('checking'))
    if (!(await isOnline())) return set(healthState('offline'))
    if (await safeTest()) return set(healthState('ok'))
    set(healthState('updating'))
    try {
      const updated = await toolManager.updateAll(AUTO_UPDATE_TOOLS)
      if (updated.length && (await safeTest())) return set(healthState('ok'))
    } catch {
      // fall through to source-down
    }
    return set(healthState('source-down'))
  }

  function run() {
    if (!running) running = check().finally(() => { running = null })
    return running
  }

  async function dailyUpdate({ enabled, now }) {
    if (!enabled || !shouldDailyCheck(toolManager.lastUpdateCheck(), now)) return []
    toolManager.markUpdateCheck(now)
    try {
      return await toolManager.updateAll(AUTO_UPDATE_TOOLS)
    } catch {
      return []
    }
  }

  return { run, get: () => state, dailyUpdate }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/healthCheck.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/healthCheck.js tests/unit/healthCheck.test.js
git commit -m "feat: health check with self-test, auto-update and semaphore states" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: IPC handlers, preload API and Electron entry

**Files:**
- Create: `src/main/ipc.js`, `src/preload/index.js`, `src/main/index.js`
- Test: `tests/unit/ipc.test.js`

**Interfaces:**
- Consumes: everything from Tasks 2–11; `INVOKE`, `EVENTS` (Task 8).
- Produces:
  - `createHandlers(services) → { [INVOKE channel]: fn(...args) }` where `services = { settings, library, anilist, toolManager, health, watch, downloads, electron: { pickFolder() → Promise<string|null>, showItemInFolder(path) }, send(channel, payload?) }`.
  - `registerIpc(ipcMain, handlers)`.
  - `window.animedesk` (preload) — the renderer API used by Tasks 13–17:
    ```
    settings: { get(), update(patch) }
    library: { list(), add(entry), update(id, patch), remove(id), setEpisodeNote(id, ep, text), recordWatched({aniCliTitle, episode}), wasCorrupt() }
    anilist: { forTitle(title, aniListId?), search(query) }
    tools: { status(), installMissing(), checkUpdates(), onProgress(cb) }
    health: { get(), recheck(), onChange(cb) }
    watch: { start({query, anime?, episode?}), cancel(sessionId), answerMenu(requestId, line|null), onMenu(cb), onAsk(cb), onPlaying(cb), onSessionEnd(cb) }
    downloads: { enqueue({title, aniCliTitle, episodes, dir}), pause(id), resume(id), cancel(id), queue(), list(), remove(id, deleteFile), play(id), openFolder(id), onChange(cb) }
    dialog: { pickFolder() }
    onLibraryChanged(cb)
    ```
    Every `on…(cb)` returns an unsubscribe function.

- [ ] **Step 1: Write the failing test**

`tests/unit/ipc.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { INVOKE, EVENTS } from '../../src/shared/channels.js'
import { createHandlers, registerIpc } from '../../src/main/ipc.js'

function services() {
  return {
    settings: { get: vi.fn(() => ({ language: 'sr' })), update: vi.fn((p) => p) },
    library: { list: vi.fn(() => []), add: vi.fn(), update: vi.fn(), remove: vi.fn(), setEpisodeNote: vi.fn(), recordWatched: vi.fn(() => ({ id: 'a' })), wasCorrupt: true },
    anilist: { getForTitle: vi.fn(), search: vi.fn() },
    toolManager: { status: vi.fn(), installMissing: vi.fn(async (cb) => { cb({ id: 'mpv', phase: 'done' }); return {} }), updateAll: vi.fn(async () => []) },
    health: { get: vi.fn(), run: vi.fn() },
    watch: { watch: vi.fn(), cancel: vi.fn(), answerMenu: vi.fn(), playLocal: vi.fn(async () => 'watched') },
    downloads: { enqueue: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), queueItems: vi.fn(), listDownloaded: vi.fn(), removeDownloaded: vi.fn(), getDownloaded: vi.fn((id) => (id === 'd1' ? { path: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1' } : null)) },
    electron: { pickFolder: vi.fn(async () => 'D:\\X'), showItemInFolder: vi.fn() },
    send: vi.fn(),
  }
}

describe('ipc', () => {
  it('has a handler for every INVOKE channel and nothing else', () => {
    expect(Object.keys(createHandlers(services())).sort()).toEqual(Object.values(INVOKE).sort())
  })
  it('forwards arguments', async () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.libraryUpdate]('id1', { rating: 8 })
    expect(s.library.update).toHaveBeenCalledWith('id1', { rating: 8 })
    h[INVOKE.anilistForTitle]('Frieren', 5)
    expect(s.anilist.getForTitle).toHaveBeenCalledWith('Frieren', { aniListId: 5 })
    h[INVOKE.downloadsRemove]('d1', true)
    expect(s.downloads.removeDownloaded).toHaveBeenCalledWith('d1', { deleteFile: true })
    expect(h[INVOKE.libraryWasCorrupt]()).toBe(true)
  })
  it('recordWatched notifies library-changed', () => {
    const s = services()
    createHandlers(s)[INVOKE.libraryRecord]({ aniCliTitle: 'A', episode: '1' })
    expect(s.send).toHaveBeenCalledWith(EVENTS.libraryChanged)
  })
  it('installMissing streams progress and re-runs the health check', async () => {
    const s = services()
    await createHandlers(s)[INVOKE.toolsInstallMissing]()
    expect(s.send).toHaveBeenCalledWith(EVENTS.toolProgress, { id: 'mpv', phase: 'done' })
    expect(s.health.run).toHaveBeenCalled()
  })
  it('plays and opens downloaded files by id', async () => {
    const s = services()
    const h = createHandlers(s)
    expect(await h[INVOKE.downloadsPlay]('d1')).toBe('watched')
    expect(s.watch.playLocal).toHaveBeenCalledWith({ file: 'D:\\A\\A Episode 1.mp4', title: 'A', episode: '1' })
    h[INVOKE.downloadsOpenFolder]('d1')
    expect(s.electron.showItemInFolder).toHaveBeenCalledWith('D:\\A\\A Episode 1.mp4')
    expect(await h[INVOKE.downloadsPlay]('nope')).toBeNull()
  })
  it('registerIpc strips the event argument', async () => {
    const ipcMain = { handle: vi.fn() }
    const fn = vi.fn(() => 42)
    registerIpc(ipcMain, { 'x:y': fn })
    const [[channel, wrapped]] = ipcMain.handle.mock.calls
    expect(channel).toBe('x:y')
    expect(await wrapped({ sender: {} }, 1, 2)).toBe(42)
    expect(fn).toHaveBeenCalledWith(1, 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ipc.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/ipc.js`**

```js
import { INVOKE, EVENTS } from '../shared/channels.js'

export function createHandlers(s) {
  const progress = (p) => s.send(EVENTS.toolProgress, p)
  return {
    [INVOKE.settingsGet]: () => s.settings.get(),
    [INVOKE.settingsUpdate]: (patch) => s.settings.update(patch),
    [INVOKE.libraryList]: () => s.library.list(),
    [INVOKE.libraryAdd]: (entry) => s.library.add(entry),
    [INVOKE.libraryUpdate]: (id, patch) => s.library.update(id, patch),
    [INVOKE.libraryRemove]: (id) => s.library.remove(id),
    [INVOKE.libraryNote]: (id, episode, text) => s.library.setEpisodeNote(id, episode, text),
    [INVOKE.libraryRecord]: (payload) => {
      const entry = s.library.recordWatched(payload)
      s.send(EVENTS.libraryChanged)
      return entry
    },
    [INVOKE.libraryWasCorrupt]: () => s.library.wasCorrupt,
    [INVOKE.anilistForTitle]: (title, aniListId = null) => s.anilist.getForTitle(title, { aniListId }),
    [INVOKE.anilistSearch]: (query) => s.anilist.search(query),
    [INVOKE.toolsStatus]: () => s.toolManager.status(),
    [INVOKE.toolsInstallMissing]: async () => {
      const errors = await s.toolManager.installMissing(progress)
      s.health.run()
      return errors
    },
    [INVOKE.toolsCheckUpdates]: async () => {
      const updated = await s.toolManager.updateAll(undefined, progress)
      s.health.run()
      return updated
    },
    [INVOKE.healthGet]: () => s.health.get(),
    [INVOKE.healthRecheck]: () => s.health.run(),
    [INVOKE.watchStart]: (params) => s.watch.watch(params),
    [INVOKE.watchCancel]: (sessionId) => s.watch.cancel(sessionId),
    [INVOKE.menuAnswer]: (requestId, line) => s.watch.answerMenu(requestId, line),
    [INVOKE.downloadsEnqueue]: (params) => s.downloads.enqueue(params),
    [INVOKE.downloadsPause]: (id) => s.downloads.pause(id),
    [INVOKE.downloadsResume]: (id) => s.downloads.resume(id),
    [INVOKE.downloadsCancel]: (id) => s.downloads.cancel(id),
    [INVOKE.downloadsQueue]: () => s.downloads.queueItems(),
    [INVOKE.downloadsList]: () => s.downloads.listDownloaded(),
    [INVOKE.downloadsRemove]: (id, deleteFile) => s.downloads.removeDownloaded(id, { deleteFile }),
    [INVOKE.downloadsPlay]: async (id) => {
      const d = s.downloads.getDownloaded(id)
      return d ? s.watch.playLocal({ file: d.path, title: d.title, episode: d.episode }) : null
    },
    [INVOKE.downloadsOpenFolder]: (id) => {
      const d = s.downloads.getDownloaded(id)
      if (d) s.electron.showItemInFolder(d.path)
    },
    [INVOKE.dialogPickFolder]: () => s.electron.pickFolder(),
  }
}

export function registerIpc(ipcMain, handlers) {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args) => fn(...args))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ipc.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `src/preload/index.js`**

```js
import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE, EVENTS } from '../shared/channels.js'

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args)
const on = (channel) => (cb) => {
  const listener = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('animedesk', {
  settings: { get: invoke(INVOKE.settingsGet), update: invoke(INVOKE.settingsUpdate) },
  library: {
    list: invoke(INVOKE.libraryList),
    add: invoke(INVOKE.libraryAdd),
    update: invoke(INVOKE.libraryUpdate),
    remove: invoke(INVOKE.libraryRemove),
    setEpisodeNote: invoke(INVOKE.libraryNote),
    recordWatched: invoke(INVOKE.libraryRecord),
    wasCorrupt: invoke(INVOKE.libraryWasCorrupt),
  },
  anilist: { forTitle: invoke(INVOKE.anilistForTitle), search: invoke(INVOKE.anilistSearch) },
  tools: {
    status: invoke(INVOKE.toolsStatus),
    installMissing: invoke(INVOKE.toolsInstallMissing),
    checkUpdates: invoke(INVOKE.toolsCheckUpdates),
    onProgress: on(EVENTS.toolProgress),
  },
  health: { get: invoke(INVOKE.healthGet), recheck: invoke(INVOKE.healthRecheck), onChange: on(EVENTS.health) },
  watch: {
    start: invoke(INVOKE.watchStart),
    cancel: invoke(INVOKE.watchCancel),
    answerMenu: invoke(INVOKE.menuAnswer),
    onMenu: on(EVENTS.menu),
    onAsk: on(EVENTS.ask),
    onPlaying: on(EVENTS.playing),
    onSessionEnd: on(EVENTS.sessionEnd),
  },
  downloads: {
    enqueue: invoke(INVOKE.downloadsEnqueue),
    pause: invoke(INVOKE.downloadsPause),
    resume: invoke(INVOKE.downloadsResume),
    cancel: invoke(INVOKE.downloadsCancel),
    queue: invoke(INVOKE.downloadsQueue),
    list: invoke(INVOKE.downloadsList),
    remove: invoke(INVOKE.downloadsRemove),
    play: invoke(INVOKE.downloadsPlay),
    openFolder: invoke(INVOKE.downloadsOpenFolder),
    onChange: on(EVENTS.downloads),
  },
  dialog: { pickFolder: invoke(INVOKE.dialogPickFolder) },
  onLibraryChanged: on(EVENTS.libraryChanged),
})
```

- [ ] **Step 6: Implement `src/main/index.js`**

```js
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import extractZip from 'extract-zip'
import { createPaths } from './paths.js'
import { createSettings } from './settings.js'
import { createLibrary } from './library.js'
import { createToolManager } from './toolManager.js'
import { getJson, download, isOnline } from './http.js'
import { run } from './run.js'
import { createBridgeServer } from './bridgeServer.js'
import { createAniCliBridge } from './aniCliBridge.js'
import { createPlayer } from './playerMonitor.js'
import { createWatchService } from './watchService.js'
import { createDownloads } from './downloads.js'
import { createAniList } from './anilist.js'
import { createHealthCheck } from './healthCheck.js'
import { createHandlers, registerIpc } from './ipc.js'
import { EVENTS } from '../shared/channels.js'

const SIX_HOURS = 6 * 60 * 60 * 1000

app.setPath('userData', process.env.ANIMEDESK_USER_DATA ?? path.join(app.getPath('appData'), 'AnimeDesk'))

let win = null
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) }

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#15151c',
    autoHideMenuBar: true,
    title: 'AnimeDesk',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function main() {
  await app.whenReady()
  const paths = createPaths(app.getPath('userData'))
  const settings = createSettings(paths.settings)
  const library = createLibrary(paths.library)
  const toolManager = createToolManager({
    paths,
    http: { getJson, download },
    extractZip: (file, dir) => extractZip(file, { dir }),
    runExe: (file, args) => run(file, args).done,
  })
  const server = createBridgeServer()
  await server.start()
  const bridgesDir = app.isPackaged ? path.join(process.resourcesPath, 'bridges') : path.join(app.getAppPath(), 'resources', 'bridges')
  const aniCli = createAniCliBridge({
    toolManager,
    server,
    bridges: { menu: path.join(bridgesDir, 'menu-bridge.sh'), player: path.join(bridgesDir, 'animedesk-mpv-bridge.sh') },
    getSettings: () => settings.get(),
    historyDir: paths.aniCliHistory,
  })
  const player = createPlayer({ getMpvPath: () => toolManager.toolPaths().mpv })
  const watch = createWatchService({ aniCli, player, library, settings, notify: send })
  const downloads = createDownloads({ file: paths.downloads, aniCli, onChange: () => send(EVENTS.downloads, downloads.queueItems()) })
  const anilist = createAniList({ cacheDir: paths.cache })
  const health = createHealthCheck({ toolManager, aniCli, isOnline, onState: (s) => send(EVENTS.health, s) })

  registerIpc(ipcMain, createHandlers({
    settings, library, anilist, toolManager, health, watch, downloads, send,
    electron: {
      pickFolder: async () => {
        const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
        return r.canceled ? null : r.filePaths[0]
      },
      showItemInFolder: (p) => shell.showItemInFolder(p),
    },
  }))

  createWindow()
  health.run().then(() => health.dailyUpdate({ enabled: settings.get().autoUpdateTools, now: new Date().toISOString() }))
  setInterval(() => { if (health.get().reason === 'source-down') health.run() }, SIX_HOURS)

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => { server.stop() })
}

main()
```

- [ ] **Step 7: Verify the main and preload bundles build**

Create a placeholder renderer so electron-vite can build (Task 13 replaces it):

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="sr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:" />
    <title>AnimeDesk</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.jsx"></script>
  </body>
</html>
```

`src/renderer/main.jsx`:
```jsx
document.getElementById('root').textContent = 'AnimeDesk'
```

Run: `npm run build`
Expected: builds `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` without errors.

- [ ] **Step 8: Run the full test suite and commit**

Run: `npx vitest run`
Expected: PASS (all tests so far).

```bash
git add src/main/ipc.js src/main/index.js src/preload/index.js src/renderer/index.html src/renderer/main.jsx tests/unit/ipc.test.js
git commit -m "feat: IPC handlers, preload API and Electron entry point" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Renderer shell, shared components and semaphore

**Files:**
- Create: `src/renderer/api.js`, `src/renderer/components/Semaphore.jsx`, `src/renderer/components/Header.jsx`, `src/renderer/components/ReadyNotice.jsx`, `src/renderer/components/Poster.jsx`, `src/renderer/components/ConfirmButton.jsx`, `src/renderer/components/AskDialog.jsx`, `src/renderer/styles.css`
- Create: `tests/unit/ui/helpers.jsx`
- Test: `tests/unit/ui/components.test.jsx`

**Interfaces:**
- Consumes: `useT`, `I18nProvider` (Task 4); `window.animedesk` shape (Task 12).
- Produces:
  - `ApiContext`, `useApi()` (api.js)
  - `<Semaphore health={{light, reason}} onClick />` — button with `data-light`, label `t('health.green')` for `ok` else `t('health.<reason>')`
  - `<Header page onNavigate health onSemaphoreClick />` — pages `search | watchlist | downloads | settings`
  - `<ReadyNotice ready onOpenWizard />` — renders nothing when ready; otherwise `role="alert"` with `t('gate.blocked')` and a `t('health.openWizard')` button
  - `<Poster title aniListId? />` — `<img class="poster">` from `api.anilist.forTitle(title, aniListId)` or a placeholder
  - `<ConfirmButton label confirmLabel onConfirm className? />` — two-step confirm (no `window.confirm`)
  - `<AskDialog ask={{aniCliTitle, episode}} onDone />` — Yes → `api.library.recordWatched({aniCliTitle, episode})`
  - Test helpers: `makeFakeApi(overrides?)`, `renderUi(ui, { api?, lang? }) → { api, ...renderResult }`

- [ ] **Step 1: Write the test helpers**

`tests/unit/ui/helpers.jsx`:
```jsx
import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { ApiContext } from '../../../src/renderer/api.js'
import { I18nProvider } from '../../../src/renderer/i18n/I18nContext.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const sub = () => vi.fn(() => () => {})

export function makeFakeApi(overrides = {}) {
  const api = {
    settings: { get: vi.fn(async () => ({ ...DEFAULT_SETTINGS })), update: vi.fn(async (p) => ({ ...DEFAULT_SETTINGS, ...p })) },
    library: {
      list: vi.fn(async () => []), add: vi.fn(async (e) => ({ id: 'new', ...e })), update: vi.fn(async (id, p) => ({ id, ...p })),
      remove: vi.fn(async () => true), setEpisodeNote: vi.fn(async () => ({})), recordWatched: vi.fn(async () => ({})), wasCorrupt: vi.fn(async () => false),
    },
    anilist: { forTitle: vi.fn(async () => null), search: vi.fn(async () => []) },
    tools: { status: vi.fn(async () => ({})), installMissing: vi.fn(async () => ({})), checkUpdates: vi.fn(async () => []), onProgress: sub() },
    health: { get: vi.fn(async () => ({ light: 'green', reason: 'ok' })), recheck: vi.fn(async () => ({})), onChange: sub() },
    watch: {
      start: vi.fn(async () => ({ sessionId: 's1' })), cancel: vi.fn(async () => {}), answerMenu: vi.fn(async () => {}),
      onMenu: sub(), onAsk: sub(), onPlaying: sub(), onSessionEnd: sub(),
    },
    downloads: {
      enqueue: vi.fn(async () => []), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), queue: vi.fn(async () => []), list: vi.fn(async () => []),
      remove: vi.fn(async () => true), play: vi.fn(async () => 'none'), openFolder: vi.fn(), onChange: sub(),
    },
    dialog: { pickFolder: vi.fn(async () => null) },
    onLibraryChanged: sub(),
  }
  for (const [group, fns] of Object.entries(overrides)) Object.assign(api[group], fns)
  return api
}

export function renderUi(ui, { api = makeFakeApi(), lang = 'sr' } = {}) {
  const result = render(
    <ApiContext.Provider value={api}>
      <I18nProvider lang={lang}>{ui}</I18nProvider>
    </ApiContext.Provider>,
  )
  return { api, ...result }
}
```

- [ ] **Step 2: Write the failing component tests**

`tests/unit/ui/components.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { Semaphore } from '../../../src/renderer/components/Semaphore.jsx'
import { ReadyNotice } from '../../../src/renderer/components/ReadyNotice.jsx'
import { ConfirmButton } from '../../../src/renderer/components/ConfirmButton.jsx'
import { AskDialog } from '../../../src/renderer/components/AskDialog.jsx'
import { Poster } from '../../../src/renderer/components/Poster.jsx'
import { Header } from '../../../src/renderer/components/Header.jsx'

describe('Semaphore', () => {
  it('shows red with the source-down message', () => {
    renderUi(<Semaphore health={{ light: 'red', reason: 'source-down' }} onClick={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('data-light', 'red')
    expect(btn).toHaveTextContent('Izvor trenutno ne radi — čeka se popravka od ani-cli tima')
  })
  it('shows green in English', () => {
    renderUi(<Semaphore health={{ light: 'green', reason: 'ok' }} onClick={() => {}} />, { lang: 'en' })
    expect(screen.getByRole('button')).toHaveAttribute('data-light', 'green')
    expect(screen.getByRole('button')).toHaveTextContent('All systems go')
  })
  it('is clickable', () => {
    const onClick = vi.fn()
    renderUi(<Semaphore health={{ light: 'yellow', reason: 'checking' }} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
})

describe('ReadyNotice', () => {
  it('renders nothing when ready', () => {
    const { container } = renderUi(<ReadyNotice ready onOpenWizard={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('explains the block and opens the wizard', () => {
    const onOpen = vi.fn()
    renderUi(<ReadyNotice ready={false} onOpenWizard={onOpen} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Potrebno je instalirati komponente da bi se nastavilo')
    fireEvent.click(screen.getByRole('button', { name: 'Otvori instalaciju' }))
    expect(onOpen).toHaveBeenCalled()
  })
})

describe('ConfirmButton', () => {
  it('needs two clicks', () => {
    const onConfirm = vi.fn()
    renderUi(<ConfirmButton label="Obriši" confirmLabel="Sigurno?" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Obriši' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Sigurno?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})

describe('AskDialog', () => {
  it('records the episode on Yes', async () => {
    const onDone = vi.fn()
    const { api } = renderUi(<AskDialog ask={{ aniCliTitle: 'Frieren', episode: '3' }} onDone={onDone} />)
    expect(screen.getByText('Označi epizodu 3 (Frieren) kao odgledanu?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Frieren', episode: '3' })
  })
})

describe('Poster', () => {
  it('shows the poster from AniList when available', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ poster: 'data:image/png;base64,AA' })) } })
    const { container } = renderUi(<Poster title="Frieren" />, { api })
    await waitFor(() => expect(container.querySelector('img.poster')).toHaveAttribute('src', 'data:image/png;base64,AA'))
    expect(api.anilist.forTitle).toHaveBeenCalledWith('Frieren', null)
  })
})

describe('Header', () => {
  it('navigates between pages', () => {
    const onNavigate = vi.fn()
    renderUi(<Header page="search" onNavigate={onNavigate} health={{ light: 'green', reason: 'ok' }} onSemaphoreClick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preuzeto' }))
    expect(onNavigate).toHaveBeenCalledWith('downloads')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ui/components.test.jsx`
Expected: FAIL — components missing.

- [ ] **Step 4: Implement the components**

`src/renderer/api.js`:
```js
import { createContext, useContext } from 'react'

export const ApiContext = createContext(null)
export const useApi = () => useContext(ApiContext)
```

`src/renderer/components/Semaphore.jsx`:
```jsx
import { useT } from '../i18n/I18nContext.jsx'

export function Semaphore({ health, onClick }) {
  const t = useT()
  const label = t(health.reason === 'ok' ? 'health.green' : `health.${health.reason}`)
  return (
    <button type="button" className={`semaphore semaphore--${health.light}`} data-light={health.light} onClick={onClick} title={label}>
      <span className="semaphore__dot" aria-hidden="true" />
      <span className="semaphore__label">{label}</span>
    </button>
  )
}
```

`src/renderer/components/Header.jsx`:
```jsx
import { useT } from '../i18n/I18nContext.jsx'
import { Semaphore } from './Semaphore.jsx'

const PAGES = ['search', 'watchlist', 'downloads', 'settings']

export function Header({ page, onNavigate, health, onSemaphoreClick }) {
  const t = useT()
  return (
    <header className="header">
      <span className="header__logo">AnimeDesk</span>
      <nav className="header__nav">
        {PAGES.map((p) => (
          <button key={p} type="button" className={p === page ? 'nav-btn nav-btn--active' : 'nav-btn'} onClick={() => onNavigate(p)}>
            {t(`nav.${p}`)}
          </button>
        ))}
      </nav>
      <Semaphore health={health} onClick={onSemaphoreClick} />
    </header>
  )
}
```

`src/renderer/components/ReadyNotice.jsx`:
```jsx
import { useT } from '../i18n/I18nContext.jsx'

export function ReadyNotice({ ready, onOpenWizard }) {
  const t = useT()
  if (ready) return null
  return (
    <div className="notice notice--warn" role="alert">
      <span>{t('gate.blocked')}</span>
      <button type="button" onClick={onOpenWizard}>{t('health.openWizard')}</button>
    </div>
  )
}
```

`src/renderer/components/Poster.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'

export function Poster({ title, aniListId = null }) {
  const api = useApi()
  const [poster, setPoster] = useState(null)
  useEffect(() => {
    let live = true
    api.anilist.forTitle(title, aniListId).then((info) => { if (live) setPoster(info?.poster ?? null) }).catch(() => {})
    return () => { live = false }
  }, [api, title, aniListId])
  return poster ? <img className="poster" src={poster} alt="" /> : <div className="poster poster--empty" aria-hidden="true" />
}
```

`src/renderer/components/ConfirmButton.jsx`:
```jsx
import { useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

export function ConfirmButton({ label, confirmLabel, onConfirm, className = '' }) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  if (!armed) return <button type="button" className={className} onClick={() => setArmed(true)}>{label}</button>
  return (
    <span className="confirm">
      <span>{confirmLabel}</span>
      <button type="button" className="danger" onClick={() => { setArmed(false); onConfirm() }}>{t('ask.yes')}</button>
      <button type="button" onClick={() => setArmed(false)}>{t('ask.no')}</button>
    </span>
  )
}
```

`src/renderer/components/AskDialog.jsx`:
```jsx
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'

export function AskDialog({ ask, onDone }) {
  const api = useApi()
  const t = useT()
  const yes = async () => {
    await api.library.recordWatched({ aniCliTitle: ask.aniCliTitle, episode: ask.episode })
    onDone()
  }
  return (
    <div className="modal" role="dialog">
      <div className="modal__box">
        <p>{t('ask.markWatched', { episode: ask.episode, title: ask.aniCliTitle })}</p>
        <div className="row">
          <button type="button" className="primary" onClick={yes}>{t('ask.yes')}</button>
          <button type="button" onClick={onDone}>{t('ask.no')}</button>
        </div>
      </div>
    </div>
  )
}
```

`src/renderer/styles.css`:
```css
:root {
  --bg: #15151c; --panel: #1f1f29; --panel-2: #2a2a37; --text: #ececf1; --muted: #9a9aab;
  --accent: #8b5cf6; --green: #22c55e; --yellow: #eab308; --red: #ef4444; --radius: 10px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 "Segoe UI", system-ui, sans-serif; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: var(--panel-2); border: 1px solid #3a3a4a; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: .45; cursor: not-allowed; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.danger { background: var(--red); border-color: var(--red); color: #fff; }
input, select, textarea { background: var(--panel-2); border: 1px solid #3a3a4a; border-radius: 8px; padding: 6px 10px; }
textarea { width: 100%; min-height: 80px; resize: vertical; }
.header { display: flex; align-items: center; gap: 16px; padding: 10px 20px; background: var(--panel); border-bottom: 1px solid #2f2f3d; position: sticky; top: 0; z-index: 5; }
.header__logo { font-weight: 700; letter-spacing: .5px; }
.header__nav { display: flex; gap: 6px; flex: 1; }
.nav-btn { background: transparent; border-color: transparent; }
.nav-btn--active { background: var(--panel-2); border-color: #3a3a4a; }
.semaphore { display: flex; align-items: center; gap: 8px; max-width: 360px; }
.semaphore__label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.semaphore__dot, .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.semaphore--green .semaphore__dot, .dot--green { background: var(--green); box-shadow: 0 0 8px var(--green); }
.semaphore--yellow .semaphore__dot, .dot--yellow { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
.semaphore--red .semaphore__dot, .dot--red { background: var(--red); box-shadow: 0 0 8px var(--red); }
main { padding: 20px; }
.page { display: flex; flex-direction: column; gap: 16px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.muted { color: var(--muted); }
.notice { padding: 10px 14px; border-radius: var(--radius); background: var(--panel); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.notice--warn { border-left: 4px solid var(--yellow); }
.notice--error { border-left: 4px solid var(--red); }
.details { width: 100%; white-space: pre-wrap; color: var(--muted); font-size: 12px; max-height: 200px; overflow: auto; }
.search-bar { display: flex; gap: 8px; }
.search-bar input { flex: 1; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.card { display: flex; flex-direction: column; gap: 6px; padding: 8px; text-align: left; background: var(--panel); }
.card__title { font-weight: 600; }
.card__meta { color: var(--muted); font-size: 12px; }
.poster { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 8px; background: var(--panel-2); display: block; }
.poster--empty { background: linear-gradient(135deg, var(--panel-2), #34344a); }
.ep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 6px; }
.ep { padding: 8px 0; text-align: center; }
.ep--watched { border-color: var(--green); color: var(--green); }
.ep--selected { background: var(--accent); border-color: var(--accent); color: #fff; }
.ep--note::after { content: "•"; margin-left: 2px; color: var(--yellow); }
.detail { display: grid; grid-template-columns: 220px 1fr; gap: 20px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field > span { color: var(--muted); font-size: 12px; }
.check { display: flex; gap: 6px; align-items: center; }
.description { white-space: pre-wrap; background: var(--panel); padding: 12px; border-radius: var(--radius); }
.modal { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal__box { background: var(--panel); padding: 20px; border-radius: var(--radius); min-width: 380px; max-width: 560px; display: flex; flex-direction: column; gap: 12px; }
.tool-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.tool-row { display: flex; align-items: center; gap: 10px; }
.tool-row__name { flex: 1; }
.tool-row__state { color: var(--muted); }
.queue-item, .dl-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--panel); border-radius: 8px; }
.queue-item__title, .dl-item__title { flex: 1; }
.progress { width: 160px; height: 6px; background: var(--panel-2); border-radius: 3px; overflow: hidden; }
.progress > div { height: 100%; background: var(--accent); }
.confirm { display: inline-flex; gap: 6px; align-items: center; }
.group { display: flex; gap: 12px; }
.group .poster { width: 80px; }
.group__items { flex: 1; display: flex; flex-direction: column; gap: 6px; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ui/components.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/api.js src/renderer/components src/renderer/styles.css tests/unit/ui/helpers.jsx tests/unit/ui/components.test.jsx
git commit -m "feat: renderer shell components with health semaphore" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Setup wizard

**Files:**
- Create: `src/renderer/pages/SetupWizard.jsx`
- Test: `tests/unit/ui/SetupWizard.test.jsx`

**Interfaces:**
- Consumes: `useApi`, `useT` (Tasks 4, 13); `TOOL_IDS` (Task 1); `api.tools.*`, `api.health.recheck` (Task 12).
- Produces: `<SetupWizard health onClose />`, `toolView(status, progress, error, busy) → { light, state: 'installed'|'missing'|'installing'|'error', percent: number|null }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/ui/SetupWizard.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SetupWizard, toolView } from '../../../src/renderer/pages/SetupWizard.jsx'

const missingAll = { bash: { installed: true, version: 'system' }, 'ani-cli': { installed: false }, mpv: { installed: false }, 'yt-dlp': { installed: false }, ffmpeg: { installed: false } }
const allOk = Object.fromEntries(Object.keys(missingAll).map((k) => [k, { installed: true, version: 'v1' }]))

describe('toolView', () => {
  it('derives light and state', () => {
    expect(toolView({ installed: true }, null, null, false)).toEqual({ light: 'green', state: 'installed', percent: null })
    expect(toolView({ installed: false }, null, 'boom', false)).toEqual({ light: 'red', state: 'error', percent: null })
    expect(toolView({ installed: false }, { phase: 'download', received: 50, total: 200 }, null, true)).toEqual({ light: 'yellow', state: 'installing', percent: 25 })
    expect(toolView({ installed: false }, { phase: 'extract' }, null, true)).toEqual({ light: 'yellow', state: 'installing', percent: null })
    expect(toolView({ installed: false }, null, null, false)).toEqual({ light: 'red', state: 'missing', percent: null })
  })
})

describe('SetupWizard', () => {
  it('lists components with red/green lights and installs missing ones', async () => {
    let status = missingAll
    const api = makeFakeApi({ tools: { status: vi.fn(async () => status), installMissing: vi.fn(async () => { status = allOk; return {} }) } })
    renderUi(<SetupWizard health={{ light: 'red', reason: 'missing-tools' }} onClose={() => {}} />, { api })
    expect(screen.getByRole('heading', { name: 'Podešavanje' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'red'))
    expect(screen.getByTestId('tool-bash')).toHaveAttribute('data-light', 'green')
    fireEvent.click(screen.getByRole('button', { name: 'Instaliraj sve' }))
    await waitFor(() => expect(screen.getByText('Sve je instalirano')).toBeInTheDocument())
    expect(api.tools.installMissing).toHaveBeenCalled()
    expect(screen.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'green')
  })
  it('offers retry after an error and shows the health message', async () => {
    const api = makeFakeApi({ tools: { status: vi.fn(async () => missingAll), installMissing: vi.fn(async () => ({ mpv: 'HTTP 404' })) } })
    renderUi(<SetupWizard health={{ light: 'red', reason: 'offline' }} onClose={() => {}} />, { api })
    expect(screen.getByText('Nema internet konekcije')).toBeInTheDocument()
    await waitFor(() => screen.getByRole('button', { name: 'Instaliraj sve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Instaliraj sve' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pokušaj ponovo' })).toBeEnabled())
    expect(screen.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'red')
  })
  it('re-checks health and closes', async () => {
    const onClose = vi.fn()
    const { api } = renderUi(<SetupWizard health={{ light: 'green', reason: 'ok' }} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Proveri ponovo' }))
    expect(api.health.recheck).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ui/SetupWizard.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/renderer/pages/SetupWizard.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { TOOL_IDS } from '../../shared/domain.js'

export function toolView(status, progress, error, busy) {
  if (status?.installed) return { light: 'green', state: 'installed', percent: null }
  if (error) return { light: 'red', state: 'error', percent: null }
  if (busy && progress && progress.phase !== 'done' && progress.phase !== 'error') {
    const percent = progress.phase === 'download' && progress.total ? Math.floor((progress.received / progress.total) * 100) : null
    return { light: 'yellow', state: 'installing', percent }
  }
  return { light: 'red', state: 'missing', percent: null }
}

export function SetupWizard({ health, onClose }) {
  const api = useApi()
  const t = useT()
  const [status, setStatus] = useState({})
  const [progress, setProgress] = useState({})
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const refresh = () => api.tools.status().then(setStatus)
  useEffect(() => {
    refresh()
    return api.tools.onProgress((p) => setProgress((prev) => ({ ...prev, [p.id]: p })))
  }, [api])

  const installAll = async () => {
    setBusy(true)
    setErrors({})
    try {
      setErrors((await api.tools.installMissing()) ?? {})
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  const loaded = Object.keys(status).length > 0
  const allInstalled = loaded && TOOL_IDS.every((id) => status[id]?.installed)
  const hasErrors = Object.keys(errors).length > 0

  return (
    <div className="modal" role="dialog" aria-labelledby="wizard-title">
      <div className="modal__box">
        <h2 id="wizard-title">{t('wizard.title')}</h2>
        <p>{t('wizard.intro')}</p>
        <ul className="tool-list">
          {TOOL_IDS.map((id) => {
            const view = toolView(status[id], progress[id], errors[id], busy)
            const version = status[id]?.installed && status[id]?.version ? ` (${status[id].version})` : ''
            return (
              <li key={id} className="tool-row">
                <span className={`dot dot--${view.light}`} data-testid={`tool-${id}`} data-light={view.light} />
                <span className="tool-row__name">{t(`tool.${id}`)}</span>
                <span className="tool-row__state">
                  {view.percent != null ? `${t('tool.installing')} ${view.percent}%` : t(`tool.${view.state}`)}
                  {version}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="row">
          <span className={`dot dot--${health.light}`} />
          <span>{t(health.reason === 'ok' ? 'health.green' : `health.${health.reason}`)}</span>
        </p>
        <div className="row">
          {loaded && !allInstalled && (
            <button type="button" className="primary" disabled={busy} onClick={installAll}>
              {hasErrors ? t('wizard.retry') : t('wizard.installAll')}
            </button>
          )}
          {allInstalled && <span>{t('wizard.done')}</span>}
          <button type="button" onClick={() => api.health.recheck()}>{t('health.recheck')}</button>
          <button type="button" onClick={onClose}>{t('wizard.close')}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ui/SetupWizard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/SetupWizard.jsx tests/unit/ui/SetupWizard.test.jsx
git commit -m "feat: setup wizard with per-component status lights" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Search page (search → anime → episode → watch / download / add)

**Files:**
- Create: `src/renderer/pages/SearchPage.jsx`
- Test: `tests/unit/ui/SearchPage.test.jsx`

**Interfaces:**
- Consumes: `useApi`, `useT`, `ReadyNotice`, `Poster` (Task 13); `animeLineTitle`, `normalizeTitle` (Task 1); `api.watch.*`, `api.downloads.enqueue`, `api.dialog.pickFolder`, `api.library.list/add` (Task 12).
- Produces: `<SearchPage ready settings onSettings onOpenWizard pendingWatch onPendingHandled />`.
  - `pendingWatch` is `{ query, anime, episode } | null`; when set and `ready`, the page starts that session once and calls `onPendingHandled()`.
  - Download without a remembered folder: `api.dialog.pickFolder()`; if "Zapamti ovaj folder" is checked, `onSettings({ downloadDir })`.
  - Downloading cancels the ani-cli play session with `answerMenu(requestId, null)`.

- [ ] **Step 1: Write the failing test**

`tests/unit/ui/SearchPage.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SearchPage } from '../../../src/renderer/pages/SearchPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

function withEvents() {
  const handlers = {}
  const capture = (name) => vi.fn((cb) => { handlers[name] = cb; return () => {} })
  const api = makeFakeApi({ watch: { onMenu: capture('menu'), onPlaying: capture('playing'), onSessionEnd: capture('end') } })
  return { api, handlers }
}
const props = (over = {}) => ({ ready: true, settings: { ...DEFAULT_SETTINGS }, onSettings: vi.fn(), onOpenWizard: vi.fn(), pendingWatch: null, onPendingHandled: vi.fn(), ...over })

describe('SearchPage', () => {
  it('is blocked until components are ready', () => {
    const p = props({ ready: false })
    renderUi(<SearchPage {...p} />)
    expect(screen.getByRole('button', { name: 'Traži' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Potrebno je instalirati komponente')
    fireEvent.click(screen.getByRole('button', { name: 'Otvori instalaciju' }))
    expect(p.onOpenWizard).toHaveBeenCalled()
  })

  it('walks search → anime → episode → watch', async () => {
    const { api, handlers } = withEvents()
    renderUi(<SearchPage {...props()} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'frieren' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    expect(api.watch.start).toHaveBeenCalledWith({ query: 'frieren' })

    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Frieren', '2 Frieren Specials'] }))
    fireEvent.click(screen.getByRole('button', { name: /Frieren Specials/ }))
    expect(api.watch.answerMenu).toHaveBeenCalledWith('r1', '2 Frieren Specials')

    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
    expect(screen.getByRole('heading', { name: /Frieren Specials/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gledaj' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gledaj' }))
    expect(api.watch.answerMenu).toHaveBeenLastCalledWith('r2', '2')

    act(() => handlers.playing({ title: 'Frieren Specials', episode: '2' }))
    expect(screen.getByText('Pušta se: Frieren Specials — epizoda 2')).toBeInTheDocument()
    act(() => handlers.end({ sessionId: 's1', result: { ok: true, error: null } }))
    expect(screen.getByRole('button', { name: 'Traži' })).toBeEnabled()
  })

  it('downloads selected episodes, asking for a folder and remembering it', async () => {
    const { api, handlers } = withEvents()
    api.dialog.pickFolder.mockResolvedValue('D:\\Anime')
    const p = props()
    renderUi(<SearchPage {...p} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2', '3'] }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByLabelText('Zapamti ovaj folder'))
    fireEvent.click(screen.getByRole('button', { name: 'Preuzmi izabrane' }))
    await waitFor(() => expect(api.downloads.enqueue).toHaveBeenCalledWith({ title: 'Show', aniCliTitle: 'Show', episodes: ['1', '3'], dir: 'D:\\Anime' }))
    expect(p.onSettings).toHaveBeenCalledWith({ downloadDir: 'D:\\Anime' })
    expect(api.watch.answerMenu).toHaveBeenLastCalledWith('r2', null)
    expect(screen.getByText('Dodato u red za preuzimanje: 2')).toBeInTheDocument()
  })

  it('shows a translated error with details', async () => {
    const { api, handlers } = withEvents()
    renderUi(<SearchPage {...props()} />, { api })
    act(() => handlers.end({ sessionId: 's1', result: { ok: false, error: 'no-results', stderr: 'No results found!' } }))
    expect(screen.getByRole('alert')).toHaveTextContent('Nema rezultata.')
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži detalje' }))
    expect(screen.getByText('No results found!')).toBeInTheDocument()
  })

  it('starts a pending "continue watching" request once ready', async () => {
    const p = props({ pendingWatch: { query: 'Show', anime: 'Show', episode: '4' } })
    const { api } = renderUi(<SearchPage {...p} />)
    await waitFor(() => expect(api.watch.start).toHaveBeenCalledWith({ query: 'Show', anime: 'Show', episode: '4' }))
    expect(p.onPendingHandled).toHaveBeenCalled()
  })

  it('marks already watched episodes', async () => {
    const { api, handlers } = withEvents()
    api.library.list.mockResolvedValue([{ id: 'a', title: 'Show', aniCliTitle: 'Show', watchedEpisodes: [1] }])
    renderUi(<SearchPage {...props()} />, { api })
    fireEvent.change(screen.getByLabelText('Naziv animea…'), { target: { value: 'show' } })
    fireEvent.click(screen.getByRole('button', { name: 'Traži' }))
    act(() => handlers.menu({ requestId: 'r1', sessionId: 's1', kind: 'anime', prompt: 'Select anime: ', lines: ['1 Show'] }))
    fireEvent.click(screen.getByRole('button', { name: /Show/ }))
    act(() => handlers.menu({ requestId: 'r2', sessionId: 's1', kind: 'episode', prompt: 'Select episode: ', lines: ['1', '2'] }))
    await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toHaveClass('ep--watched'))
    expect(screen.getByRole('button', { name: '2' })).not.toHaveClass('ep--watched')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ui/SearchPage.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/renderer/pages/SearchPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { ReadyNotice } from '../components/ReadyNotice.jsx'
import { Poster } from '../components/Poster.jsx'
import { animeLineTitle, normalizeTitle } from '../../shared/domain.js'

const byNumber = (a, b) => Number(a) - Number(b)

export function SearchPage({ ready, settings, onSettings, onOpenWizard, pendingWatch, onPendingHandled }) {
  const api = useApi()
  const t = useT()
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('idle') // idle | busy | anime | episode | playing
  const [menu, setMenu] = useState(null)
  const [anime, setAnime] = useState(null)
  const [selected, setSelected] = useState([])
  const [watched, setWatched] = useState([])
  const [playing, setPlaying] = useState(null)
  const [error, setError] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [remember, setRemember] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const offs = [
      api.watch.onMenu((m) => { setMenu(m); setSelected([]); setPhase(m.kind === 'episode' ? 'episode' : 'anime') }),
      api.watch.onPlaying((p) => { setPlaying(p); setPhase('playing') }),
      api.watch.onSessionEnd(({ result }) => {
        setMenu(null)
        setPlaying(null)
        setPhase('idle')
        if (!result.ok && result.error !== 'cancelled') setError(result)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => {
    if (!anime) return
    api.library.list().then((list) => {
      const key = anime.toLowerCase()
      const e = list.find((x) => normalizeTitle(x.aniCliTitle ?? x.title).toLowerCase() === key)
      setWatched(e?.watchedEpisodes ?? [])
    })
  }, [api, anime])

  const start = (params) => {
    setError(null)
    setShowDetails(false)
    setNotice(null)
    setPhase('busy')
    api.watch.start(params).catch(() => { setPhase('idle'); setError({ error: 'unknown' }) })
  }

  useEffect(() => {
    if (pendingWatch && ready) {
      setAnime(pendingWatch.anime)
      start(pendingWatch)
      onPendingHandled()
    }
  }, [pendingWatch, ready])

  const submit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setAnime(null)
    start({ query: query.trim() })
  }
  const answer = (line) => {
    api.watch.answerMenu(menu.requestId, line)
    setMenu(null)
    setPhase(line == null ? 'idle' : 'busy')
  }
  const pickAnime = (line) => { setAnime(animeLineTitle(line)); answer(line) }
  const toggle = (ep) => setSelected((s) => (s.includes(ep) ? s.filter((x) => x !== ep) : [...s, ep]))
  const watchSelected = () => { const ep = [...selected].sort(byNumber)[0]; if (ep) answer(ep) }

  const downloadSelected = async () => {
    let dir = settings.downloadDir
    if (!dir) {
      dir = await api.dialog.pickFolder()
      if (!dir) return
      if (remember) await onSettings({ downloadDir: dir })
    }
    const episodes = [...selected].sort(byNumber)
    await api.downloads.enqueue({ title: anime, aniCliTitle: anime, episodes, dir })
    answer(null)
    setNotice(t('search.queued', { count: episodes.length }))
  }

  const addToWatchlist = async () => {
    const list = await api.library.list()
    const key = anime.toLowerCase()
    if (list.some((x) => normalizeTitle(x.aniCliTitle ?? x.title).toLowerCase() === key)) {
      setNotice(t('search.alreadyInList'))
      return
    }
    await api.library.add({ title: anime, aniCliTitle: anime })
    setNotice(t('search.added'))
  }

  return (
    <section className="page">
      <ReadyNotice ready={ready} onOpenWizard={onOpenWizard} />
      <form className="search-bar" onSubmit={submit}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
        <button type="submit" className="primary" disabled={!ready || phase !== 'idle'}>{t('search.button')}</button>
      </form>

      {notice && <div className="notice">{notice}</div>}
      {error && (
        <div className="notice notice--error" role="alert">
          <span>{t(`error.${error.error ?? 'unknown'}`)}</span>
          {error.stderr && <button type="button" onClick={() => setShowDetails((v) => !v)}>{t('error.showDetails')}</button>}
          {showDetails && <pre className="details">{error.stderr}</pre>}
        </div>
      )}
      {phase === 'busy' && <p className="muted">{t('search.searching')}</p>}
      {phase === 'playing' && playing && <p>{t('search.playing', { title: playing.title, episode: playing.episode })}</p>}

      {phase === 'anime' && menu && (
        <div className="page">
          <h2>{t('search.selectAnime')}</h2>
          <div className="card-grid">
            {menu.lines.map((line) => {
              const title = animeLineTitle(line)
              return (
                <button type="button" key={line} className="card" onClick={() => pickAnime(line)}>
                  <Poster title={title} />
                  <span className="card__title">{title}</span>
                </button>
              )
            })}
          </div>
          <div className="row"><button type="button" onClick={() => answer(null)}>{t('search.cancel')}</button></div>
        </div>
      )}

      {phase === 'episode' && menu && (
        <div className="page">
          <h2>{anime} — {t('search.selectEpisode')}</h2>
          <div className="ep-grid">
            {menu.lines.map((line) => {
              const ep = line.trim()
              const cls = ['ep', selected.includes(ep) && 'ep--selected', watched.includes(Number(ep)) && 'ep--watched'].filter(Boolean).join(' ')
              return <button type="button" key={ep} className={cls} aria-pressed={selected.includes(ep)} onClick={() => toggle(ep)}>{ep}</button>
            })}
          </div>
          <div className="row">
            <button type="button" className="primary" disabled={!ready || selected.length === 0} onClick={watchSelected}>{t('search.watch')}</button>
            <button type="button" disabled={!ready || selected.length === 0} onClick={downloadSelected}>{t('search.download')}</button>
            {!settings.downloadDir && (
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t('downloads.rememberFolder')}
              </label>
            )}
            <button type="button" onClick={addToWatchlist}>{t('search.addToWatchlist')}</button>
            <button type="button" onClick={() => answer(null)}>{t('search.cancel')}</button>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ui/SearchPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/SearchPage.jsx tests/unit/ui/SearchPage.test.jsx
git commit -m "feat: search page driving ani-cli menus, watch and download" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Watchlist page and anime detail

**Files:**
- Create: `src/renderer/pages/WatchlistPage.jsx`, `src/renderer/pages/AnimeDetail.jsx`
- Test: `tests/unit/ui/Watchlist.test.jsx`

**Interfaces:**
- Consumes: `useApi`, `useT`, `Poster`, `ConfirmButton` (Task 13); `STATUSES` (Task 1); `api.library.*`, `api.anilist.forTitle`, `api.onLibraryChanged` (Task 12).
- Produces:
  - `<WatchlistPage ready onContinue />`, `sortItems(items, 'title'|'rating'|'lastWatched') → items`
  - `<AnimeDetail entry ready onBack onChanged onContinue />`
  - `onContinue({ query, anime, episode })` — episode is the first unwatched episode number as a string.
  - On first open, if AniList finds the anime and the entry lacks `aniListId` / `totalEpisodes`, the detail fills them via `api.library.update`.

- [ ] **Step 1: Write the failing test**

`tests/unit/ui/Watchlist.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { WatchlistPage, sortItems } from '../../../src/renderer/pages/WatchlistPage.jsx'
import { AnimeDetail } from '../../../src/renderer/pages/AnimeDetail.jsx'

const entry = (over = {}) => ({
  id: 'a1', title: 'Frieren', aniCliTitle: 'Frieren', aniListId: null, status: 'watching', rating: null, comment: '',
  totalEpisodes: 4, watchedEpisodes: [1, 2], episodeNotes: { 2: 'lepo' }, lastWatchedAt: null, ...over,
})

describe('sortItems', () => {
  it('sorts by title, rating and last watched', () => {
    const items = [
      { title: 'B', rating: 5, lastWatchedAt: '2026-01-01' },
      { title: 'A', rating: null, lastWatchedAt: null },
      { title: 'C', rating: 9, lastWatchedAt: '2026-05-01' },
    ]
    expect(sortItems(items, 'title').map((i) => i.title)).toEqual(['A', 'B', 'C'])
    expect(sortItems(items, 'rating').map((i) => i.title)).toEqual(['C', 'B', 'A'])
    expect(sortItems(items, 'lastWatched').map((i) => i.title)).toEqual(['C', 'B', 'A'])
  })
})

describe('WatchlistPage', () => {
  it('shows an empty message and adds an anime manually', async () => {
    const { api } = renderUi(<WatchlistPage ready onContinue={() => {}} />)
    await waitFor(() => expect(screen.getByText('Watchlist je prazna.')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Naziv animea'), { target: { value: 'Dandadan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj ručno' }))
    await waitFor(() => expect(api.library.add).toHaveBeenCalledWith({ title: 'Dandadan' }))
  })
  it('filters by status', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => [entry(), entry({ id: 'a2', title: 'Naruto', status: 'dropped' })]) } })
    renderUi(<WatchlistPage ready onContinue={() => {}} />, { api })
    await waitFor(() => screen.getByText('Naruto'))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'dropped' } })
    expect(screen.queryByText('Frieren')).not.toBeInTheDocument()
    expect(screen.getByText('Naruto')).toBeInTheDocument()
  })
})

describe('AnimeDetail', () => {
  const info = { id: 154587, genres: ['Adventure'], year: 2023, episodes: 28, description: 'Tajna radnja', poster: null }

  it('hides the description until the user asks for it', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info) } })
    renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => screen.getByText('Adventure'))
    expect(screen.queryByText('Tajna radnja')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži opis' }))
    expect(screen.getByText('Tajna radnja')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sakrij opis' }))
    expect(screen.queryByText('Tajna radnja')).not.toBeInTheDocument()
  })
  it('links AniList id but keeps a known episode count', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => info) } })
    renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />, { api })
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { aniListId: 154587 }))
  })
  it('edits rating, status and comment', async () => {
    const onChanged = vi.fn()
    const { api } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={onChanged} onContinue={() => {}} />)
    fireEvent.change(screen.getByLabelText('Ocena'), { target: { value: '8' } })
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { rating: 8 }))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paused' } })
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { status: 'paused' }))
    fireEvent.change(screen.getByLabelText('Komentar'), { target: { value: 'super' } })
    fireEvent.blur(screen.getByLabelText('Komentar'))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { comment: 'super' }))
    expect(onChanged).toHaveBeenCalled()
  })
  it('shows progress, edits episode notes and toggles watched', async () => {
    const { api } = renderUi(<AnimeDetail entry={entry()} ready onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />)
    expect(screen.getByText('Napredak: 2 / 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByLabelText('Beleška za epizodu 2')).toHaveValue('lepo')
    fireEvent.change(screen.getByLabelText('Beleška za epizodu 2'), { target: { value: 'najbolja' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.library.setEpisodeNote).toHaveBeenCalledWith('a1', 2, 'najbolja'))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni oznaku odgledano' }))
    await waitFor(() => expect(api.library.update).toHaveBeenCalledWith('a1', { watchedEpisodes: [1] }))
  })
  it('continues with the first unwatched episode and removes after confirmation', async () => {
    const onContinue = vi.fn()
    const onBack = vi.fn()
    const { api } = renderUi(<AnimeDetail entry={entry()} ready onBack={onBack} onChanged={() => {}} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi gledanje' }))
    expect(onContinue).toHaveBeenCalledWith({ query: 'Frieren', anime: 'Frieren', episode: '3' })
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni iz watchlist-e' }))
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(api.library.remove).toHaveBeenCalledWith('a1'))
    expect(onBack).toHaveBeenCalled()
  })
  it('disables continue when components are not ready', () => {
    renderUi(<AnimeDetail entry={entry()} ready={false} onBack={() => {}} onChanged={() => {}} onContinue={() => {}} />)
    expect(screen.getByRole('button', { name: 'Nastavi gledanje' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ui/Watchlist.test.jsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/renderer/pages/AnimeDetail.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from '../components/Poster.jsx'
import { ConfirmButton } from '../components/ConfirmButton.jsx'
import { STATUSES } from '../../shared/domain.js'

export function AnimeDetail({ entry, ready, onBack, onChanged, onContinue }) {
  const api = useApi()
  const t = useT()
  const [info, setInfo] = useState(null)
  const [showDesc, setShowDesc] = useState(false)
  const [comment, setComment] = useState(entry.comment)
  const [noteEp, setNoteEp] = useState(null)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    let live = true
    api.anilist.forTitle(entry.title, entry.aniListId).then((i) => {
      if (!live || !i) return
      setInfo(i)
      const patch = {}
      if (entry.aniListId == null) patch.aniListId = i.id
      if (entry.totalEpisodes == null && i.episodes) patch.totalEpisodes = i.episodes
      if (Object.keys(patch).length) api.library.update(entry.id, patch).then(onChanged)
    }).catch(() => {})
    return () => { live = false }
  }, [api, entry.id])

  const save = async (patch) => { await api.library.update(entry.id, patch); onChanged() }
  const watched = entry.watchedEpisodes
  const maxEp = Math.max(entry.totalEpisodes ?? 0, ...watched.map(Math.ceil), 1)
  const episodes = Array.from({ length: maxEp }, (_, i) => i + 1)
  const nextEp = episodes.find((ep) => !watched.includes(ep)) ?? 1

  const openNote = (ep) => { setNoteEp(ep); setNoteText(entry.episodeNotes[String(ep)] ?? '') }
  const saveNote = async () => { await api.library.setEpisodeNote(entry.id, noteEp, noteText); onChanged() }
  const toggleWatched = (ep) => save({ watchedEpisodes: watched.includes(ep) ? watched.filter((x) => x !== ep) : [...watched, ep] })
  const remove = async () => { await api.library.remove(entry.id); onBack(); onChanged() }
  const animeKey = entry.aniCliTitle ?? entry.title

  return (
    <section className="page">
      <div className="row"><button type="button" onClick={onBack}>{t('detail.back')}</button></div>
      <div className="detail">
        <Poster title={entry.title} aniListId={entry.aniListId} />
        <div className="page">
          <h2>{entry.title}</h2>
          {info && (
            <p className="muted">
              {t('detail.genres')}: {info.genres.map((g) => <span key={g}>{g} </span>)}
              {info.year && <> · {t('detail.year')}: {info.year}</>}
            </p>
          )}
          <p>{t('detail.progress', { watched: watched.length, total: entry.totalEpisodes ?? '?' })}</p>
          <div className="row">
            <label className="field">
              <span>{t('detail.status')}</span>
              <select aria-label={t('detail.status')} value={entry.status} onChange={(e) => save({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('detail.rating')}</span>
              <select aria-label={t('detail.rating')} value={entry.rating ?? ''} onChange={(e) => save({ rating: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('detail.noRating')}</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>{t('detail.comment')}</span>
            <textarea aria-label={t('detail.comment')} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => { if (comment !== entry.comment) save({ comment }) }} />
          </label>
          {info?.description && (
            <div>
              <button type="button" onClick={() => setShowDesc((v) => !v)}>{showDesc ? t('detail.hideDescription') : t('detail.showDescription')}</button>
              {showDesc && <p className="description">{info.description}</p>}
            </div>
          )}
          <h3>{t('detail.episodes')}</h3>
          <div className="ep-grid">
            {episodes.map((ep) => {
              const cls = ['ep', watched.includes(ep) && 'ep--watched', noteEp === ep && 'ep--selected', entry.episodeNotes[String(ep)] && 'ep--note'].filter(Boolean).join(' ')
              return <button type="button" key={ep} className={cls} onClick={() => openNote(ep)}>{ep}</button>
            })}
          </div>
          {noteEp != null && (
            <div className="page">
              <label className="field">
                <span>{t('detail.note', { episode: noteEp })}</span>
                <textarea aria-label={t('detail.note', { episode: noteEp })} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              </label>
              <div className="row">
                <button type="button" className="primary" onClick={saveNote}>{t('detail.save')}</button>
                <button type="button" onClick={() => toggleWatched(noteEp)}>
                  {watched.includes(noteEp) ? t('detail.unmarkWatched') : t('detail.markWatched')}
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <button type="button" className="primary" disabled={!ready} onClick={() => onContinue({ query: animeKey, anime: animeKey, episode: String(nextEp) })}>
              {t('detail.continue')}
            </button>
            <ConfirmButton label={t('detail.delete')} confirmLabel={t('detail.confirmDelete')} onConfirm={remove} />
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Implement `src/renderer/pages/WatchlistPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from '../components/Poster.jsx'
import { AnimeDetail } from './AnimeDetail.jsx'
import { STATUSES } from '../../shared/domain.js'

export function sortItems(items, sort) {
  const copy = [...items]
  if (sort === 'rating') copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  else if (sort === 'lastWatched') copy.sort((a, b) => String(b.lastWatchedAt ?? '').localeCompare(String(a.lastWatchedAt ?? '')))
  else copy.sort((a, b) => a.title.localeCompare(b.title))
  return copy
}

export function WatchlistPage({ ready, onContinue }) {
  const api = useApi()
  const t = useT()
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('title')
  const [openId, setOpenId] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  const load = () => api.library.list().then(setItems)
  useEffect(() => {
    load()
    return api.onLibraryChanged(load)
  }, [api])

  const open = items?.find((i) => i.id === openId)
  if (open) return <AnimeDetail key={open.id} entry={open} ready={ready} onBack={() => setOpenId(null)} onChanged={load} onContinue={onContinue} />

  const visible = sortItems((items ?? []).filter((i) => filter === 'all' || i.status === filter), sort)
  const addManual = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await api.library.add({ title: newTitle.trim() })
    setNewTitle('')
    load()
  }

  return (
    <section className="page">
      <div className="row">
        <label className="field">
          <span>{t('detail.status')}</span>
          <select aria-label={t('detail.status')} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t('watchlist.all')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('watchlist.sort')}</span>
          <select aria-label={t('watchlist.sort')} value={sort} onChange={(e) => setSort(e.target.value)}>
            {['title', 'rating', 'lastWatched'].map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </select>
        </label>
        <form className="row" onSubmit={addManual}>
          <input aria-label={t('watchlist.titlePrompt')} placeholder={t('watchlist.titlePrompt')} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <button type="submit">{t('watchlist.addManual')}</button>
        </form>
      </div>
      {items && items.length === 0 && <p className="muted">{t('watchlist.empty')}</p>}
      <div className="card-grid">
        {visible.map((i) => (
          <button type="button" key={i.id} className="card" onClick={() => setOpenId(i.id)}>
            <Poster title={i.title} aniListId={i.aniListId} />
            <span className="card__title">{i.title}</span>
            <span className="card__meta">
              {t(`status.${i.status}`)} · {i.watchedEpisodes.length}/{i.totalEpisodes ?? '?'}{i.rating ? ` · ★ ${i.rating}` : ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/ui/Watchlist.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/WatchlistPage.jsx src/renderer/pages/AnimeDetail.jsx tests/unit/ui/Watchlist.test.jsx
git commit -m "feat: watchlist with filters, ratings, comments and per-episode notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Downloads page

**Files:**
- Create: `src/renderer/pages/DownloadsPage.jsx`
- Test: `tests/unit/ui/DownloadsPage.test.jsx`

**Interfaces:**
- Consumes: `useApi`, `useT`, `Poster`, `ConfirmButton` (Task 13); `api.downloads.*` (Task 12).
- Produces: `<DownloadsPage />`, `groupByTitle(items) → [title, items[]][]` (sorted by title, episodes by number).

- [ ] **Step 1: Write the failing test**

`tests/unit/ui/DownloadsPage.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { DownloadsPage, groupByTitle } from '../../../src/renderer/pages/DownloadsPage.jsx'

const downloaded = [
  { id: 'd2', title: 'Show', episode: '2', path: 'D:\\A\\Show\\Show Episode 2.mp4', missing: false },
  { id: 'd1', title: 'Show', episode: '1', path: 'D:\\A\\Show\\Show Episode 1.mp4', missing: false },
  { id: 'd3', title: 'Gone', episode: '1', path: 'D:\\A\\Gone\\Gone Episode 1.mp4', missing: true },
]

describe('groupByTitle', () => {
  it('groups and sorts', () => {
    const g = groupByTitle(downloaded)
    expect(g.map(([title]) => title)).toEqual(['Gone', 'Show'])
    expect(g[1][1].map((i) => i.episode)).toEqual(['1', '2'])
  })
})

describe('DownloadsPage', () => {
  it('shows the queue with progress and controls', async () => {
    let push
    const api = makeFakeApi({
      downloads: {
        queue: vi.fn(async () => [{ id: 'q1', title: 'Show', episode: '3', status: 'downloading', percent: 42.4 }]),
        onChange: vi.fn((cb) => { push = cb; return () => {} }),
      },
    })
    renderUi(<DownloadsPage />, { api })
    await waitFor(() => expect(screen.getByText('Preuzima 42%')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Pauza' }))
    expect(api.downloads.pause).toHaveBeenCalledWith('q1')
    act(() => push([{ id: 'q1', title: 'Show', episode: '3', status: 'paused', percent: 42 }]))
    fireEvent.click(screen.getByRole('button', { name: 'Nastavi' }))
    expect(api.downloads.resume).toHaveBeenCalledWith('q1')
    fireEvent.click(screen.getByRole('button', { name: 'Otkaži' }))
    expect(api.downloads.cancel).toHaveBeenCalledWith('q1')
  })
  it('lists downloaded episodes with play, open folder and delete', async () => {
    const api = makeFakeApi({ downloads: { list: vi.fn(async () => downloaded) } })
    renderUi(<DownloadsPage />, { api })
    await waitFor(() => screen.getByRole('heading', { name: 'Show' }))
    const playButtons = screen.getAllByRole('button', { name: 'Pusti' })
    expect(playButtons).toHaveLength(2)
    fireEvent.click(playButtons[0])
    expect(api.downloads.play).toHaveBeenCalledWith('d1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Otvori folder' })[0])
    expect(api.downloads.openFolder).toHaveBeenCalledWith('d1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Obriši' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(api.downloads.remove).toHaveBeenCalledWith('d1', true))
  })
  it('flags missing files and lets the user remove the entry', async () => {
    const api = makeFakeApi({ downloads: { list: vi.fn(async () => downloaded) } })
    renderUi(<DownloadsPage />, { api })
    await waitFor(() => screen.getByText('Fajl ne postoji'))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni sa liste' }))
    await waitFor(() => expect(api.downloads.remove).toHaveBeenCalledWith('d3', false))
  })
  it('shows an empty message', async () => {
    renderUi(<DownloadsPage />)
    await waitFor(() => expect(screen.getByText('Nema preuzetih epizoda.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ui/DownloadsPage.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/renderer/pages/DownloadsPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from '../components/Poster.jsx'
import { ConfirmButton } from '../components/ConfirmButton.jsx'

export function groupByTitle(items) {
  const map = new Map()
  for (const i of items) map.set(i.title, [...(map.get(i.title) ?? []), i])
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, list]) => [title, [...list].sort((x, y) => Number(x.episode) - Number(y.episode))])
}

export function DownloadsPage() {
  const api = useApi()
  const t = useT()
  const [queue, setQueue] = useState([])
  const [items, setItems] = useState(null)

  const loadList = () => api.downloads.list().then(setItems)
  useEffect(() => {
    api.downloads.queue().then(setQueue)
    loadList()
    return api.downloads.onChange((q) => { setQueue(q); loadList() })
  }, [api])

  const remove = async (id, deleteFile) => { await api.downloads.remove(id, deleteFile); loadList() }

  return (
    <section className="page">
      {queue.length > 0 && (
        <div className="page">
          <h2>{t('downloads.queue')}</h2>
          {queue.map((q) => (
            <div key={q.id} className="queue-item">
              <span className="queue-item__title">{q.title} — {t('downloads.episode', { episode: q.episode })}</span>
              <div className="progress"><div style={{ width: `${Math.round(q.percent)}%` }} /></div>
              <span>{t(`dstatus.${q.status}`, { percent: Math.floor(q.percent) })}</span>
              {['downloading', 'queued'].includes(q.status) && <button type="button" onClick={() => api.downloads.pause(q.id)}>{t('downloads.pause')}</button>}
              {['paused', 'error'].includes(q.status) && <button type="button" onClick={() => api.downloads.resume(q.id)}>{t('downloads.resume')}</button>}
              {q.status !== 'done' && <button type="button" onClick={() => api.downloads.cancel(q.id)}>{t('downloads.cancel')}</button>}
            </div>
          ))}
        </div>
      )}

      <h2>{t('downloads.done')}</h2>
      {items && items.length === 0 && <p className="muted">{t('downloads.empty')}</p>}
      {items && groupByTitle(items).map(([title, list]) => (
        <div key={title} className="group">
          <Poster title={title} />
          <div className="group__items">
            <h3>{title}</h3>
            {list.map((d) => (
              <div key={d.id} className="dl-item">
                <span className="dl-item__title">{t('downloads.episode', { episode: d.episode })}</span>
                {d.missing ? (
                  <>
                    <span className="muted">{t('downloads.missing')}</span>
                    <button type="button" onClick={() => remove(d.id, false)}>{t('downloads.removeEntry')}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="primary" onClick={() => api.downloads.play(d.id)}>{t('downloads.play')}</button>
                    <button type="button" onClick={() => api.downloads.openFolder(d.id)}>{t('downloads.openFolder')}</button>
                    <ConfirmButton label={t('downloads.delete')} confirmLabel={t('downloads.confirmDelete')} onConfirm={() => remove(d.id, true)} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ui/DownloadsPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/DownloadsPage.jsx tests/unit/ui/DownloadsPage.test.jsx
git commit -m "feat: downloads page with queue controls and downloaded episodes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Settings page, App composition and i18n key coverage

**Files:**
- Create: `src/renderer/pages/SettingsPage.jsx`, `src/renderer/App.jsx`
- Modify: `src/renderer/main.jsx` (replace the Task 12 placeholder)
- Test: `tests/unit/ui/SettingsPage.test.jsx`, `tests/unit/ui/App.test.jsx`, `tests/unit/i18nKeys.test.js`

**Interfaces:**
- Consumes: all renderer pieces (Tasks 13–17), `api.*` (Task 12).
- Produces: `<SettingsPage settings onSettings />`, `<App api />` (default export).
  - App opens the wizard automatically when `health.reason === 'missing-tools'`, and when the semaphore is clicked.
  - App shows `AskDialog` on `watch.onAsk` and a banner when `library.wasCorrupt()` is true.
  - `ready` passed to pages is `health.light === 'green'`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/ui/SettingsPage.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SettingsPage } from '../../../src/renderer/pages/SettingsPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

describe('SettingsPage', () => {
  it('changes every setting through onSettings', async () => {
    const onSettings = vi.fn()
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={onSettings} />)
    fireEvent.change(screen.getByLabelText('Jezik'), { target: { value: 'en' } })
    expect(onSettings).toHaveBeenLastCalledWith({ language: 'en' })
    fireEvent.click(screen.getByLabelText('Automatsko praćenje gledanja'))
    expect(onSettings).toHaveBeenLastCalledWith({ autoTrack: false })
    fireEvent.change(screen.getByLabelText('Epizoda je odgledana posle (%)'), { target: { value: '90' } })
    expect(onSettings).toHaveBeenLastCalledWith({ watchedThreshold: 90 })
    fireEvent.click(screen.getByLabelText('Pitaj pri zatvaranju plejera (umesto praga)'))
    expect(onSettings).toHaveBeenLastCalledWith({ askOnClose: true })
    fireEvent.change(screen.getByLabelText('Kvalitet'), { target: { value: '720' } })
    expect(onSettings).toHaveBeenLastCalledWith({ quality: '720' })
    fireEvent.change(screen.getByLabelText('Audio'), { target: { value: 'dub' } })
    expect(onSettings).toHaveBeenLastCalledWith({ mode: 'dub' })
    fireEvent.click(screen.getByLabelText('Automatsko ažuriranje ani-cli i yt-dlp'))
    expect(onSettings).toHaveBeenLastCalledWith({ autoUpdateTools: false })
  })
  it('picks and clears the download folder', async () => {
    const onSettings = vi.fn()
    const api = makeFakeApi({ dialog: { pickFolder: vi.fn(async () => 'D:\\Anime') } })
    const { rerender } = renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={onSettings} />, { api })
    expect(screen.getByText('Nije postavljen (pita svaki put)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Promeni' }))
    await waitFor(() => expect(onSettings).toHaveBeenCalledWith({ downloadDir: 'D:\\Anime' }))
  })
  it('shows tool versions and checks for updates', async () => {
    const api = makeFakeApi({ tools: { status: vi.fn(async () => ({ 'ani-cli': { installed: true, version: 'v5.1' } })) } })
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} />, { api })
    await waitFor(() => expect(screen.getByText(/v5\.1/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Proveri ažuriranja' }))
    await waitFor(() => expect(api.tools.checkUpdates).toHaveBeenCalled())
  })
})
```

`tests/unit/ui/App.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

describe('App', () => {
  it('opens the wizard automatically when tools are missing', async () => {
    const api = makeFakeApi({ health: { get: vi.fn(async () => ({ light: 'red', reason: 'missing-tools', missing: ['mpv'] })) } })
    render(<App api={api} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Podešavanje' })).toBeInTheDocument())
  })
  it('switches language when settings change and navigates', async () => {
    const api = makeFakeApi()
    render(<App api={api} />)
    await waitFor(() => screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Podešavanja' }))
    fireEvent.change(screen.getByLabelText('Jezik'), { target: { value: 'en' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument())
  })
  it('asks whether to mark an episode as watched', async () => {
    let ask
    const api = makeFakeApi({ watch: { onAsk: vi.fn((cb) => { ask = cb; return () => {} }) } })
    render(<App api={api} />)
    await waitFor(() => expect(ask).toBeDefined())
    act(() => ask({ aniCliTitle: 'Show', episode: '5' }))
    expect(screen.getByText('Označi epizodu 5 (Show) kao odgledanu?')).toBeInTheDocument()
  })
  it('warns when the watchlist file was corrupt', async () => {
    const api = makeFakeApi({ library: { wasCorrupt: vi.fn(async () => true) } })
    render(<App api={api} />)
    await waitFor(() => expect(screen.getByText(/bio oštećen/)).toBeInTheDocument())
  })
})
```

`tests/unit/i18nKeys.test.js`:
```js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DICTS } from '../../src/renderer/i18n/index.js'

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? files(p) : /\.jsx?$/.test(e.name) ? [p] : []
  })
}

describe('i18n key coverage', () => {
  it('every literal t(\'key\') used in the renderer exists in sr and en', () => {
    const missing = []
    for (const f of files('src/renderer')) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) {
        for (const lang of ['sr', 'en']) if (!(m[1] in DICTS[lang])) missing.push(`${lang}:${m[1]} (${f})`)
      }
    }
    expect(missing).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ui/SettingsPage.test.jsx tests/unit/ui/App.test.jsx tests/unit/i18nKeys.test.js`
Expected: FAIL — SettingsPage/App missing (i18nKeys may already pass).

- [ ] **Step 3: Implement `src/renderer/pages/SettingsPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { TOOL_IDS } from '../../shared/domain.js'

const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']

export function SettingsPage({ settings, onSettings }) {
  const api = useApi()
  const t = useT()
  const [tools, setTools] = useState({})
  const [checking, setChecking] = useState(false)
  const [threshold, setThreshold] = useState(settings.watchedThreshold)

  useEffect(() => { api.tools.status().then(setTools) }, [api])
  useEffect(() => { setThreshold(settings.watchedThreshold) }, [settings.watchedThreshold])

  const pickDir = async () => {
    const dir = await api.dialog.pickFolder()
    if (dir) onSettings({ downloadDir: dir })
  }
  const checkUpdates = async () => {
    setChecking(true)
    try { await api.tools.checkUpdates() } finally {
      setTools(await api.tools.status())
      setChecking(false)
    }
  }

  return (
    <section className="page">
      <h2>{t('settings.title')}</h2>
      <label className="field">
        <span>{t('settings.language')}</span>
        <select aria-label={t('settings.language')} value={settings.language} onChange={(e) => onSettings({ language: e.target.value })}>
          <option value="sr">{t('lang.sr')}</option>
          <option value="en">{t('lang.en')}</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autoTrack} onChange={(e) => onSettings({ autoTrack: e.target.checked })} />
        {t('settings.autoTrack')}
      </label>
      <label className="field">
        <span>{t('settings.threshold')}</span>
        <input
          type="number" min="50" max="100" aria-label={t('settings.threshold')} value={threshold}
          disabled={!settings.autoTrack || settings.askOnClose}
          onChange={(e) => { setThreshold(e.target.value); const n = Number(e.target.value); if (n >= 50 && n <= 100) onSettings({ watchedThreshold: n }) }}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.askOnClose} disabled={!settings.autoTrack} onChange={(e) => onSettings({ askOnClose: e.target.checked })} />
        {t('settings.askOnClose')}
      </label>
      <div className="field">
        <span>{t('settings.downloadDir')}</span>
        <div className="row">
          <span>{settings.downloadDir ?? t('settings.downloadDirNone')}</span>
          <button type="button" onClick={pickDir}>{t('settings.change')}</button>
          {settings.downloadDir && <button type="button" onClick={() => onSettings({ downloadDir: null })}>{t('settings.clear')}</button>}
        </div>
      </div>
      <label className="field">
        <span>{t('settings.quality')}</span>
        <select aria-label={t('settings.quality')} value={settings.quality} onChange={(e) => onSettings({ quality: e.target.value })}>
          {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t('settings.mode')}</span>
        <select aria-label={t('settings.mode')} value={settings.mode} onChange={(e) => onSettings({ mode: e.target.value })}>
          <option value="sub">{t('settings.mode.sub')}</option>
          <option value="dub">{t('settings.mode.dub')}</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autoUpdateTools} onChange={(e) => onSettings({ autoUpdateTools: e.target.checked })} />
        {t('settings.autoUpdate')}
      </label>
      <h3>{t('settings.tools')}</h3>
      <ul className="tool-list">
        {TOOL_IDS.map((id) => (
          <li key={id} className="tool-row">
            <span className="tool-row__name">{t(`tool.${id}`)}</span>
            <span className="tool-row__state">{tools[id]?.installed ? tools[id].version : t('tool.missing')}</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" disabled={checking} onClick={checkUpdates}>{checking ? t('settings.checking') : t('settings.checkUpdates')}</button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Implement `src/renderer/App.jsx` and replace `src/renderer/main.jsx`**

`src/renderer/App.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { ApiContext } from './api.js'
import { I18nProvider, useT } from './i18n/I18nContext.jsx'
import { Header } from './components/Header.jsx'
import { AskDialog } from './components/AskDialog.jsx'
import { SetupWizard } from './pages/SetupWizard.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { WatchlistPage } from './pages/WatchlistPage.jsx'
import { DownloadsPage } from './pages/DownloadsPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'

function CorruptBanner() {
  const t = useT()
  return <div className="notice notice--warn" role="status">{t('library.corrupt')}</div>
}

export default function App({ api }) {
  const [settings, setSettings] = useState(null)
  const [health, setHealth] = useState({ light: 'yellow', reason: 'checking' })
  const [page, setPage] = useState('search')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [ask, setAsk] = useState(null)
  const [pendingWatch, setPendingWatch] = useState(null)
  const [corrupt, setCorrupt] = useState(false)

  useEffect(() => {
    api.settings.get().then(setSettings)
    api.health.get().then(setHealth)
    api.library.wasCorrupt().then(setCorrupt)
    const offs = [api.health.onChange(setHealth), api.watch.onAsk(setAsk)]
    return () => offs.forEach((off) => off())
  }, [api])

  useEffect(() => { if (health.reason === 'missing-tools') setWizardOpen(true) }, [health.reason])

  if (!settings) return null
  const ready = health.light === 'green'
  const updateSettings = async (patch) => setSettings(await api.settings.update(patch))
  const continueWatching = (params) => { setPendingWatch(params); setPage('search') }

  return (
    <ApiContext.Provider value={api}>
      <I18nProvider lang={settings.language}>
        <Header page={page} onNavigate={setPage} health={health} onSemaphoreClick={() => setWizardOpen(true)} />
        <main>
          {corrupt && <CorruptBanner />}
          {page === 'search' && (
            <SearchPage ready={ready} settings={settings} onSettings={updateSettings} onOpenWizard={() => setWizardOpen(true)} pendingWatch={pendingWatch} onPendingHandled={() => setPendingWatch(null)} />
          )}
          {page === 'watchlist' && <WatchlistPage ready={ready} onContinue={continueWatching} />}
          {page === 'downloads' && <DownloadsPage />}
          {page === 'settings' && <SettingsPage settings={settings} onSettings={updateSettings} />}
        </main>
        {wizardOpen && <SetupWizard health={health} onClose={() => setWizardOpen(false)} />}
        {ask && <AskDialog ask={ask} onDone={() => setAsk(null)} />}
      </I18nProvider>
    </ApiContext.Provider>
  )
}
```

`src/renderer/main.jsx` (replace placeholder):
```jsx
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App api={window.animedesk} />)
```

- [ ] **Step 5: Run the tests, the full suite and a build**

Run: `npx vitest run`
Expected: PASS (all unit, UI and integration tests).

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 6: Manual check in dev mode**

Run: `npm run dev`
Expected: window opens; wizard appears (tools missing in `%APPDATA%\AnimeDesk`); "Instaliraj sve" downloads all tools with progress; semaphore turns green after the self-test; search "frieren" shows anime cards, then episodes; watching opens mpv; closing after >85% marks the episode in Watchlist. Note any deviation before committing.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/SettingsPage.jsx src/renderer/App.jsx src/renderer/main.jsx tests/unit/ui/SettingsPage.test.jsx tests/unit/ui/App.test.jsx tests/unit/i18nKeys.test.js
git commit -m "feat: settings page and app composition" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Packaging, README, live test and Electron smoke test

**Files:**
- Create: `electron-builder.yml`, `README.md`, `vitest.live.config.mjs`, `tests/live/aniCli.live.test.js`, `playwright.config.mjs`, `tests/e2e/smoke.spec.mjs`

**Interfaces:**
- Consumes: the whole app (Tasks 1–18).
- Produces: `npm run dist` → `dist/AnimeDesk-Setup-0.1.0.exe`; `npm run test:live`; `npm run test:e2e`.

- [ ] **Step 1: Write the Electron smoke test**

`playwright.config.mjs`:
```js
import { defineConfig } from '@playwright/test'

export default defineConfig({ testDir: 'tests/e2e', timeout: 60000 })
```

`tests/e2e/smoke.spec.mjs`:
```js
import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('starts and shows the setup wizard when tools are missing', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-e2e-'))
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ANIMEDESK_USER_DATA: userData } })
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'Podešavanje' })).toBeVisible()
  await expect(win.getByTestId('tool-mpv')).toHaveAttribute('data-light', 'red')
  await app.close()
})
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e` (Playwright drives Electron directly; no browser download is needed)
Expected: 1 passed.

- [ ] **Step 3: Live test against the real ani-cli**

`vitest.live.config.mjs`:
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['tests/live/**/*.test.js'], testTimeout: 15 * 60 * 1000 } })
```

`tests/live/aniCli.live.test.js`:
```js
import { it, expect } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import extractZip from 'extract-zip'
import { createPaths } from '../../src/main/paths.js'
import { createToolManager } from '../../src/main/toolManager.js'
import { getJson, download } from '../../src/main/http.js'
import { run } from '../../src/main/run.js'
import { createBridgeServer } from '../../src/main/bridgeServer.js'
import { createAniCliBridge } from '../../src/main/aniCliBridge.js'
import { DEFAULT_SETTINGS } from '../../src/main/settings.js'

// Uses the real %APPDATA%\AnimeDesk (or ANIMEDESK_USER_DATA), installs missing tools, then runs the self-test.
it('real ani-cli returns a stream link for One Piece episode 1', async () => {
  const base = process.env.ANIMEDESK_USER_DATA ?? path.join(process.env.APPDATA ?? os.homedir(), 'AnimeDesk')
  const paths = createPaths(base)
  const toolManager = createToolManager({
    paths,
    http: { getJson, download },
    extractZip: (file, dir) => extractZip(file, { dir }),
    runExe: (file, args) => run(file, args).done,
  })
  const errors = await toolManager.installMissing((p) => { if (p.phase !== 'download') console.log(p.id, p.phase, p.message ?? '') })
  expect(errors).toEqual({})
  const server = createBridgeServer()
  await server.start()
  try {
    const aniCli = createAniCliBridge({
      toolManager, server,
      bridges: { menu: path.resolve('resources/bridges/menu-bridge.sh'), player: path.resolve('resources/bridges/animedesk-mpv-bridge.sh') },
      getSettings: () => DEFAULT_SETTINGS,
      historyDir: paths.aniCliHistory,
    })
    expect(await aniCli.selfTest({ timeoutMs: 60000 })).toBe(true)
  } finally {
    await server.stop()
  }
})
```

Run: `npm run test:live`
Expected: PASS. If it fails with the self-test only, run the real script by hand to see why: `"C:\Program Files\Git\bin\bash.exe" "%APPDATA%\AnimeDesk\tools\ani-cli\ani-cli" -S 1 -e 1 one piece` with `ANI_CLI_PLAYER=debug`. A source outage is not an AnimeDesk bug; report it rather than changing code.

- [ ] **Step 4: Installer config**

`electron-builder.yml`:
```yaml
appId: com.leqora.animedesk
productName: AnimeDesk
directories:
  output: dist
files:
  - out/**
  - package.json
extraResources:
  - from: resources/bridges
    to: bridges
win:
  target: nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  artifactName: AnimeDesk-Setup-${version}.exe
publish:
  provider: github
  owner: leqora
  repo: AnimeDesk
```

Run: `npm run dist`
Expected: `dist/AnimeDesk-Setup-0.1.0.exe` exists. Install it, start AnimeDesk, confirm the wizard appears and `%LOCALAPPDATA%\Programs\AnimeDesk\resources\bridges\menu-bridge.sh` exists with LF endings.

- [ ] **Step 5: README**

`README.md`:
````markdown
# AnimeDesk

Desktop aplikacija (Windows) za gledanje i preuzimanje animea preko [ani-cli](https://github.com/pystardust/ani-cli), sa ličnom watchlist-om.
*A Windows desktop app for watching and downloading anime through ani-cli, with a personal watchlist.*

## Srpski

### Šta radi
- Pretraga, izbor epizode i gledanje u **mpv** plejeru.
- Watchlist: status (Gledam, Završeno, Planiram, Pauzirano, Odustao), ocena 1–10, komentar i beleške po epizodi. Napredak se prati automatski (podesivo).
- Preuzimanje epizoda u izabrani folder, red preuzimanja sa pauzom.
- Semafor pokazuje da li sve radi; ako izvor prestane da radi, aplikacija sama preuzme novu verziju ani-cli.
- Bez spojlera: opisi su sakriveni dok ne klikneš „Prikaži opis”.

### Instalacija
1. Skini `AnimeDesk-Setup-<verzija>.exe` sa [Releases](https://github.com/leqora/AnimeDesk/releases) i instaliraj.
2. Pri prvom pokretanju klikni **Instaliraj sve** — aplikacija sama preuzima potrebne alate u `%APPDATA%\AnimeDesk\tools`.

### Šta aplikacija preuzima i odakle
| Alat | Izvor |
|---|---|
| ani-cli | github.com/pystardust/ani-cli (GPL-3.0) |
| mpv | github.com/mpv-player/mpv (GPL-2.0+/LGPL) |
| yt-dlp | github.com/yt-dlp/yt-dlp (Unlicense) |
| ffmpeg | github.com/GyanD/codexffmpeg (GPL) |
| PortableGit (samo ako Git nije instaliran) | github.com/git-for-windows/git (GPL-2.0) |

### Napomena
ani-cli koristi neoficijalne izvore sadržaja. To je pravno siva zona; korisnik je sam odgovoran za način upotrebe. Za legalno gledanje koristi zvanične servise.

## English

### Features
- Search, pick an episode and watch it in **mpv**.
- Watchlist with status, 1–10 rating, comment and per-episode notes; progress is tracked automatically (configurable).
- Download episodes to a folder of your choice, with a pausable queue.
- A status light shows whether everything works; if the source breaks, the app fetches the newest ani-cli by itself.
- Spoiler-free: descriptions stay hidden until you click "Show description".

### Install
1. Download `AnimeDesk-Setup-<version>.exe` from [Releases](https://github.com/leqora/AnimeDesk/releases) and install it.
2. On first launch click **Install all** — the app downloads the tools it needs into `%APPDATA%\AnimeDesk\tools`.

### Disclaimer
ani-cli relies on unofficial content sources. This is a legal grey area and you are responsible for how you use it. Use official services for legal streaming.

## Development
```bash
npm install
npm run dev        # start the app
npm test           # unit + integration tests
npm run test:live  # real ani-cli self-test (needs internet)
npm run test:e2e   # Electron smoke test
npm run dist       # build the Windows installer
```
````

- [ ] **Step 6: Final full verification and commit**

Run: `npx vitest run && npm run test:e2e`
Expected: all PASS.

```bash
git add electron-builder.yml README.md vitest.live.config.mjs tests/live playwright.config.mjs tests/e2e
git commit -m "chore: installer config, README, live and smoke tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| §2 Pravilo bez spojlera | 16 (hidden description), 15/16 (episodes by number only) |
| §3.1 ToolManager | 5 |
| §3.2 AniCliBridge + bridges | 6, 7 |
| §3.3 PlayerMonitor | 8 |
| §3.4 Downloads | 9, 15, 17 |
| §3.5 Library | 3, 16 |
| §3.6 AniList | 10, 13 (Poster), 16 |
| §3.7 HealthCheck + semafor + blokiranje | 11, 12 (6 h re-check, daily update), 13, 15, 16 |
| §3.8 Wizard | 14, 18 (auto-open) |
| §3.9 Settings | 2, 18 |
| §3.10 i18n | 4, 18 (key coverage) |
| §4 UI ekrani | 13–18 |
| §6 Testiranje (unit, integration, UI, live, smoke) | all tasks, 19 |
| §7 Distribucija + README | 19 |
