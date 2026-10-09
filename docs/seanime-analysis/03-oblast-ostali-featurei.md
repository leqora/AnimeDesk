# 03 — Oblast 5: Ostali feature-i (Faza 3, samo analiza)

> Poređenje Seanime-a (GPL-3.0, `C:\Users\Nikola\Desktop\Projekti\_ref\seanime`) i AnimeDesk-a v0.5.0 za sve što nije plejer/izvor: biblioteka, skener, sinhronizacija, pretraga, manga, auto-preuzimanje, notifikacije, ekstenzije, podešavanja, Nakama/offline/Discord/paleta/spojleri/random/statistika.
> Reference: `seanime/<putanja>:<linija>` (koren clone-a) i `src/...:<linija>` (koren AnimeDesk repoa). Gde se oslanjam na prethodne faze, piše `00 §x` / `02 #x` (fajlovi `00-nas-projekat.md`, `02-seanime-features.md`).
> Seanime je **samo inspiracija** — GPL kod se ne kopira. Bez spojlera: nijedan konkretan naslov ni radnja nisu navedeni.
> Ocene: **Uticaj** i **Napor** = V (visok) / S (srednji) / N (nizak).
> Korisnikove ideje su uzete iz `Claude/Anime/IDEJE.md` (otvoreno: „Preporuke”, „Skripta za nove epizode”, linije 5 i 7) i `Claude/Anime/Aplikacija za gledanje Anime-a/Istrazivanje.md` (top-10 lista, linije 135–146).

---

## 1. Biblioteka / watchlist / statusi liste, custom liste, sortiranje i filteri

**Kako oni rade**
- Statusi su AniList-ovi: `CURRENT, PLANNING, COMPLETED, DROPPED, PAUSED, REPEATING` (`seanime/internal/api/anilist/models_gen.go:2910-2923`). Postoji i šesti status „ponovno gledanje” (REPEATING); kad se ažurira progres serije koja je u REPEATING listi, status ostaje REPEATING, a na kraju prelazi u COMPLETED (`seanime/internal/platforms/anilist_platform/anilist_platform.go:128-147`).
- Lista se deli po statusima i posebno po **custom listama** (`isCustomList`) (`seanime/seanime-web/src/app/(main)/lists/_lib/handle-user-anilist-lists.ts:93-103`). Custom liste su AniList-ove (žive na AniList nalogu).
- Filteri liste: `sorting, genre, tags, status (emitovanja), format, season, year, isAdult` + `continueWatchingOnly` (`seanime/seanime-web/src/lib/helpers/filtering.ts:120-133`); podrazumevano sortiranje `SCORE_DESC` (`:136-137`). Sortiranja: START_DATE, SCORE, AUDIENCE_SCORE, RELEASE_DATE, PROGRESS, TITLE (asc/desc), a za „nastavi gledanje” i AIRDATE (`:19-60`). Pretraga po naslovu u listi je debounce-ovana (`handle-user-anilist-lists.ts:80-91`).
- Uređivanje unosa (modal): status, skor 0–100, progres, `startedAt`, `completedAt`, broj ponovnih gledanja `repeat` (`seanime/seanime-web/src/app/(main)/_features/media/_containers/anilist-media-entry-modal.tsx:35-39,89-132`). Server: `UpdateEntry`, `UpdateEntryProgress`, `UpdateEntryRepeat`, `DeleteEntry` (`seanime/internal/platforms/anilist_platform/anilist_platform.go:98,113,162,177`).
- Bez AniList naloga radi „lokalni nalog” (simulirana platforma) (`seanime/internal/platforms/simulated_platform/simulated_platform.go:49`), uz dugme „Upload to AniList” (`seanime/seanime-web/src/app/(main)/settings/_containers/local-settings.tsx:28-32`, `seanime/internal/handlers/local.go:220`).

**Kako mi radimo**
- 5 statusa: `watching, completed, planned, paused, dropped` (`src/shared/domain.js:1`); nema „ponovno gledanje”. Status se validira (`src/main/library.js:20`).
- Unos ima ocenu 1–10, komentar, beleške po epizodi, `watchedEpisodes` kao skup, `pinnedAt`, `addedAt/updatedAt/lastWatchedAt` (`src/main/library.js:50-55,21-23`). Nema `startedAt/completedAt` ni broja ponovnih gledanja.
- `recordWatched`: ako je serija `completed`, ostaje `completed`; inače `watching`; a kad je epizoda ≥ ukupnog broja → `completed` (`src/main/library.js:96-97`). To znači da gledanje poslednje epizode (npr. preskakanjem) završava seriju iako ranije epizode nisu odgledane.
- Watchlist stranica: filter po jednom statusu ili „sve”, sortiranje `title | rating | lastWatched` (`src/renderer/pages/WatchlistPage.jsx:9-15,36,50-59`), ručno dodavanje po naslovu (`:37-43`). Nema pretrage po naslovu u listi, filtera po žanru/godini/formatu, ni brojača po statusu.
- Detalj: status, ocena, komentar, beleške, „označi odgledano” (`src/renderer/pages/AnimeDetail.jsx:76-127`).
- Favoriti (do 5) i šina „Nastavi gledanje” (`src/main/library.js:5,103-113`; `00 §2 Favoriti`).

**Razlika**
- Imamo isti osnovni model statusa (5 od 6), bez REPEATING i bez datuma početka/završetka.
- Nemamo custom liste/tagove, pretragu u listi, filtere po metapodacima (žanr, godina, format, sezona), ni sortiranje po napretku/datumu dodavanja.
- Prednost kod nas: beleške po epizodi i ocena bez potrebe za nalogom; podaci su lokalni JSON uz atomski upis (`00 §1.9`).

**Preporuka**
1. **Pretraga + brojači + više sortiranja u Watchlist-i** — polje „traži u listi”, broj po statusu na `<option>`, sortiranje po `addedAt`, po napretku (`watched/total`). Fajlovi: `src/renderer/pages/WatchlistPage.jsx` (`sortItems` je već izvezen, lako se testira). Uticaj S, napor N. Rizik: nikakav.
2. **Filter po žanru/godini** iz AniList keša — `anilist.getCached` je već sinhrono i bez mreže (`00 §1.8`, `src/main/anilist.js:126-134` prema 00). Fajlovi: `src/main/ipc.js` (novi kanal ili proširen `library:list` sa `genres/year`), `WatchlistPage.jsx`. Uticaj S, napor N–S. Rizik: serije bez AniList pogotka nemaju žanr — prikazati ih pod „nepoznato”.
3. **Tagovi (custom liste)** kao `tags: string[]` u unosu + filter. Fajlovi: `src/main/library.js` (`EDITABLE`, `validatePatch`), `AnimeDetail.jsx`, `WatchlistPage.jsx`, i18n. Uticaj S, napor S. Rizik: migracija nije potrebna (polje opciono).
4. **Status „ponovo gledam” + `startedAt/completedAt`** — samo ako se radi AniList sinhronizacija (sekcija 3), da mapiranje bude 1:1. Napomena: promena `STATUSES` dira gamifikaciju (`src/shared/stats.js`, završena serija +50 XP) — mora se odlučiti da li ponovno završavanje daje XP. Uticaj N–S, napor S.
5. **Ispraviti/oznaći `recordWatched` → completed** samo kad su sve epizode odgledane ili tražiti potvrdu. Fajl: `src/main/library.js:97`. Uticaj S (tačnost statistike), napor N. Rizik: promena ponašanja → test u `tests/unit`.

