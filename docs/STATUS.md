# AnimeDesk — stanje projekta

Poslednje ažuriranje: 2026-10-10. Trenutna verzija: **0.6.1** — objavljena 2026-10-10 (GitHub Release `v0.6.1`, Latest), spojena u `main`.

## Dokle smo stigli (ukratko)

- Objavljeno: 0.1.0 → 0.6.1 (12 izdanja, 2026-10-01 – 2026-10-10).
- Testovi: 65 fajlova, **621/621 prolazi** (0.6.1), e2e smoke prolazi.
- 2026-10-09: komparativna analiza Seanime-a → plan unapređenja u `docs/seanime-analysis/` (`04-plan.md` = roadmap P0–P3 sa odlukama korisnika). Iz nje je urađen hotfix 0.5.1 (P0-A).
- **v0.6.0 (objavljeno 2026-10-09):** P0-B koraci 1–3 — spinner/baferovanje, pamćenje jačine, dvoklik = pun ekran, bedž rezolucije + upozorenje o kvalitetu, poruka „nema ispravnih izvora” + „Pokušaj ponovo”, automatski oporavak zaglavljenog strima, retry/timeout u proxy-ju. Spec: `docs/superpowers/specs/2026-10-09-v0.6-player-design.md`. Beleške: `docs/releases/v0.6.0.md`.
- **v0.6.1 (objavljeno 2026-10-10, Latest):** P0-B korak 4 — titlovi: SRT→VTT (strim i lokalni `.srt`, i Windows-1250/UTF-16), pomak `G`/`H` po seriji i režimu (`series-prefs.json`), sopstveni overlay (veći na punom ekranu, zbijeni redovi), podešavanja sa živim pregledom, meni titlova u plejeru, dub podrazumevano bez titla, poruka za nepodržan format (ASS). Spec: `docs/superpowers/specs/2026-10-09-v0.6.1-subtitles-design.md`, plan: `docs/superpowers/plans/2026-10-09-v0.6.1-subtitles.md`. Beleške: `docs/releases/v0.6.1.md`.
- **Sledeće:** P0-B koraci 5–7 (nastavak u mpv-u + „odgledano” na pragu + AniSkip normalizacija; lazy `PlayerView` + brzina + buffered traka; prefetch) iz `docs/seanime-analysis/04-plan.md`.

## Gde smo stali (2026-10-10, kraj sesije) i kako dalje

### Stanje repoa
- v0.6.1 je objavljen kao **Latest** (GitHub Release `v0.6.1`: `.exe`, `.blockmap`, `latest.yml`, SHA-256 provereni). `main` = `origin/main`, radno stablo čisto, nema otvorenih `feat/` grana (`feat/v0.6.1-subtitles` spojena sa `--no-ff` i obrisana). Radni folder podagenata (`.superpowers/sdd/`, ignorisan u git-u) je obrisan; istorija je u `git log`.

### Šta je urađeno u sesiji 2026-10-09/10 (v0.6.1 titlovi)
- **Brainstorming — odluke korisnika:**
  1. cilj: zaštita (SRT) + offset i stil kao poboljšanje; izgled je smetao (titl premali na punom ekranu, veliki razmak između redova — zahtev iz `Claude/Anime/Aplikacija za gledanje Anime-a/Dodaci2.txt`: veličina 0–100 %, razmak redova, font, tamni okvir podrazumevano uključen);
  2. na **dub** epizodama titl podrazumevano **isključen**; uključeno/isključeno se pamti odvojeno za sub i dub (korisnik je primetio da na engleskom dub-u titlovi kasne ili ne odgovaraju);
  3. pomak titla se pamti **po seriji i režimu**;
  4. prikaz: **sopstveni overlay** (ne nativni `::cue`, ne JASSUB);
  5. izdanje **v0.6.1**.
