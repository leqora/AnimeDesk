# 00 — Naš projekat (AnimeDesk v0.5.0): polazno stanje za poređenje

Faza 0 uporedne analize. Opisano je samo ono što je pročitano u kodu i dokumentaciji (stanje na `main`, commit `af3cf54`, v0.5.0). Reference su u obliku `putanja:linija`, relativno prema korenu repoa. Gde nešto nije moglo da se potvrdi iz koda, piše **„nije provereno”**.

---

## 1. Stack, struktura, arhitektura

### 1.1 Stack (verzije iz `package.json`; instalirane verzije iz `node_modules` su iste)

| Oblast | Paket | Verzija | Ref |
|---|---|---|---|
| Desktop runtime | electron | ^44.5.1 | `package.json:33` |
| Build | electron-vite / vite | ^5.0.0 / ^7.3.6 | `package.json:35,41` |
| UI | react / react-dom | ^19.3.0 | `package.json:39-40` |
| Plejer | hls.js | ^1.7.3 | `package.json:36` |
| Ikone | lucide-react | ^1.49.0 | `package.json:38` |
| Fontovi | @fontsource/russo-one, exo-2, chakra-petch | ^5.3.0 | `package.json:25-27` |
| Ažuriranje | electron-updater | ^6.8.9 (jedina prava runtime zavisnost uz extract-zip) | `package.json:21-22` |
| Pakovanje | electron-builder (NSIS, GitHub publish) | ^26.15.3 | `package.json:34`, `electron-builder.yml:14-24` |
| Testovi | vitest ^5.0.3, @testing-library/react ^16.3.3, jsdom ^30.1.1, @playwright/test ^1.63.0 | | `package.json:28-31,37,42` |

- Paket nije `"type": "module"`; konfiguracije su `.mjs` (`CLAUDE.md`, sekcija Konvencije).
- Renderer: `assetsInlineLimit: 0` i plugin `react()` (`electron.vite.config.mjs`). Nema routera, state biblioteke, CSS frameworka ni biblioteke komponenti. Sve je ručno pisano.
- Vitest uključuje `tests/unit/**` i `tests/integration/**`, timeout 20 s (`vitest.config.mjs`). Prema STATUS-u ima 60 test fajlova i 486 testova (`docs/STATUS.md:9`).
- electron-builder pakuje `out/**`, a kao `extraResources` dodaje `resources/bridges` i `docs/releases` (`electron-builder.yml:6-13`).

### 1.2 Struktura foldera (2–3 nivoa)

```
AnimeDesk/
├─ src/
│  ├─ main/              Electron glavni proces: servisi, IPC, ani-cli most, proxy, skladišta
│  │   ├─ index.js           povezuje sve servise i pravi prozor
│  │   ├─ ipc.js             mapa kanal → handler (ipcMain.handle)
│  │   ├─ aniCliBridge.js    pokretanje ani-cli preko bash-a, env varijable, parsiranje argumenata plejera
│  │   ├─ bridgeServer.js    lokalni HTTP server za menu/play pozive iz bridge skripti
│  │   ├─ watchService.js    tok gledanja: meniji, izbor plejera, beleženje odgledanog
│  │   ├─ streamServer.js    HLS/fajl proxy na 127.0.0.1 za ugrađeni plejer
│  │   ├─ internalPlayer.js  sesija ugrađenog plejera (open/progress/closed/stop)
│  │   ├─ playerMonitor.js   spoljni mpv: pokretanje, IPC pipe, % gledanosti, automatsko preskakanje
│  │   ├─ mpvConfig.js       sopstveni mpv config folder sa uosc
│  │   ├─ aniskip.js / skipLookup.js  AniSkip vremena preko MAL id-a iz AniList-a
│  │   ├─ anilist.js         AniList GraphQL: red zahteva, keš, posteri kao data URL
│  │   ├─ positions.js       pozicije za „Nastavi od…”
│  │   ├─ library.js / tracker.js / watchLog.js / progress.js  watchlist, dnevnik, XP/nivo
│  │   ├─ downloads.js       red preuzimanja (ani-cli -d)
│  │   ├─ seriesPrefs.js / settings.js  podešavanja (po seriji i globalno)
│  │   ├─ toolManager.js / toolSources.js / healthCheck.js  instalacija alata, semafor
│  │   ├─ updater.js / whatsNew.js  automatsko ažuriranje i „Šta je novo”
│  │   ├─ fullscreen.js / windowSecurity.js  F11, zabrana navigacije i novih prozora
│  │   └─ jsonStore.js / paths.js / http.js / run.js  pomoćni moduli
│  ├─ preload/index.js   contextBridge → window.animedesk.*
│  ├─ renderer/          React interfejs
│  │   ├─ App.jsx, main.jsx, api.js, index.html (CSP), styles.css, sound.js
│  │   ├─ pages/          Home, Search, Watchlist, AnimeDetail, Downloads, Profile, Settings, SetupWizard
│  │   ├─ components/     PlayerView, PlayerControls, EpisodePicker, Poster, SeriesCard, Hero, Sidebar…
│  │   ├─ i18n/           sr.json, en.json, index.js, I18nContext.jsx
│  │   └─ theme/          posterTint.js, usePosterTint.js (boja iz postera)
│  └─ shared/            čista logika bez I/O-a: channels, domain, episodes, player, stats, releaseNotes
├─ resources/bridges/    menu-bridge.sh, animedesk-mpv-bridge.sh (ani-cli ih poziva)
├─ tests/                unit (+ui), integration, e2e (Playwright smoke), live, fixtures (fake-ani-cli.sh)
├─ scripts/              release.mjs + releaseChecks.mjs, makeIcon.mjs + ico.mjs
├─ build/                icon.ico/png/svg
└─ docs/                 STATUS.md, RIZICI.md, releases/, superpowers/specs + plans
```

### 1.3 Main i renderer

- Prozor je 1200×800 (minimalno 800×560), sa `contextIsolation: true`, `nodeIntegration: false` i `sandbox: true` (`src/main/index.js:48-65`). `hardenWindow` odbija nove prozore i navigaciju van aplikacije (`src/main/windowSecurity.js:7-12`).
- `userData` je `%APPDATA%\AnimeDesk`. U testovima se menja preko `ANIMEDESK_USER_DATA` (`src/main/index.js:41`).
- Redosled pokretanja u `main()` (`src/main/index.js:72-157`):
  1. settings, whatsNew, updater, library, seriesPrefs, anilist, aniskip, positions (sa `prune(60)`);
  2. pokreće se stream server; zatim watchLog, progress, tracker, toolManager;
  3. pokreće se bridge server; zatim aniCli, player (mpv), internalPlayer, watchService, downloads, health;
  4. `registerIpc`, pa `createWindow`;
  5. `updater.start()`, a za njim `health.run()` → dnevno ažuriranje alata → instalacija opcionih alata (uosc).
- Renderer CSP (`src/renderer/index.html:5`): `img-src 'self' data:`, `media-src`/`connect-src` samo `'self'` i `http://127.0.0.1:*`, `worker-src blob:`. Interfejs zato ne može direktno da pristupi spoljnim sajtovima; sve ide preko main procesa.

### 1.4 IPC kanali (`src/shared/channels.js`)

**INVOKE**, 45 kanala (`src/shared/channels.js:1-47`):
- settings: `settings:get`, `settings:update`;
- ažuriranja: `update:get-state`, `update:check`, `update:download`, `update:install`, `whats-new:get`, `whats-new:seen`;
- biblioteka: `library:list|add|update|remove|note|record|was-corrupt|set-pinned`;
- podešavanja po seriji: `series-prefs:get|set`;
- AniList: `anilist:for-title`, `anilist:search`;
- alati i zdravlje: `tools:status|install-missing|check-updates`, `health:get|recheck`;
- gledanje: `watch:start`, `watch:cancel`, `menu:answer`;
- preuzimanja: `downloads:enqueue|pause|resume|cancel|queue|list|remove|play|open-folder`;
- ostalo: `dialog:pick-folder`, `app:open-repo`, `stats:get`, `window:get-fullscreen|set-fullscreen`;
- plejer: `player:progress`, `player:closed`, `skip:get`.

**EVENTS**, 14 kanala (`src/shared/channels.js:49-64`): `event:health`, `tool-progress`, `menu`, `ask`, `playing`, `session-end`, `library-changed`, `downloads`, `level-up`, `series-completed`, `update-state`, `fullscreen`, `player-open`, `player-close`.

Handleri su u `src/main/ipc.js:3-94`. Registruju se generički preko `ipcMain.handle(channel, (_e, ...args) => fn(...args))` (`src/main/ipc.js:96-100`). Nema validacije argumenata na nivou IPC-a; validaciju rade samo pojedini servisi (npr. `validatePatch` u `src/main/library.js:13-30`, `sanitizeSettings` u `src/main/settings.js:32-58`).