---

## 2. Lokalni skener biblioteke i uparivanje (relevantnost za naš folder preuzimanja)

**Kako oni rade**
- Skener prolazi kroz library putanje, parsira imena fajlova i uparuje ih sa AniList kolekcijom (`seanime/internal/library/scanner/scan.go:58`), sa „context-aware” uparivanjem (`seanime/internal/library/scanner/matcher.go:112`, `media_tree_analysis.go`), normalizacijom naslova (`title_normalization.go`) i hidracijom broja epizode/tipa (`hydrator.go:57`).
- Pravila (regex) za forsiranje uparivanja (`seanime/internal/library/scanner/config.go:5`), watcher za automatsko skeniranje (`watcher.go:47`, `seanime/internal/library/autoscanner/autoscanner.go:60`), izveštaj skeniranja (`seanime/internal/library/summary/scan_summary.go:76`), lista epizoda koje nedostaju (`seanime/internal/library/anime/missing_episodes.go:24`).
- Ovo je ~150 KB Go koda samo u `internal/library/scanner/` (matcher.go 47 KB, hydrator.go 28 KB) — rešava problem **proizvoljno imenovanih** fajlova iz torrenata.

**Kako mi radimo**
- Fajlove pravi ani-cli sa predvidljivim imenom; tražimo `… Episode N.mp4` rekurzivno u `<dir>/<safeDirName(title)>` (`src/main/downloads.js:14-26,42`).
- Zapis o preuzetom fajlu ide u `downloads.json` → `items` (`src/main/downloads.js:84`), a `missing` se računa sa `existsSync` (`:149`).
- Nema skeniranja foldera: fajl prebačen spolja ili preuzet pre reinstalacije (ako se `downloads.json` izgubi) nije vidljiv. `enqueue` ne proverava da li epizoda već postoji (`src/main/downloads.js:108-115`).

**Razlika**
- Seanime-ov skener rešava problem koji mi nemamo (nasumična imena). Naš problem je uži: **povratak izgubljenih zapisa** i **izbegavanje duplog preuzimanja**.

**Preporuka**
- **Lagani „re-index” foldera preuzimanja** (bez fuzzy uparivanja): prođi `downloadDir/*/`, prepoznaj samo ani-cli obrazac `… Episode N.mp4`, dodaj nedostajuće zapise u `items`. Fajlovi: `src/main/downloads.js` (izdvojiti `findEpisodeFile` u čist parser imena + test), dugme u `src/renderer/pages/DownloadsPage.jsx`. Uticaj S, napor N–S. Rizik: naslov iz imena foldera je `safeDirName` (izgubljeni znakovi) — upariti sa watchlist-om preko `normalizeTitle`, a nepoznate prikazati pod imenom foldera.
- **Provera duplikata u `enqueue`** (preskoči epizodu koja već postoji u `items` i fajl postoji). Fajl: `src/main/downloads.js:108`. Uticaj S, napor N.
- **Ne preuzimati** Seanime-ov skener/matcher, pravila, watcher i „Super Update” — velik obim, a nema koristi dok ani-cli imenuje fajlove sam (vidi „Ne preuzimati”).

---

## 3. AniList / MAL sinhronizacija (OAuth u Electronu, progres, ocena, uvoz liste)

**Kako oni rade**
- **AniList prijava = implicit grant (token u URL fragmentu)**: dugme otvara `https://anilist.co/api/v2/oauth/authorize?client_id=…&response_type=token` (`seanime/seanime-web/src/app/(main)/server-data-wrapper.tsx:147-151`, `seanime/seanime-web/src/lib/server/config.ts:1`); rezervni put je „Get AniList token” (PIN klijent, `config.ts:2`) i ručno lepljenje tokena u formu (`server-data-wrapper.tsx:178-200`). Server samo prima token (`seanime/internal/handlers/auth.go:15-36`).
- **Progres**: posle završene epizode `UpdateEntryProgress` (`anilist_platform.go:113-160`), uz opciju `AutoUpdateProgress` (`seanime/internal/database/models/models.go:73`); događaj „video completed” obrađuje `seanime/internal/library/playbackmanager/progress_tracking.go:138`.
- **Ocena/status/datumi** preko modala (sekcija 1).
- **Keš sloj**: svi AniList zahtevi se keširaju, izmene idu u red kad AniList ne odgovara (`seanime/internal/platforms/shared_platform/cachelayer.go:205`; `02 #4.3`).
- **MAL**: OAuth sa PKCE (`code_verifier`) i razmena koda na `https://myanimelist.net/v1/oauth2/token` (`seanime/internal/handlers/mal.go:33-58`); tokeni (access/refresh/expires) u bazi (`models.go:279-285`); progres/status preko `UpdateAnimeProgress` / `UpdateAnimeListStatus` (`seanime/internal/api/mal/anime.go:105,143`). Dokumentacija ga svrstava u „Plugin” nivo (`02 #4.8`).

**Kako mi radimo**
- AniList se koristi **samo anonimno** za slike/opis/žanrove/broj epizoda/MAL id (`src/main/anilist.js:5-8`), sa redom zahteva i poštovanjem 429 (`00 §1.8`). Nema naloga, tokena, mutacija ni uvoza liste.
- STATUS.md već navodi „AniList sinhronizacija” kao mogući korak (`docs/STATUS.md:55`), a Istraživanje kao #4 (`Istrazivanje.md:138`).

