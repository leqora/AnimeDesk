# AnimeDesk — uputstvo za Claude

Windows desktop aplikacija (Electron + React) koja je grafički interfejs za originalni **ani-cli**, sa watchlist-om, preuzimanjem, gamifikacijom i automatskim ažuriranjem. Repo: https://github.com/leqora/AnimeDesk (javni).

**Prvo pročitaj `docs/STATUS.md`** — tu je trenutna verzija, šta je provereno, poznati problemi i sledeći koraci.

## Pravila

- **Bez spojlera.** Nikad ne otkrivaj radnju, obrte, smrti likova, identitete, završetke ili bilo koji detalj priče za anime (ili deo animea – sezonu/epizodu/arc) koji korisnik nije odgledao. Ako nije jasno da li je nešto gledao, pitaj pre nego što kažeš bilo šta o radnji. Za preporuke koristi samo opšte informacije bez spojlera (žanr, premisa sa početka, atmosfera, broj epizoda). Isto važi za tekst u aplikaciji, testove i beleške izdanja.
- Sa korisnikom se razgovara na **srpskom**; kod, komentari i commit poruke na engleskom.
- Ne otvaraj screenshot-ove na svoju ruku; korisnik ih šalje kad hoće da nešto pokaže.
- Ne menjaj logiku sajta za anime: ani-cli se koristi **originalan**, preko zvaničnih env varijabli (`ANI_CLI_MENU`, `ANI_CLI_PLAYER`), da korisnik ne mora da prati izmene ani-cli tima.

## Git i objavljivanje

- Identitet (lokalno u repou): `leqora <dzonzi777@gmail.com>`. Svaki commit završava sa `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rad na grani `feat/...`, spajanje u `main` sa `--no-ff`; push i release **samo uz dozvolu korisnika**.
- `gh` je u `~/scoop/shims` (u Bash-u: `export PATH="$HOME/scoop/shims:$PATH"`), prijavljen kao leqora.
- **Objava verzije:**
  1. podigni verziju: `npm version X.Y.Z --no-git-tag-version`;
  2. napiši `docs/releases/vX.Y.Z.md` (sr + en, bez spojlera; ugrađuje se u instaler i prikazuje u „Šta je novo”);
  3. commit, spoji u `main`, `git push origin main`;
  4. `npm run release` — proverava repo (čist, `main` = `origin/main`, tag ne postoji, beleške postoje, `gh` prijavljen), pušta testove, pravi instaler, proverava `.exe` + `.blockmap` + `latest.yml`, objavljuje kao **draft**, proverava SHA-256, pa tek onda objavljuje kao Latest.
- Nikad ne objavljuj ručno preko `gh release create` — release bez `latest.yml` pokvari ažuriranje svima.

## Komande

```bash
npm run dev        # pokretanje u razvoju
npm test           # vitest (unit + integration), ~468 testova
npm run test:e2e   # build + Playwright smoke (izolovan userData preko ANIMEDESK_USER_DATA)
npm run test:live  # pravi ani-cli self-test (internet)
npm run dist       # instaler u dist/ (bez objave)
npm run release    # objava (vidi gore)
```

## Arhitektura (gde je šta)

- `src/main/` — Electron glavni proces:
  - `index.js` povezuje sve; `ipc.js` handleri; `paths.js` putanje podataka (`%APPDATA%\AnimeDesk`);
  - ani-cli: `aniCliBridge.js`, `bridgeServer.js`, `watchService.js`, `playerMonitor.js`, `run.js`;
  - alati: `toolManager.js`, `toolSources.js`, `healthCheck.js` (semafor);
  - `seriesPrefs.js` — kvalitet i sub/dub po seriji (`series-prefs.json`), koristi se za gledanje i preuzimanje; `fullscreen.js` — pun ekran (F11, Esc, dugme u meniju; pamti se u `settings.fullscreen`);
  - podaci: `library.js` (watchlist), `settings.js`, `downloads.js`, `watchLog.js`, `progress.js`, `tracker.js`, `jsonStore.js`;
  - `anilist.js` — slike/opisi: red zahteva (jedan po jedan, 429/`Retry-After`), rezervne pretrage (`searchCandidates`), keš u `Cache\anilist` (+ „nije nađeno” 7 dana, sa `SEARCH_VERSION` — povećaj ga kad menjaš pretragu);
  - plejer: `streamServer.js` (lokalni proxy na 127.0.0.1 sa tokenom, prepisuje HLS playliste, dodaje zaglavlja; `registerFile` za preuzete); `internalPlayer.js` (sesija ugrađenog plejera: open/closed/stop/progress, ista `afterPlayback` logika); `positions.js` (sačuvane pozicije za „Nastavi od…”); `aniskip.js` + `skipLookup.js` (AniSkip preko AniList MAL id, keš); `mpvConfig.js` (config za spoljni mpv: uosc, automatsko preskakanje);
  - opcioni alati: `OPTIONAL_TOOL_IDS` u `shared/domain.js` (npr. `uosc`; nedostatak ne kvari semafor);
  - `updater.js` — omotač oko `electron-updater` (stanja: idle/checking/none/available/downloading/ready/error/disabled; instalacija samo na klik, `autoInstallOnAppQuit = false`); `whatsNew.js` — „Ažurirano na X” jednom po verziji.
- `src/preload/index.js` — `window.animedesk.*` API; kanali u `src/shared/channels.js`.
- `src/renderer/` — React: `App.jsx`, `pages/` (Home, Search, Watchlist, Downloads, Profile, Settings, SetupWizard, AnimeDetail), `components/` (EpisodePicker — grupe od 100, „idi na epizodu”, stalna traka radnji; PlayerView — ugrađeni plejer (hls.js) sa PlayerControls, SkipButton, NextEpisodeCard, ResumePrompt; PlayerView — ugrađeni plejer (hls.js) sa PlayerControls, SkipButton, NextEpisodeCard, ResumePrompt; SeriesCard — kartica za favorite/„Nastavi gledanje”; Sidebar, Hero, Poster, UpdateBanner, WhatsNewDialog, LevelUpOverlay…), `i18n/sr.json` + `en.json`, `styles.css` (samo CSS tokeni, bez hex boja van `:root`), `sound.js`.
- `src/shared/` — čista logika: `domain.js`, `stats.js` (XP/nivoi), `releaseNotes.js`, `episodes.js` (grupisanje epizoda), `player.js` (čista logika plejera: prečice, delovi za preskakanje, odbrojavanje).
- `scripts/ico.mjs` + `scripts/makeIcon.mjs` — generisanje ikonice aplikacije (`npm run icon`).
- `scripts/release.mjs` + `scripts/releaseChecks.mjs` (čista pravila, testirana).
- `docs/releases/` se pakuje u instaler kao `resources/releases/` (electron-builder `extraResources`).

## Konvencije

- TDD: prvo test koji pada, pa kod. Testovi u `tests/unit/` (UI testovi u `tests/unit/ui/`, `renderUi` + `makeFakeApi` iz `helpers.jsx`).
- Svi UI tekstovi preko `t('key')`, isti ključevi u `sr.json` i `en.json` (`i18nKeys.test.js` to proverava).
- Paket NIJE `"type": "module"` — skripte i konfiguracije su `.mjs`.
- Veće funkcionalnosti idu kroz superpowers tok: brainstorming → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → izvršavanje (korisnik je do sada birao podagente). Male izmene: kratak dizajn u chatu, odobrenje, pa TDD.
- Rizici koji se prate: `docs/RIZICI.md`.