### 1.5 Preload API

`window.animedesk` (`src/preload/index.js:11-68`) ima grupe `player`, `settings`, `library`, `seriesPrefs`, `anilist`, `tools`, `health`, `watch`, `downloads`, `stats`, `update`, `whatsNew`, `window`, `dialog`, `skip`, `app` i `onLibraryChanged`. Svaki `on*` vraća funkciju za odjavu (`src/preload/index.js:5-9`). Renderer dobija API preko React konteksta `ApiContext` (`src/renderer/api.js:3-4`, `src/renderer/main.jsx:11`), pa testovi ubacuju lažni API (`tests/unit/ui/helpers.jsx`).

### 1.6 Stanje u rendereru

- Nema globalnog store-a. Sve stanje je `useState` u `App.jsx`: `settings`, `health`, `page`, `stats`, `wizardOpen`, `asks` (FIFO red), `pendingWatch`, `corrupt`, `openAnimeId`, `updateState`, `whatsNew`, `fullscreen`, `player` (`src/renderer/App.jsx:41-60`).
- Stranice same učitavaju podatke preko API-ja i osvežavaju se na `onLibraryChanged` (npr. `src/renderer/pages/HomePage.jsx:50-54`, `src/renderer/pages/WatchlistPage.jsx:27-31`).
- Nema keša na strani renderera. Svaki `Poster` posebno traži `anilist.forTitle` (`src/renderer/components/Poster.jsx:5-15`).
- i18n: `createT(lang)` vraća `t(key, vars)` sa rezervom sr → en → ključ (`src/renderer/i18n/index.js:6-12`). Kontekst je `I18nProvider` (`src/renderer/i18n/I18nContext.jsx:6-11`).

### 1.7 Navigacija

- Nema routera. `page ∈ home|watchlist|downloads|profile|settings` (`src/renderer/components/Sidebar.jsx:6`, `src/renderer/App.jsx:49`). Stranice se prikazuju uslovno, a `key={page}` ih remontira uz animaciju `page-enter` (`src/renderer/App.jsx:154-162`).
- Detalj serije nije posebna ruta. To je `openAnimeId` unutar Watchlist stranice (`src/renderer/App.jsx:132`, `src/renderer/pages/WatchlistPage.jsx:33-34`).
- Pretraga je ugrađena u Početnu (`src/renderer/pages/HomePage.jsx:68`). Kad je izbor anime/epizode u toku, uključuje se „fokus režim” koji sakriva hero i šine (`src/renderer/pages/SearchPage.jsx:33-37`, `src/renderer/pages/HomePage.jsx:61`).
- „Nastavi” sa bilo koje stranice postavlja `pendingWatch` i prebacuje na `home`, gde ga SearchPage pokreće (`src/renderer/App.jsx:133`, `src/renderer/pages/SearchPage.jsx:98-106`).
- Plejer je overlay iznad `.app-shell`. Ljuska ostaje montirana, ali dobija `inert` i `aria-hidden` (`src/renderer/App.jsx:140,166-177`).
- Nema istorije „nazad/napred”, a pozicija skrola se ne pamti (uočeno u kodu).

### 1.8 Dohvatanje podataka

**AniList** (`src/main/anilist.js`):
- GraphQL na `https://graphql.anilist.co`. Polja su `id idMal title cover genres seasonYear episodes duration description` (`:5-8`).
- Svi zahtevi idu kroz jedan red (`:77-82`). 429 → `Retry-After` / `X-RateLimit-Reset`, najviše 3 pokušaja; kad je `X-RateLimit-Remaining === '0'`, čeka se (`:94-112`).
- Rezervne pretrage idu redom: pun naslov, podnaslov, deo pre separatora, očišćen naslov (`:29-47`). `bestMatch` traži tačno poklapanje normalizovanog naslova, a inače uzima prvi rezultat (`:20-23`).
- Poster se preuzima i čuva kao **base64 data URL** u JSON kešu (`:114-120,180-181`). Keš je `cache/anilist/<sha1>.json`. „Nije nađeno” se pamti 7 dana sa `SEARCH_VERSION` (`:67-70,160-177`).
- `getCached` je sinhrono čitanje bez mreže, za statistiku (`:126-134`).

**ani-cli most**: detaljno u sekciji 5.

**AniSkip**: `https://api.aniskip.com/v2/skip-times/<malId>/<ep>`, keš 7 dana po fajlu (`src/main/aniskip.js:8-31`).

**Alati**: GitHub Releases API (`src/main/toolManager.js:76`, `src/main/toolSources.js:1-8`).

### 1.9 Trajni podaci (`%APPDATA%\AnimeDesk`)

| Fajl / folder | Sadržaj | Ref |
|---|---|---|
| `settings.json` | globalna podešavanja | `src/main/paths.js:11`, `src/main/settings.js:3-25` |
| `library.json` | watchlist `{version, anime:{id→entry}}` | `src/main/paths.js:10`, `src/main/library.js:33,52-55` |
| `series-prefs.json` | kvalitet/sub-dub po seriji | `src/main/paths.js:15`, `src/main/seriesPrefs.js:8-31` |
| `downloads.json` | `items` (preuzeto) + `queue` (nedovršeno) | `src/main/paths.js:12`, `src/main/downloads.js:29-39` |
| `watchlog.json` | dnevnik odgledanih epizoda (streak, aktivnost) | `src/main/paths.js:13`, `src/main/watchLog.js:4-35` |
| `profile.json` | `lastLevel` za level-up | `src/main/paths.js:14`, `src/main/progress.js:6-11` |
| `positions.json` | pozicije za nastavak | `src/main/paths.js:16`, `src/main/positions.js:7-38` |
| `cache/anilist/*.json` | AniList info + poster (base64) | `src/main/paths.js:8`, `src/main/anilist.js:122` |
| `cache/aniskip/<mal>-<ep>.json` | AniSkip vremena | `src/main/index.js:83`, `src/main/aniskip.js:12` |
| `tools/` + `tools/manifest.json` | bash/ani-cli/mpv/yt-dlp/ffmpeg/uosc | `src/main/paths.js:6-7` |
| `ani-cli-history/` | ani-cli istorija (`ANI_CLI_HIST_DIR`) | `src/main/paths.js:9`, `src/main/aniCliBridge.js:69` |
| `mpv-config/` | mpv.conf + uosc skripte i fontovi | `src/main/index.js:124`, `src/main/mpvConfig.js:5-20` |

Svi JSON fajlovi idu kroz `jsonStore.js`:
- upis je atomski i **sinhron**: `writeFileSync` u `.tmp`, pa `renameSync` (`src/main/jsonStore.js:22-27`);
- pokvaren JSON se preimenuje u `.corrupt-<stamp>.json` i vraća se podrazumevana vrednost (`src/main/jsonStore.js:12-19`);
- za biblioteku se o tome prikazuje baner (`src/renderer/App.jsx:21-24,155`).

---

## 2. Spisak funkcionalnosti

### Pretraga i izbor
- **Pretraga preko ani-cli.**
  - Polje na Početnoj pokreće `watch.start({query})` (`src/renderer/pages/SearchPage.jsx:108-113`).
  - ani-cli meni naslova postaje mreža kartica sa AniList posterima (`src/renderer/pages/SearchPage.jsx:187-204`).
  - Dugme je onemogućeno dok semafor nije zelen (`src/renderer/pages/SearchPage.jsx:171`, `src/renderer/App.jsx:129`).
- **Meni epizoda.** `EpisodePicker` prikazuje stvarnu listu epizoda iz ani-cli-ja (`src/renderer/pages/SearchPage.jsx:206-223`). Može da se izabere više epizoda.
  - „Gledaj” pušta **samo najmanju izabranu** epizodu (`src/renderer/pages/SearchPage.jsx:131`).
  - „Preuzmi” stavlja u red sve izabrane (`src/renderer/pages/SearchPage.jsx:141-152`).
- **Greške ani-cli-ja** se mapiraju na `no-results`, `episode-not-released`, `blocked`, `no-dub`, `unknown` (`src/main/aniCliBridge.js:11-18`). Prikazuju se uz „Prikaži detalje” (stderr) (`src/renderer/pages/SearchPage.jsx:176-183`).
- **„Nema dub-a” → „Pusti sa titlom”**: ista epizoda se pokreće sa `mode:'sub'` (`src/renderer/pages/SearchPage.jsx:139,180`).
- **Dodavanje u watchlist iz pretrage**, uz proveru duplikata (`src/renderer/pages/SearchPage.jsx:154-163`).

