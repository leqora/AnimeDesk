# AnimeDesk v0.3 — Auto-update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app updates: AnimeDesk checks GitHub Releases, downloads a new version in the background, shows "What's new" and installs only when the user clicks "Restart and update"; plus a release script that guarantees every release carries the files the updater needs.

**Architecture:** A testable `src/main/updater.js` wraps `electron-updater`'s `autoUpdater` (injected) and publishes a small state object to the renderer. `src/main/whatsNew.js` decides once per new version whether to show "Updated to X" using a `lastSeenVersion` setting and release notes shipped as `resources/releases/vX.Y.Z.md`. The renderer gets an update banner, a "What's new" dialog and a settings section. `scripts/release.mjs` builds and publishes via `gh` after pure checks in `scripts/releaseChecks.mjs`.

**Tech Stack:** existing (Electron 44, React 19, Vitest 5, electron-vite 5, electron-builder 26) + `electron-updater` ^6.8 (runtime dependency).

**Spec:** `docs/superpowers/specs/2026-10-02-auto-update-design.md` (earlier specs still apply).

## Global Constraints

- Branch `feat/v0.3-auto-update`; git identity `leqora <dzonzi777@gmail.com>`; every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nothing installs without the user's click: `autoUpdater.autoInstallOnAppQuit = false` always; install only via `quitAndInstall(false, true)` from the "Restart and update" button.
- `autoDownload` follows the setting `autoDownloadUpdates` (default `true`).
- Checks: first 10 000 ms after start, then every 6 h, and on the button. No checks when `app.isPackaged === false` (state `disabled`).
- Release notes are shown only as plain text (never injected as HTML).
- "Updated to X" shows once per new version; never on a fresh install (`lastSeenVersion === null` → just record it).
- Update state shape: `{ status: 'idle'|'checking'|'none'|'available'|'downloading'|'ready'|'error'|'disabled', currentVersion, version, percent, notes, lastCheckedAt, error }`.
- Releases are published only by `npm run release`, which refuses unless `.exe`, `.exe.blockmap` and `latest.yml` (with the right version/path) exist.
- All UI strings through `t('key')`, identical keys in `sr.json`/`en.json`; colors only via CSS tokens (styles test enforces).
- Ruling (spec §4): release notes are "built in" by shipping `docs/releases/` as electron-builder `extraResources` (`resources/releases/`), read at runtime — offline, no network.

## Review Focus

1. **The current latest release (v0.2.0) has no `latest.yml`** — the first check in 0.3.0 fails with "Cannot find latest.yml"; the user must see no banner and no crash, only "Update check failed" in Settings. Pinned in Task 3 ("an error event or rejected check becomes state error without throwing") and Task 5 ("hides on error").
2. **Late `download-progress` events after `update-downloaded`** must not flip the state back from `ready` to `downloading` (the button would disappear). Pinned in Task 3 ("progress after ready keeps ready").
3. **Double-clicking "Restart and update"** or clicking it in the wrong state must not call `quitAndInstall` twice / at all. Pinned in Task 3 ("install only when ready, once").
4. **Turning auto-download on while an update is merely `available`** should start the download immediately. Pinned in Task 3 ("applySettings starts a pending download").
5. **Malicious or odd HTML in GitHub release notes** (`<script>`, `<img onerror>`, entities) must render as harmless text. Pinned in Task 2 ("strips scripts and tags, decodes entities").

---

## File Map

```
src/main/settings.js            MOD  + autoDownloadUpdates, lastSeenVersion
src/shared/releaseNotes.js      NEW  releaseNotesToText, markdownToText, compareVersions
src/main/updater.js             NEW  createUpdater (wraps electron-updater)
src/main/whatsNew.js            NEW  createWhatsNew, readReleaseNotes
src/shared/channels.js, src/main/ipc.js, src/preload/index.js, src/main/index.js   MOD
electron-builder.yml            MOD  extraResources docs/releases → releases
src/renderer/components/UpdateBanner.jsx, WhatsNewDialog.jsx   NEW
src/renderer/App.jsx, pages/SettingsPage.jsx, styles.css, i18n/*.json   MOD
scripts/releaseChecks.mjs, scripts/release.mjs   NEW
docs/releases/v0.3.0.md         NEW
README.md, package.json         MOD
```

---

### Task 1: Update settings

**Files:** Modify `src/main/settings.js`, `tests/unit/settings.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.autoDownloadUpdates = true`, `DEFAULT_SETTINGS.lastSeenVersion = null`; sanitize keeps `autoDownloadUpdates` only if boolean and `lastSeenVersion` only if it matches `/^\d+\.\d+\.\d+$/`, else `null`.

- [ ] **Step 1: Failing tests** — in `tests/unit/settings.test.js`, add to the `'has the agreed defaults'` expected object: `autoDownloadUpdates: true, lastSeenVersion: null,` and append:
```js
  it('validates the update settings', () => {
    expect(sanitizeSettings({ autoDownloadUpdates: false }).autoDownloadUpdates).toBe(false)
    expect(sanitizeSettings({ autoDownloadUpdates: 'no' }).autoDownloadUpdates).toBe(true)
    expect(sanitizeSettings({ lastSeenVersion: '0.3.1' }).lastSeenVersion).toBe('0.3.1')
    expect(sanitizeSettings({ lastSeenVersion: 'v0.3.1' }).lastSeenVersion).toBeNull()
    expect(sanitizeSettings({ lastSeenVersion: 3 }).lastSeenVersion).toBeNull()
  })
```
- [ ] **Step 2:** `npx vitest run tests/unit/settings.test.js` → FAIL (defaults mismatch, undefined fields).
- [ ] **Step 3: Implement** — add to `DEFAULT_SETTINGS` after `animations: true,`:
```js
  autoDownloadUpdates: true,
  lastSeenVersion: null,
```
and to `sanitizeSettings` before `return s`:
```js
  if (typeof input.autoDownloadUpdates === 'boolean') s.autoDownloadUpdates = input.autoDownloadUpdates
  if (typeof input.lastSeenVersion === 'string' && /^\d+\.\d+\.\d+$/.test(input.lastSeenVersion)) s.lastSeenVersion = input.lastSeenVersion
```
- [ ] **Step 4:** `npx vitest run tests/unit/settings.test.js` → PASS; `npx vitest run` → all PASS.
- [ ] **Step 5: Commit**
```bash
git add src/main/settings.js tests/unit/settings.test.js
git commit -m "feat: auto-download and last-seen-version settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Release notes to plain text

**Files:** Create `src/shared/releaseNotes.js`; Test `tests/unit/releaseNotes.test.js`

**Interfaces:**
- Produces: `releaseNotesToText(notes: string | {version, note}[] | null) → string | null`; `markdownToText(md: string | null) → string | null`; `compareVersions(a, b) → -1|0|1` (semver `x.y.z`).

- [ ] **Step 1: Failing test** — `tests/unit/releaseNotes.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { releaseNotesToText, markdownToText, compareVersions } from '../../src/shared/releaseNotes.js'

