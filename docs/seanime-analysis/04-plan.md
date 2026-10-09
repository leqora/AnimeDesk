# 04 — Gap analiza i plan unapređenja (Seanime → AnimeDesk)

Datum: 2026-10-09. Osnova: `00-nas-projekat.md`, `01-seanime-arhitektura.md`, `02-seanime-features.md` i šest analiza `03-oblast-*.md` (u zagradi `[03-player]`, `[03-izvori]`, `[03-epizode]`, `[03-ui]`, `[03-ostalo]`, `[03-perf]` — tamo su sve reference `seanime/…:linija` i `src/…:linija`).
Referenca: Seanime commit `2da73d9` (2026-09-20), GPL-3.0 — **samo inspiracija, bez kopiranja koda**.

Status: **plan čeka odobrenje — nijedna linija koda nije menjana.**

Legenda: Status = nemamo / slabije / jednako / bolje (iz ugla AnimeDesk-a). Uticaj i Napor = V (visok) / S (srednji) / N (nizak).

Stavke označene ✔ su lično proverene u kodu tokom pisanja plana (ne samo preuzete od analitičara).

---

## 1. Tabela poređenja

### Player
| Feature / oblast | Seanime | Mi | Status | Uticaj | Napor |
|---|---|---|---|---|---|
| Ikone kontrola | Sve rade | 7 dugmadi bez ikone (`Icon.jsx` mapa) ✔ | slabije (bag) | V | N |
| Prečice | ~25, prilagodljive | 8 fiksnih; prestaju posle klika na klizač (`PlayerView.jsx:107`) ✔; `e.key` zavisi od rasporeda | slabije (bag) | S | N |
| Indikator učitavanja/baferovanja | Overlay + detekcija zastoja (12 s) | Crn ekran do prvog kadra | nemamo | V | N |
| Oporavak od greške | Refresh URL → sledeći server → sledeći provider | 3 retry-ja hls.js nad istim URL-om, pa mpv dugme | slabije | V | S |
| Titlovi | ASS preko JASSUB (libass WASM), offset, stil, više staza | Samo VTT (sve se šalje kao `text/vtt`) | slabije | S | N (SRT, offset) / S–V (ASS) |
| Pamćenje jačine / mute | Da | Ne | nemamo | S | N |
| Dvoklik = fullscreen, brzina, PiP, Media Session | Da | Ne | nemamo | S | N |
| Izbor kvaliteta u plejeru | Meni kvaliteta | Ne; ani-cli daje samo jednu varijantu (`ani-cli:367`) | slabije | S | S (preko debug probe) |
| Prikaz stvarne rezolucije | Da | Ne; ani-cli tiho spušta na `best` (`ani-cli:239`) | nemamo | V | N |
| Skip intro/outro | AniSkip + poglavlja + markeri na traci | AniSkip + dugmad + auto-skip (i u mpv-u) | jednako | — | — |
| Auto-next | Bez odbrojavanja | Odbrojavanje 10 s + kartica | **bolje** | — | — |
| Prefetch sledeće epizode | Samo za torrent strim | Ne; ceo ani-cli tok iznova | jednako (online) | V | S–V |
| Resume | Jedan zapis po seriji, bez pitanja, 5–90 % | Po epizodi, sa pitanjem | **bolje** u ugrađenom; mpv ne čuva poziciju | S | N |
| „Odgledano” | Na 80 % u toku gledanja | Pri zatvaranju plejera (pad aplikacije = gubitak) | slabije | S | N–S |
| Spoljni plejeri | mpv/VLC/MPC-HC/IINA + libmpv u prozoru | mpv + uosc + IPC auto-skip | slabije u širini, dovoljno | N | — |
| Proxy strima | Prima bilo koji URL (nema allow-list) | Token + allow-list po reprodukciji | **bolje** | — | — |

### Izvori i kvalitet
| Feature / oblast | Seanime | Mi | Status | Uticaj | Napor |
|---|---|---|---|---|---|
| Kvalitet online strima | Isti tip sajtova preko ekstenzija | ani-cli, jedan provider, jedan embed | jednako | — | — |
| Kvalitet preko torrent/debrid | BD release-ovi, rangiranje po grupi/kodeku/seederima | — | nemamo (van opsega) | — | — |
| Fallback izvora | Server → provider → URL refresh | Nema | slabije | V | S |
| Greška „nema izvora za sub” | — | Prikazuje se kao `unknown` | slabije | S | N |
| Tačan izbor kvaliteta | — | Neusidren `grep` (`ani-cli:237`), rešivo sa `^720p` | slabije | S | N |