### Detalj serije (`src/renderer/pages/AnimeDetail.jsx`)
- Baner sa zamućenim posterom i bojom iz postera (`:60-66`).
- AniList žanrovi i godina, a opis na klik (`:69-74,95-100`).
- Status, ocena 1–10 i komentar koji se čuva na blur (`:76-94`).
- Mreža epizoda je **1..max(total, odgledano)**, a ne lista iz ani-cli-ja (`:36-38`). Klik na epizodu otvara belešku i dugme „označi kao odgledano” (`:41-43,114-127`).
- „Nastavi” pušta sledeću neodgledanu epizodu (`:110-112`, `src/shared/domain.js:15-21`).
- Kačenje u favorite (najviše 5) (`:46-51`, `src/main/library.js:5,103-113`) i brisanje uz potvrdu (`:128-130`).
- Pri prvom otvaranju se automatski upisuju `aniListId` i `totalEpisodes` (`:22-33`).

### Epizode
- Grupe od 100 se seku po poziciji u listi, a ne po broju epizode (`src/shared/episodes.js:1-12`). Otvara se grupa sa prvom neodgledanom (`src/renderer/components/EpisodePicker.jsx:10`, `src/shared/episodes.js:28-33`).
- „Idi na epizodu” skroluje i označava traženu epizodu (`src/renderer/components/EpisodePicker.jsx:23-32`).
- Stalna (sticky) traka radnji sadrži kvalitet i sub/dub po seriji (`src/renderer/components/EpisodePicker.jsx:57-78`, `src/renderer/styles.css:132`).
- Oznake: odgledana (cijan), izabrana (ljubičasta + glow), sa beleškom (tačka) (`src/renderer/styles.css:125-133`).

### Watchlist (`src/renderer/pages/WatchlistPage.jsx`)
- Filter po statusu `watching|completed|planned|paused|dropped` (`:48-54`, `src/shared/domain.js:1`).
- Sortiranje po naslovu, oceni ili poslednjem gledanju (`:9-15,55-60`).
- Ručno dodavanje po naslovu (`:37-43,61-64`).
- Kartice sa zvezdicom za kačenje (`:68-87`).
- Automatsko beleženje: `recordWatched` pravi zapis ako ne postoji, postavlja `watching`, a `completed` kad je epizoda ≥ ukupnog broja (`src/main/library.js:87-101`).

### Početna (`src/renderer/pages/HomePage.jsx`)
- Hero „Nastavi” prikazuje poslednju seriju u statusu `watching`. Bez nje se prikazuje pozdravni hero (`:11`, `src/renderer/components/Hero.jsx:13-51`).
- Šina „Favoriti” (zakačeni) i šina „Nastavi gledanje” (do 10 serija u statusu watching) (`:12-13,64-65`).
- Strelice za skrol se vide samo kad šina ima više sadržaja nego što staje (`:15-42`).

### Preuzimanja
- **Red**: jedno preuzimanje u isto vreme (`src/main/downloads.js:102-106`). Ima pauzu (gasi stablo procesa), nastavak (ponovni start) i otkazivanje (`:117-146`).
- Posle restarta se nedovršene stavke vraćaju kao „pauzirane” (`src/main/downloads.js:31-32`).
- Svaka serija dobija svoj folder `safeDirName(title)` (`src/main/downloads.js:42`, `src/main/paths.js:29-39`).
- Lista preuzetog je grupisana po seriji (`src/renderer/pages/DownloadsPage.jsx:7-13,51-75`). Za svaku stavku postoje „Pusti” u aplikaciji, „Otvori folder” i „Obriši” (sa fajlom); fajl koji nedostaje se posebno označava (`src/main/downloads.js:149`).
- Zvuk se pušta kad se preuzimanje završi (`src/renderer/App.jsx:87-91`).

### Plejer
Detaljno u sekciji 4.

### Gamifikacija / XP (`src/shared/stats.js`)
- XP: 10 po odgledanoj epizodi, +50 za završenu seriju, +5 za datu ocenu (`:14-19`).
- Prag nivoa je `100·(L−1)^1.5`. Titule: rookie, watcher (5), veteran (10), elite (20), sensei (35), legend (50) (`:1-12`).
- Statistika: epizode, sati (duration iz AniList keša, inače 24 min), završene serije, prosečna ocena, top 5 žanrova, niz dana, aktivnost za 28 dana (`:32-74`).
- Level-up: `progress.check` poredi sa `lastLevel` i šalje `levelUp` (`src/main/progress.js:31-47`). Overlay traje 2 s, a ako su animacije isključene, umesto njega je toast (`src/renderer/components/LevelUpOverlay.jsx`, `src/renderer/App.jsx:28-39`).
- Toast „serija završena” (+50 XP) (`src/main/tracker.js:3,10`).
- Zvuci se sintetišu preko WebAudio-a (bez fajlova): levelUp, seriesCompleted, downloadDone, click, navigate, sa prioritetima (`src/renderer/sound.js:1-73`).

### Profil (`src/renderer/pages/ProfilePage.jsx`)
- Avatar sa inicijalima, nivo, titula, XP traka (`:21-30`).
- 4 pločice sa brojevima, trake žanrova, niz dana i mreža aktivnosti 14×2 (`:32-58`).
- Ime profila je u podešavanjima. Ako ga nema, koristi se sistemsko korisničko ime (`src/main/index.js:75`, `src/renderer/App.jsx:146`).

### Podešavanja (`src/renderer/pages/SettingsPage.jsx`, podrazumevane vrednosti u `src/main/settings.js:3-25`)
- jezik sr/en;
- automatsko praćenje, prag (50–100, podrazumevano 85), „pitaj pri zatvaranju”;
- folder za preuzimanje, globalni kvalitet (`best|1080|720|480|360|worst`), sub/dub;
- sekcija Plejer: režim ugrađeni/spoljni, automatsko preskakanje, automatski sledeća, veličina titlova S/M/L, moderan mpv (uosc);
- automatsko ažuriranje alata;
- profil i zvuci (ključni, UI, jačina, test) i animacije;
- ažuriranja aplikacije, spisak alata sa verzijama i „Proveri ažuriranja alata”;
- „O aplikaciji” sa linkom na GitHub (`:172-178`).

### Setup wizard / alati / zdravlje
- **Wizard** se otvara sam kad alati nedostaju (`src/renderer/App.jsx:125`). Prikazuje semafor po alatu i procenat preuzimanja (`src/renderer/pages/SetupWizard.jsx:6-14,50-65`).
- **ToolManager** preuzima najnoviji GitHub release, raspakuje ga u `tools/<id>.new` i zamenjuje atomski, sa rollback-om i ponovnim pokušajima na EPERM/EBUSY (`src/main/toolManager.js:32-57,78-105`).
- Izvori alata: PortableGit (bash), pystardust/ani-cli, mpv, yt-dlp, GyanD ffmpeg i opcioni uosc (`src/main/toolSources.js:1-8`). Postojeći Git Bash se koristi samo sa Git for Windows lokacija, nikad WSL (`src/main/toolSources.js:19-26`).
- **HealthCheck**:
  - stanja su missing-tools → offline → self-test (pravi ani-cli upit „one piece”, ep 1, plejer `debug`) → ažuriranje ani-cli/yt-dlp → source-down (`src/main/healthCheck.js:27-41`, `src/main/aniCliBridge.js:112-120`);
  - alati se ažuriraju jednom dnevno (`src/main/healthCheck.js:48-56`);
  - provera se ponavlja na 6 h ako je stanje `source-down` (`src/main/index.js:153`).
- **Semafor** u bočnom meniju (`src/renderer/components/Semaphore.jsx`).

### Automatsko ažuriranje
- electron-updater sa GitHub-a. Prva provera je posle 10 s, zatim na svakih 6 h (`src/main/updater.js:4-5,76-81`).
- Stanja: idle/checking/none/available/downloading/ready/error/disabled (`src/main/updater.js:12-41`).
- Instalacija ide samo na klik; `autoInstallOnAppQuit = false` (`src/main/updater.js:62-74`).
- Baner (`src/renderer/components/UpdateBanner.jsx`) i „Šta je novo” (`src/renderer/components/WhatsNewDialog.jsx`, `src/main/whatsNew.js:15-31`). Beleške se prikazuju samo kao tekst (`src/shared/releaseNotes.js:15-36`).

### i18n
- `sr.json` i `en.json` imaju iste ključeve; to proverava `tests/unit/i18nKeys.test.js`. Interpolacija je `{var}` (`src/renderer/i18n/index.js:10`).
- Nema pluralizacije (uočeno u kodu).

### Pun ekran
- F11 se hvata u main procesu (`src/main/fullscreen.js:3-11`).
- Esc u rendereru izlazi iz punog ekrana samo kad nijedan dijalog nije otvoren (`src/renderer/App.jsx:110-118`).
- Dugme postoji u meniju (`src/renderer/components/Sidebar.jsx:31-34`) i u plejeru.
- Stanje se pamti u `settings.fullscreen` i primenjuje pri pokretanju (`src/main/fullscreen.js:12-14`, `src/main/index.js:54`).