describe('releaseNotesToText', () => {
  it('turns GitHub HTML into readable text', () => {
    const html = '<h2>Novo</h2><ul><li>Bočni meni</li><li>Zvuci &amp; animacije</li></ul><p>Prvi red<br>Drugi red</p>'
    expect(releaseNotesToText(html)).toBe('Novo\n• Bočni meni\n• Zvuci & animacije\n\nPrvi red\nDrugi red')
  })
  it('strips scripts and tags, decodes entities', () => {
    const html = '<p>Hi</p><script>alert(1)</script><img src=x onerror="alert(2)"><style>p{}</style>&lt;b&gt; &quot;x&quot; &#39;y&#39;'
    const text = releaseNotesToText(html)
    expect(text).not.toMatch(/alert|onerror|<img|p\{\}/)
    expect(text).toContain('<b> "x" \'y\'')
  })
  it('joins an array of versions, newest first', () => {
    expect(releaseNotesToText([{ version: '0.3.0', note: '<p>A</p>' }, { version: '0.3.1', note: '<p>B</p>' }]))
      .toBe('v0.3.1\nB\n\nv0.3.0\nA')
  })
  it('returns null for empty input', () => {
    expect(releaseNotesToText(null)).toBeNull()
    expect(releaseNotesToText('   ')).toBeNull()
    expect(releaseNotesToText('<p></p>')).toBeNull()
  })
})

describe('markdownToText', () => {
  it('drops markdown markers but keeps the words', () => {
    expect(markdownToText('## Novo\n- **Bočni** meni\n`code` [link](https://x)\n\n\n\nkraj'))
      .toBe('Novo\n• Bočni meni\ncode link\n\nkraj')
    expect(markdownToText(null)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders semver numerically', () => {
    expect(compareVersions('0.3.10', '0.3.9')).toBe(1)
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0)
    expect(compareVersions('0.2.9', '0.3.0')).toBe(-1)
  })
})
```
- [ ] **Step 2:** `npx vitest run tests/unit/releaseNotes.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/shared/releaseNotes.js`:
```js
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }

const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1
  }
  return 0
}

// GitHub release notes arrive as HTML; the app only ever shows them as plain text.
export function releaseNotesToText(notes) {
  if (notes == null) return null
  if (Array.isArray(notes)) {
    const parts = [...notes]
      .sort((x, y) => compareVersions(y.version, x.version))
      .map((n) => {
        const body = releaseNotesToText(n.note)
        return body ? `v${n.version}\n${body}` : `v${n.version}`
      })
    return parts.length ? parts.join('\n\n') : null
  }
  return tidy(
    String(notes)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
      .replace(/<\/(ul|ol)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]),
  )
}

export function markdownToText(md) {
  if (md == null) return null
  return tidy(
    String(md)
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
  )
}
```
Check by hand for the first test: `<h2>Novo</h2>` → `Novo\n`; `<ul>` removed; `<li>Bočni meni</li>` → `• Bočni meni\n`; second li → `• Zvuci & animacije\n`; `</ul>` → `\n`; `<p>Prvi red<br>Drugi red</p>` → `Prvi red\nDrugi red\n` ⇒ `Novo\n• Bočni meni\n• Zvuci & animacije\n\nPrvi red\nDrugi red` after tidy. ✓
- [ ] **Step 4:** `npx vitest run tests/unit/releaseNotes.test.js` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/shared/releaseNotes.js tests/unit/releaseNotes.test.js
git commit -m "feat: plain-text release notes from GitHub HTML and markdown" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Updater (main process)

**Files:** Create `src/main/updater.js`; Modify `src/shared/channels.js`; Test `tests/unit/updater.test.js`

**Interfaces:**
- Consumes: `releaseNotesToText` (Task 2); `EVENTS` from channels.
- Produces:
  - `EVENTS.updateState = 'event:update-state'`.
  - `createUpdater({ autoUpdater, isPackaged, currentVersion, getSettings, notify, setTimeoutFn = setTimeout, setIntervalFn = setInterval, now = () => new Date().toISOString() }) → { start(), check() → Promise<state>, download() → boolean, install() → boolean, applySettings(), getState() → state }`.
  - `notify(EVENTS.updateState, state)` on every change.

- [ ] **Step 1: Add the channel** — in `src/shared/channels.js` `EVENTS`, add `updateState: 'event:update-state',`.

- [ ] **Step 2: Failing test** — `tests/unit/updater.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createUpdater } from '../../src/main/updater.js'
import { EVENTS } from '../../src/shared/channels.js'

function fakeAutoUpdater() {
  const u = new EventEmitter()
  u.autoDownload = true
  u.autoInstallOnAppQuit = true
  u.checkForUpdates = vi.fn(async () => {})
  u.downloadUpdate = vi.fn(async () => {})
  u.quitAndInstall = vi.fn()
  return u
}
function setup({ isPackaged = true, settings = { autoDownloadUpdates: true } } = {}) {
  const autoUpdater = fakeAutoUpdater()
  const events = []
  const timers = []
  const intervals = []
  const current = { ...settings }
  const updater = createUpdater({
    autoUpdater, isPackaged, currentVersion: '0.3.0',
    getSettings: () => current,
    notify: (ch, s) => events.push([ch, s]),
    setTimeoutFn: (fn, ms) => timers.push([fn, ms]),
    setIntervalFn: (fn, ms) => intervals.push([fn, ms]),
    now: () => '2026-10-02T10:00:00Z',
  })
  return { autoUpdater, events, timers, intervals, updater, current }
}
const last = (events) => events.at(-1)[1]