- **Tok:** spec → plan (11 zadataka) → podagenti (implementer + pregled po zadatku; ispravke u zadacima 7, 9 i 11) → završni pregled cele grane (Opus) → jedan krug ispravki (dekodiranje lokalnog `.srt` Windows-1250/UTF-16, poruka 415 samo kad je titl uključen, strelice na klizaču u meniju ne premotavaju, dokumentacija) → merge `--no-ff` → push → `npm run release`.
- **Važne tehničke odluke (iz pregleda):** titl nove epizode se prikazuje tek kad se njen `<track>` učita (ne prikazuju se cue-ovi prethodne epizode); `Esc` zatvara meni titlova odakle god; prečice plejera rade i kad je fokus na prekidaču u meniju; nepodržan format se prepoznaje `HEAD` zahtevom na `/sub` (415); greška izvora titla (404/500) se prosleđuje, ne pretvara u 415.
- **Svesno ostavljeno (vidi „Poznati problemi” 10–11):** klizač veličine u meniju plejera upisuje na svaki korak; pomak je vezan za naziv u plejeru (strim i preuzeta epizoda iste serije mogu imati različit ključ). Takođe: HTML stranica sa statusom 200 umesto titla daje poruku „format nije podržan”; nema upravljanja fokusom u meniju titlova (a11y); Windows-1251 (ćirilični) `.srt` može imati pogrešna slova.

### Uživo neprovereno — korisnik proverava i javlja rezultat
- **0.6.1 titlovi:**
  1. **dub** epizoda sa pravim ani-cli-jem: titl na početku isključen; uključi (`S` ili dugme) → `G`/`H` poravnaju titl sa govorom; sledeća epizoda iste serije u dub-u zadrži pomak;
  2. **sub** epizoda strima: titl uključen, nov izgled (veći na punom ekranu, zbijeni redovi), iznad kontrola dok su vidljive — proveriti i **u prozoru** (mereno samo na punom ekranu);
  3. Podešavanja → Titlovi: veličina / razmak / font / boja / okvir menjaju i pravi plejer;
  4. (opciono) srpski `.srt` pored preuzete epizode, isto ime kao video — slova č/ć/š/ž/đ ispravna.
- **0.6.0 oporavak strima** (dogovoreno 2026-10-09, i dalje neprovereno):
  1. prava epizoda, posle ~1 min isključi Wi-Fi → kad se pojavi „Ponovno povezivanje…” (~12 s) uključi → nastavak od iste sekunde, bez „Nastavi od…”;
  2. ponovi u istoj epizodi → ekran sa „Pokušaj ponovo” / mpv / „Nazad” (bez drugog automatskog oporavka);
  3. „Pokušaj ponovo” sa tog ekrana → nastavak od iste pozicije;
  4. „Nazad” tokom „Ponovno povezivanje…” → povratak, bez sesije u pozadini;
  5. sledeća epizoda posle oporavka → normalan start (nov budžet, bez starog ekrana);
  6. spora mreža (npr. hotspot) → „Sporo učitavanje…” posle ~8 s;
  7. kvalitet koji izvor nema (npr. 1080 na starijem naslovu) → jednokratno obaveštenje + bedž stvarne rezolucije;
  8. `no-sources` — samo ako se slučajno pojavi: radi li „Pokušaj ponovo”.
- Rezultate upisati u „Šta je stvarno provereno”.

### Mini ispravke v0.6.2 — URAĐENO 2026-10-10 (grana `feat/v0.6.2-subtitle-polish`; odluke: razmak redova — nova skala: 0 % = line-height 1,40 (ispod toga se okviri prelomljenih redova preklapaju, javio korisnik), 100 % = 1,60, podrazumevano 0 %, `--sub-gap` = line − 1,4; sačuvane vrednosti se ne migriraju (korisnikovih 82 % sada daje 1,56 umesto 1,49), stari `M` prati novu podrazumevanu = 25, objava odmah kao v0.6.2)
1. **Podrazumevana veličina titla = 25** (umesto 40). Korisnik je u svojoj aplikaciji podesio veličinu na 25 i to želi kao podrazumevano (u njegovom `settings.json`: `size: 25`; tamo je i `lineSpacing: 82` — pitati korisnika da li i razmak redova treba da postane podrazumevan). Izmena: `DEFAULT_SUBTITLES.size` u `src/shared/subtitles.js` + testovi (`subtitles.test.js`, `settings.test.js`, očekivane vrednosti CSS varijable `--sub-size` u testovima; 25 → `2.5 + 0.25 × 5.5 = 3,88 cqh`). Postojeći korisnici zadržavaju svoju sačuvanu vrednost; prelazak sa starog `subtitleSize` (S/M/L → 20/40/65) ostaje kakav jeste ili se `M` usklađuje sa novom podrazumevanom — odlučiti u dizajnu.
2. **Meni titlova u plejeru je previše providan** — preko svetlog kadra se tekst u meniju („Resetuj”, „Veličina titlova”, vrednost pomaka) slabo vidi (snimak ekrana korisnika, Naruto kadar sa peskom). Uzrok: `.player__subs-menu` koristi `background: var(--glass-strong)` (= `rgba(255,255,255,0.10)`) + blur, pa svetla slika prolazi kroz meni. Izmena: tamna, skoro neprovidna pozadina (npr. `color-mix(in srgb, var(--bg) 92%, transparent)` ili novi token u `:root`), uz zadržan okvir; proveriti kontrast i za dugmad u meniju. Isto proveriti za ostale „staklene” panele preko videa (`.player__card`, `.player__flash`).