### Epizode i raspored
| Feature / oblast | Seanime | Mi | Status | Uticaj | Napor |
|---|---|---|---|---|---|
| Lista dugih serija | Paginacija 24/strani, grid bez grupa | Grupe od 100 + „idi na epizodu” | **bolje** | — | — |
| Kartice epizoda (sličica, naslov, trajanje) | Da (animap, ani.zip fallback) | Samo brojevi | nemamo | V | S |
| Spoiler zaštita | Opcija, podrazumevano isključena, rupe (popover, tooltip, CSS blur) | Ne prikazujemo ništa iz radnje (jer nemamo metapodatke) | jednako sada; preduslov za sve dalje | V | S |
| Progres po epizodi na karticama | Traka + „Xm left” | Pozicije čuvamo, ne prikazujemo | slabije | V | N–S |
| Stvarna lista epizoda | Iz izvora | Detalj prikazuje sintetičko `1..max` | slabije | V | S |
| AniList keš | TTL + `singleflight` | Nikad ne zastareva (`anilist.js:162`) ✔ | slabije (bag) | V | N |
| Raspored / „sledeća izlazi” | Kalendar (traži nalog) | Nema | nemamo | V | N |
| Filler/recap | Scraper animefillerlist (bez recap-a) | Nema | nemamo | S | S |
| Sezone / relacije | Direktne relacije | Nema | nemamo | S–V | S |

### UI / dizajn
| Feature / oblast | Seanime | Mi | Status | Uticaj | Napor |
|---|---|---|---|---|---|
| Kartica | Bedževi na posteru, traka, gradijent, fade-in | Tekst ispod postera, bez bedževa, glow bez prelaza ✔ | slabije | V | S |
| Identitet (glass/neon, 3 fonta, boja po posteru) | Neutralan, Inter | Jak, prepoznatljiv | **bolje** | — | — |
| Navigacija (nazad, skrol) | Router, istorija | Nema istorije ni pamćenja skrola | slabije | V | S |
| Dijalozi (a11y) | Radix (fokus, Esc) | Bez `aria-modal`, focus-trap, Esc u AskDialog | slabije | V | S |
| Toastovi / tooltipovi / kontekst meni | Sonner red, tooltipovi, meni | Jedan toast bez tipova | slabije | S | S |
| Reduced motion, zvuk, level-up | Po komponentama, bez zvuka | Globalno + zvuk | **bolje** | — | — |

### Ostali feature-i
| Feature / oblast | Seanime | Mi | Status | Uticaj | Napor |
|---|---|---|---|---|---|
| Obaveštenje o novoj epizodi | **Nema** | Nema | jednako — šansa da budemo bolji | V | S |
| OS notifikacije (preuzimanje) | Za auto-download | Samo zvuk | nemamo | S | N |
| Tray / autostart / single instance | Da (Denshi) | Ne | nemamo | S | N–S |
| AniList sinhronizacija | OAuth + PIN token, red za offline | Samo slike/opisi | nemamo | V | S–V |
| Uvoz liste | Kroz nalog | Ne | nemamo | V | S |
| Auto-download | Pravila, profili (torrent) | Ne | nemamo | V | S–V |
| Watchlist filteri/pretraga | Bogati | Osnovni | slabije | S | N |
| Gamifikacija (XP, nivoi, statistika) | Nema | Ima | **bolje** | — | — |
| Wizard alata + semafor sa self-testom | Ne | Ima | **bolje** | — | — |
| Release pipeline (SHA-256, draft→latest) | Bez checksum provere u updateru | Ima | **bolje** | — | — |
| Ekstenzije, manga, Nakama, server mod | Ima | Nema | nije cilj (vidi §6) | — | — |