**Razlika / izvodljivost za nas**
- **AniList (izvodljivo, S napor):**
  - Implicit grant ne traži client secret, pa nema tajne u aplikaciji. U Electronu: otvori URL u spoljnom browseru (`shell.openExternal`) i uzmi token preko **PIN redirect-a** (korisnik lepi token) — isti rezervni put koji koristi Seanime (`config.ts:2`, `server-data-wrapper.tsx:178`). Alternativa sa custom protokolom (`animedesk://`) traži registraciju protokola u NSIS instaleru i `requestSingleInstanceLock` (trenutno ga nemamo — pretraga `src/main` ne nalazi `requestSingleInstanceLock`).
  - Čuvanje tokena: Electron `safeStorage` (predlog iz `Istrazivanje.md:99`), nikad u `settings.json` kao čist tekst.
  - CSP renderera dozvoljava samo `'self'` i `127.0.0.1` (`src/renderer/index.html:5`, `00 §1.3`) — sve mutacije moraju ići iz main procesa, kroz postojeći AniList red (`src/main/anilist.js`), što je dobro (rate-limit već rešen).
  - Mapiranje: imamo `aniListId` po unosu (`src/main/library.js:53`), ali ga dobijamo heuristikom `bestMatch` (prvi rezultat ako nema tačnog poklapanja — `src/main/anilist.js:20-23`). **Rizik: pogrešan push na tuđu seriju na nalogu.** Zato push samo za unose sa potvrđenim `aniListId` (ručna potvrda/„manual match”).
  - Statusi: `watching→CURRENT, planned→PLANNING, completed→COMPLETED, paused→PAUSED, dropped→DROPPED`; ocena 1–10 → AniList skor (format zavisi od korisnikovog `scoreFormat` — treba pročitati `Viewer.mediaListOptions`; nije provereno u Seanime-u kako tačno konvertuju, Seanime šalje `score*10` iz modala, `anilist-media-entry-modal.tsx:116`).
  - Konflikti: lokalna lista ostaje glavni izvor; push je jednosmeran (lokalno → AniList), uvoz je jednokratan i ručan.
- **MAL (izvodljivo, ali skuplje):** treba registrovan MAL client id, PKCE, refresh token i loopback/redirect URI; Seanime sam kaže da je to „Plugin” nivo. Za nas **niži prioritet** (P3).
- **Uvoz liste**: AniList `MediaListCollection(userName, type: ANIME)` je javan za javne profile — uvoz moguć i **bez prijave** (samo korisničko ime). To je najjeftiniji prvi korak. (Tvrdnja o AniList API-ju; nije provereno u Seanime kodu — oni uvoz rade preko prijavljenog naloga.)

**Preporuka**
- **P1: „Uvezi sa AniList-a” (po korisničkom imenu, bez prijave)** → kreira unose sa `aniListId`, statusom, progresom (`watchedEpisodes = 1..progress`), ocenom. Fajlovi: `src/main/anilist.js` (novi upit, kroz isti red), `src/main/library.js` (bulk add sa deduplikacijom po `aniListId`), `SettingsPage.jsx`. Uticaj V, napor S. Rizik: XP — uvezene epizode **ne smeju** da daju XP/streak (inače se gamifikacija „naduva”); `watchLog` ostaje netaknut.
- **P2: AniList prijava (PIN token) + automatski push progresa** posle `tracker.record` (`src/main/tracker.js:5-12` prema 00), samo za potvrđeni `aniListId`, sa redom izmena koji preživi offline (ideja iz `cachelayer_queue.go`). Fajlovi: novi `src/main/anilistSync.js`, `src/main/tracker.js`, `src/main/ipc.js`, `src/preload/index.js`, Settings. Uticaj V, napor S–V. Rizik: token u `safeStorage`; pogrešno uparivanje (rešiti „manual match” iz oblasti pretrage).
- **P3: MAL** — tek ako korisnik traži.

---

## 4. Pretraga i filteri, Discover / trending / sezonski, napredna pretraga

**Kako oni rade**
- **Napredna pretraga** nad AniList-om: `title, sorting[], genre[], tags[], status[], format, season, year, minScore, isAdult, countryOfOrigin` (`seanime/seanime-web/src/app/(main)/search/_lib/advanced-search.atoms.ts:4-16`), UI `advanced-search-options.tsx:36`, server `seanime/internal/handlers/anilist.go:302` (`HandleAnilistListAnime`).
- **Discover** stranica (`seanime/seanime-web/src/app/(main)/discover/page.tsx:21`) sa sekcijama: trending, popular, upcoming, trending po zemlji, filmovi, manga, airing schedule, „You Might Have Missed” (fajlovi u `discover/_containers/`: `discover-trending.tsx`, `discover-popular.tsx`, `discover-upcoming.tsx`, `discover-trending-country.tsx`, `discover-trending-movies.tsx`, `discover-airing-schedule.tsx`, `discover-missed-sequels.tsx`).
- **Propušteni nastavci**: za unose u COMPLETED/REPEATING/PAUSED uzima prvu `SEQUEL` relaciju koja nije u listi, a status joj je FINISHED ili RELEASING (`seanime/internal/api/anilist/list.go:11-58`); sekcija se učitava tek kad uđe u vidno polje (`discover-missed-sequels.tsx:10-16`).
- **Nedavno emitovano** (`seanime/internal/handlers/anilist.go:391`), **kalendar** koji spaja AniList `airingSchedule` sa listom (`seanime/internal/library/anime/schedule.go:42`), `nextAiringEpisode` u upitima (`seanime/internal/api/anilist/queries/anime.graphql:372`).
- **Brza pretraga** tasterom `S` i paleta (`seanime/seanime-web/src/app/(main)/_features/sea-command/sea-command.tsx:97-124`).

**Kako mi radimo**
- Jedina pretraga je **ani-cli pretraga** sa Početne: `watch.start({query})`, a ani-cli meni naslova postaje mreža kartica sa AniList posterima (`00 §2 Pretraga`: `src/renderer/pages/SearchPage.jsx:108-113,187-204`). Nema filtera ni sortiranja; rezultati su ono što izvor vrati.
- AniList pretragu koristimo samo da nađemo **sliku/metapodatke** za ani-cli naslov (`src/main/anilist.js:7`, `Page(perPage: 10)`), sa poljima bez `relations`, `nextAiringEpisode`, `tags`, `popularity` (`src/main/anilist.js:6`).
- Nema Discover/trending/sezonskog pregleda ni preporuka (otvoreno u `IDEJE.md:5`).

**Razlika**
- Kod nas je pretraga „šta izvor ima”, kod njih „šta AniList zna”. Za nas je to i prednost: sve što se nađe može odmah da se pusti. Discover bez provere da li ani-cli ima naslov može da vodi na „nema rezultata” — zato svaki Discover klik treba da pokrene ani-cli pretragu, a ne da obećava dostupnost.