describe('updater', () => {
  it('is disabled when the app is not packaged', async () => {
    const { updater, autoUpdater, timers } = setup({ isPackaged: false })
    updater.start()
    expect(updater.getState()).toMatchObject({ status: 'disabled', currentVersion: '0.3.0' })
    expect(timers).toEqual([])
    await updater.check()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })
  it('never installs on quit and follows the auto-download setting', () => {
    const { updater, autoUpdater, current } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(autoUpdater.autoDownload).toBe(false)
    current.autoDownloadUpdates = true
    updater.applySettings()
    expect(autoUpdater.autoDownload).toBe(true)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
  })
  it('checks 10 s after start and every 6 hours', async () => {
    const { updater, autoUpdater, timers, intervals } = setup()
    updater.start()
    expect(timers.map((t) => t[1])).toEqual([10000])
    expect(intervals.map((t) => t[1])).toEqual([6 * 60 * 60 * 1000])
    await timers[0][0]()
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })
  it('maps updater events to states', () => {
    const { updater, autoUpdater, events } = setup()
    updater.start()
    autoUpdater.emit('checking-for-update')
    expect(last(events)).toMatchObject({ status: 'checking' })
    autoUpdater.emit('update-available', { version: '0.3.1', releaseNotes: '<p>Novo</p>' })
    expect(last(events)).toMatchObject({ status: 'available', version: '0.3.1', notes: 'Novo', lastCheckedAt: '2026-10-02T10:00:00Z' })
    autoUpdater.emit('download-progress', { percent: 41.6 })
    expect(last(events)).toMatchObject({ status: 'downloading', percent: 42 })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    expect(last(events)).toMatchObject({ status: 'ready', version: '0.3.1', percent: 100 })
    expect(events.every(([ch]) => ch === EVENTS.updateState)).toBe(true)
  })
  it('progress after ready keeps ready', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    autoUpdater.emit('download-progress', { percent: 99 })
    expect(updater.getState().status).toBe('ready')
  })
  it('reports up to date', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-not-available', { version: '0.3.0' })
    expect(updater.getState()).toMatchObject({ status: 'none', lastCheckedAt: '2026-10-02T10:00:00Z' })
  })
  it('an error event or rejected check becomes state error without throwing', async () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('error', new Error('Cannot find latest.yml'))
    expect(updater.getState()).toMatchObject({ status: 'error', error: 'Cannot find latest.yml' })
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await expect(updater.check()).resolves.toMatchObject({ status: 'error', error: 'offline' })
  })
  it('an error after ready keeps the downloaded update installable', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    autoUpdater.emit('error', new Error('later check failed'))
    expect(updater.getState()).toMatchObject({ status: 'ready', error: 'later check failed' })
  })
  it('downloads only when available', () => {
    const { updater, autoUpdater } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    expect(updater.download()).toBe(false)
    autoUpdater.emit('update-available', { version: '0.3.1' })
    expect(updater.download()).toBe(true)
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(updater.getState()).toMatchObject({ status: 'downloading', percent: 0 })
  })
  it('a failed download becomes state error', async () => {
    const { updater, autoUpdater } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('disk full'))
    autoUpdater.emit('update-available', { version: '0.3.1' })
    updater.download()
    await new Promise((r) => setTimeout(r, 0))
    expect(updater.getState()).toMatchObject({ status: 'error', error: 'disk full' })
  })
  it('applySettings starts a pending download', () => {
    const { updater, autoUpdater, current } = setup({ settings: { autoDownloadUpdates: false } })
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    current.autoDownloadUpdates = true
    updater.applySettings()
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })
  it('install only when ready, once', () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    expect(updater.install()).toBe(false)
    autoUpdater.emit('update-available', { version: '0.3.1' })
    expect(updater.install()).toBe(false)
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    expect(updater.install()).toBe(true)
    expect(updater.install()).toBe(false)
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
  it('does not re-check while checking, downloading or ready', async () => {
    const { updater, autoUpdater } = setup()
    updater.start()
    autoUpdater.emit('update-available', { version: '0.3.1' })
    autoUpdater.emit('update-downloaded', { version: '0.3.1' })
    await updater.check()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3:** `npx vitest run tests/unit/updater.test.js` → FAIL (module missing).

- [ ] **Step 4: Implement** `src/main/updater.js`:
```js
import { EVENTS } from '../shared/channels.js'
import { releaseNotesToText } from '../shared/releaseNotes.js'

const FIRST_CHECK_MS = 10000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const BUSY = ['checking', 'downloading', 'ready']

export function createUpdater({
  autoUpdater, isPackaged, currentVersion, getSettings, notify,
  setTimeoutFn = setTimeout, setIntervalFn = setInterval, now = () => new Date().toISOString(),
}) {
  let state = {
    status: isPackaged ? 'idle' : 'disabled',
    currentVersion, version: null, percent: null, notes: null, lastCheckedAt: null, error: null,
  }
  let installing = false
  const set = (patch) => {
    state = { ...state, ...patch }
    notify(EVENTS.updateState, { ...state })
  }
  const message = (err) => String(err?.message ?? err)
  const fail = (err) => (state.status === 'ready' ? set({ error: message(err) }) : set({ status: 'error', error: message(err), lastCheckedAt: now() }))

  if (isPackaged) {
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
    autoUpdater.on('update-not-available', () => set({ status: 'none', lastCheckedAt: now() }))
    autoUpdater.on('update-available', (info) => set({
      status: 'available', version: info?.version ?? null, notes: releaseNotesToText(info?.releaseNotes ?? null),
      percent: null, lastCheckedAt: now(),
    }))
    autoUpdater.on('download-progress', (p) => {
      if (state.status === 'ready') return
      set({ status: 'downloading', percent: Math.round(p?.percent ?? 0) })
    })
    autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info?.version ?? state.version, percent: 100 }))
    autoUpdater.on('error', fail)
  }

  async function check() {
    if (state.status === 'disabled' || BUSY.includes(state.status)) return { ...state }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      fail(err)
    }
    return { ...state }
  }

  function download() {
    if (state.status !== 'available') return false
    set({ status: 'downloading', percent: 0 })
    Promise.resolve(autoUpdater.downloadUpdate()).catch(fail)
    return true
  }

  function install() {
    if (state.status !== 'ready' || installing) return false
    installing = true
    autoUpdater.quitAndInstall(false, true)
    return true
  }

  function applySettings() {
    if (state.status === 'disabled') return
    autoUpdater.autoDownload = getSettings().autoDownloadUpdates !== false
    autoUpdater.autoInstallOnAppQuit = false // never install without the user's click
    if (autoUpdater.autoDownload && state.status === 'available') download()
  }

  function start() {
    if (state.status === 'disabled') return
    applySettings()
    setTimeoutFn(check, FIRST_CHECK_MS)
    setIntervalFn(check, CHECK_EVERY_MS)
  }

  return { start, check, download, install, applySettings, getState: () => ({ ...state }) }
}
```

- [ ] **Step 5:** `npx vitest run tests/unit/updater.test.js` → PASS; `npx vitest run` → all PASS.

- [ ] **Step 6: Commit**
```bash
git add src/main/updater.js src/shared/channels.js tests/unit/updater.test.js
git commit -m "feat: updater wrapper with click-to-install and safe error handling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: What's new, IPC and main wiring

**Files:**
- Create: `src/main/whatsNew.js`, `docs/releases/v0.3.0.md`
- Modify: `src/shared/channels.js`, `src/main/ipc.js`, `src/preload/index.js`, `src/main/index.js`, `electron-builder.yml`, `package.json` (dependency), `tests/unit/ipc.test.js`
- Test: `tests/unit/whatsNew.test.js`

**Interfaces:**
- Consumes: `createUpdater` (Task 3), `markdownToText` (Task 2), settings (Task 1).
- Produces:
  - `readReleaseNotes(dir, version) → string | null`; `createWhatsNew({ settings, currentVersion, readNotes }) → { init(), get() → { version, notes } | null, seen() }`.
  - Channels: `INVOKE.updateGetState 'update:get-state'`, `INVOKE.updateCheck 'update:check'`, `INVOKE.updateDownload 'update:download'`, `INVOKE.updateInstall 'update:install'`, `INVOKE.whatsNewGet 'whats-new:get'`, `INVOKE.whatsNewSeen 'whats-new:seen'`.
  - Preload: `window.animedesk.update = { getState, check, download, install, onState(cb) }`, `window.animedesk.whatsNew = { get, seen }`.
  - `settings.update(patch)` with `autoDownloadUpdates` calls `updater.applySettings()`.

- [ ] **Step 1: Install the runtime dependency**
```bash
npm install electron-updater@^6.8
```
Check `package.json`: `electron-updater` must be under `dependencies` (not devDependencies) — the packaged app needs it at runtime.

- [ ] **Step 2: Failing tests** — `tests/unit/whatsNew.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWhatsNew, readReleaseNotes } from '../../src/main/whatsNew.js'

function fakeSettings(lastSeenVersion) {
  let s = { lastSeenVersion }
  return { get: () => ({ ...s }), update: vi.fn((p) => { s = { ...s, ...p }; return { ...s } }) }
}
const readNotes = (v) => `Notes for ${v}`

describe('whatsNew', () => {
  it('records the version silently on a fresh install', () => {
    const settings = fakeSettings(null)
    const w = createWhatsNew({ settings, currentVersion: '0.3.0', readNotes })
    w.init()
    expect(settings.update).toHaveBeenCalledWith({ lastSeenVersion: '0.3.0' })
    expect(w.get()).toBeNull()
  })
  it('shows notes once after an update', () => {
    const settings = fakeSettings('0.3.0')
    const w = createWhatsNew({ settings, currentVersion: '0.3.1', readNotes })
    w.init()
    expect(w.get()).toEqual({ version: '0.3.1', notes: 'Notes for 0.3.1' })
    w.seen()
    expect(settings.get().lastSeenVersion).toBe('0.3.1')
    expect(w.get()).toBeNull()
    const again = createWhatsNew({ settings, currentVersion: '0.3.1', readNotes })
    again.init()
    expect(again.get()).toBeNull()
  })
  it('reads release notes files and returns null when missing or empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-notes-'))
    fs.writeFileSync(path.join(dir, 'v0.3.1.md'), '## Novo\n- Ažuriranje\n')
    fs.writeFileSync(path.join(dir, 'v0.3.2.md'), '   \n')
    expect(readReleaseNotes(dir, '0.3.1')).toBe('## Novo\n- Ažuriranje')
    expect(readReleaseNotes(dir, '0.3.2')).toBeNull()
    expect(readReleaseNotes(dir, '9.9.9')).toBeNull()
  })
})
```
In `tests/unit/ipc.test.js` `services()` add:
```js
    updater: { getState: vi.fn(() => ({ status: 'idle' })), check: vi.fn(async () => ({ status: 'none' })), download: vi.fn(() => true), install: vi.fn(() => true), applySettings: vi.fn() },
    whatsNew: { get: vi.fn(() => null), seen: vi.fn() },