### Favoriti i „Nastavi gledanje”
- Najviše 5 zakačenih serija; za šestu dolazi poruka `pin-limit` (`src/main/library.js:103-113`, `src/main/ipc.js:42-51`).
- Šine su opisane gore. Kartica je `SeriesCard` (`src/renderer/components/SeriesCard.jsx`).

### Ostalo
- „Pitaj pri zatvaranju”: dijalog „Označi kao odgledano?” se prikazuje u FIFO redu, da se odgovor ne izgubi pri automatskom prelasku na sledeću epizodu (`src/renderer/App.jsx:52-53,179`, `src/renderer/components/AskDialog.jsx`).
- Upozorenje kad je fajl biblioteke bio pokvaren (`src/renderer/App.jsx:21-24`).
- Verzija i „by Leqora” u dnu menija (`src/renderer/components/Sidebar.jsx:35-37`).

---

## 3. Dizajn sistem

### 3.1 Boje i tokeni (`src/renderer/styles.css:1-28`, svi tokeni iz `:root`)

| Token | Vrednost | Token | Vrednost |
|---|---|---|---|
| `--bg` | `#0B0B16` | `--ok` | `#22C55E` |
| `--bg-elev` | `#141428` | `--warn` | `#EAB308` |
| `--glass` | `rgba(255,255,255,0.06)` | `--bad` | `#EF4444` |
| `--glass-strong` | `rgba(255,255,255,0.10)` | `--on-accent` | `#FFFFFF` |
| `--glass-border` | `rgba(255,255,255,0.10)` | `--scrim` | `rgba(5,5,12,0.72)` |
| `--blur` | `16px` | `--poster-tint` | `var(--accent)` (menja se po posteru) |
| `--text` | `#ECECF6` | `--radius` | `14px` |
| `--text-muted` | `#A3A3C2` | `--radius-sm` | `8px` |
| `--accent` | `#8B5CF6` (ljubičasta) | `--glow` | `0 0 18px color-mix(accent 55%)` |
| `--accent-2` | `#22D3EE` (cijan) | `--glow-cyan` | `0 0 14px color-mix(accent-2 60%)` |
| `--cta` | `#F43F5E` (roza-crvena, primarna dugmad) | `--ease` | `cubic-bezier(.2,.8,.2,1)` |
| `--font-display` | `'Russo One', 'Segoe UI', sans-serif` | `--font-body` | `'Exo 2', 'Segoe UI', sans-serif` |
| `--font-hud` | `'Chakra Petch', 'Consolas', monospace` | | `color-scheme: dark` |

- Pravilo je da van `:root` nema hex boja i da se animiraju samo `transform` i `opacity`. Oba pravila proverava `tests/unit/styles.test.js:15-23`.
- Postoji samo tamna tema; svetle nema.
- Boja iz postera: postera se smanji na 32×48 i izračuna se prosek „živih” piksela, sa zasićenjem ≥ 0.55 i svetlinom 0.3–0.5 (`src/renderer/theme/posterTint.js:24-62`). Rezultat ide u `--poster-tint` na heru i baneru detalja (`src/renderer/components/Hero.jsx:33`, `src/renderer/pages/AnimeDetail.jsx:60`).
- Neusklađenost: pozadina prozora je `#15151c` (`src/main/index.js:55`), a `--bg` je `#0B0B16` (uočeno u kodu).

### 3.2 Tipografija
- Učitane težine: Russo One 400; Exo 2 400/500/600; Chakra Petch 500/600 (`src/renderer/main.jsx:1-6`).
- body: `15px/1.5` Exo 2. Naslovi h1–h3 su Russo One 400 sa `letter-spacing .02em`; h2 22px, h3 17px (`src/renderer/styles.css:31-34`).
- `.hud`: Chakra Petch 600, verzal, `letter-spacing .08em` (`src/renderer/styles.css:48`). Koristi se za brojeve, oznake i vreme.
- Ostale veličine:
  - hero naslov 34px, logo 20px, level-up naslov 56px;
  - meta tekst na kartici 12px HUD, oznaka polja 12px HUD verzal;
  - broj na pločici statistike 28px;
  - verzija u meniju 11px.
  - Ref: `src/renderer/styles.css:61,67,101,120,142,153,186`.

### 3.3 Razmaci, radijusi, senke, glass
- Dugme: `padding 7px 14px`, `radius-sm`, glass pozadina, 1px glass border. Na hover: `glass-strong` i ivica u boji accent-a 60%. Na klik: `translateY(1px)` (`src/renderer/styles.css:36-38`).
- Primarno dugme ima CTA pozadinu i na hover CTA glow. Dugme `danger` je `--bad` (`src/renderer/styles.css:41-43`).
- Fokus: `outline 2px var(--accent-2)`, offset 2px (`src/renderer/styles.css:39`).
- Raspored: `.page` je kolona sa `gap 18px`, `.row` je `gap 8px` sa prelamanjem, sadržaj ima `padding 24px 28px 40px` (`src/renderer/styles.css:50-55`).
- Glass efekti: sidebar ima `backdrop-filter: blur(16px)` (`:60`). Modal ima scrim + `blur(6px)` (`:167`). Traka epizoda i kartice u plejeru imaju blur (`:132,240`).
- Senke: glow na aktivnoj stavci menija, hover kartice, izabranoj epizodi, toast-u i avataru. Poster u heru ima `0 10px 30px var(--scrim)` (`:65,102,118,128,149,188`).

### 3.4 Animacije
- `page-in`, 200ms: pomeranje 6px + fade (`src/renderer/styles.css:56-57`).
- `breathe`, 1.6s: žuta tačka semafora (`:74-76`).
- XP traka: `transform 600ms` (`:86`).
- Kartica: `transform 180ms` (`:117`).
- Level-up: `fade-in 200ms`, `beam 900ms`, `pop 400ms` (`:183-191`).
- Plejer: kontrole nestaju preko `opacity 200ms` (`:220,223`).
- Smanjeno kretanje: OS `prefers-reduced-motion` ili klasa `.reduce-motion` iz podešavanja (`:207-211`, `src/renderer/App.jsx:98-102`).

### 3.5 Ikone
- `lucide-react`, `strokeWidth 1.75`, podrazumevano 18px (`src/renderer/components/Icon.jsx:9-12`). Mapa imena je u `src/renderer/components/Icon.jsx:3-7`.
- **Bug, detalji u 6.1:** ikone plejera (`pause`, `rewind`, `fastForward`, `skipBack`, `skipForward`, `volumeX`, `subtitles`) se uvoze, ali nisu u mapi.

### 3.6 Komponente
- `AskDialog`, `ConfirmButton` (potvrda u dva koraka), `EpisodePicker`, `Hero`, `Icon`, `LevelUpOverlay`.
- Plejer: `NextEpisodeCard`, `PlayerControls`, `PlayerView`, `ResumePrompt`, `SkipButton`.
- Kartice i meni: `Poster`, `ProfileCard`, `SeriesCard`, `Sidebar`, `Semaphore`.
- Obaveštenja: `ReadyNotice`, `Toast`, `UpdateBanner`, `WhatsNewDialog`, `XpBar`.
- Sve su u `src/renderer/components/`.

### 3.7 Kartice

**`Poster`** (`src/renderer/components/Poster.jsx:17-22`, `src/renderer/styles.css:121-122`):
- `<img>` sa data URL-om, `width:100%`, `aspect-ratio: 2/3`, `object-fit: cover`, `radius-sm`.
- Prazan poster je gradijent sa ikonom `film` 28px.
- Nema `loading="lazy"`, skeleton-a ni fade-in-a.

**Kartica u mreži pretrage** (`src/renderer/pages/SearchPage.jsx:195-198`, `src/renderer/styles.css:116-120`):
- Ceo `<button class="card">` sadrži poster i naslov (600).
- Mreža je `repeat(auto-fill, minmax(160px, 1fr))`, `gap 14px`. Kartica ima `padding 8px`, glass pozadinu i `radius 14px`.
- Hover: `translateY(-2px)` + `--glow`.
- Nema bedževa, overlay-a, godine ni broja epizoda.

**`SeriesCard`** (Početna, šine) (`src/renderer/components/SeriesCard.jsx:8-33`, `src/renderer/styles.css:107-113`):
- Šina je grid `grid-auto-columns: 150px`, `gap 14px`, sa horizontalnim skrolom.
- Kartica sadrži dugme za otvaranje (poster + naslov) i meta „X/Y epizoda”.
- Traka napretka je XpBar sa procentom i prikazuje se samo kad je ukupan broj poznat.
- Okruglo primarno dugme ▶ je apsolutno pozicionirano: `top 14px; right 14px; padding 6px`.
- `.series-card__open` nema pozadinu, a `.card` hover efekat važi i ovde.