**Preporuka**
1. **„Propušteni nastavci” na Početnoj** (iz watchlist-e sa `aniListId` i statusom completed/paused): jedan batch upit `Page(media(id_in:[…])){ relations{…} }` kroz postojeći red, keš 1 dan; prikaz samo **poster + naslov + format**, bez opisa (spojleri). Klik → `watch.start({query: naslov})`. Fajlovi: `src/main/anilist.js` (novi upit + keš), `src/main/ipc.js`, `src/renderer/pages/HomePage.jsx` (nova šina, isti rail obrazac). Uticaj V, napor S. Rizik: uzimati samo `SEQUEL` kao Seanime (`list.go:37`), ne „side story”.
2. **Discover „Ova sezona / Trending”** (AniList `sort: TRENDING_DESC`, `season/seasonYear`) kao šina na Početnoj; klik pokreće ani-cli pretragu. Fajlovi: isti kao gore. Uticaj S, napor S. Rizik: ~30 zahteva/min (`docs/STATUS.md:45`) — jedan upit po šini, keš nekoliko sati.
3. **Preporuke po žanru** (`IDEJE.md:5`): AniList `recommendations` za serije sa ocenom ≥ 8 + top žanrovi iz `src/shared/stats.js`. Prikazati samo naslov/žanrove, **bez opisa i bez tagova sa `isMediaSpoiler`** (predlog iz `Istrazivanje.md:107`). Uticaj S–V, napor S.
4. **Filteri na ani-cli rezultatima** (godina/format iz AniList keša, kad postoji) — tek posle 1–3. Uticaj N, napor S.
5. **Prečica za fokus na pretragu** — vidi sekciju 10 (paleta). Uticaj N, napor N.
- **Ne raditi** punu naprednu pretragu sa 10+ filtera (tagovi, zemlja, minScore): velika površina, a rezultat ionako mora kroz ani-cli.

---

## 5. Manga (samo relevantnost)

**Kako oni rade:** zasebna biblioteka (`seanime/internal/manga/collection.go:43`), provider ekstenzije, čitač, red preuzimanja poglavlja, lokalni CBZ izvor (`02 #14.1–14.9`).

**Kako mi radimo:** ništa; ani-cli je samo za anime (`00 §5`).

**Relevantnost: nije relevantno.** Traži drugi izvor (ekstenzije/scraperi — upravo ono što namerno izbegavamo, `docs/RIZICI.md:21-22` prema `00 §6.2`) i potpuno novi UI (čitač). Jedina korisna ideja je **obrazac „reset errored”** u redu preuzimanja (`02 #14.6`, `seanime/internal/manga/downloader/queue.go:56`), a to važi i za naš anime red (sekcija 6).

---

## 6. Preuzimanje / auto-download pravila (nove epizode serija koje gledamo, preko ani-cli)

**Kako oni rade**
- **Auto Downloader**: petlja sa intervalom (podrazumevano 20 min, korisnička vrednost se prihvata samo ako je ≥ 15) (`seanime/internal/library/autodownloader/autodownloader.go:266-272`), `checkForNewEpisodes` (`:295`), čita RSS torrent providera.
- **Pravilo po animeu**: `Enabled, MediaId, Destination, ProfileID, ReleaseGroups, Resolutions, EpisodeNumbers, EpisodeType, ComparisonTitle, TitleComparisonType, AdditionalTerms, ExcludeTerms, MinSeeders, MinSize/MaxSize, CustomEpisodeNumberAbsoluteOffset, Providers` (`seanime/internal/library/anime/autodownloader_types.go:30-62`); provera `torrentFollowsRule` (`autodownloader.go:1156`).
- Podešavanja: `Provider, Interval, Enabled, DownloadAutomatically` (inače ide u red za odobrenje), `UseDebrid` (`seanime/internal/database/models/models.go:335-344`). Odloženo preuzimanje radi bolje verzije (`autodownloader.go:764`), simulacija (`:155`), bulk pravila „svi koje gledam” (`02 #13.6`).
- Na kraju šalje OS notifikaciju „N epizoda preuzeto / dodato u red” (`autodownloader.go:1140-1153`).

**Kako mi radimo**
- Ručni red: `enqueue({title, aniCliTitle, episodes, dir})` (`src/main/downloads.js:108-115`), jedno preuzimanje u isto vreme (`:102-106`), pauza/nastavak/otkaz (`:117-146`), nedovršeno preživi restart kao „pauzirano” (`:31-32`). Kvalitet i sub/dub po seriji (`:50-54`).
- ani-cli greška „epizoda još nije izašla” postoji kao `episode-not-released` (`src/main/aniCliBridge.js:11-18` prema `00 §2`). U redu se greška samo upiše (`src/main/downloads.js:93-94`); automatskog ponovnog pokušaja nema (ručni `resume` prihvata i `error` status, `:131`).
- Nema automatskog otkrivanja novih epizoda (otvoreno: `IDEJE.md:7` „Skripta za nove epizode”).

**Razlika**
- Sve torrent-specifično (release grupe, seederi, veličina, RSS, profili sa skorom, odlaganje radi bolje verzije) **ne važi** za nas: ani-cli vraća izvor po kvalitetu, a kvalitet i sub/dub već imamo po seriji.
- Ostaje jezgro: „za seriju X, kad izađe nova epizoda, stavi je u red”.

**Preporuka — „Auto-preuzimanje novih epizoda” (pojednostavljen Auto Downloader)**
- **Okidač**: AniList `nextAiringEpisode`/`airingSchedule` za unose u statusu `watching` sa `aniListId` (zajednički modul sa notifikacijama, sekcija 7). Kad `airingAt` prođe (+ zaštitni razmak, npr. 1–2 h, jer izvor kasni), epizoda je „kandidat”.
- **Pravilo po seriji** (minimalno): `autoDownload: boolean` u `series-prefs.json`, pored kvaliteta/sub-dub koje već postoje (`src/main/seriesPrefs.js`). Bez regex-a, termina i grupa.
- **Izvršenje**: postojeći `downloads.enqueue` sa `aniCliTitle` iz watchlist-e; na `episode-not-released` → **ponovi kasnije** (backoff, npr. 1 h, najviše N puta), umesto trajne greške.
- **Bez duplikata**: provera `items` i `queue` pre dodavanja (sekcija 2).
- **Opcija „samo dodaj u red”** — analogno Seanime-ovom `DownloadAutomatically=false` (`models.go:339`).
- Fajlovi: novi `src/main/airing.js` (AniList upit + keš + raspored provere), novi `src/shared/autoDownload.js` (čista logika „koji su kandidati” — TDD), `src/main/downloads.js` (dedup + retry stanje), `src/main/seriesPrefs.js`, `src/main/index.js` (tajmer, isti obrazac kao updater/health tajmeri), prekidač u `src/renderer/pages/AnimeDetail.jsx`.
- Uticaj **V**, napor **S–V**. Rizici: (1) aplikacija mora da radi da bi preuzimala — tray (sekcija 7); (2) broj epizode kod ani-cli-ja i AniList-a ne mora da se poklapa (Seanime zato ima `CustomEpisodeNumberAbsoluteOffset`, `autodownloader_types.go:57`) — početno porediti sa `max(watchedEpisodes)+1`, a offset po seriji dodati tek ako zatreba; (3) pravni profil „auto-download” (`Istrazivanje.md:187`) — opcija podrazumevano isključena.
- Nezavisno od auto-preuzimanja: **„Ponovi neuspele”** dugme u redu. Fajlovi: `src/main/downloads.js`, `src/renderer/pages/DownloadsPage.jsx`. Uticaj S, napor N.

