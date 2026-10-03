# AnimeDesk — stanje projekta

Poslednje ažuriranje: 2026-10-03. Trenutna verzija: **0.4.0** (na grani `feat/v0.4`, još nije objavljena; poslednji objavljeni release je 0.3.4).

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

## Šta je stvarno provereno (ne samo testovima)

- 380 unit/integration testa prolaze (`npm test`, 0.4.0), e2e smoke (`npm run test:e2e`) prolazi.
- **0.4.0: živa ručna provera (One Piece grupe, sub↔dub, „nema dub-a”, F11, 5 favorita, GitHub veza) tek treba da se uradi sa korisnikom pre objave.** Dodatno proveriti uživo: Esc dok je „Šta je novo” otvoren u punom ekranu (zatvara samo prozorčić); pretraga → izbor serije sa sačuvanim dub-om → pušta dub; pun ekran → izlaz → ponovno pokretanje zadržava pun ekran.
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

## Mogući sledeći koraci (ideje, ništa nije dogovoreno)

- **v0.5:** ugrađeni plejer (podrazumevano unutar aplikacije, uz opciju spoljnog mpv-a), preskakanje uvoda/odjave (AniSkip), moderan izgled mpv-a (uosc).
- Dalji predlozi su u `Claude/Anime/Aplikacija za gledanje Anime-a/Istrazivanje.md`: obaveštenja o novim epizodama, raspored emitovanja, automatski nastavak na sledeću epizodu, AniList sinhronizacija, oznake filler epizoda…
- Ručno povezivanje naslova iz pretrage sa AniList unosom (postoji za watchlist preko `aniListId`, ne i u mreži pretrage).
- Preporuke na osnovu žanrova (iz `Claude/Anime/IDEJE.md`).