**Kartica u watchlist-u** (`src/renderer/pages/WatchlistPage.jsx:70-85`, `src/renderer/styles.css:213-215`):
- Ista mreža kao pretraga. Meta: `status · odgledano/ukupno · ★ ocena`.
- Okruglo dugme sa zvezdicom gore desno postaje cijan kad je serija zakačena.

**Ostalo:**
- Poster u grupi preuzimanja je 84px (`src/renderer/styles.css:179`).
- Poster u baneru detalja je 150px (`src/renderer/styles.css:139`).
- Poster u heru je 150px (`src/renderer/styles.css:102`).

### 3.8 Raspored
- **Ljuska:** grid `232px 1fr`, `height 100vh`. Skroluje samo `.content` (`src/renderer/styles.css:54-55`).
- **Sidebar:**
  - logo sa gradijentom accent → accent-2 (`:61`);
  - 5 stavki sa ikonom 20px; aktivna stavka ima traku od 3px sa glow-om (`:63-65`);
  - u dnu su semafor, kartica profila sa XP-om, pun ekran i verzija (`src/renderer/components/Sidebar.jsx:28-38`).
- **Hero:**
  - visina najmanje 280px; pozadina je zamućen poster (`blur 28px`, `saturate 1.3`, `opacity .55`);
  - dva gradijenta: levo `--bg` → poster-tint, odozdo `--bg` (`src/renderer/styles.css:95-103`);
  - tekst zauzima najviše 60% širine, poster je desno.
- **Responzivnost:** samo jedan breakpoint, `max-width: 960px`. Na njemu meni ostaje samo sa ikonama (72px), kartica profila i oznake se skrivaju, a poster u heru nestaje (`src/renderer/styles.css:199-205`). Najmanji prozor je 800×560 (`src/main/index.js:52-53`).

---

## 4. Plejer

### 4.1 Biblioteka i režimi
- **hls.js 1.7.3** (`package.json:36`), `new Hls({ enableWorker: true })` (`src/renderer/components/PlayerView.jsx:63`).
- Preuzeti fajl ide direktno kao `video.src` (`src/renderer/components/PlayerView.jsx:62`).
- Režim zavisi od `settings.playerMode`: `internal` (podrazumevano) ili `external` (mpv) (`src/main/settings.js:20,29`, `src/main/watchService.js:32`).

### 4.2 Kako stream stiže do plejera
1. ani-cli misli da poziva mpv. U stvari poziva `animedesk-mpv-bridge.sh` (ime mora da sadrži „mpv”), a skripta šalje argumente POST-om na `/play` bridge servera (`resources/bridges/animedesk-mpv-bridge.sh:1-10`).
2. `parsePlayerArgs` izvlači `--force-media-title` (naslov i epizoda), `--referrer`, `--sub-file` i URL (`src/main/aniCliBridge.js:38-44`).
3. `internalPlayer.play` registruje reprodukciju u `streamServer`-u i šalje `event:player-open` sa `{playbackId, title, episode, kind:'hls'|'file', src, subtitleUrl, resumeAt, totalEpisodes}` (`src/main/internalPlayer.js:21-34`).
4. `streamServer` (`src/main/streamServer.js`) radi ovako:
   - sluša na `127.0.0.1:0` (nasumičan port) (`:149-153`);
   - token je 16 nasumičnih bajtova u hex-u i deo je putanje: `/s/<token>/<id>/(playlist|sub|file|r/<n>)` (`:28,32,129`). Token se poredi u konstantnom vremenu (`:122-126`). Odgovori: 403 za pogrešan token, 404 za nepoznato, 405 za metode osim GET/HEAD (`:128-146`);
   - **prepisivanje HLS-a:** svaka linija koja nije komentar i svaki `URI="…"` razrešava se prema URL-u playliste i dobija lokalni `/r/<n>`. Lista dozvoljenih URL-ova je po reprodukciji; isti URL dobija isti `n`. Dozvoljeni su samo `http(s)` URL-ovi (`:11-18,34-39,103-108`);
   - **zaglavlja ka izvoru:** `User-Agent` (Chrome 124 string, `:7`), `Referer` + `Origin` iz referrera, `Range` se prosleđuje, `Accept-Encoding: identity` (`:87-89`);
   - segmenti se strimuju (`Readable.fromWeb`), uz prenos `content-length/range` i `accept-ranges` (`:111-115`). Prekid klijenta prekida odlazni zahtev preko `AbortController`-a (`:85-86`). Greška daje 502;
   - CORS `*` (`:8`);
   - **preuzeti fajl:** `registerFile` servira `video/mp4` sa Range podrškom (`:47-52,62-76`).
5. Kad se plejer zatvori, `streams.unregister` briše dozvole (`src/main/internalPlayer.js:11`).

### 4.3 Kontrole (`src/renderer/components/PlayerControls.jsx`)
- Vremenska traka je `<input type=range>` sa obojenim delovima `op` (cijan), `ed` (ljubičasta) i `recap` (žuta) (`:9-14`, `src/renderer/styles.css:228-231`).
- Dugmad: prethodna (onemogućena za ep ≤ 1), −10 s, play/pause, +10 s, sledeća (onemogućena za poslednju). Zatim vreme `m:ss / m:ss`, zvuk, klizač jačine, titlovi, S/M/L i pun ekran (`:15-30`).
- Gornja traka: „← Nazad”, naslov i „EP n” (`src/renderer/components/PlayerView.jsx:186-189`).
- Kontrole se kriju posle 3 s mirovanja dok video ide, a kursor tada nestaje (`src/renderer/components/PlayerView.jsx:12,92-97`, `src/renderer/styles.css:223-224`).

### 4.4 Prečice (`src/renderer/components/PlayerView.jsx:105-126`)
Ne rade dok je fokus u `input/select/textarea` (`:107`), što znači ni na klizaču trake ni na klizaču jačine.

| Taster | Radnja |
|---|---|
| Space | pusti/pauza |
| ← / → | −10 s / +10 s |
| ↑ / ↓ | jačina ±10% |
| F | pun ekran |
| M | bez zvuka |
| S | titlovi uključeni/isključeni |
| N | sledeća epizoda (ako nije poslednja) |
| F11 | pun ekran (main proces, `src/main/fullscreen.js:3`) |
| Esc | samo izlazak iz punog ekrana (`src/renderer/App.jsx:113-114`); Esc ne zatvara plejer, po spec-u (`docs/superpowers/specs/2026-10-03-v0.5-player-design.md:43`) |

Nema prečica za brzinu reprodukcije, korak po kadar, brojeve 0–9 (skok na %) ni P (prethodna). Brzina reprodukcije ne postoji ni u interfejsu.

### 4.5 Titlovi
- Podržan je **samo WebVTT**, i to preko jednog `<track kind="subtitles" default>` (`src/renderer/components/PlayerView.jsx:184`).
- Stream: `--sub-file` iz ani-cli-ja se proxy-uje i **uvek** dobija `Content-Type: text/vtt`, bez obzira na pravi format (`src/main/streamServer.js:99-101`). ASS/SSA/SRT se ne konvertuju i nisu podržani.
- Preuzeti fajl: traži se samo `<isto ime>.vtt` pored videa (`src/main/streamServer.js:41-45`).
- Uključivanje i isključivanje menja samo `textTracks[0]` (`src/renderer/components/PlayerView.jsx:87-90`). Veličina S/M/L se postiže preko `::cue` (0.9/1.3/1.8rem) (`src/renderer/styles.css:236-238`).
- Nema stila, pomeranja vremena titlova ni izbora jezika ili više staza.
- Titlovi ugrađeni u HLS manifest: ponašanje hls.js-a nije provereno.

### 4.6 Audio staze i kvalitet
- **Nema izbora audio staze** u ugrađenom plejeru (uočeno u kodu; nijedna `audioTrack` referenca u `src/renderer`).
- **Nema izbora kvaliteta u plejeru.** Spec ga je namerno ostavio van opsega (`docs/superpowers/specs/2026-10-03-v0.5-player-design.md:29`). Kvalitet se bira pre puštanja, na stranici epizoda (`ANI_CLI_QUALITY`, sekcija 5).
- Ako ani-cli preda master playlistu sa više nivoa, hls.js ima podrazumevani ABR, ali to nije provereno.