---

## 7. Notifikacije (nove epizode, preuzimanje završeno; Electron Notification)

**Kako oni rade**
- OS notifikacije postoje **samo za tri izvora**: `Auto Downloader`, `Auto Scanner`, `Debrid` (`seanime/internal/notifier/notifier.go:29-33`) + notifikacije iz pluginova (`seanime/internal/plugin/ui/notification.go:33`). Pozivi: `autodownloader.go:1143-1148`, `seanime/internal/library/autoscanner/autoscanner.go:349`, `seanime/internal/debrid/client/download.go:219`.
- Isključivanje: globalno i po tipu (`seanime/internal/database/models/models.go:269-273`, provera `notifier.go:74-92`). Windows: `toast` (`seanime/internal/notifier/notify_windows.go:9-10`); Unix: `beeep` (`notify_unix.go:9-10`).
- **Seanime NEMA notifikaciju „izašla je nova epizoda”** — pretraga poziva `Notify(` u `internal/` daje samo gornja mesta. Nova emitovanja se vide samo u kalendaru/„upcoming” (`seanime/internal/library/anime/upcoming_episodes.go:38`, `schedule.go:42`).
- In-app „hub” model postoji (`seanime/internal/notification/hub.go:3`).

**Kako mi radimo**
- Nema `Notification`, `Tray`, `setAppUserModelId` ni `requestSingleInstanceLock` u `src/` (pretraga: 0 pogodaka; jedini „autoDownload” je za ažuriranja aplikacije, `src/main/settings.js:17`, `src/main/updater.js:71`).
- Završeno preuzimanje = samo **zvuk** u rendereru kad se u događaju `downloads` pojavi novi `done` (`src/renderer/App.jsx:87-91`). Kad je prozor minimizovan, nema vidljivog signala.
- `appId: com.leqora.animedesk` postoji u `electron-builder.yml:1`.

**Razlika**
- Ovde **možemo biti bolji od Seanime-a**: notifikacija o novoj epizodi je #1 u našem istraživanju (`Istrazivanje.md:94,135`; Shiru obrazac sa debounce-om i automatskim „pročitano”, `Istrazivanje.md:46`), a Seanime je nema.

**Preporuka**
1. **OS notifikacija „preuzimanje završeno / neuspelo”** iz main procesa (u `onChange` putanji za `createDownloads`, `src/main/index.js`); klik → fokus prozora i stranica Preuzimanja. Podešavanje „Sistemska obaveštenja” (globalno + po tipu, kao `models.go:269-273`) u `src/main/settings.js` (`DEFAULT_SETTINGS` + `sanitizeSettings`) i `SettingsPage.jsx`. Uticaj S, napor N. Rizik: na Windows-u Electron notifikacije zavise od AppUserModelID-a — `app.setAppUserModelId('com.leqora.animedesk')` usklađen sa `electron-builder.yml:1` (zahtev iz Electron dokumentacije za Windows; u našem kodu ga nema). Prigušiti: jedna notifikacija po završenom nizu, ne po epizodi.
2. **„Nova epizoda je izašla”** (isti `airing.js` modul kao sekcija 6): provera na ~30 min, poravnato + jitter (Shiru obrazac, `Istrazivanje.md:47`), jedan batch AniList upit za sve `watching` unose sa `aniListId`; notifikacija samo **naslov + broj epizode** (nikad naziv epizode — spojler). In-app „zvonce” sa nepročitanim, automatski „pročitano” kad `watchLog` zabeleži tu epizodu. Fajlovi: `src/main/airing.js`, `src/main/notifications.js` (red + dedup + `notifications.json` preko `jsonStore`), `src/shared/channels.js` (novi event), `src/renderer/components/Sidebar.jsx` (zvonce). Uticaj **V**, napor S.
3. **Tray + „zatvori u tray” + pokretanje sa Windows-om** (`02 #19.1`, `seanime/seanime-denshi/src/main/index.ts:502`) — preduslov da 2. i auto-preuzimanje rade dok je prozor zatvoren. Uz to `requestSingleInstanceLock` (drugo pokretanje fokusira postojeći prozor). Fajl: `src/main/index.js` + podešavanja. Uticaj S, napor N–S. Rizik: korisnik ne zna da aplikacija radi u pozadini → jasna opcija, podrazumevano isključena.

---

## 8. Ekstenzije / pluginovi

**Kako oni rade:** 5 tipova — `anime-torrent-provider`, `manga-provider`, `onlinestream-provider`, `custom-source`, `plugin` (`seanime/internal/extension/extension.go:14` i dalje), JS u ugrađenom Goja engine-u, marketplace iz repo URL-a, ~150 hook-ova, UI API (tray, webview, DOM), dozvole i „Extension Secure Mode” (`02 #15.1–15.9`, `seanime/internal/plugin/secure.go:11`).

**Kako mi radimo:** nema ekstenzija. Izvor je **jedan, originalni ani-cli bez izmena** (`00 §7`, `CLAUDE.md` „Ne menjaj logiku sajta”).

**Zašto ne za nas:**
- Provider ekstenzije = scraperi u aplikaciji. To smo svesno izbegli: repo ne sadrži nijednu referencu na sajt, a izvor održava ani-cli tim (`00 §5.1`, `docs/RIZICI.md:21-22`). Ekstenzije bi nas vratile u akuse-scenario (arhiviran jer su se izvori pokvarili, `Istrazivanje.md:50`) i povećale pravni rizik (`Istrazivanje.md:33,187`).
- Plugin sistem (izvršavanje tuđeg JS-a sa pristupom fajlovima/mreži) bi oslabio naš bezbednosni model: `sandbox`, `contextIsolation`, strogi CSP, lokalni serveri sa tokenom (`00 §7`). Seanime je zbog toga morao da uvede secure mode i dozvole (`02 #2.7, #15.9`).
- Obim: Seanime ima zasebne pakete `extension_repo`, `plugin`, `hook`, `hook_resolver` i JS runtime — više nego cela naša aplikacija.
- **Zaključak: ne preuzimati.**

---

## 9. Podešavanja (poređenje kategorija)

**Kako oni rade:** ~20 tabova (`seanime/seanime-web/src/app/(main)/settings/page.tsx:191`, model `seanime/internal/database/models/models.go:49` i dalje; pun spisak u `02 #20.1–20.20`).

**Kako mi radimo:** jedna stranica sa sekcijama: opšte (jezik, praćenje i prag, „pitaj pri zatvaranju”, folder preuzimanja, kvalitet, sub/dub) (`src/renderer/pages/SettingsPage.jsx:33-78`), Plejer (`:79`), Profil i zvuci (`:109`), Ažuriranja (`:140`), Alati (`:160`), O aplikaciji (`:172`). Model: 21 ključ u `src/main/settings.js:3-25`, uz `sanitizeSettings` (`:32-58`).