### Sledeći razvoj
- **P0-B korak 5:** nastavak sa pozicije u spoljnom mpv-u (`time-pos` već pratimo → `positions.js`, `--start=`); „odgledano” na pragu tokom gledanja (bez duplog XP-a); normalizacija AniSkip intervala. Zatim 6 (lazy `PlayerView` — hls.js ≈62 % bundle-a; brzina reprodukcije + meni; buffered traka + tooltip vremena; razbijanje `PlayerView` na hook-ove) i 7 (prefetch linka sledeće epizode — poseban spec). Detalji i fajlovi: `docs/seanime-analysis/03-oblast-player.md` (tabela „Top preporuke”) i `04-plan.md` §3.
- Isti tok: brainstorming → spec → plan → podagenti; nova grana `feat/v0.7-…` (ili `feat/v0.6.2-…` ako je obim mali); merge/push/release samo uz dozvolu korisnika.

Ovaj fajl je „predaja smene”: šta je urađeno, šta je stvarno provereno, šta je otvoreno. Detalji dizajna su u `docs/superpowers/specs/`, planovi u `docs/superpowers/plans/`, beleške izdanja u `docs/releases/`.

## Istorija verzija

| Verzija | Datum | Šta donosi | Spec / plan |
|---|---|---|---|
| 0.1.0 | 2026-10-01 | Prva verzija: ani-cli GUI (pretraga, epizode, mpv), watchlist sa ocenom/komentarom/beleškama, preuzimanje sa redom, semafor + wizard za alate, sr/en | `2026-09-30-animedesk-design.md` / `2026-09-30-animedesk.md` |
| 0.2.0 | 2026-10-02 | Redizajn (bočni meni, hero baner, glass/neon tema, fontovi, lucide ikone) + gamifikacija (XP, nivoi, profil, statistika, level-up animacija, zvuci) | `2026-10-01-redesign-gamification-design.md` / `2026-10-01-redesign-gamification.md` |
| 0.3.0 | 2026-10-02 | Automatsko ažuriranje (electron-updater + GitHub Releases), „Šta je novo”, sekcija Ažuriranja u Podešavanjima, zaštićena skripta `npm run release` | `2026-10-02-auto-update-design.md` / `2026-10-02-auto-update.md` |
| 0.3.1 | 2026-10-02 | Rezervne AniList pretrage po podnaslovu (posle `:`); verzija u donjem levom uglu menija | — (mala izmena) |
| 0.3.2 | 2026-10-02 | AniList zahtevi u redu jedan po jedan, poštovanje 429 / `Retry-After` / `X-RateLimit-*`; podnaslov posle ` - `; pamćenje „nije nađeno” 7 dana | — |
| 0.3.3 | 2026-10-02 | Poslednja rezervna pretraga: naslov bez „Movie N”/„OVA N” i interpunkcije | — |
| 0.3.4 | 2026-10-03 | Zapis „nije nađeno” nosi `searchVersion`; zapisi starije logike pretrage se zanemaruju | — |
| 0.4.0 | 2026-10-03 | Brze izmene: epizode u grupama + „idi na epizodu” + stalna traka radnji, posebna stranica epizoda, kvalitet i sub/dub po seriji (`series-prefs.json`), poruka „nema dub-a”, favoriti (do 5) + „Nastavi gledanje”, pun ekran (F11), nova ikonica, „by Leqora” + O aplikaciji | `2026-10-03-v0.4-quick-wins-design.md` / `2026-10-03-v0.4-quick-wins.md` |
| 0.5.0 | 2026-10-04 | Ugrađeni plejer (hls.js preko lokalnog proxy-ja, spoljni mpv kao opcija), kontrole + prečice, preskakanje uvoda/rezimea (AniSkip) i opciono automatsko, sledeća epizoda sa odbrojavanjem, „Nastavi od…”, rezervni prelaz na mpv, preuzete epizode u aplikaciji, moderan mpv (uosc), AniList podaci i offline | `2026-10-03-v0.5-player-design.md` / `2026-10-03-v0.5-player.md` |
| 0.5.1 | 2026-10-09 | Hotfix iz Seanime analize (P0-A): ikone plejera, prečice posle klika na klizač + po fizičkom tasteru (ćirilica), „Završeno” tek kad su sve epizode odgledane, AniList keš se osvežava dnevno za serije koje se emituju, error boundary + ekran „Pokušaj ponovo”, red preuzimanja bez duplikata + „Ponovi neuspele”, minifikacija (2,07 MB → 0,91 MB), statistika se ne računa na svaku navigaciju | `docs/seanime-analysis/04-plan.md` |
| 0.6.0 | 2026-10-09 | Plejer (P0-B 1–3): spinner + „Sporo učitavanje…” posle 8 s, pamćenje jačine/mute, dvoklik = pun ekran (jedan klik pauzira posle 220 ms), bedž prave rezolucije + jednokratno obaveštenje o kvalitetu, greška „nema ispravnih izvora” + „Pokušaj ponovo”, automatski oporavak zastoja (watchdog 12 s, jednom po epizodi, ekran „Ponovno povezivanje…”), proxy: timeout zaglavlja 20 s + 1 ponovni pokušaj segmenta | `2026-10-09-v0.6-player-design.md` |
| 0.6.2 | 2026-10-10 | Podrazumevana veličina titla 25 (i stari `M`), razmak redova bez preklapanja (nova skala 1,40–1,60), tamni neprovidni paneli preko videa (meni titlova, kartica sledeće epizode, poruke) — token `--panel-solid` | — (mala izmena) |
| 0.6.1 | 2026-10-10 | Titlovi (P0-B 4): SRT→VTT za strim i lokalni `.srt`, sopstveni overlay (skalira sa plejerom, zbijeni redovi, gore/dole), podešavanja (veličina, razmak, font, boja, okvir) sa živim pregledom, meni titlova u plejeru, pomak `G`/`H` po seriji i režimu, dub bez titla podrazumevano, poruka za ASS/nepodržan format, lokalni `.srt` u Windows-1250/UTF-16 | `2026-10-09-v0.6.1-subtitles-design.md` |