### 4.7 Preskakanje uvoda/odjavne špice (AniSkip)
- Posle `loadedmetadata` poziva se `api.skip.get(title, episode, duration)` (`src/renderer/components/PlayerView.jsx:143-151`). Lanac je `skipLookup` → `anilist.getForTitle` (prvo `aniListId` iz watchlist-e) → `malId` → AniSkip (`src/main/skipLookup.js:4-10`).
- AniSkip v2 traži tipove `op`, `ed` i `recap`; `mixed-op/ed` se mapiraju na `op/ed`. Keš traje 7 dana, i za prazan odgovor (404). Greška vraća sve `null`, bez keširanja (`src/main/aniskip.js:4-30`).
- Dugme „Preskoči uvod/rezime” se vidi samo tokom `op` i `recap` (`src/renderer/components/SkipButton.jsx:5-6`).
- Uz `autoSkip`: skok se dešava jednom po delu, uz kratku poruku od 1.5 s. Ako je deo `ed`, epizoda se tretira kao završena (`src/renderer/components/PlayerView.jsx:152-165`).
- Tokom `ed`, ili u poslednjih 30 s kad `ed` nije poznat, prikazuje se dugme „Sledeća epizoda” (`src/renderer/components/PlayerView.jsx:15,168,199`).
- Određivanje dela: `segmentAt` proverava redom `op`, `recap`, `ed` (`src/shared/player.js:9-16`).

### 4.8 Automatski sledeća epizoda
- `finishEpisode` (na `ended` ili automatsko preskakanje `ed`-a) postavlja `maxPercent = 100` (`src/renderer/components/PlayerView.jsx:128-135`). Zatim:
  - poslednja epizoda → kartica „Završio si seriju” (`isLastEpisode`, total iz watchlist-e ili AniList keša: `src/shared/player.js:25`, `src/main/skipLookup.js:12-17`);
  - inače, uz `autoNext`: odbrojavanje 10 s sa „Pusti sada” / „Otkaži” (`src/renderer/components/PlayerView.jsx:14,136-141`, `src/renderer/components/NextEpisodeCard.jsx`);
  - bez `autoNext`: dugme „Sledeća”.
- Kad se plejer zatvori sa `next/prev`, App postavlja `pendingWatch` za `floor(ep) ± 1` (`src/renderer/App.jsx:170-175`, `src/shared/player.js:18`). To **pokreće novu ani-cli sesiju od nule**: pretraga → izbor naslova → epizoda → link (sekcija 6).
- U spoljnom mpv režimu nema automatski sledeće epizode: ani-cli radi sa `ANI_CLI_EXIT_AFTER_PLAY=1` (`src/main/aniCliBridge.js:65`).

### 4.9 Nastavak („Nastavi od…”)
- Pozicije se čuvaju u `positions.js`. Ključ je `normalizeTitle(title).lower#Number(ep)` (`src/main/positions.js:10`). Brišu se zapisi starije od 60 dana (`src/main/index.js:86`).
- Renderer šalje `player:progress` na svakih 5 s i pri pauzi (`src/renderer/components/PlayerView.jsx:13,82-85,178`). Main čuva samo poziciju ≥ 10 s (`src/main/internalPlayer.js:36-42`).
- `shouldOfferResume`: 10 s ≤ pozicija ≤ 90% trajanja (`src/shared/player.js:20-21`). `get` vraća poziciju samo kad to važi (`src/main/positions.js:16-19`).
- `ResumePrompt` nudi „Nastavi od mm:ss” (sa autofokusom) i „Od početka”. Dok je prompt otvoren, video ne kreće sam (`src/renderer/components/ResumePrompt.jsx`, `src/renderer/components/PlayerView.jsx:150,171,197`).
- Pozicija se briše kad je epizoda označena kao odgledana (`src/main/watchService.js:16`, `src/main/ipc.js:37`).
- **Spoljni mpv ne čuva pozicije.** `playerMonitor` vraća samo `exitCode/maxPercent` (`src/main/playerMonitor.js:92`), pa nastavak radi samo u ugrađenom plejeru (uočeno u kodu).

### 4.10 Praćenje napretka i prag „odgledano”
- Ugrađeni plejer: `maxPercent = max(time/duration·100)` (`src/shared/player.js:23`, `src/renderer/components/PlayerView.jsx:155`). Pri izlasku na „next” tokom kraja epizode računa se 100% (`:55`).
- mpv: posmatra se `percent-pos` preko IPC pipe-a (`src/main/playerMonitor.js:17-38,77`).
- `decideWatched`: kad je `autoTrack` isključen → ništa; kad je `askOnClose` uključen → pitanje; inače `maxPercent ≥ watchedThreshold` (podrazumevano 85, opseg 50–100) (`src/main/playerMonitor.js:11-15`, `src/main/settings.js:6,36-38`).
- Ista `afterPlayback` logika važi za oba plejera (`src/main/watchService.js:10-21`). Otkazana sesija se ne beleži (`:74-75`).
- Beleženje ide kroz `tracker`: biblioteka + dnevnik + provera nivoa (`src/main/tracker.js:5-12`).

### 4.11 Spoljni mpv
- Pokreće se sa `--input-ipc-server=\\.\pipe\animedesk-mpv-<uuid>`. Povezivanje se ponavlja 40 puta na 250 ms (`src/main/playerMonitor.js:40-85`).
- Posmatraju se `percent-pos`, `time-pos` i `duration`. Uz `autoSkip`: `seek` na kraj dela + `show-text` (sr/en) jednom po delu (`src/main/playerMonitor.js:56-68,6-9`).
- Moderan izgled je uosc: `ensureMpvConfig` piše `mpv.conf` (`osc=no`, `osd-bar=no`) i kopira `scripts`/`fonts` kad se verzija uosc-a promeni. Prosleđuje se `--config-dir` (`src/main/mpvConfig.js:5-20`, `src/main/index.js:125-131`).
- mpv sam učitava titlove (`--sub-file`) i podržava sve formate koje mpv podržava.

### 4.12 Rezervni prelaz na mpv
- Ako `internalPlayer.play` baci grešku (npr. loš referrer), odmah se pokreće mpv (`src/main/watchService.js:34`).
- `reason: 'external'` (dugme na ekranu greške) pokreće mpv sa `--start=<pozicija>` u istoj sesiji, a `maxPercent` je veći od dva (`src/main/watchService.js:35-37`).

### 4.13 Baferovanje i greške
- hls.js fatalni `NETWORK_ERROR` → do 3 ponovna pokušaja. Za greške manifesta (ili kad još nema nivoa) radi se ponovni `loadSource`, inače `startLoad` (`src/renderer/components/PlayerView.jsx:16-18,66-73`). `MEDIA_ERROR` → `recoverMediaError` jednom (`:74`). Posle toga sledi ekran greške sa „Pusti u spoljnom plejeru (mpv)” i „Nazad” (`:75,190-196`).
- Preuzeti fajl: `onError` na `<video>` vodi na ekran greške (`:182`).
- **Nema indikatora baferovanja ili učitavanja** (nema `onWaiting`/`onStalled`, spinnera ni poruke dok se manifest učitava). Do prvog kadra se vidi crn ekran sa kontrolama (uočeno u kodu).

### 4.14 Preuzete epizode
- `downloads:play` → `watch.playLocal` → `runPlayer` sa `info.file`. Ugrađeni plejer koristi `registerFile` (`src/main/ipc.js:79-82`, `src/main/watchService.js:99-103`, `src/main/internalPlayer.js:23-24`).
- Ista `afterPlayback` logika i isti nastavak važe i ovde.

---

## 5. Izvor epizoda (ani-cli)

### 5.1 Kako se ani-cli pokreće
- Komanda je `bash <ani-cli> [-S index] [-e epizode] <reči upita>` (`src/main/aniCliBridge.js:97-102`). Bash je PortableGit ili postojeći Git for Windows. Pokreće se preko `spawn(..., {windowsHide:true})`, a gasi preko `taskkill /T /F` (`src/main/run.js:3-13`).
- **env** (`src/main/aniCliBridge.js:46-78`):
  - `PATH` dobija redom: folder bridge skripti, Git `usr/bin` i `mingw64/bin`, yt-dlp, ffmpeg. Postojeći `Path`/`PATH` se zamenjuje jednim ključem `PATH`;
  - `ANI_CLI_MENU` = `menu-bridge.sh` (msys putanja);
  - `ANI_CLI_PLAYER`: kad je režim `play`, to je **samo ime** bridge skripte, jer ani-cli plejer poziva bez navodnika; inače `download` ili `debug`;
  - `ANI_CLI_NO_DETACH=1`, `ANI_CLI_EXIT_AFTER_PLAY=1`, `ANI_CLI_LOG=0`;
  - `ANI_CLI_QUALITY`, `ANI_CLI_MODE`, `ANI_CLI_HIST_DIR`;
  - `ANIMEDESK_PORT/TOKEN/SESSION`;
  - `ANI_CLI_DOWNLOAD_DIR` u Windows obliku sa `/`.
- **Meni:** `menu-bridge.sh` šalje stavke (stdin) i prompt (hex u zaglavlju) na `/menu` i ispisuje odgovor. Prazan odgovor znači izlaz 1, odnosno otkazivanje (`resources/bridges/menu-bridge.sh:1-13`).
- **bridgeServer:**
  - sluša na `127.0.0.1:0`, sa tokenom i sesijom u zaglavljima; telo zahteva je najviše 1 MB;
  - `requestTimeout = 0`, jer korisnik može minutima da bira;
  - 204 znači otkazivanje (`src/main/bridgeServer.js:34-90`).