| Seanime kategorija (`02 #20.x`) | Kod nas | Ocena |
|---|---|---|
| App (update kanal, watch history, default source) — 20.1 | Ažuriranja: auto-preuzimanje ažuriranja (`settings.js:17`); jedan kanal | Dovoljno; kanali (beta) nisu potrebni za jednog korisnika |
| User Interface (boje, pozadina, blur, custom CSS, spojleri) — 20.2 | samo animacije/zvuci (`settings.js:13-16`); tema fiksna (`00 §3.1`) | **Nedostaje: spojler opcije** (sekcija 10); akcent boja = N prioritet |
| Home screen layout — 20.3 | fiksne šine (`00 §2 Početna`) | Nedostaje; vredi tek kad bude više šina (sekcija 4) |
| Local Anime Library — 20.4 | folder preuzimanja + kvalitet (`settings.js:8-10`) | Ok za naš obim |
| Video Playback / Desktop Media Player — 20.5–20.6 | `playerMode`, `autoSkip`, `autoNext`, `subtitleSize`, `mpvModernUi` (`settings.js:20-24`) | Pokriveno oblastima plejera |
| Torrent / Debrid / Transcoding / Online — 20.8–20.13 | — | Ne važi za nas |
| Manga — 20.14, Nakama — 20.15 | — | Ne važi (sekcije 5 i 10) |
| Discord — 20.16 | — | Nedostaje (sekcija 10) |
| Denshi (tray i sl.) — 20.17 | pun ekran (`settings.js:19`) | **Nedostaje: tray, autostart** (sekcija 7) |
| Logs & Cache — 20.18 | — | **Nedostaje: „Obriši keš” (AniList/AniSkip) i „Otvori folder logova/podataka”** |
| AniList / lokalni nalog / Data — 20.19 | — | Nedostaje: AniList (sekcija 3), **izvoz/uvoz podataka** |
| Auto Downloader / Notifications — 20.20 | — | Nedostaje (sekcije 6 i 7) |

**Preporuka**
- **Sekcija „Podaci”**: izvoz/uvoz `library.json` + `watchlog.json` + `series-prefs.json` u jedan JSON (backup), „Otvori folder podataka” (`%APPDATA%\AnimeDesk`, `00 §1.3`), „Obriši keš slika/AniSkip-a” (`cache/anilist`, `cache/aniskip` — `00 §1.9`). Fajlovi: `src/main/ipc.js`, `src/main/paths.js`, `SettingsPage.jsx`, `dialog:pick-folder` obrazac već postoji (`00 §1.4`). Uticaj S (zaštita podataka uz automatski `.corrupt` backup), napor N. Rizik: uvoz mora proći istu validaciju (`validatePatch`, `src/main/library.js:13-30`).
- **Sekcija „Obaveštenja”** i **„Rad u pozadini”** — uz sekcije 6–7.
- **Spojleri** — uz sekciju 10.
- **Ne praviti** 20 tabova; zadržati jednu stranicu sa sekcijama (eventualno sidro-navigacija kad sekcija bude > 8).

---

## 10. Multi-user / Nakama / watch-together; offline; Discord RPC; command palette; skrivanje spojlera; random epizoda; statistika

### 10.1 Multi-user, Nakama, watch-together
- **Oni:** Nakama povezuje Seanime instance (host/peer, HTTP + WebSocket) (`seanime/internal/nakama/nakama.go:221`), Cloud Rooms preko centralnog API-ja (`seanime/internal/nakama/room.go:37`), watch party sa sinhronizacijom (`seanime/internal/nakama/watch_party_host.go:29`), deljenje biblioteke (`seanime/internal/nakama/share.go:109`). **Multi-user nije podržan** (`02 #17.8`).
- **Mi:** ništa; jedan korisnik po `userData` (`00 §1.3`), ime profila u podešavanjima (`src/main/settings.js:12`).
- **Preporuka:** **ne preuzimati** Nakama/watch party (traži relay server ili otvaranje porta; naši serveri namerno slušaju samo na `127.0.0.1`, `00 §7`). **Više profila** (poseban `userData` podfolder, ideja iz `Istrazivanje.md:114`) — P3, samo ako korisnik deli računar; utiče na XP po profilu. Uticaj N, napor S.

### 10.2 Offline režim
- **Oni:** čuvanje metapodataka/slika izabranih serija i offline platforma sa kasnijim uploadom izmena (`seanime/internal/local/manager.go:147`, `seanime/internal/local/sync.go:144`, `seanime/internal/platforms/offline_platform/offline_platform.go:31`).
- **Mi:** AniList keš sa posterima u base64 na disku i `getCached` bez mreže (`00 §1.8`); semafor ima stanje `offline` koje blokira strim, a preuzete epizode i dalje rade (`00 §6.1 #6`); sve liste su lokalne (`00 §1.9`).
- **Razlika:** pošto nemamo nalog, „offline” nam je već podrazumevano stanje za listu i statistiku. Seanime-ov offline modul rešava problem koji imamo tek ako uvedemo AniList sync — tada je dovoljan **red izmena za push** (sekcija 3).
- **Preporuka:** jasna poruka/baner „Offline — preuzete epizode i dalje rade” sa prečicom na Preuzimanja. Fajlovi: `src/renderer/components/Semaphore.jsx`, `HomePage.jsx`. Uticaj S, napor N.

### 10.3 Discord Rich Presence
- **Oni:** sopstveni IPC klijent (`seanime/internal/discordrpc/ipc/ipc_windows.go:13`), `Presence` (`seanime/internal/discordrpc/presence/presence.go:36`); aktivnost nosi i **naziv epizode** (`presence.go:284-300`, polje `EpisodeTitle`); podešavanja: uključi, anime/manga, dugmad, naslov u statusu (`models.go:259-267`).
- **Mi:** nema.
- **Preporuka:** P2 — naslov + „EP n/m”, poster sa AniList-a, **nikad naziv epizode** (spojler — za razliku od Seanime-a), podrazumevano isključeno. Izvor događaja već postoji: `event:player-open/close` (`00 §1.4`). Fajlovi: novi `src/main/discordPresence.js`, `src/main/internalPlayer.js`/`watchService.js`, Settings. Uticaj S, napor N–S. Rizik: nova zavisnost (licenca `@xhayper/discord-rpc` proveriti — `Istrazivanje.md:105`) ili ~150 linija sopstvenog IPC klijenta preko named pipe-a (`\\.\pipe\discord-ipc-0`); greške moraju biti tihe (Discord nije pokrenut).