```
and append:
```js
  it('routes update calls and re-applies updater settings', async () => {
    const s = services()
    const h = createHandlers(s)
    h[INVOKE.updateGetState]()
    await h[INVOKE.updateCheck]()
    h[INVOKE.updateDownload]()
    h[INVOKE.updateInstall]()
    h[INVOKE.whatsNewGet]()
    h[INVOKE.whatsNewSeen]()
    expect(s.updater.getState).toHaveBeenCalled()
    expect(s.updater.check).toHaveBeenCalled()
    expect(s.updater.download).toHaveBeenCalled()
    expect(s.updater.install).toHaveBeenCalled()
    expect(s.whatsNew.get).toHaveBeenCalled()
    expect(s.whatsNew.seen).toHaveBeenCalled()
    h[INVOKE.settingsUpdate]({ language: 'en' })
    expect(s.updater.applySettings).not.toHaveBeenCalled()
    h[INVOKE.settingsUpdate]({ autoDownloadUpdates: false })
    expect(s.updater.applySettings).toHaveBeenCalledTimes(1)
  })
```
- [ ] **Step 3:** `npx vitest run tests/unit/whatsNew.test.js tests/unit/ipc.test.js` → FAIL (module missing; INVOKE keys undefined).

- [ ] **Step 4: Implement**

`src/main/whatsNew.js`:
```js
import fs from 'node:fs'
import path from 'node:path'

export function readReleaseNotes(dir, version) {
  try {
    const text = fs.readFileSync(path.join(dir, `v${version}.md`), 'utf8').trim()
    return text || null
  } catch {
    return null
  }
}

// "Updated to X" once per new version; a fresh install (no lastSeenVersion) only records the version.
export function createWhatsNew({ settings, currentVersion, readNotes }) {
  let pending = false
  return {
    init() {
      const last = settings.get().lastSeenVersion
      if (last == null) settings.update({ lastSeenVersion: currentVersion })
      else pending = last !== currentVersion
    },
    get() {
      return pending ? { version: currentVersion, notes: readNotes(currentVersion) } : null
    },
    seen() {
      pending = false
      settings.update({ lastSeenVersion: currentVersion })
    },
  }
}
```

`src/shared/channels.js` `INVOKE`, add:
```js
  updateGetState: 'update:get-state',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  whatsNewGet: 'whats-new:get',
  whatsNewSeen: 'whats-new:seen',
```

`src/main/ipc.js` — replace the `settingsUpdate` handler and add the new ones:
```js
    [INVOKE.settingsUpdate]: (patch) => {
      const updated = s.settings.update(patch)
      if (patch && 'autoDownloadUpdates' in patch) s.updater.applySettings()
      return updated
    },
```
```js
    [INVOKE.updateGetState]: () => s.updater.getState(),
    [INVOKE.updateCheck]: () => s.updater.check(),
    [INVOKE.updateDownload]: () => s.updater.download(),
    [INVOKE.updateInstall]: () => s.updater.install(),
    [INVOKE.whatsNewGet]: () => s.whatsNew.get(),
    [INVOKE.whatsNewSeen]: () => s.whatsNew.seen(),
```

`src/preload/index.js` — add before `dialog:`:
```js
  update: {
    getState: invoke(INVOKE.updateGetState),
    check: invoke(INVOKE.updateCheck),
    download: invoke(INVOKE.updateDownload),
    install: invoke(INVOKE.updateInstall),
    onState: on(EVENTS.updateState),
  },
  whatsNew: { get: invoke(INVOKE.whatsNewGet), seen: invoke(INVOKE.whatsNewSeen) },
```

`src/main/index.js`:
- imports:
```js
import { autoUpdater } from 'electron-updater'
import { createUpdater } from './updater.js'
import { createWhatsNew, readReleaseNotes } from './whatsNew.js'
import { markdownToText } from '../shared/releaseNotes.js'
```
- after `const settings = createSettings(…)` add:
```js
  const releasesDir = app.isPackaged ? path.join(process.resourcesPath, 'releases') : path.join(app.getAppPath(), 'docs', 'releases')
  const whatsNew = createWhatsNew({ settings, currentVersion: app.getVersion(), readNotes: (v) => markdownToText(readReleaseNotes(releasesDir, v)) })
  whatsNew.init()
  const updater = createUpdater({ autoUpdater, isPackaged: app.isPackaged, currentVersion: app.getVersion(), getSettings: () => settings.get(), notify: send })
```
- add `updater, whatsNew,` to the object passed to `createHandlers({ … })`.
- right after `createWindow()` add `updater.start()`.

`electron-builder.yml` — under `extraResources:` add a second entry:
```yaml
  - from: docs/releases
    to: releases
```

`docs/releases/v0.3.0.md`:
```markdown
## Srpski

### Novo
- **Automatsko ažuriranje:** aplikacija sama proverava nove verzije, preuzima ih u pozadini i nudi dugme „Restartuj i ažuriraj”. Ništa se ne instalira bez tvog klika.
- **Šta je novo:** pre ažuriranja vidiš šta dobijaš, a posle ažuriranja aplikacija jednom prikaže novine.
- **Podešavanja → Ažuriranja:** trenutna verzija, „Proveri ažuriranja” i prekidač „Automatski preuzimaj ažuriranja”.

### Napomena
Sa 0.1.0 i 0.2.0 na 0.3.0 se prelazi jednom ručno (ove verzije nemaju ažuriranje). Od 0.3.0 nadalje — na dugme.

## English

### New
- **Automatic updates:** the app checks for new versions, downloads them in the background and offers a "Restart and update" button. Nothing installs without your click.
- **What's new:** see the changes before updating; after an update the app shows them once.
- **Settings → Updates:** current version, "Check for updates" and an "Download updates automatically" switch.

### Note
Moving from 0.1.0 / 0.2.0 to 0.3.0 is a one-time manual install. From 0.3.0 on, updates are one click.
```

- [ ] **Step 5:** `npx vitest run tests/unit/whatsNew.test.js tests/unit/ipc.test.js` → PASS; `npx vitest run` → all PASS; `npm run build` → OK; `npm run test:e2e` → 1 passed (dev/unpackaged → updater `disabled`, no network).

- [ ] **Step 6: Commit**
```bash
git add src/main/whatsNew.js src/shared/channels.js src/main/ipc.js src/preload/index.js src/main/index.js electron-builder.yml package.json package-lock.json docs/releases/v0.3.0.md tests/unit/whatsNew.test.js tests/unit/ipc.test.js
git commit -m "feat: wire updater and what's-new into main, IPC and preload" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Update banner, What's new dialog, i18n and styles

**Files:**
- Create: `src/renderer/components/UpdateBanner.jsx`, `src/renderer/components/WhatsNewDialog.jsx`
- Modify: `src/renderer/i18n/sr.json`, `src/renderer/i18n/en.json`, `src/renderer/styles.css`, `tests/unit/ui/helpers.jsx`
- Test: `tests/unit/ui/Update.test.jsx`