## Šta je stvarno provereno (ne samo testovima)

- **0.6.2: 65 fajlova, 623/623 testova prolazi.** Kontrast panela nije meren u pravoj aplikaciji (pozadina 92 % `--bg`; tekst `--text`).

- **0.6.1: 65 fajlova, 621/621 testova prolazi (`npm test`), `npm run build` i e2e smoke prolaze.** Provereno u pravoj aplikaciji (Playwright `_electron`, izolovan profil, probni video 1280x720 + `.srt` sa 3 cue-a, 2026-10-10): titl se vidi; dvoredni cue je jedan blok sa jednim okvirom; `{\an8}` cue je gore; pun ekran (`F`) podiže font titla sa 35,8 px na 56,4 px; sa vidljivim kontrolama titl je iznad trake (mereno samo na punom ekranu, u prozoru nije mereno; donja ivica 1056 px, traka počinje na 1095 px), posle ~4 s mirovanja se spušta (`translateY(-96px)` ostao bez izmene); `H` prikazuje „Titl: +0,1 s”, upisuje `subOffset.sub = 0.1` u `series-prefs.json` i pomak ostaje posle zatvaranja i ponovnog puštanja; Podešavanja → Titlovi: klizač veličine odmah menja pregled, isključen okvir daje obris, Georgia se vidi u pregledu, vrednosti se upisuju u `settings.json`; bez grešaka u konzoli. **Uživo neprovereno:** dub epizoda sa pravim ani-cli-jem (titl isključen, uključi + poravnaj pomakom) i sub epizoda strima sa pravim izvorom — proverava korisnik; ASS/415 poruka samo unit testovima.
- **0.6.0: 62 fajla, 559/559 testova prolazi (`npm test`), `npm run build` i e2e smoke prolaze.** Provereno u pravoj aplikaciji (Playwright `_electron`, izolovan profil, lokalni probni video 1280x720, 2026-10-09): (1) spinner se vidi dok video nema prvi kadar i nestaje posle njega; (2) bedž pokazuje `720p`; (3) jačina 0.3 + mute ostaju posle zatvaranja i ponovnog pokretanja (upisano u `settings.json`); (4) dvoklik uključuje pun ekran bez pauze, drugi dvoklik ga isključuje, jedan klik pauzira; (5) pokvaren lokalni fajl daje grešku sa dugmadima samo „Pusti u spoljnom plejeru (mpv)” i „Nazad” (bez oporavka); bez grešaka u konzoli. **Uživo neprovereno:** oporavak strima (zastoj se ne može pouzdano izazvati bez pravog strima — pokriveno unit testovima), poruka „nema ispravnih izvora” i obaveštenje o kvalitetu sa pravim ani-cli-jem, „Sporo učitavanje…” posle 8 s (pokriveno unit testom).
- 508 unit/integration testova prolazi (`npm test`, 0.5.1), e2e smoke (`npm run test:e2e`) prolazi.
- **0.5.1 provereno u pravoj aplikaciji (Playwright `_electron`, izolovan profil, lokalni probni video, 2026-10-09):** svih 9 dugmadi plejera ima ikonu; posle klika na traku vremena → skače +10 s, Space pauzira, M isključuje zvuk; bez grešaka u konzoli. Uživo neprovereno: duplikati u redu preuzimanja (traži pravi ani-cli tok) i prečice na ćiriličnom rasporedu (pokriveno unit testom).
- **0.5.0 provereno uživo sa korisnikom (potvrđeno 2026-10-09), svih 13 stavki:** (1) Frieren ep 1 u aplikaciji (slika, zvuk, titlovi, S/M/L); (2) „Preskoči uvod” i automatsko preskakanje; (3) kraj → odbrojavanje → sledeća epizoda; (4) zatvori pa „Nastavi od…”; (5) prečice + pun ekran; (6) preuzeta epizoda u aplikaciji; (7) spoljni režim sa uosc i automatskim preskakanjem; (8) dugme „Pusti u spoljnom plejeru”; (9) ažuriranje 0.4.0 → 0.5.0; (10) nameran kvar playliste (npr. bez interneta / pogrešan link) prikazuje ekran sa greškom i dugmetom za mpv, ne crn ekran; (11) preuzeta epizoda sa titlom (`.vtt` pored videa) prikazuje titlove u aplikaciji; (12) „Pitaj pri zatvaranju” + automatska sledeća epizoda: odgovor za prethodnu epizodu se ne gubi (dijalog vidljiv iznad plejera, pitanja u redu); (13) posle automatskog prelaska na sledeću epizodu sa pragom 95 % prethodna epizoda je označena kao odgledana.
- **0.4.0 provereno uživo sa korisnikom (2026-10-03):** One Piece grupe i „Idi na epizodu”, sub↔dub na stranici epizoda, „nema dub-a” + „Pusti sa titlom”, serija sa sačuvanim dub-om iz pretrage pušta dub, F11 / dugme / Esc i pamćenje punog ekrana posle ponovnog pokretanja, Esc u dijalogu ne izlazi iz punog ekrana, 5 favorita + poruka za šesti, „O aplikaciji” → GitHub, „by Leqora” i nova ikonica.
- **Auto-update radi u praksi:**
  - lokalna proba (generic provider na `localhost`, 0.2.90 → 0.2.91): instalacija tek na klik, podaci netaknuti, bez SmartScreen-a;
  - pravo ažuriranje preko GitHub-a **0.3.0 → 0.3.1 → 0.3.2 → 0.3.3** — korisnik potvrdio.