### 10.4 Command palette
- **Oni:** „Sea Command”, prečice `meta+j` i `q` (`seanime/seanime-web/src/app/(main)/_features/sea-command/sea-command.tsx:25`), `S` za pretragu (`:114`), `mousetrap` (`:18`); komande za navigaciju, pretragu, `/spoilers` (`sea-command-spoilers.tsx:22`).
- **Mi:** prečice postoje samo u plejeru (`00 §4.4`) i F11 (`src/main/fullscreen.js:3`); nema routera (`00 §1.7`), ali je navigacija jedno stanje `page` (`src/renderer/App.jsx:49` prema 00), pa je paleta jednostavna.
- **Preporuka:** P2 — `Ctrl+K`: idi na stranicu, otvori seriju iz watchlist-e (fuzzy po naslovu), „Nastavi” poslednju, „Pretraži ani-cli: …”. Bez nove biblioteke (jedan `keydown` listener + modal, focus-trap — postojeći dug sa dijalozima `00 §6.1 #15`). Fajlovi: nova `src/renderer/components/CommandPalette.jsx`, `App.jsx`, i18n. Uticaj S, napor S. Rizik: sukob sa prečicama plejera — paleta isključena dok je plejer otvoren.

### 10.5 Skrivanje spojlera
- **Oni (od v3.7):** `HideAnimeSpoilers` + posebno za thumbnailove, naslove, opise epizoda i „skip next episode” (`seanime/internal/database/models/models.go:415-419`); režim „blur” ili „replace” i izuzetak po seriji (`seanime/seanime-web/src/lib/theme/anime-spoilers.ts:8-27,40-60`), stanje po epizodi u odnosu na odgledani progres (`:100`).
- **Mi:** opis serije je sakriven iza dugmeta „Prikaži opis” (`src/renderer/pages/AnimeDetail.jsx:95-99`); epizode nemaju naslove ni slike jer ani-cli daje samo brojeve (`00 §5.4`) — dakle trenutno **nema površine za spojlere epizoda**.
- **Razlika:** danas smo „bezbedni po dizajnu”. Rizik nastaje čim dodamo: thumbnailove/naslove epizoda (ani.zip), Discover opise, preporuke, Discord, notifikacije.
- **Preporuka:** P1 kao **pravilo**, ne kao feature: svaka nova površina sa tekstom epizode/opisa dolazi sa podrazumevano skrivenim sadržajem za neodgledano (kao Seanime `hideAnimeSpoilerTitles/Descriptions/Thumbnails`), plus jedan prekidač „Prikaži spojlere” po seriji. AniList tagove sa `isMediaSpoiler`/`isGeneralSpoiler` nikad ne prikazivati (`Istrazivanje.md:126,181`). Fajlovi: `src/main/settings.js` (jedan ključ `hideSpoilers: true`), `src/main/library.js` (opcioni `showSpoilers` po unosu). Uticaj V (pravilo projekta), napor N.

### 10.6 Random epizoda
- **Oni:** `StartRandomVideo` bira nasumično među serijama koje **nisu završene**, i to **prvu neodgledanu** lokalnu epizodu — ne nasumičnu epizodu iz sredine (`seanime/internal/library/playbackmanager/play_random_episode.go:19-70`). To je bezbedno za spojlere.
- **Mi:** nema.
- **Preporuka:** P3 — „Iznenadi me”: nasumična serija iz `watching`/`planned`, pa `nextEpisode(entry)` (`src/shared/domain.js:15-21`) — isti princip, bez preskakanja unapred. Fajl: `HomePage.jsx` (dugme u heru). Uticaj N, napor N.

### 10.7 Statistika
- **Oni:** AniList statistika naloga — broj, minuti, epizode, prosečna ocena, žanrovi, formati, statusi, studiji, ocene, godine početka/izlaska (`seanime/internal/api/anilist/stats.go:14-26,40`), prikaz `seanime/seanime-web/src/app/(main)/lists/_containers/anilist-stats.tsx:56`. **Traži AniList nalog**; nema XP-a, nivoa, nizova dana ni dostignuća (pretraga `xp|achievement|streak|levelUp` u `internal/` i `seanime-web/src` ne nalazi ništa osim liste AniList tagova u `advanced-search-constants.ts`).
- **Mi:** lokalno iz `watchLog`: epizode, sati, završene serije, prosečna ocena, top 5 žanrova, niz dana, aktivnost 28 dana, XP i nivoi sa titulama (`src/shared/stats.js:1-74` prema `00 §2 Gamifikacija`), profil (`src/renderer/pages/ProfilePage.jsx` — `00 §2 Profil`).
- **Preporuka:** P2 — dodati **raspodelu ocena** i **formate/godine** (iz AniList keša, bez mreže) i **dostignuća** (bedževi; čista logika u `src/shared/stats.js`, TDD; ideja iz `Istrazivanje.md:116`). Bedževi ne smeju da otkrivaju sadržaj serija. Uticaj S, napor N–S.

---

## 11. Gde smo MI bolji / jedinstveni

| Oblast | Mi | Seanime | Ref |
|---|---|---|---|
| **Gamifikacija** (XP, nivoi, titule, level-up animacija, zvuci, toast „serija završena”) | Da | Nema (pretraga u kodu bez pogodaka) | `00 §2 Gamifikacija`; sekcija 10.7 |
| **Instalacija alata bez ručnog rada** (wizard, preuzimanje sa GitHub-a, atomska zamena, rollback, EPERM/EBUSY retry) | Da | Korisnik sam instalira i konfiguriše mpv/VLC/qBittorrent (uputstva u dokumentaciji) | `00 §2 Setup wizard`, `src/main/toolManager.js:32-57,78-105` (prema 00); `02 #1.5` |
| **Semafor zdravlja izvora** (missing → offline → self-test pravim upitom → ažuriranje → source-down, ponovna provera na 6 h) | Da | U katalogu nema ekvivalenta self-testa izvora | `00 §2 HealthCheck`; `02` (katalog) |
| **Jedan održavani izvor** (originalni ani-cli, bez scrapera u repou) | Da | Ekstenzije/scraperi trećih strana | `00 §7`; sekcija 8 |
| **Release pipeline** (release skripta sa proverama, draft → SHA-256 → Latest, instalacija samo na klik, „Šta je novo” jednom po verziji) | Da | Self-update sa kanalima; provera checksum-a u `internal/updater/` nije nađena (pretraga `sha512|sha256|checksum`, 0 pogodaka) | `00 §7`; `02 #1.9` |
| **Lične beleške po epizodi i ocena bez naloga** | Da | Skor/progres preko AniList/lokalnog naloga, bez beleški po epizodi u katalogu | `src/main/library.js:76-85`; `02 #4.1` |
| **Bezbednosni model desktop aplikacije** (sandbox, CSP, lokalni serveri na 127.0.0.1 sa tokenom) | Da, jednostavno | Server model sa lozinkom, secure mode, TLS — složenije jer je mrežni server | `00 §7`; `02 #2.1–2.4` |
| **Sr/en i18n sa testom pariteta ključeva** | Da | — (nije analizirano u ovoj oblasti) | `00 §2 i18n` |
| **Spojler-bezbednost po dizajnu** (opis iza dugmeta, bez naslova epizoda) | Da | Opcija (v3.7+), podrazumevano nije uključena — nije provereno koja je podrazumevana vrednost | `AnimeDetail.jsx:95-99`; `models.go:415` |