### Performanse i kod
| Feature / oblast | Seanime | Mi | Status | Uticaj | Napor |
|---|---|---|---|---|---|
| Minifikacija | Da | **Ne** — 2,07 MB, minifikovano ~0,97 MB (izmereno) ✔ | slabije (bag) | S | N |
| Code splitting | Auto, hls u posebnom chunk-u | Sve u jednom (hls.js ≈62 %) | slabije | S | N |
| Statistika | — | Računa se na svaku promenu stranice (`App.jsx:80`) ✔ | slabije (bag) | S | N |
| Error boundary / obrada grešaka | Dva nivoa, centralni toast, log fajl | Nema boundary-ja; `main()` i `settings.get` bez `catch` | slabije | V | N |
| Keš postera | React Query + CDN + lazy | base64 kroz IPC na svaki mount, bez keša | slabije | V | N (keš) / S (fajlovi) |
| Main-process I/O | Poseban Go proces | Sinhroni upisi (pozicija na 5 s, napredak po liniji) | slabije | S | N–S |
| Pokretanje | — | Self-test (pravi upit, do 30 s) blokira pretragu | slabije | V | S |
| Testovi | Go testovi, TS tipovi | 486 testova, više linija testa nego koda; bez tipova | **bolje** testovi / slabije tipovi | — | — |

---

## 2. Quick wins (veliki uticaj, mali napor)

| # | Šta | Fajlovi | Zašto |
|---|---|---|---|
| QW1 | **Ikone plejera** — 7 imena u `ICONS` + test „svako korišćeno ime postoji” | `src/renderer/components/Icon.jsx`, `tests/unit/` | Vidljiv bag u objavljenoj 0.5.0 |
| QW2 | **Minifikacija renderera** (`build.minify: 'esbuild'`) | `electron.vite.config.mjs` | −53 % bundle-a jednom linijom |
| QW3 | **Mreža sigurnosti za greške**: `ErrorBoundary`, `catch` u `main()` i za `settings.get`, `unhandledRejection` | `src/renderer/App.jsx`, `src/main/index.js`, nova `ErrorBoundary.jsx` | Danas jedna greška = prazan prozor |
| QW4 | **Plejer polish**: prečice (`input:not([type=range])`, `e.code`, filter Ctrl/Alt), spinner učitavanja, pamćenje jačine/mute, dvoklik = fullscreen | `PlayerView.jsx`, `styles.css`, `settings.js`, i18n | Najviše osećaja „pravog” plejera za najmanje koda |
| QW5 | **Transparentan kvalitet**: bedž stvarne rezolucije + upozorenje kad ani-cli spusti na `best` + greška `no-sources` sa „Pokušaj ponovo” | `PlayerView.jsx`, `playerMonitor.js`, `watchService.js`, `aniCliBridge.js`, i18n | Odgovara na pitanje „zašto je kvalitet lošiji” bez diranja ani-cli-ja |

Odmah iza: statistika `[api, page]` → `[api]` (jedna reč), TTL za AniList keš, dedup u redu preuzimanja.

---

## 3. Prioritizovan roadmap

Svaka stavka ide kroz TDD i po pravilima iz `CLAUDE.md`; veće (★) kroz brainstorming → spec → plan.

### P0 — bagovi i plejer (predlog: v0.5.1 hotfix + v0.6 „plejer”)

**P0-A. Hotfix paket (v0.5.1)**
| Stavka | Fajlovi | Pristup | Rizici |
|---|---|---|---|
| QW1 ikone | `Icon.jsx` + test | Dodati imena; test skenira `name="…"` u `src/renderer` i proverava mapu | Nema |
| QW2 minifikacija | `electron.vite.config.mjs` | `renderer.build.minify: 'esbuild'` | Stack trace-ovi manje čitljivi → `sourcemap: 'hidden'` po želji |
| Statistika | `App.jsx:80` | Zavisnost `[api]`; keš snapshot-a u main-u kasnije (P1) | Profil se ne osveži posle gledanja? — već pokriva `onLibraryChanged` |
| QW3 greške | `App.jsx`, `index.js`, `ErrorBoundary.jsx` | Boundary oko sadržaja i posebno oko plejera; poruka + „Ponovo učitaj” | Nema |
| Prečice | `PlayerView.jsx:105-125` | Isključiti samo tekstualna polja; `blur` klizača posle promene; `e.code` | Testovi koji šalju `key` treba dopuniti `code` |
| AniList keš TTL | `anilist.js` | TTL za serije koje se emituju (npr. 1 dan), završene duže; povećati `SEARCH_VERSION` nije potrebno (to je za promašaje) | Više AniList zahteva — red već poštuje 429 |
| Dedup u redu preuzimanja + „Ponovi neuspele” | `downloads.js`, `DownloadsPage.jsx` | Ključ `naslov:epizoda:mode` | Nema |
| **Odluka:** `library.js:97` | `library.js` | Završeno tek kad su sve epizode odgledane, ili pitati | Promena ponašanja — **ti biraš** |