- **Automatski odgovori:** kad su naslov i epizoda poznati (Nastavi, sledeća, preuzimanje), meni se odgovara bez korisnika. Naslov se poklapa tačno, bez obzira na velika i mala slova, a epizoda kao string (`src/main/aniCliBridge.js:26-36`, `src/main/watchService.js:59-67`). Inače meni ide u interfejs (`event:menu`).
- Provajder: koji sajt ani-cli koristi **nije provereno** iz ovog repoa. Repo namerno ne sadrži nijednu referencu na sajt i koristi originalni ani-cli bez izmena (`CLAUDE.md`, „Ne menjaj logiku sajta”; `docs/RIZICI.md:21-22`). Spec beleži da ani-cli 5.1 daje HLS media playlistu, segmente maskirane kao `.ts.jpg` na drugom hostu i CDN koji traži `Origin` (`docs/superpowers/specs/2026-10-03-v0.5-player-design.md:13-16`).

### 5.2 Kvalitet i sub/dub
- Globalno: `quality ∈ best|1080|720|480|360|worst` i `mode ∈ sub|dub` (`src/main/settings.js:9-10,27-28`).
- Po seriji: `seriesPrefs.resolve(title, settings)` vraća vrednost serije, a ako je nema, globalnu (`src/main/seriesPrefs.js:33-36`). Koristi se i za gledanje (`src/main/watchService.js:50-58`) i za preuzimanje (`src/main/index.js:133`, `src/main/downloads.js:50-54`).
- ani-cli čita kvalitet i režim samo pri pokretanju. Zato:
  - izbor naslova sa sačuvanim podešavanjima restartuje sesiju (`src/renderer/pages/SearchPage.jsx:119-129`);
  - promena sub↔dub na stranici epizoda restartuje sesiju (`:133-138`).
- Kad traženi kvalitet ne postoji, aplikacija ništa ne proverava i ne prikazuje; prepušta to ani-cli-ju. Ponašanje ani-cli-ja u tom slučaju **nije provereno**. Izabrana rezolucija se nigde ne prikazuje korisniku (uočeno u kodu).
- Kad dub ne postoji: greška `no-dub` i dugme „Pusti sa titlom” (`src/main/aniCliBridge.js:16`, `src/renderer/pages/SearchPage.jsx:180`).

### 5.3 Preuzimanje
- ani-cli se pokreće sa `player: 'download'` i `ANI_CLI_DOWNLOAD_DIR=<dir>/<safeDirName>` (`src/main/downloads.js:41-67`). Samo preuzimanje radi ani-cli preko yt-dlp/ffmpeg, koji su u `PATH`-u (`src/main/aniCliBridge.js:55-56`). Koji alat ani-cli bira za koji tip linka nije provereno.
- Napredak se parsira iz `[download] NN%` linija (yt-dlp) (`src/main/downloads.js:8-11,63-66`).
- Gotov fajl se traži rekurzivno po imenu `… Episode N.mp4` (`src/main/downloads.js:14-26`). Ako se ne nađe → `file-not-found`.

### 5.4 Lista epizoda
- U toku gledanja, lista su stavke ani-cli menija epizoda bez izmena (mogu biti „0”, „12.5”, rupe). Grupišu se po 100 po poziciji (`src/shared/episodes.js:1-12`, `src/renderer/pages/SearchPage.jsx:210`).
- Na stranici detalja lista je sintetička, `1..max` (`src/renderer/pages/AnimeDetail.jsx:36-38`). Zato specijalne epizode ani-cli-ja tu ne postoje (uočeno u kodu).
- Nema naslova, sličica, datuma ni filler oznaka za epizode. ani-cli daje samo brojeve.

---

## 6. Bagovi, tehnički dug, usporenja

### 6.1 Uočeno u kodu

1. **Ikone plejera se ne prikazuju (verovatan vizuelni bag).**
   - `Icon.jsx` uvozi `Pause, Rewind, FastForward, SkipBack, SkipForward, VolumeX, Subtitles`, ali ih ne stavlja u mapu `ICONS` (`src/renderer/components/Icon.jsx:1,3-7`). `Icon` za nepoznato ime vraća `null` (`:11`).
   - Zato su dugmad ⏮, −10, ⏸ (dok video ide), +10, ⏭, „bez zvuka” i „titlovi” verovatno prazna (`src/renderer/components/PlayerControls.jsx:16-25`). Imaju `aria-label`, pa testovi prolaze.
   - Plan je tražio mapiranje (`docs/superpowers/plans/2026-10-03-v0.5-player.md:1137`).
   - Vizuelno nije provereno.
2. **Sinhroni I/O u main procesu.**
   - Svaki upis JSON-a je `writeFileSync` + `renameSync` (`src/main/jsonStore.js:22-27`).
   - `positions.save` prepisuje ceo `positions.json` na svakih 5 s tokom gledanja (`src/main/internalPlayer.js:41`, `src/main/positions.js:20-24`).
   - `anilist.getForTitle` čita keš sinhrono za svaki poster (`src/main/anilist.js:159`).
   - `toolManager.load()` čita `manifest.json` pri svakom `exePath`, a `toolPaths()` ga pročita oko 6 puta po pozivu (`src/main/toolManager.js:28,59-64,154-165`).
   - `findEpisodeFile` rekurzivno koristi `readdirSync` (`src/main/downloads.js:14-26`).
3. **Statistika se računa često i sinhrono.**
   - `computeSnapshot` za svaku seriju čita AniList keš fajl i prolazi ceo dnevnik (`src/main/index.js:90-99`).
   - Poziva se pri svakoj promeni biblioteke (`progress.check`, `src/main/tracker.js:10,21,29`) i **pri svakoj promeni stranice**, jer `App` ima `useEffect` sa zavisnošću `[api, page]` (`src/renderer/App.jsx:76-80`).
4. **Posteri kao base64 kroz IPC.**
   - Slika se čuva u JSON kešu kao data URL (`src/main/anilist.js:114-120,180-181`) i šalje se kroz IPC pri svakom montiranju `Poster`-a (`src/renderer/components/Poster.jsx:8-13`).
   - Nema keša u rendereru, `loading="lazy"`, virtualizacije, skeleton-a ni fade-in-a. Remontiranje stranice (`key={page}`, `src/renderer/App.jsx:154`) ponovo traži sve postere.
   - `posterTint` keš je `Map` sa celim data URL-om kao ključem (`src/renderer/theme/posterTint.js:1,45,60`).
5. **Sledeća epizoda je spora.** Svaka sledeća ili prethodna epizoda pokreće ceo ani-cli tok iznova: bash, pretraga, meni, izvlačenje linka (`src/renderer/App.jsx:172-174`, `src/renderer/pages/SearchPage.jsx:98-106`). Nema unapred pripremljenog linka (prefetch). Koliko traje nije mereno.
6. **Health self-test pri svakom pokretanju** radi pravi ani-cli upit, uz timeout od 30 s (`src/main/aniCliBridge.js:112-120`, `src/main/healthCheck.js:32`). Pretraga i „Nastavi” su onemogućeni dok semafor nije zelen (`src/renderer/App.jsx:129`, `src/renderer/pages/SearchPage.jsx:171`). Offline režim blokira gledanje strimova (preuzete epizode i dalje rade).
7. **Plejer nema stanje učitavanja/baferovanja** (sekcija 4.13), **izbor kvaliteta i audio staze** ni **brzinu reprodukcije** (sekcija 4.4, 4.6).
8. **Titlovi su samo VTT.** Sve što stigne preko `--sub-file` dobija `text/vtt` (`src/main/streamServer.js:99-101`), pa ASS/SRT neće raditi u ugrađenom plejeru. Uključivanje dira samo prvu stazu (`src/renderer/components/PlayerView.jsx:87-90`).
9. **Nastavak ne radi u spoljnom mpv-u** (`src/main/playerMonitor.js:92`). Automatski sledeća epizoda takođe ne radi u spoljnom režimu.
10. **„Gledaj” sa više izabranih epizoda pušta samo prvu** (`src/renderer/pages/SearchPage.jsx:131`). Ostale ostaju izabrane bez efekta, a reda za gledanje nema.
11. **Preuzimanje prepoznaje samo `.mp4`** (`src/main/downloads.js:19`). Drugi format bi dao `file-not-found`; da li ani-cli ikad pravi drugi format nije provereno.
    - Preuzima se jedna epizoda u isto vreme (`:102-106`).
    - Svaka linija napretka šalje IPC bez prigušivanja (`:63-66`, `src/main/index.js:133`).
    - Nastavak posle pauze ponovo pokreće ani-cli (`:129-135`); da li yt-dlp nastavlja `.part` fajl nije provereno.