**Interfaces:**
- Consumes: preload `update` API (Task 4), `XpBar`, `Icon` (v0.2).
- Produces:
  - `<UpdateBanner state onWhatsNew />` — renders only for `available | downloading | ready`.
  - `<WhatsNewDialog mode="before"|"after" version notes status onClose />` — `role="dialog"`, Escape closes.
  - Fake api in `helpers.jsx` gains `update` and `whatsNew`.

- [ ] **Step 1: i18n keys**

`sr.json`:
```json
  "update.available": "Dostupna je verzija {version}",
  "update.downloading": "Verzija {version} se preuzima… {percent}%",
  "update.ready": "Verzija {version} je spremna",
  "update.whatsNew": "Šta je novo",
  "update.download": "Preuzmi",
  "update.install": "Restartuj i ažuriraj",
  "update.close": "Zatvori",
  "update.titleBefore": "Šta je novo u {version}",
  "update.titleAfter": "Ažurirano na {version}",
  "update.noNotes": "Nema beležaka za ovu verziju.",
  "settings.updateSection": "Ažuriranja",
  "settings.updateVersion": "Verzija {version}",
  "settings.autoDownloadUpdates": "Automatski preuzimaj ažuriranja",
  "settings.updateCheck": "Proveri ažuriranja",
  "settings.updateChecking": "Proveravam…",
  "settings.updateDisabled": "Ažuriranja rade samo u instaliranoj aplikaciji",
  "settings.updateNone": "Imaš najnoviju verziju",
  "settings.updateFailed": "Provera nije uspela",
  "settings.updateLastChecked": "Poslednja provera: {time}"
```
`en.json`:
```json
  "update.available": "Version {version} is available",
  "update.downloading": "Downloading version {version}… {percent}%",
  "update.ready": "Version {version} is ready",
  "update.whatsNew": "What's new",
  "update.download": "Download",
  "update.install": "Restart and update",
  "update.close": "Close",
  "update.titleBefore": "What's new in {version}",
  "update.titleAfter": "Updated to {version}",
  "update.noNotes": "No notes for this version.",
  "settings.updateSection": "Updates",
  "settings.updateVersion": "Version {version}",
  "settings.autoDownloadUpdates": "Download updates automatically",
  "settings.updateCheck": "Check for updates",
  "settings.updateChecking": "Checking…",
  "settings.updateDisabled": "Updates only work in the installed app",
  "settings.updateNone": "You have the latest version",
  "settings.updateFailed": "Update check failed",
  "settings.updateLastChecked": "Last checked: {time}"
```
(Keep both files valid JSON — add a comma after the previous last entry.)

- [ ] **Step 2: Fake API** — in `tests/unit/ui/helpers.jsx` `makeFakeApi`, add before `dialog:`:
```js
    update: {
      getState: vi.fn(async () => ({ status: 'disabled', currentVersion: '0.3.0', version: null, percent: null, notes: null, lastCheckedAt: null, error: null })),
      check: vi.fn(async () => ({ status: 'none' })), download: vi.fn(async () => true), install: vi.fn(async () => true), onState: sub(),
    },
    whatsNew: { get: vi.fn(async () => null), seen: vi.fn(async () => {}) },
```

- [ ] **Step 3: Failing tests** — `tests/unit/ui/Update.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { UpdateBanner } from '../../../src/renderer/components/UpdateBanner.jsx'
import { WhatsNewDialog } from '../../../src/renderer/components/WhatsNewDialog.jsx'

const st = (over) => ({ status: 'idle', currentVersion: '0.3.0', version: '0.3.1', percent: null, notes: 'Novo', lastCheckedAt: null, error: null, ...over })

describe('UpdateBanner', () => {
  it('offers download when auto-download is off', () => {
    const onWhatsNew = vi.fn()
    const { api } = renderUi(<UpdateBanner state={st({ status: 'available' })} onWhatsNew={onWhatsNew} />)
    expect(screen.getByRole('status')).toHaveTextContent('Dostupna je verzija 0.3.1')
    fireEvent.click(screen.getByRole('button', { name: 'Preuzmi' }))
    expect(api.update.download).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Šta je novo' }))
    expect(onWhatsNew).toHaveBeenCalled()
  })
  it('shows download progress', () => {
    renderUi(<UpdateBanner state={st({ status: 'downloading', percent: 42 })} onWhatsNew={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Verzija 0.3.1 se preuzima… 42%')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('restarts and updates when ready', () => {
    const { api } = renderUi(<UpdateBanner state={st({ status: 'ready' })} onWhatsNew={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Verzija 0.3.1 je spremna')
    fireEvent.click(screen.getByRole('button', { name: 'Restartuj i ažuriraj' }))
    expect(api.update.install).toHaveBeenCalled()
  })
  it('hides on error and in every other state', () => {
    for (const status of ['idle', 'checking', 'none', 'error', 'disabled']) {
      const { container, unmount } = renderUi(<UpdateBanner state={st({ status })} onWhatsNew={() => {}} />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })
})

describe('WhatsNewDialog', () => {
  it('shows notes before updating with the install button when ready', () => {
    const onClose = vi.fn()
    const { api } = renderUi(<WhatsNewDialog mode="before" version="0.3.1" notes={'Prvi red\nDrugi red'} status="ready" onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Šta je novo u 0.3.1' })).toBeInTheDocument()
    expect(screen.getByText(/Prvi red/)).toHaveTextContent('Prvi red Drugi red')
    fireEvent.click(screen.getByRole('button', { name: 'Restartuj i ažuriraj' }))
    expect(api.update.install).toHaveBeenCalled()
  })
  it('offers download before updating when only available', () => {
    const { api } = renderUi(<WhatsNewDialog mode="before" version="0.3.1" notes="x" status="available" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preuzmi' }))
    expect(api.update.download).toHaveBeenCalled()
  })
  it('after an update only offers close, and Escape closes', () => {
    const onClose = vi.fn()
    renderUi(<WhatsNewDialog mode="after" version="0.3.1" notes={null} status="none" onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Ažurirano na 0.3.1' })).toBeInTheDocument()
    expect(screen.getByText('Nema beležaka za ovu verziju.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restartuj i ažuriraj' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
  it('renders notes as text, never HTML', () => {
    const { container } = renderUi(<WhatsNewDialog mode="before" version="0.3.1" notes={'<img src=x onerror="alert(1)">'} status="available" onClose={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4:** `npx vitest run tests/unit/ui/Update.test.jsx` → FAIL (modules missing).

- [ ] **Step 5: Implement**

`src/renderer/components/UpdateBanner.jsx`:
```jsx
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { XpBar } from './XpBar.jsx'

const VISIBLE = ['available', 'downloading', 'ready']

export function UpdateBanner({ state, onWhatsNew }) {
  const api = useApi()
  const t = useT()
  if (!VISIBLE.includes(state.status)) return null
  const { version } = state
  const text = state.status === 'available'
    ? t('update.available', { version })
    : state.status === 'downloading'
      ? t('update.downloading', { version, percent: state.percent ?? 0 })
      : t('update.ready', { version })
  return (
    <div className="update-banner" role="status">
      <Icon name="downloads" />
      <span className="update-banner__text">{text}</span>
      {state.status === 'downloading' && <XpBar into={state.percent ?? 0} total={100} />}
      {state.status !== 'downloading' && <button type="button" onClick={onWhatsNew}>{t('update.whatsNew')}</button>}
      {state.status === 'available' && <button type="button" className="primary" onClick={() => api.update.download()}>{t('update.download')}</button>}
      {state.status === 'ready' && <button type="button" className="primary" onClick={() => api.update.install()}>{t('update.install')}</button>}
    </div>
  )
}
```

`src/renderer/components/WhatsNewDialog.jsx`:
```jsx
import { useEffect } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'