**P0-B. Plejer (v0.6)**
| Stavka | Fajlovi | Pristup | Rizici |
|---|---|---|---|
| QW4 polish (spinner, jačina, dvoklik) | `PlayerView.jsx`, `styles.css`, `settings.js` | `waiting`/`playing`/`canplay` događaji; jačina u settings | Nema |
| QW5 kvalitet (bedž, upozorenje, `no-sources`) | `PlayerView.jsx`, `playerMonitor.js`, `watchService.js` (`onLine`), `aniCliBridge.js` | `videoHeight` posle `loadedmetadata`; mpv `height` preko IPC; tolerantan regex na stderr | Tekst ani-cli poruka se može promeniti — izostanak ne sme ništa da pokvari |
| Detekcija zastoja + „Pokušaj ponovo” (svež link, nastavak od pozicije, max 1 automatski po epizodi) | `PlayerView.jsx`, `App.jsx`, `watchService.js` | Po uzoru na njihov ciklus: refresh URL-a = nova ani-cli sesija | Petlje ponovnih pokušaja → obavezan limit |
| hls.js oporavak (`recoverMediaError`, `swapAudioCodec`) + proxy retry/timeout segmenta | `PlayerView.jsx`, `streamServer.js` | Standardni hls.js obrazac | Nema |
| Titlovi: SRT→VTT (strim i lokalni `.srt`), offset (prečice), stil preko `::cue` tokena | `streamServer.js`, novi `src/shared/subtitles.js`, `PlayerView.jsx`, `styles.css` | Detekcija formata po sadržaju, ne po ekstenziji | Prvo zabeležiti šta izvori zaista šalju |
| Nastavak u spoljnom mpv-u | `playerMonitor.js`, `watchService.js`, `positions.js` | `time-pos` već pratimo → čuvati; `--start=` pri pokretanju | Nema |
| „Odgledano” na pragu tokom gledanja | `internalPlayer.js`, `watchService.js` | Upis kad pređe prag (ne čekati zatvaranje) | XP se ne sme dodeliti dvaput |
| Normalizacija AniSkip intervala | `aniskip.js` | Spajanje preklapanja, odsecanje na trajanje | Nema |
| Lazy `PlayerView` | `App.jsx` | `React.lazy` + `Suspense` | Prvo otvaranje plejera ~100 ms sporije |
| Brzina reprodukcije + meni podešavanja; tooltip vremena + buffered traka | `PlayerControls.jsx`, `PlayerView.jsx` | — | Nema |
| Razbiti `PlayerView` na hook-ove (pre većih dodataka) | `src/renderer/player/*` | `useHls`, `useShortcuts`, `useProgress` | Refaktor — oslanjamo se na postojeće testove |
| ★ Prefetch sledeće epizode (od ~80 %, `debug` sesija, TTL) | `watchService.js`, `aniCliBridge.js`, `internalPlayer.js` | Poseban spec | Linkovi ističu; dodatni zahtevi ka sajtu |