12. **Detalj serije ne koristi stvarnu listu epizoda** (sintetičko `1..max`, `src/renderer/pages/AnimeDetail.jsx:36-38`). Detalj i pretraga se ponašaju različito za specijalne i decimalne epizode.
13. **Rupe u obradi grešaka u rendereru.**
    - `api.settings.get().then(setSettings)` nema `catch`; ako ne uspe, `App` zauvek vraća `null` (`src/renderer/App.jsx:63,127`).
    - Mnogi `.then` pozivi nemaju `catch`, npr. `src/renderer/pages/HomePage.jsx:51` i `src/renderer/pages/DownloadsPage.jsx:21-25`.
    - U main procesu `main()` nema `catch` (`src/main/index.js:159`), pa bi greška pri `streams.start()` ili `server.start()` bila neobrađena.
    - `downloads.removeDownloaded` sa `deleteFile` nema `try` oko `rmSync` (`src/main/downloads.js:158`).
14. **Nema validacije IPC argumenata** na ulazu (`src/main/ipc.js:96-100`). Na primer, `downloads:enqueue` prima `dir` i naslov direktno iz renderera (`src/main/ipc.js:72`). Rizik je mali jer je renderer izolovan (CSP + sandbox).
15. **Pristupačnost dijaloga:**
    - `AskDialog` nema Esc, focus-trap ni `aria-modal` (`src/renderer/components/AskDialog.jsx:11-21`);
    - `SetupWizard` i `WhatsNewDialog` nemaju focus-trap;
    - `ResumePrompt` ima `role="dialog"`, pa dok je otvoren Esc ne izlazi iz punog ekrana (`src/renderer/App.jsx:114`, `src/renderer/components/ResumePrompt.jsx:7`).
16. **Navigacija:** nema routera, istorije ni pamćenja skrola. Detalj serije se otvara samo kroz Watchlist (`src/renderer/App.jsx:132`).
17. **Biblioteka:** `findRaw` linearno traži po naslovu (`src/main/library.js:39-42`), a `list()` radi `structuredClone` svih zapisa pri svakom pozivu (`:117`). Za stotine serija to nije problem; za hiljade nije mereno.
18. **Sitnice:** pozadina prozora se razlikuje od `--bg` (`src/main/index.js:55` naspram `src/renderer/styles.css:2`); nema pluralizacije u i18n-u; postoji samo jedan breakpoint (`src/renderer/styles.css:200`).
19. **Spec i kod se razlikuju za neobjavljenu epizodu.** Spec traži posebnu poruku „Sledeća epizoda još nije izašla” (`docs/superpowers/specs/2026-10-03-v0.5-player-design.md:100`). U kodu nema tog ključa; prikazuje se opšta `error.episode-not-released`, „Epizoda još nije izašla.” (`src/renderer/i18n/sr.json:45`, `src/renderer/pages/SearchPage.jsx:176-178`).
20. U kodu nema `TODO`/`FIXME`/`HACK` komentara (pretraga `src/` i `tests/`, 0 rezultata).

### 6.2 Iz dokumentacije

- (iz dokumentacije) Svaka izmena pretrage u `anilist.js` mora da poveća `SEARCH_VERSION` (`docs/STATUS.md`, Poznati problemi #1; `src/main/anilist.js:68-70`).
- (iz dokumentacije) Naslovi koje AniList nema na engleskom ostaju bez slike. Namerno se ne traži po jednoj reči (STATUS #2; `docs/RIZICI.md:33`).
- (iz dokumentacije) AniList dozvoljava oko 30 zahteva u minutu, pa se slike velike pretrage popunjavaju i do nekoliko minuta (STATUS #3; `docs/RIZICI.md:32`).
- (iz dokumentacije) Aplikacija nije potpisana, pa je moguće SmartScreen upozorenje (STATUS #4; `docs/RIZICI.md:31`).
- (iz dokumentacije) Ostavljeno iz v0.3 (STATUS #5):
  - dugme „Preuzmi” kratko trepne;
  - skripta ne proverava sha512 iz `latest.yml`;
  - `fail`/`fail0` u `src/main/updater.js:22-26`;
  - nema focus-trap-a u „Šta je novo”.
- (iz dokumentacije) Windows može da prikazuje staru ikonicu dok ne osveži keš ikonica (STATUS #6).
- (iz dokumentacije) Ručno nisu provereni zvuci i level-up animacija pri stvarnom gledanju (STATUS #7).
- (iz dokumentacije) Ako sajt promeni zaštitu, popravka ide u `streamServer.js`. AniSkip nema podatke za sve serije (STATUS #8; `docs/RIZICI.md:40-42`).
- (iz dokumentacije) Pravni i DMCA rizik; slične aplikacije su uklonjene (`docs/RIZICI.md:21-22`).
- (iz dokumentacije) Ideje koje još nisu urađene (`docs/STATUS.md`, „Mogući sledeći koraci”):
  - obaveštenja o novim epizodama, raspored emitovanja;
  - AniList sinhronizacija, filler oznake;
  - ručno povezivanje naslova iz pretrage sa AniList-om (sada postoji samo `aniListId` u watchlist-i);
  - preporuke po žanru.

---

## 7. Snage (ne smemo nazadovati)

- **Originalni ani-cli bez izmena**, preko zvaničnih env varijabli i bridge skripti (`src/main/aniCliBridge.js:59-73`, `resources/bridges/*`). Kad se ani-cli ažurira, aplikacija prati izmene sama. Self-test i automatsko ažuriranje to štite (`src/main/healthCheck.js:27-41`).
- **Bezbednost:**
  - contextIsolation + sandbox + strogi CSP (`src/main/index.js:59-64`, `src/renderer/index.html:5`);
  - zabrana navigacije i novih prozora (`src/main/windowSecurity.js`);
  - oba lokalna servera slušaju samo na `127.0.0.1`, sa nasumičnim tokenom i poređenjem u konstantnom vremenu (`src/main/bridgeServer.js:28-32`, `src/main/streamServer.js:122-131`);
  - proxy prosleđuje samo URL-ove koje je sam video u playlisti (`src/main/streamServer.js:34-39`).
- **Otpornost podataka:**
  - atomski upis i rezervna kopija pokvarenog JSON-a (`src/main/jsonStore.js`);
  - zaštita od pada pri upisu pozicije (`src/main/positions.js:11-13`);
  - nedovršena preuzimanja prežive restart (`src/main/downloads.js:31-32`).
- **Alati bez ručne instalacije:** wizard, atomska zamena sa rollback-om, Windows zamke (PATH, CRLF, razmaci i naša slova u putanjama, `taskkill /T`). Sve je pokriveno testovima (`docs/RIZICI.md:5-11`).
- **Pažljiv AniList:** red zahteva, poštovanje 429, rezervne pretrage bez pogrešnih slika, keš sa verzijom i offline `getCached` (`src/main/anilist.js`).
- **Ista logika praćenja za oba plejera.** Rezervni prelaz na mpv sa iste pozicije; ekran greške umesto crnog ekrana (`src/main/watchService.js:24-38`, `src/renderer/components/PlayerView.jsx:66-76,190-196`).
- **Pažljivi detalji u plejeru:**
  - automatsko preskakanje jednom po delu;
  - kraj `ed`-a se računa kao odgledano;
  - poruka „pitaj” se ne gubi zahvaljujući FIFO redu;
  - nastavak sa pragom 10 s–90%;
  - odbrojavanje do sledeće epizode.
- **Epizode za duge serije:** grupe od 100 sa pozicionim sečenjem (radi za „0”, „12.5” i rupe), „idi na epizodu”, sticky traka radnji (`src/shared/episodes.js`, `src/renderer/components/EpisodePicker.jsx`). Najviše 100 dugmadi odjednom, pa virtualizacija nije potrebna.
- **Doslednost dizajna:** svi tokeni u `:root`, bez hex boja van njega, animira se samo transform/opacity, podrška za smanjeno kretanje. Sve to proveravaju testovi (`tests/unit/styles.test.js`).
- **Pouzdano objavljivanje i ažuriranje:** release skripta sa proverama i draft → SHA-256 → Latest; instalacija samo na klik; „Šta je novo” jednom po verziji (`CLAUDE.md`, `src/main/updater.js:62-74`, `src/main/whatsNew.js`).
- **Testovi:** 486 testova (unit, UI sa lažnim API-jem i lažnim hls.js-om, integracija sa lažnim ani-cli-jem) i e2e smoke sa izolovanim `userData` (`docs/STATUS.md:9`, `tests/e2e/smoke.spec.mjs`, `tests/fixtures/fake-ani-cli.sh`).
- **i18n sr/en** sa proverom pariteta ključeva. Nijedan UI tekst nije hardkodovan, osim „by Leqora” i „© 2026 Leqora” (`src/renderer/components/Sidebar.jsx:36`, `src/renderer/pages/SettingsPage.jsx:177`).