export function WhatsNewDialog({ mode, version, notes, status, onClose }) {
  const api = useApi()
  const t = useT()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const title = mode === 'after' ? t('update.titleAfter', { version }) : t('update.titleBefore', { version })
  return (
    <div className="modal" role="dialog" aria-label={title}>
      <div className="modal__box">
        <h2>{title}</h2>
        <div className="whats-new__notes">{notes || t('update.noNotes')}</div>
        <div className="row">
          {mode === 'before' && status === 'ready' && (
            <button type="button" className="primary" onClick={() => api.update.install()}>{t('update.install')}</button>
          )}
          {mode === 'before' && status === 'available' && (
            <button type="button" className="primary" onClick={() => api.update.download()}>{t('update.download')}</button>
          )}
          <button type="button" onClick={onClose}>{t('update.close')}</button>
        </div>
      </div>
    </div>
  )
}
```

Append to `src/renderer/styles.css` (before the `@media (max-width: 960px)` block):
```css
/* updates */
.update-banner { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 10px 14px; margin-bottom: 16px; border-radius: var(--radius); background: var(--glass); border: 1px solid color-mix(in srgb, var(--accent-2) 50%, transparent); box-shadow: var(--glow-cyan); }
.update-banner__text { flex: 1; }
.update-banner .xp-bar { width: 160px; }
.whats-new__notes { white-space: pre-wrap; max-height: 50vh; overflow-y: auto; background: var(--glass); padding: 12px; border-radius: var(--radius-sm); }
```

- [ ] **Step 6:** `npx vitest run tests/unit/ui/Update.test.jsx tests/unit/styles.test.js tests/unit/i18n.test.js` → PASS; `npx vitest run` → all PASS.

- [ ] **Step 7: Commit**
```bash
git add src/renderer/components/UpdateBanner.jsx src/renderer/components/WhatsNewDialog.jsx src/renderer/i18n src/renderer/styles.css tests/unit/ui/helpers.jsx tests/unit/ui/Update.test.jsx
git commit -m "feat: update banner and what's-new dialog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: App and Settings integration

**Files:** Modify `src/renderer/App.jsx`, `src/renderer/pages/SettingsPage.jsx`; Test `tests/unit/ui/AppUpdate.test.jsx`, `tests/unit/ui/SettingsPage.test.jsx`

**Interfaces:**
- Consumes: `UpdateBanner`, `WhatsNewDialog` (Task 5); `api.update`, `api.whatsNew` (Task 4).
- Produces: App keeps `updateState` (from `api.update.getState()` + `api.update.onState`) and `whatsNew` dialog state `{ mode, version, notes } | null`; on mount `api.whatsNew.get()` → if non-null open `mode: 'after'`; closing an `after` dialog calls `api.whatsNew.seen()`. `<SettingsPage … updateState={updateState} />` shows the "Updates" section.

- [ ] **Step 1: Failing tests**

`tests/unit/ui/AppUpdate.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

const state = (over) => ({ status: 'idle', currentVersion: '0.3.0', version: '0.3.1', percent: null, notes: 'Bočni meni', lastCheckedAt: null, error: null, ...over })

describe('App updates', () => {
  it('shows the banner from pushed state and opens what\'s new', async () => {
    let push
    const api = makeFakeApi({ update: { onState: vi.fn((cb) => { push = cb; return () => {} }) } })
    render(<App api={api} sound={{ play: vi.fn() }} />)
    await waitFor(() => expect(push).toBeDefined())
    await screen.findByRole('button', { name: 'Početna' })
    act(() => push(state({ status: 'ready' })))
    expect(screen.getByText('Verzija 0.3.1 je spremna')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Šta je novo' }))
    expect(screen.getByRole('dialog', { name: 'Šta je novo u 0.3.1' })).toHaveTextContent('Bočni meni')
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(screen.queryByRole('dialog', { name: 'Šta je novo u 0.3.1' })).not.toBeInTheDocument()
    expect(api.whatsNew.seen).not.toHaveBeenCalled()
  })
  it('shows "updated to" once after an update and marks it seen on close', async () => {
    const api = makeFakeApi({ whatsNew: { get: vi.fn(async () => ({ version: '0.3.1', notes: 'Novo' })) } })
    render(<App api={api} sound={{ play: vi.fn() }} />)
    const dialog = await screen.findByRole('dialog', { name: 'Ažurirano na 0.3.1' })
    expect(dialog).toHaveTextContent('Novo')
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(api.whatsNew.seen).toHaveBeenCalledTimes(1)
  })
})
```

Append to `tests/unit/ui/SettingsPage.test.jsx` (inside the describe):
```jsx
  it('shows the update section and checks for updates', async () => {
    const onSettings = vi.fn()
    const { api } = renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={onSettings} updateState={{ status: 'none', currentVersion: '0.3.0', version: null, lastCheckedAt: '2026-10-02T10:00:00Z' }} />)
    expect(screen.getByText('Verzija 0.3.0')).toBeInTheDocument()
    expect(screen.getByText('Imaš najnoviju verziju')).toBeInTheDocument()
    expect(screen.getByText(/Poslednja provera:/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Proveri ažuriranja' }))
    expect(api.update.check).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Automatski preuzimaj ažuriranja'))
    expect(onSettings).toHaveBeenLastCalledWith({ autoDownloadUpdates: false })
  })
  it('explains updates are disabled outside the installed app and reports failures', () => {
    const { rerender } = renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} updateState={{ status: 'disabled', currentVersion: '0.3.0' }} />)
    expect(screen.getByText('Ažuriranja rade samo u instaliranoj aplikaciji')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Proveri ažuriranja' })).not.toBeInTheDocument()
    rerender(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} updateState={{ status: 'error', currentVersion: '0.3.0', error: 'x' }} />)
    expect(screen.getByText('Provera nije uspela')).toBeInTheDocument()
    rerender(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={() => {}} updateState={{ status: 'checking', currentVersion: '0.3.0' }} />)
    expect(screen.getByRole('button', { name: 'Proveravam…' })).toBeDisabled()
  })
```

- [ ] **Step 2:** `npx vitest run tests/unit/ui/AppUpdate.test.jsx tests/unit/ui/SettingsPage.test.jsx` → FAIL.

- [ ] **Step 3: Implement `App.jsx`**
- imports: `import { UpdateBanner } from './components/UpdateBanner.jsx'` and `import { WhatsNewDialog } from './components/WhatsNewDialog.jsx'`.
- state: `const [updateState, setUpdateState] = useState({ status: 'idle', currentVersion: '' })` and `const [whatsNew, setWhatsNew] = useState(null)`.
- new effect (with the other effects, before `if (!settings) return null`):
```jsx
  useEffect(() => {
    api.update.getState().then(setUpdateState)
    api.whatsNew.get().then((w) => { if (w) setWhatsNew({ mode: 'after', ...w }) })
    return api.update.onState(setUpdateState)
  }, [api])
```
- handlers (after `continueWatching`):
```jsx
  const openWhatsNew = () => setWhatsNew({ mode: 'before', version: updateState.version, notes: updateState.notes })
  const closeWhatsNew = () => { if (whatsNew?.mode === 'after') api.whatsNew.seen(); setWhatsNew(null) }
```
- inside `<main className="content">`, before `<div key={page} className="page-enter">`:
```jsx
            <UpdateBanner state={updateState} onWhatsNew={openWhatsNew} />
```
- pass `updateState={updateState}` to `<SettingsPage … />`.
- after `<Celebrations … />`:
```jsx
        {whatsNew && <WhatsNewDialog mode={whatsNew.mode} version={whatsNew.version} notes={whatsNew.notes} status={updateState.status} onClose={closeWhatsNew} />}
```