Ove prednosti treba čuvati: nijedna nova funkcija ne sme da uvede ručnu instalaciju, ekstenzije, mrežni server ili spojlere.

---

## 12. Prioritizovana lista (P0–P3)

Uticaj/napor: V/S/N. „Zavisi od” = mora pre.

### P0 — odmah, mali napor, štiti postojeće
| # | Feature | Uticaj | Napor | Glavni fajlovi |
|---|---|---|---|---|
| P0.1 | **Pravilo „spojleri skriveni po podrazumevanju”** za sve nove površine (ključ `hideSpoilers`) | V | N | `src/main/settings.js`, buduće komponente (10.5) |
| P0.2 | **OS notifikacija „preuzimanje završeno/neuspelo”** + `setAppUserModelId` + podešavanje | S | N | `src/main/index.js`, `src/main/settings.js`, `SettingsPage.jsx` (7.1) |
| P0.3 | **Dedup u `enqueue`** + **„Ponovi neuspele”** | S | N | `src/main/downloads.js`, `DownloadsPage.jsx` (2, 6) |
| P0.4 | `recordWatched` ne završava seriju preskakanjem na poslednju epizodu (ili traži potvrdu) | S | N | `src/main/library.js:97` (1) |

### P1 — sledeća verzija (v0.6 kandidati)
| # | Feature | Uticaj | Napor | Zavisi od |
|---|---|---|---|---|
| P1.1 | **Modul „airing”** (AniList `nextAiringEpisode`, batch, keš) + **notifikacija „nova epizoda”** + zvonce | V | S | P0.1, P0.2 |
| P1.2 | **Tray + zatvori u tray + autostart + single-instance** | S | N–S | — (preduslov za P1.1/P2.1 u pozadini) |
| P1.3 | **„Propušteni nastavci”** šina na Početnoj | V | S | P0.1 |
| P1.4 | **Uvoz liste sa AniList-a po korisničkom imenu** (bez XP-a za uvezeno) | V | S | — |
| P1.5 | **Watchlist: pretraga, brojači, sortiranje po napretku/dodavanju, filter po žanru** | S | N | — |
| P1.6 | **Sekcija „Podaci”**: izvoz/uvoz backup-a, otvori folder, obriši keš | S | N | — |

### P2 — posle toga
| # | Feature | Uticaj | Napor | Zavisi od |
|---|---|---|---|---|
| P2.1 | **Auto-preuzimanje novih epizoda** (prekidač po seriji, retry na `episode-not-released`) | V | S–V | P1.1, P1.2, P0.3 |
| P2.2 | **AniList prijava (PIN token, `safeStorage`) + push progresa/ocene/statusa** sa redom za offline | V | S–V | P1.4, ručna potvrda `aniListId` |
| P2.3 | **Command palette `Ctrl+K`** | S | S | — |
| P2.4 | **Discord Rich Presence** (bez naziva epizode, podrazumevano isključeno) | S | N–S | P0.1 |
| P2.5 | **Discover šine** (trending / ova sezona) + **preporuke po žanru** | S | S | P0.1 |
| P2.6 | **Statistika+**: raspodela ocena, formati/godine, **dostignuća** | S | N–S | — |
| P2.7 | **Tagovi/custom liste** u watchlist-i | S | S | P1.5 |
| P2.8 | **Lagani re-index foldera preuzimanja** | S | N–S | P0.3 |

### P3 — možda, na zahtev
| # | Feature | Uticaj | Napor |
|---|---|---|---|
| P3.1 | Status „ponovo gledam” + `startedAt/completedAt` (korisno tek uz P2.2) | N–S | S |
| P3.2 | „Iznenadi me” (random serija → sledeća neodgledana epizoda) | N | N |
| P3.3 | Više profila (`userData` po profilu) | N | S |
| P3.4 | MAL sinhronizacija (PKCE, refresh token) | N | V |
| P3.5 | Raspored home ekrana / akcent boja | N | S |

---

## 13. Ne preuzimati (sa razlozima)

| Seanime feature | Razlog |
|---|---|
| **Ekstenzije, marketplace, plugin/hook sistem** (`02 #15.x`) | Scraperi u aplikaciji = pravni rizik i krhkost izvora; tuđi JS ruši naš sandbox/CSP model; ogroman obim (sekcija 8). |
| **Manga** (`02 #14.x`) | Van fokusa; traži izvore preko ekstenzija i čitač (sekcija 5). |
| **Puni skener lokalne biblioteke + matcher, pravila, watcher, Library Explorer, Super Update** (`02 #3.1–3.18`) | Rešavaju proizvoljna imena torrent fajlova; ani-cli imenuje fajlove predvidljivo. Dovoljan je lagani re-index (P2.8). |
| **Torrent/RSS deo Auto Downloader-a** (grupe, seederi, veličina, profili skora, delay za bolju verziju, simulacija) (`02 #13.x`) | Nema torrenta; ani-cli vraća izvor po kvalitetu, a kvalitet/sub-dub već imamo po seriji. Zadržati samo jezgro (P2.1). |
| **Nakama, Cloud Rooms, watch party, deljenje biblioteke, UPnP** (`02 #17.x`) | Traži mrežni server/relay; naši serveri namerno slušaju samo na `127.0.0.1`; jedan korisnik. |
| **Server mod, lozinka, TLS, secure mode, remote access, PWA** (`02 #2.x`, `#19.8`) | Desktop aplikacija bez mrežnog izlaganja — dodaje napadnu površinu bez koristi. |
| **Offline platforma sa sinhronizacijom** (`02 #18.x`) | Lista nam je već lokalna; dovoljan je red izmena uz AniList push (P2.2). |
| **20 tabova podešavanja, custom CSS, pozadinske slike** (`02 #20.2`) | Jedna stranica sa sekcijama je dovoljna; custom CSS bi zaobišao test „bez hex boja van `:root`” (`00 §3.1`). |
| **Naziv epizode u Discord statusu i notifikacijama** (`presence.go:284-300`) | Spojler rizik — pravilo projekta. |
| **Napredna AniList pretraga sa svim filterima** (`02 #5.1`) | Rezultat ionako mora kroz ani-cli; dovoljno je nekoliko šina + filter na ani-cli rezultatima. |
| **Issue recorder sa session replay-em, pprof, feature flags** (`02 #21.2–21.5`) | Projekat jednog korisnika; „Otvori folder podataka/logova” (P1.6) je dovoljan. |

