# AnimeDesk — stanje projekta

Poslednje ažuriranje: 2026-10-02. Trenutna verzija: **0.3.3** (GitHub release „Latest”).

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

## Šta je stvarno provereno (ne samo testovima)

- 322 unit/integration testa prolaze (`npm test`), e2e smoke (`npm run test:e2e`) prolazi.
- **Auto-update radi u praksi:**
  - lokalna proba (generic provider na `localhost`, 0.2.90 → 0.2.91): instalacija tek na klik, podaci netaknuti, bez SmartScreen-a;
  - pravo ažuriranje preko GitHub-a **0.3.0 → 0.3.1 → 0.3.2** — korisnik potvrdio (ažuriranje na 0.3.3 još nije potvrđeno).
- „Šta je novo” posle ažuriranja se prikazuje jednom (`lastSeenVersion` u `settings.json`).
- Slike iz AniList-a: za pretragu „naruto” 24/26 naslova dobija tačnu sliku, nijedna pogrešna (provereno uživo).
- Korisnik je instalirao aplikaciju i koristi je (pretraga, slike, ažuriranje).

## Poznati problemi / otvoreno

1. **Keš „nije nađeno” ne zna za promene logike pretrage.** Zapis `{ notFound: true, at }` u `%APPDATA%\AnimeDesk\Cache\anilist\*.json` važi 7 dana čak i kad nova verzija ima bolju pretragu (zato „-Bonds-” posle 0.3.3 nije odmah dobio sliku; zapisi su ručno obrisani kod korisnika). **Popravka za sledeću verziju:** upisati verziju logike (npr. `searchVersion`) u zapis i zanemariti zapise sa starom verzijom.
2. Bez slike ostaju naslovi koje AniList nema na engleskom ili uopšte: npr. „Naruto OVA7: Chunin Exam on Fire!…” (na AniList-u samo japanski naziv) i „Naruto (Shinsaku Anime)” (AniList ga nema). Namerno se ne traži po jednoj reči (pogrešna slika je gora od prazne).
3. AniList trenutno dozvoljava ~30 zahteva/min; velika pretraga prvi put popunjava slike postepeno (do par minuta), posle iz keša.
4. Aplikacija nije potpisana (nema code-signing sertifikata); SmartScreen se do sada nije pojavio, ali može.
5. Sitnice iz završnog pregleda v0.3 koje su svesno ostavljene: kratko treptanje dugmeta „Preuzmi” kad je auto-preuzimanje uključeno; nema sha512 provere `latest.yml` u skripti; `fail`/`fail0` u `updater.js` bi mogli u jednu funkciju; Escape u „Šta je novo” nema focus-trap.
6. Ručno još neprovereno iz v0.2: zvuci i level-up animacija pri stvarnom gledanju, puno gledanje epizode do kraja sa automatskim praćenjem.

## Mogući sledeći koraci (ideje, ništa nije dogovoreno)

- Popravka #1 (verzija keša „nije nađeno”).
- Ručno povezivanje naslova iz pretrage sa AniList unosom (postoji za watchlist preko `aniListId`, ne i u mreži pretrage).
- Preporuke na osnovu žanrova, praćenje novih epizoda (iz `Claude/Anime/IDEJE.md`).