- [ ] **Step 4: Implement `SettingsPage.jsx`**
- signature: `export function SettingsPage({ settings, onSettings, onTestSound = () => {}, updateState = { status: 'disabled', currentVersion: '' } })`.
- before `<h3>{t('settings.tools')}</h3>` insert:
```jsx
      <h3>{t('settings.updateSection')}</h3>
      <p className="hud">{t('settings.updateVersion', { version: updateState.currentVersion })}</p>
      <label className="check">
        <input type="checkbox" checked={settings.autoDownloadUpdates} onChange={(e) => onSettings({ autoDownloadUpdates: e.target.checked })} />
        {t('settings.autoDownloadUpdates')}
      </label>
      {updateState.status === 'disabled' ? (
        <p className="muted">{t('settings.updateDisabled')}</p>
      ) : (
        <div className="row">
          <button type="button" disabled={['checking', 'downloading'].includes(updateState.status)} onClick={() => api.update.check()}>
            {updateState.status === 'checking' ? t('settings.updateChecking') : t('settings.updateCheck')}
          </button>
          {updateState.status === 'none' && <span className="muted">{t('settings.updateNone')}</span>}
          {['available', 'downloading', 'ready'].includes(updateState.status) && <span className="muted">{t('update.available', { version: updateState.version })}</span>}
          {updateState.status === 'error' && <span className="muted">{t('settings.updateFailed')}</span>}
          {updateState.lastCheckedAt && (
            <span className="muted">{t('settings.updateLastChecked', { time: new Date(updateState.lastCheckedAt).toLocaleString(settings.language === 'en' ? 'en-US' : 'sr-RS') })}</span>
          )}
        </div>
      )}
```

- [ ] **Step 5:** `npx vitest run tests/unit/ui/AppUpdate.test.jsx tests/unit/ui/SettingsPage.test.jsx` → PASS; `npx vitest run` → all PASS (run twice).

- [ ] **Step 6: Commit**
```bash
git add src/renderer/App.jsx src/renderer/pages/SettingsPage.jsx tests/unit/ui/AppUpdate.test.jsx tests/unit/ui/SettingsPage.test.jsx
git commit -m "feat: update banner, what's-new and update settings in the app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Release script and README

**Files:**
- Create: `scripts/releaseChecks.mjs`, `scripts/release.mjs`
- Modify: `package.json` (scripts), `README.md`
- Test: `tests/unit/releaseChecks.test.js`

**Interfaces:**
- Consumes: `electron-builder.yml` (`artifactName: AnimeDesk-Setup-${version}.exe`, output `dist`), `docs/releases/v<V>.md` (Task 4).
- Produces:
  - `checkRepoState({ version, porcelain, branch, localHead, remoteHead, localTagExists, remoteTagExists, notesText, ghAuthed })` → `string[]` (error messages; empty = OK).
  - `checkArtifacts({ version, files, latestYml })` → `string[]`, where `files` is the list of file names in `dist/`.
  - `artifactNames(version)` → `{ exe, blockmap, latest }`.
  - `npm run release`.

- [ ] **Step 1: Failing tests** — `tests/unit/releaseChecks.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { checkRepoState, checkArtifacts, artifactNames } from '../../scripts/releaseChecks.mjs'

const okRepo = {
  version: '0.3.0', porcelain: '', branch: 'main', localHead: 'abc', remoteHead: 'abc',
  localTagExists: false, remoteTagExists: false, notesText: '## Novo\n- Ažuriranja', ghAuthed: true,
}
const yml = 'version: 0.3.0\nfiles:\n  - url: AnimeDesk-Setup-0.3.0.exe\npath: AnimeDesk-Setup-0.3.0.exe\nsha512: x\n'
const okFiles = ['AnimeDesk-Setup-0.3.0.exe', 'AnimeDesk-Setup-0.3.0.exe.blockmap', 'latest.yml', 'win-unpacked']

describe('artifactNames', () => {
  it('matches the electron-builder artifactName', () => {
    expect(artifactNames('0.3.0')).toEqual({
      exe: 'AnimeDesk-Setup-0.3.0.exe', blockmap: 'AnimeDesk-Setup-0.3.0.exe.blockmap', latest: 'latest.yml',
    })
  })
})

describe('checkRepoState', () => {
  it('passes a clean, pushed main with notes', () => {
    expect(checkRepoState(okRepo)).toEqual([])
  })
  it.each([
    ['dirty working tree', { porcelain: ' M src/a.js' }, /necommit/i],
    ['wrong branch', { branch: 'feat/x' }, /main/],
    ['main not pushed', { remoteHead: 'def' }, /origin\/main/],
    ['local tag exists', { localTagExists: true }, /v0\.3\.0/],
    ['remote tag exists', { remoteTagExists: true }, /v0\.3\.0/],
    ['missing notes', { notesText: null }, /docs\/releases\/v0\.3\.0\.md/],
    ['empty notes', { notesText: '  \n' }, /docs\/releases\/v0\.3\.0\.md/],
    ['gh not logged in', { ghAuthed: false }, /gh auth login/],
    ['bad version', { version: '0.3' }, /verzija/i],
  ])('rejects %s', (_name, over, msg) => {
    const errors = checkRepoState({ ...okRepo, ...over })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join('\n')).toMatch(msg)
  })
})

describe('checkArtifacts', () => {
  it('passes when all three files exist and latest.yml matches', () => {
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml })).toEqual([])
  })
  it('rejects a missing latest.yml', () => {
    const errors = checkArtifacts({ version: '0.3.0', files: okFiles.filter((f) => f !== 'latest.yml'), latestYml: null })
    expect(errors.join('\n')).toMatch(/latest\.yml/)
  })
  it('rejects a missing blockmap', () => {
    const errors = checkArtifacts({ version: '0.3.0', files: okFiles.filter((f) => !f.endsWith('.blockmap')), latestYml: yml })
    expect(errors.join('\n')).toMatch(/blockmap/)
  })
  it('rejects a missing installer', () => {
    const errors = checkArtifacts({ version: '0.3.0', files: okFiles.filter((f) => !f.endsWith('.exe')), latestYml: yml })
    expect(errors.join('\n')).toMatch(/AnimeDesk-Setup-0\.3\.0\.exe/)
  })
  it('rejects latest.yml with another version or path', () => {
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml.replace('version: 0.3.0', 'version: 0.2.0') }).join('\n')).toMatch(/version: 0\.3\.0/)
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml.replace(/path: .*/, 'path: Other.exe') }).join('\n')).toMatch(/path: AnimeDesk-Setup-0\.3\.0\.exe/)
  })
  it('does not accept 0.3.0 as a prefix of 0.3.01', () => {
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml.replace('version: 0.3.0', 'version: 0.3.01') })).not.toEqual([])
  })
})
```

- [ ] **Step 2:** `npx vitest run tests/unit/releaseChecks.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `scripts/releaseChecks.mjs`**
```js
// Pure rules for scripts/release.mjs — no I/O, so they are unit-tested.

export function artifactNames(version) {
  const exe = `AnimeDesk-Setup-${version}.exe`
  return { exe, blockmap: `${exe}.blockmap`, latest: 'latest.yml' }
}

export function checkRepoState({ version, porcelain, branch, localHead, remoteHead, localTagExists, remoteTagExists, notesText, ghAuthed }) {
  const errors = []
  const tag = `v${version}`
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) errors.push(`Neispravna verzija u package.json: "${version}"`)
  if (porcelain.trim() !== '') errors.push('Radni folder ima necommit-ovane izmene (git status nije prazan)')
  if (branch !== 'main') errors.push(`Objavljuje se samo sa grane main (trenutna: ${branch})`)
  if (localHead !== remoteHead) errors.push('Lokalni main nije jednak origin/main — uradi git push / git pull')
  if (localTagExists) errors.push(`Tag ${tag} već postoji lokalno`)
  if (remoteTagExists) errors.push(`Tag ${tag} već postoji na GitHub-u`)
  if (!notesText || notesText.trim() === '') errors.push(`Nedostaju beleške: docs/releases/${tag}.md`)
  if (!ghAuthed) errors.push('gh nije prijavljen — pokreni gh auth login')
  return errors
}

export function checkArtifacts({ version, files, latestYml }) {
  const errors = []
  const names = artifactNames(version)
  for (const name of [names.exe, names.blockmap, names.latest]) {
    if (!files.includes(name)) errors.push(`Nedostaje dist/${name}`)
  }
  if (latestYml != null) {
    const lines = latestYml.split(/\r?\n/).map((l) => l.trim())
    if (!lines.includes(`version: ${version}`)) errors.push(`latest.yml nema "version: ${version}"`)
    if (!lines.includes(`path: ${names.exe}`)) errors.push(`latest.yml nema "path: ${names.exe}"`)
  }
  return errors
}
```