- „Šta je novo” posle ažuriranja se prikazuje jednom (`lastSeenVersion` u `settings.json`).
- Slike iz AniList-a: za pretragu „naruto” 24/26 naslova dobija tačnu sliku, nijedna pogrešna (provereno uživo).
- Korisnik je instalirao aplikaciju i koristi je (pretraga, slike, ažuriranje).

## Poznati problemi / otvoreno

1. **Pravilo za pretragu slika:** svaka izmena `searchCandidates`/`bestMatch` u `anilist.js` mora da poveća `SEARCH_VERSION`, inače zapamćeni promašaji važe do 7 dana (popravljeno u 0.3.4).
2. Bez slike ostaju naslovi koje AniList nema na engleskom ili uopšte: npr. „Naruto OVA7: Chunin Exam on Fire!…” (na AniList-u samo japanski naziv) i „Naruto (Shinsaku Anime)” (AniList ga nema). Namerno se ne traži po jednoj reči (pogrešna slika je gora od prazne).
3. AniList trenutno dozvoljava ~30 zahteva/min; velika pretraga prvi put popunjava slike postepeno (do par minuta), posle iz keša.
4. Aplikacija nije potpisana (nema code-signing sertifikata); SmartScreen se do sada nije pojavio, ali može.
5. Sitnice iz završnog pregleda v0.3 koje su svesno ostavljene: kratko treptanje dugmeta „Preuzmi” kad je auto-preuzimanje uključeno; nema sha512 provere `latest.yml` u skripti; `fail`/`fail0` u `updater.js` bi mogli u jednu funkciju; Escape u „Šta je novo” nema focus-trap.
6. Windows može da prikazuje staru ikonicu prečice dok ne osveži keš ikonica (nova ikonica u 0.4.0).
7. Ručno još neprovereno iz v0.2: zvuci i level-up animacija pri stvarnom gledanju, puno gledanje epizode do kraja sa automatskim praćenjem.
8. Rizici v0.5: ako sajt promeni zaštitu (zaglavlja, maskirani segmenti), popravka ide u `streamServer.js` (do tada dugme „Pusti u spoljnom plejeru”); AniSkip nema podatke za sve serije/epizode (tada nema dugmadi za preskakanje).
9. Sitnice iz pregleda v0.6 svesno ostavljene: „Nazad” pritisnut baš tokom IPC poziva za oporavak ipak pokrene ponovno povezivanje (prozor jednog poziva; „Nazad” na ekranu povezivanja vraća); „Pokušaj ponovo” u plejeru nema zaštitu od dvostrukog klika; ekran „Ponovno povezivanje…” ne pomera fokus na dugme; nema testova za prekid klijenta u proxy-ju i za mrežnu grešku pri ponovnom pokušaju segmenta (kod je pregledan i ispravan); budžet oporavka ne briše istekle unose (zanemarljivo).
10. Pomak titla se čuva po naslovu plejera: pomak podešen tokom strimovanja ne mora da važi za preuzeti fajl iste serije (isto kao sačuvane pozicije za „Nastavi od…”).
11. Klizač veličine u meniju titla upisuje podešavanje na svaki korak (do 20 upisa po prevlačenju), za razliku od klizača u Podešavanjima koji upisuju sa odlaganjem.

## Mogući sledeći koraci (ideje, ništa nije dogovoreno)

- v0.5 je implementirana, objavljena (2026-10-04) i proverena uživo; 0.5.1 hotfix i 0.6.0 (plejer, P0-B 1–3) objavljeni 2026-10-09.
- **Glavni izvor sledećih koraka:** `docs/seanime-analysis/04-plan.md` (ostatak P0-B plejera: koraci 4–7, P1 spoiler model + kartice + epizode, P2 obaveštenja/tray/AniList…). Stanje roadmap-a: `docs/seanime-analysis/_STANJE.md`.
- Dalji predlozi su u `Claude/Anime/Aplikacija za gledanje Anime-a/Istrazivanje.md`: obaveštenja o novim epizodama, raspored emitovanja, automatski nastavak na sledeću epizodu, AniList sinhronizacija, oznake filler epizoda…
- Ručno povezivanje naslova iz pretrage sa AniList unosom (postoji za watchlist preko `aniListId`, ne i u mreži pretrage).
- Preporuke na osnovu žanrova (iz `Claude/Anime/IDEJE.md`).