### P1 — dizajn kartica i epizoda (v0.7)
| Stavka | Fajlovi | Pristup | Rizici |
|---|---|---|---|
| ★ **Spoiler model** `isSpoiler()` — podrazumevano uključen, režim „ne renderuj” (ne blur), otkrivanje po seriji/epizodi | `src/shared/spoilers.js`, `seriesPrefs.js`, `settings.js`, `SettingsPage.jsx` | **Mora pre** svakog naslova/sličice/opisa epizode | Svaka nova površina mora kroz njega — test koji to proverava |
| ★ Redizajn kartice (bedž „3/12”, traka na posteru, „emituje se”, gradijent, skeleton + fade-in, glow na `::after`) — spec u `[03-ui] §10` | `Poster.jsx`, `SeriesCard.jsx`, novi `MediaCard.jsx`, `styles.css` (novi tokeni `--card-ratio`, `--badge-bg`, `--status-*`, `--dur*`) | Zadržati glass/neon i boju po posteru | `styles.test.js` proverava samo prvi `:root` |
| Progres po epizodi na karticama i pilulama („ostalo X min”) | `positions.js`, `ipc.js`, `preload`, `SeriesCard.jsx`, `EpisodePicker.jsx` | Podaci već postoje | Nema |
| Keš stvarne ani-cli liste epizoda; detalj koristi nju umesto `1..max` | `library.js`/`seriesPrefs.js`, `watchService.js`, `AnimeDetail.jsx` | Puni se pri svakom ani-cli prolazu | Lista zastareva za serije koje se emituju |
| „Sledeća epizoda izlazi …” + bedž „N novih” (samo broj) | `anilist.js` (`status`, `nextAiringEpisode`), `AnimeDetail.jsx`, `SeriesCard.jsx`, `HomePage.jsx` | Tekst „emitovana”, ne „dostupna” | Emitovanje ≠ dostupno na izvoru |
| Header detalja (meta, žanrovi, akcije u baneru) | `AnimeDetail.jsx`, `styles.css` | — | Nema |
| Istorija navigacije (Nazad, `Alt+←`, miš 4) + pamćenje skrola | `App.jsx`, stranice | Mini stek u `App.jsx`, bez routera | Nema |
| Zajednički `Modal.jsx` (aria-modal, fokus, Esc, vraćanje fokusa) | `AskDialog.jsx`, `WhatsNewDialog.jsx`, `SetupWizard.jsx` | — | Esc u dijalogu ne sme izaći iz fullscreen-a (već rešeno, sačuvati) |
| Red toastova sa tipovima + „Poništi”; stilizovan scrollbar | `Toast.jsx`, `App.jsx`, `styles.css` | — | Nema |
| Keš postera u rendereru + dedup u main-u | `Poster.jsx`, `anilist.js` | Map obećanja | Nema |

### P2 — novi feature-i (v0.8+)
| Stavka | Fajlovi | Pristup | Rizici |
|---|---|---|---|
| ★ Obaveštenja o novoj epizodi (airing modul + Electron `Notification` + zvonce) — **ovde smo bolji od Seanime-a** | novi `src/main/airingWatcher.js`, `settings.js` | Jedan AniList upit za sve serije; bez naziva epizode | Zavisi od TTL keša i spoiler modela |
| Tray, zatvori u tray, autostart, single-instance, `setAppUserModelId` | `src/main/index.js` | Preduslov za rad u pozadini | Korisnik mora moći da isključi |
| OS notifikacija „preuzimanje završeno/neuspelo” | `index.js`, `downloads.js` | — | Nema |
| „Propušteni nastavci” šina (SEQUEL za završene, spoiler-bezbedno) | `anilist.js`, `HomePage.jsx` | Samo poster + naslov + format | Naslov nastavka može biti spojler → skriveno dok serija nije završena |
| Uvoz liste sa AniList-a po korisničkom imenu (bez XP-a za uvezeno) | `anilist.js`, `library.js`, `SettingsPage.jsx` | Javni upit, bez prijave | Pogrešno mapiranje naslova → ručna potvrda |
| Watchlist: pretraga, brojači po statusu, sort, filter žanra; sekcija „Podaci” (backup, keš) | `WatchlistPage.jsx`, `SettingsPage.jsx` | — | Nema |
| Proba kvaliteta (`debug` režim) → izbor rezolucije u EpisodePicker-u, tačan izbor `^<h>p`, lista preferenci sa fallback-om | `aniCliBridge.js`, `EpisodePicker.jsx`, `settings.js`/`seriesPrefs.js` | Zvanični ani-cli režim, bez patcha | Dupli scrape pre puštanja |
| ★ Metapodaci epizoda (ani.zip) + režim „kartice” za epizode | novi `episodeMeta.js`, `episodeMap.js`, `EpisodeRow.jsx` | Mapiranje po broju; kad se ne slaže — ništa ne prikazivati | Spojleri (zavisi od P1 modela); rate limit ani.zip nije dokumentovan |
| Filler/recap oznake (Jikan, keš 30 dana, isključivo) | novi `fillerInfo.js`, `EpisodePicker.jsx` | Na zahtev | Jikan limit ~3/s |
| ★ Auto-preuzimanje novih epizoda (prekidač po seriji) | `downloads.js`, `library.js` | Retry na `episode-not-released`, interval ≥15 min | Opterećenje sajta |
| ★ AniList prijava (PIN token, `safeStorage`) + slanje progresa | `anilist.js`, `settings.js` | Samo za serije sa potvrđenim `aniListId`; pravilo „samo napred” | Pogrešan upis na tuđu seriju |
| Optimistično pokretanje (zapamćen uspešan self-test → odmah zeleno) | `healthCheck.js`, `index.js` | Test nastavlja u pozadini | Kratko „zeleno” dok izvor ne radi |
| Posteri kao fajlovi + URL umesto base64 kroz IPC; lazy učitavanje | `anilist.js`, `Poster.jsx`, CSP u `index.html` | `protocol.handle` | Migracija keša |
| Prigušen napredak preuzimanja; ređi/asinhroni upis pozicije | `downloads.js`, `DownloadsPage.jsx`, `jsonStore.js` | — | Nema |