- [ ] **Step 4:** `npx vitest run tests/unit/releaseChecks.test.js` → PASS.

- [ ] **Step 5: Implement `scripts/release.mjs`** (I/O glue; not unit-tested — every rule lives in `releaseChecks.mjs`):
```js
// Usage: npm run release — builds and publishes the GitHub release for the version in package.json.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkRepoState, checkArtifacts, artifactNames } from './releaseChecks.mjs'

const run = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
const ok = (cmd) => { try { run(cmd); return true } catch { return false } }
const step = (msg) => console.log(`\n▶ ${msg}`)
const fail = (errors) => { console.error('\n✖ Objavljivanje prekinuto:'); for (const e of errors) console.error(`  - ${e}`); process.exit(1) }
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = `v${version}`
const notesFile = `docs/releases/${tag}.md`

step(`Provera repozitorijuma za ${tag}`)
run('git fetch origin --tags')
const repoErrors = checkRepoState({
  version,
  porcelain: run('git status --porcelain'),
  branch: run('git rev-parse --abbrev-ref HEAD'),
  localHead: run('git rev-parse main'),
  remoteHead: run('git rev-parse origin/main'),
  localTagExists: ok(`git rev-parse -q --verify refs/tags/${tag}`),
  remoteTagExists: run(`git ls-remote --tags origin refs/tags/${tag}`) !== '',
  notesText: existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : null,
  ghAuthed: ok('gh auth status'),
})
if (repoErrors.length) fail(repoErrors)

step('Testovi (npm test)')
execSync('npm test', { stdio: 'inherit' })

step('Pravljenje instalera (npm run dist)')
execSync('npm run dist', { stdio: 'inherit' })

step('Provera fajlova u dist/')
const names = artifactNames(version)
const latestPath = join('dist', names.latest)
const artifactErrors = checkArtifacts({
  version,
  files: readdirSync('dist'),
  latestYml: existsSync(latestPath) ? readFileSync(latestPath, 'utf8') : null,
})
if (artifactErrors.length) fail(artifactErrors)
const assetNames = [names.exe, names.blockmap, names.latest]

step(`Objavljivanje GitHub release-a ${tag}`)
execSync(`gh release create ${tag} ${assetNames.map((n) => `"${join('dist', n)}"`).join(' ')} --target main --title "AnimeDesk ${version}" --notes-file "${notesFile}"`, { stdio: 'inherit' })

step('Provera objavljenih fajlova (SHA-256)')
const dir = mkdtempSync(join(tmpdir(), 'animedesk-release-'))
try {
  run(`gh release download ${tag} --dir "${dir}"`)
  const mismatches = assetNames.filter((name) => {
    const remote = join(dir, name)
    const same = existsSync(remote) && sha256(remote) === sha256(join('dist', name))
    console.log(`  ${same ? '✔' : '✖'} ${name}`)
    return !same
  })
  if (mismatches.length) fail([`Objavljeni fajlovi se ne poklapaju sa lokalnim: ${mismatches.join(', ')} — proveri release ručno`])
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\n✔ ${tag} objavljen: https://github.com/leqora/AnimeDesk/releases/tag/${tag}`)
```

- [ ] **Step 6: `package.json`** — add to `scripts` after `"dist"`:
```json
    "dist": "npm run build && electron-builder --win --publish never",
    "release": "node scripts/release.mjs"
```
Run `node --check scripts/release.mjs` → no output (syntax OK). Do NOT run `npm run release`.

- [ ] **Step 7: README** — after the Serbian `### Instalacija` list add:
```markdown
### Ažuriranja
Od verzije 0.3.0 aplikacija sama proverava da li postoji nova verzija (pri pokretanju i na svakih 6 sati) i preuzima je u pozadini. Kad je spremna, klikni **Restartuj i ažuriraj** — ništa se ne instalira bez tvog klika. Automatsko preuzimanje možeš isključiti u Podešavanjima. Verzije 0.1 i 0.2 nemaju ovu opciju, pa 0.3.0 treba jednom instalirati ručno.
```
After the English `### Install` list add:
```markdown
### Updates
Since 0.3.0 the app checks for a new version (on start and every 6 hours) and downloads it in the background. When it is ready, click **Restart and update** — nothing is installed without your click. You can turn automatic downloads off in Settings. Versions 0.1 and 0.2 cannot update themselves, so install 0.3.0 manually once.
```
In `## Development` add one line: ``Release: bump `version` in package.json, write `docs/releases/v<version>.md`, merge to `main`, push, then `npm run release`.``

- [ ] **Step 8:** `npx vitest run` → all PASS.

- [ ] **Step 9: Commit**
```bash
git add scripts tests/unit/releaseChecks.test.js package.json README.md
git commit -m "build: guarded release script for auto-update artifacts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none created (fixes only, if something fails).

- [ ] **Step 1:** `npx vitest run` twice → all PASS both times (no flaky tests).
- [ ] **Step 2:** `npm run build` → OK; `npm run test:e2e` → smoke test PASS (the unpackaged app must start with update status `disabled` and no banner).
- [ ] **Step 3: Packaged app** — `npm run dist`; check `dist/latest.yml` and `dist/AnimeDesk-Setup-<version>.exe.blockmap` exist and `dist/win-unpacked/resources/releases/v0.3.0.md` exists. Launch `dist/win-unpacked/AnimeDesk.exe` with Playwright `_electron.launch({ executablePath })` (temporary script in the scratchpad, not committed), wait 15 s and assert:
  - `await window.animedesk.update.getState()` has `status` `error` or `none` (the current latest release v0.2.0 has no `latest.yml`, so `error` is expected) and the app did not crash;
  - no `.update-banner` is in the DOM;
  - after navigating to Settings the text "Provera nije uspela" (or "Imaš najnoviju verziju") is visible.
  Do NOT take or open screenshots. Close the app.
- [ ] **Step 4:** `git status` clean; `git log --oneline main..HEAD` lists the task commits, each ending with the `Co-Authored-By: Claude Opus 5.5` trailer.
- [ ] **Step 5:** No spoilers anywhere in notes, tests or UI text (no anime plot content is added by this feature).
- [ ] **Step 6:** Do not bump the version, merge, or run `npm run release` — those happen only after the user approves (finishing-a-development-branch).
