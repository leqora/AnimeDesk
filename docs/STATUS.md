# AnimeDesk — stanje projekta

Poslednje ažuriranje: 2026-10-04. Trenutna verzija: **0.5.0** (na grani `feat/v0.5`, još neobjavljena; poslednji objavljeni release je 0.4.0).

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

## Šta je stvarno provereno (ne samo testovima)

- 468 unit/integration testa prolaze (`npm test`, 0.5.0), e2e smoke (`npm run test:e2e`) prolazi.
- **0.5.0 — uživo provere još NISU urađene (na čekanju):** (1) Frieren ep 1 u aplikaciji (slika, zvuk, titlovi, S/M/L); (2) „Preskoči uvod” i automatsko preskakanje; (3) kraj → odbrojavanje → sledeća epizoda; (4) zatvori pa „Nastavi od…”; (5) prečice + pun ekran; (6) preuzeta epizoda u aplikaciji; (7) spoljni režim sa uosc i automatskim preskakanjem; (8) dugme „Pusti u spoljnom plejeru”; (9) ažuriranje 0.4.0 → 0.5.0.
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
8. Rizici v0.5: ako sajt promeni zaštitu (zaglavlja, maskirani segmenti), popravka ide u `streamServer.js` (do tada dugme „Pusti u spoljnom plejeru”); AniSkip nema podatke za sve serije/epizode (tada nema dugmadi za preskakanje).
7. Ručno još neprovereno iz v0.2: zvuci i level-up animacija pri stvarnom gledanju, puno gledanje epizode do kraja sa automatskim praćenjem.

## Mogući sledeći koraci (ideje, ništa nije dogovoreno)

- v0.5 je implementirana (čeka uživo provere i objavu).
- Dalji predlozi su u `Claude/Anime/Aplikacija za gledanje Anime-a/Istrazivanje.md`: obaveštenja o novim epizodama, raspored emitovanja, automatski nastavak na sledeću epizodu, AniList sinhronizacija, oznake filler epizoda…
- Ručno povezivanje naslova iz pretrage sa AniList unosom (postoji za watchlist preko `aniListId`, ne i u mreži pretrage).
- Preporuke na osnovu žanrova (iz `Claude/Anime/IDEJE.md`).