### P3 — nice-to-have
- ASS/SSA preko JASSUB-a (tek ako se izmeri da izvori šalju ASS; CSP za WASM; licenca).
- Opcioni Anime4K profil za mpv.
- Nedeljni raspored (cover + broj, bez naslova epizoda).
- Command palette (`Ctrl+K`), kontekst meni na kartici, tooltipovi, preseti akcenta, View Transitions.
- Discord Rich Presence (bez naziva epizode, podrazumevano isključen).
- Discover šine (trending / sezona) + preporuke po žanru (`IDEJE.md`).
- Dostignuća i bogatija statistika; „Iznenadi me”.
- JSDoc + `@ts-check` od `src/shared`; `hls.js/light`; fontovi samo latin/latin-ext.
- Preview sličice na seek baru, prilagodljive prečice, mini plejer.

---

## 4. Šta NE preuzimati od Seanime-a

| Seanime | Zašto ne |
|---|---|
| Torrent strim, debrid, rangiranje po release grupama/seederima | Van pravila projekta (originalni ani-cli, bez novih izvora); pravni rizik. Jedini put do „BD kvaliteta”, ali nije naš put. |
| Ekstenzije, marketplace, plugin/hook sistem | Scraperi u aplikaciji = pravni rizik i krhkost; tuđi JS ruši naš sandbox/CSP model. |
| Izbor provajdera / više servera | ani-cli ima jedan provider i jedan embed server; zahtevalo bi patch ani-cli-ja. |
| Skener biblioteke + matcher | Rešava proizvoljna imena torrent fajlova; ani-cli imenuje predvidljivo — dovoljan je lagani re-index. |
| Nakama / watch party / server mod / PWA / remote | Jedan korisnik, desktop; naši serveri namerno slušaju samo na `127.0.0.1`. |
| Manga | Van fokusa. |
| 20 tabova podešavanja, custom CSS | Custom CSS zaobilazi pravilo „bez hex boja van `:root`”. |
| Naziv epizode u Discord statusu / notifikacijama | Spojler rizik. |
| Spoiler zaštita kao opcija sa CSS blur-om | Kod nas mora biti podrazumevana i bez renderovanja teksta. |
| Resume bez pitanja, jedan zapis po seriji | Naš model (po epizodi, uz pitanje) je jasniji. |
| Auto-next bez odbrojavanja | Naše odbrojavanje je bolje. |
| Video proxy bez allow-list-e | Naš je bezbedniji — zadržati. |
| React Query / jotai / virtualizacija lista | Za našu veličinu nepotrebno; dovoljan mali `useIpcQuery` i grupe od 100. |
| Transkodiranje, VLC/MPC-HC/IINA | Mali dobitak, veliki napor; mpv je dovoljan. |

---

## 5. Otvorena pitanja za korisnika
1. `library.js:97`: da li serija treba da bude „Završeno” čim se pogleda poslednja epizoda, ili tek kad su sve odgledane (ili uz pitanje)?
2. Da li P0-A ide kao zaseban hotfix **v0.5.1** (preporuka: da — ikone su vidljiv bag), pa plejer kao v0.6?
3. Spoiler model: da li otkrivanje naslova epizoda želiš po seriji, po epizodi, ili oba?

## 6. Odluke korisnika (2026-10-09)
1. `library.js:97` → serija je „Završeno” tek kad su **sve** epizode odgledane.
2. P0-A ide kao zaseban hotfix **v0.5.1**, plejer (P0-B) kao v0.6.
3. Spoiler model: otkrivanje **i po seriji i po epizodi**.
