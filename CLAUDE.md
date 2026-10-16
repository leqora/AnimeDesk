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
npm test           # vitest (unit + integration), ~892 testa
npm run test:e2e   # build + Playwright smoke (izolovan userData preko ANIMEDESK_USER_DATA)
npm run test:live  # pravi ani-cli self-test (internet)
npm run dist       # instaler u dist/ (bez objave)
npm run release    # objava (vidi gore)
```

## Arhitektura (gde je šta)

- `src/main/` — Electron glavni proces:
  - `index.js` povezuje sve; `ipc.js` handleri; `paths.js` putanje podataka (`%APPDATA%\AnimeDesk`);
  - ani-cli: `aniCliBridge.js`, `bridgeServer.js`, `watchService.js` (čuva pozicije ≥ 10 s i beleži „odgledano” na pragu za oba plejera); `celebrations.js` (drži level-up i „serija završena” dok traje reprodukcija), `playerMonitor.js` (mpv IPC: auto-skip, nastavak sa `--start` + „Nastavljeno od…”, javlja napredak na 5 s), `run.js`;
  - prefetch sledeće epizode (`watchService.js`): od 80 % u ugrađenom plejeru tiha ani-cli sesija za ep+1 parkirana u onPlay, watch() je usvaja (isti naslov plejera/epizoda/kvalitet/režim), rok 10 min od kraja epizode koja ga je pokrenula, dispose na before-quit;
  - alati: `toolManager.js`, `toolSources.js`, `healthCheck.js` (semafor);
  - `seriesPrefs.js` — kvalitet i sub/dub po seriji (`series-prefs.json`), koristi se za gledanje i preuzimanje; `fullscreen.js` — pun ekran (F11, Esc, dugme u meniju; pamti se u `settings.fullscreen`);
  - podaci: `library.js` (watchlist), `settings.js`, `downloads.js`, `watchLog.js`, `progress.js`, `tracker.js`, `jsonStore.js`;
  - `anilist.js` — slike/opisi + `nextAiring { episode, airingAt }` (keš serije koja se emituje ističe sat posle emitovanja, `isFresh`; neuspelo osvežavanje se ponavlja tek posle 1 h): red zahteva (jedan po jedan, 429/`Retry-After`), rezervne pretrage (`searchCandidates`), keš u `Cache\anilist` (+ „nije nađeno” 7 dana, sa `SEARCH_VERSION` — povećaj ga kad menjaš pretragu);
  - plejer: `streamServer.js` (lokalni proxy na 127.0.0.1 sa tokenom, prepisuje HLS playliste, dodaje zaglavlja; `registerFile` za preuzete); `internalPlayer.js` (sesija ugrađenog plejera: open/closed/stop/progress; samo javlja napredak, `watchService` odlučuje); `positions.js` (sačuvane pozicije za „Nastavi od…”; `forSeries` + `onChange`); `positionEvents.js` (prigušen `event:positions-changed`, ≤ 1 / 5 s, `clear` odmah); `aniskip.js` (`normalizeSkips` odbacuje neispravne intervale) + `skipLookup.js` (AniSkip preko AniList MAL id, keš); `mpvConfig.js` (sopstveni config folder za spoljni mpv sa uosc temom); automatsko preskakanje u spoljnom mpv-u je u `playerMonitor.js` (mpv IPC: seek + show-text);
  - opcioni alati: `OPTIONAL_TOOL_IDS` u `shared/domain.js` (npr. `uosc`; nedostatak ne kvari semafor);
  - `updater.js` — omotač oko `electron-updater` (stanja: idle/checking/none/available/downloading/ready/error/disabled; instalacija samo na klik, `autoInstallOnAppQuit = false`); `whatsNew.js` — „Ažurirano na X” jednom po verziji.
  - metapodaci epizoda (v0.7.0): `episodeMeta.js` (ani.zip po `aniListId`, keš u `cache\anizip`, sličice kao data-URL u `cache\anizip\thumbs`, samo host `artworks.thetvdb.com`); `episodeLists.js` (keš ani-cli liste epizoda u `episode-lists.json`, puni ga `watchService`/`downloads`); `seriesEpisodes.js` — **jedino mesto koje odlučuje šta renderer sme da zna o epizodama** (spoiler pravilo iz `shared/spoilers.js`): svaka nova površina sa naslovom/slikom/opisom epizode MORA ići kroz njega (IPC `episodes:for-series`, `episodes:thumb`, `episodes:spoilers`); otkrivanja i „isključi metapodatke” po seriji u `series-prefs.json`.
- `src/preload/index.js` — `window.animedesk.*` API; kanali u `src/shared/channels.js`.
- `src/renderer/` — React: `useNow.js` (sat za odbrojavanje, Hero i detalj), `App.jsx`, `pages/` (Home, Search, Watchlist, Downloads, Profile, Settings, SetupWizard, AnimeDetail), `components/` (EpisodePicker — grupe od 100, „idi na epizodu”, stalna traka radnji; PlayerView — ugrađeni plejer (hls.js) sa PlayerControls, PlayerMenu (zupčanik „Podešavanja plejera”: brzina + titlovi), PlayerTimeline (klizač, AniSkip segmenti, buffered, tooltip vremena), SkipButton, NextEpisodeCard, ResumePrompt; `PlayerView` se učitava lazy preko `src/renderer/player/loadPlayer.js` (`createLoader`/`loadPlayer`, priprema kad aplikacija miruje); MediaCard — zajednička kartica serije za Početnu i Watchlist (bedž, traka, tačka statusa, ▶/★ na hover/fokus, red „EP 4 · ostalo 16 min”, bedž „N novih”); Poster (sa decom: skeleton/fade-in/„nema postera”; `PosterFrame` za pozivaoce koji već imaju AniList info); AiringLine + NewBadge („EP N izlazi za…”, „3 nove”; samo broj i vreme); Sidebar, Hero, Poster, UpdateBanner, WhatsNewDialog, LevelUpOverlay…), `player/` (hook-ovi plejera: `useLatest` — ref na poslednju vrednost; `useFlash` — kratka poruka preko videa; `useIdle` — sakrivanje kontrola; `usePlayerVolume` — jačina/mute; `usePlayerSubtitles` — titlovi, pomak, veličina; `usePlaybackRate` — brzina; `useHlsSource` — hls.js izvor i oporavak; `useEpisodeEnd` — kraj epizode/sledeća; `usePlayerShortcuts` — prečice po fizičkom tasteru; `usePlayerHealth` — zastoj/oporavak; `useSubtitleCues` — aktivni redovi titla), `episodes/` (`useSeriesEpisodes` — lista epizoda sa dozvoljenim poljima iz glavnog procesa; `useEpisodeView` — prekidač Brojevi/Lista, `settings.episodeView`; `useEpisodeProgress` — sačuvane pozicije serije po ani-cli naslovu, jedna zajednička pretplata na `event:positions-changed`), `EpisodeRow` (red liste; skriven red ima samo broj i trajanje), `i18n/sr.json` + `en.json`, `styles.css` (samo CSS tokeni, bez hex boja van `:root`), `sound.js`.
- `src/shared/` — čista logika: `domain.js`, `stats.js` (XP/nivoi), `releaseNotes.js`, `episodes.js` (grupisanje epizoda), `airing.js` („N novih” = emitovano − najveća odgledana, samo „Gledam” + `RELEASING`; `upcoming`, `untilKey`; samo broj i vreme, nikad naslov epizode), `spoilers.js` (pravilo šta je `full`/`preview`/`hidden` i čišćenje epizode), `episodeMap.js` (ključ ani.zip epizode za broj iz ani-cli liste, provera da li se brojevi poklapaju, izbor naslova), `player.js` (čiste pomoćne funkcije plejera: `formatTime`, `segmentAt`, `trackMax`, `shouldOfferResume`, `isLastEpisode`, `nextEpisodeNumber`, `RATES`, `stepRate`, `formatRate` (brzina), `bufferedRanges`, `sameRanges` (buffered traka); prečice su u `usePlayerShortcuts.js`, odbrojavanje u `useEpisodeEnd.js`).
- `scripts/ico.mjs` + `scripts/makeIcon.mjs` — generisanje ikonice aplikacije (`npm run icon`).
- `scripts/release.mjs` + `scripts/releaseChecks.mjs` (čista pravila, testirana).
- `docs/releases/` se pakuje u instaler kao `resources/releases/` (electron-builder `extraResources`).

## Konvencije

- TDD: prvo test koji pada, pa kod. Testovi u `tests/unit/` (UI testovi u `tests/unit/ui/`, `renderUi` + `makeFakeApi` iz `helpers.jsx`).
- Svi UI tekstovi preko `t('key')` (množina: `t.n('key', n)` sa `key_one`/`key_few`/`key_other` u oba jezika; datumi: `t.locale`), isti ključevi u `sr.json` i `en.json` (`i18nKeys.test.js` to proverava).
- Paket NIJE `"type": "module"` — skripte i konfiguracije su `.mjs`.
- Veće funkcionalnosti idu kroz superpowers tok: brainstorming → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → izvršavanje (korisnik je do sada birao podagente). Male izmene: kratak dizajn u chatu, odobrenje, pa TDD.
- Rizici koji se prate: `docs/RIZICI.md`.
