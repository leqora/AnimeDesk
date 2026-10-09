# Seanime analiza → unapređenje AnimeDesk-a — stanje rada (predaja smene)

Poslednje ažuriranje: 2026-10-09 (kraj sesije v0.6).

- Spec korisnika: `C:\Users\Nikola\Desktop\Claude\Anime\Aplikacija za gledanje Anime-a\Seanime\zadatak.txt`
- Seanime klon (referenca, GPL-3.0 — samo inspiracija, ne kopirati kod): `C:\Users\Nikola\Desktop\Projekti\_ref\seanime` (commit 2da73d9; ne commitovati).
- Glavni dokument sa planom: **`04-plan.md`** (tabela poređenja, quick wins, roadmap P0–P3 sa fajlovima/pristupom/rizicima, „ne preuzimati”, §6 odluke korisnika).
- Detalji po oblastima: `03-oblast-player.md` (25 preporuka + redosled), `03-oblast-izvori-kvalitet.md`, `03-oblast-epizode.md`, `03-oblast-ui-dizajn.md` (§10 spec redizajna kartice), `03-oblast-ostali-featurei.md`, `03-oblast-performanse.md`.

## Gde smo stali

- [x] Faze 0–4 analize (00–04 fajlovi), rezime dat korisniku.
- [x] **P0-A objavljen kao v0.5.1** (2026-10-09, GitHub Release Latest, `main` spojen i push-ovan).
  Ikone plejera, prečice (klizač, `e.code`, Ctrl/Alt), „Završeno” tek kad su sve epizode odgledane, AniList TTL za serije koje se emituju,
  ErrorBoundary + ekran „Pokušaj ponovo” + `main().catch`, red preuzimanja bez duplikata + „Ponovi neuspele”, minifikacija (2,07 → 0,91 MB),
  statistika samo na promenu biblioteke / otvaranje Profila. 508/508 testova, e2e prolazi, provereno u pravoj aplikaciji (Playwright `_electron`).
- [x] **v0.6 = P0-B koraci 1–3 objavljeni kao v0.6.0** (2026-10-09, spojeno u `main`) (spinner/baferovanje, jačina/mute, dvoklik, bedž rezolucije + upozorenje o kvalitetu, `no-sources` + „Pokušaj ponovo”, detekcija zastoja i automatski oporavak, retry/timeout u `streamServer.js`). 559/559 testova, e2e prolazi, provereno u pravoj aplikaciji (vidi `docs/STATUS.md`).
- [ ] **SLEDEĆE: P0-B koraci 4–7** (titlovi SRT/offset, nastavak u mpv-u + prag „odgledano”, lazy `PlayerView` + brzina + razbijanje na hook-ove, prefetch sledeće epizode) — ide kroz superpowers tok kao v0.6, nova grana.

## Odluke korisnika (važe za dalje)
1. Serija je „Završeno” tek kad su **sve** epizode odgledane (urađeno u 0.5.1).
2. Hotfix odvojeno (urađeno), plejer kao v0.6.
3. Spoiler model: otkrivanje **i po seriji i po epizodi**; podrazumevano uključen; režim „ne renderuj” (ne CSS blur).

## Preostalo po roadmap-u (detalji u `04-plan.md` §3)

### P0-B — plejer — koraci 1–3 urađeni u v0.6, ostaju 4–7 (redosled iz `03-oblast-player.md`)
1. Spinner učitavanja/baferovanja (`waiting`/`playing`/`canplay`), pamćenje jačine/mute, dvoklik = pun ekran.
2. Transparentan kvalitet: bedž stvarne rezolucije (`videoHeight`, mpv `height`), upozorenje kad ani-cli spusti kvalitet na `best` (stderr `ani-cli:239`, `watchService` mora da prosledi `onLine`), nova greška `no-sources` + „Pokušaj ponovo”.
3. Detekcija zastoja + „Pokušaj ponovo” = nova ani-cli sesija, nastavak od pozicije, max 1 automatski po epizodi; hls.js `recoverMediaError`/`swapAudioCodec`; retry + timeout segmenta u `streamServer.js`.
4. Titlovi: SRT→VTT (strim i lokalni `.srt`, detekcija po sadržaju), offset titlova + prečice, stil preko `::cue` tokena.
5. Nastavak sa pozicije u spoljnom mpv-u (`time-pos` već pratimo → `positions.js`, `--start=`); „odgledano” na pragu tokom gledanja (bez duplog XP-a); normalizacija AniSkip intervala.
6. Lazy `PlayerView` (`React.lazy`, hls.js ≈62 % bundle-a), brzina reprodukcije + meni, tooltip vremena + buffered traka; razbiti `PlayerView` na hook-ove pre većih dodataka.
7. ★ Prefetch linka sledeće epizode (poseban spec; `debug` sesija od ~80 %, TTL).

### P1 — v0.7 (kartice i epizode)
Spoiler model `src/shared/spoilers.js` (PRE svakog naslova/sličice/opisa epizode) · redizajn kartice (spec `03-oblast-ui-dizajn.md` §10) · progres po epizodi na karticama · keš stvarne ani-cli liste epizoda (umesto `1..max`) · „sledeća epizoda izlazi…” + bedž „N novih” · header detalja · istorija navigacije + pamćenje skrola · zajednički `Modal.jsx` (a11y) · red toastova · keš postera u rendereru.

### P2 — v0.8+ (novi feature-i)
Obaveštenja o novim epizodama (Seanime ovo NEMA) · tray/autostart/single-instance · OS notifikacija za preuzimanja · „Propušteni nastavci” · uvoz AniList liste po korisničkom imenu · watchlist filteri/pretraga + sekcija „Podaci” · proba kvaliteta preko ani-cli `debug` + izbor rezolucije (`^720p`) · metapodaci epizoda (ani.zip) + kartice epizoda · filler (Jikan) · auto-preuzimanje novih epizoda · AniList prijava + slanje progresa · optimistično pokretanje · posteri kao fajlovi.

### P3 — nice-to-have
JASSUB/ASS, Anime4K za mpv, nedeljni raspored, command palette, Discord RPC (bez naziva epizode), discover/preporuke, dostignuća, `@ts-check`.

## Napomene za sledeću sesiju
- Ručna provera aplikacije: Playwright `_electron` skripta sa izolovanim `ANIMEDESK_USER_DATA` i probnim videom ubačenim u `downloads.json` (ffmpeg `testsrc`). Chrome-devtools MCP ne radi za ovo (nema preload-a).
- Python na ovoj mašini ne pokretati preko heredoc-a (Windows alias visi) — koristiti `node -e`.
- vitest ponekad prijavi „Timeout waiting for worker” pri prvom pokretanju — samo ponoviti.
- Uživo još neprovereno iz 0.5.1: duplikati u redu preuzimanja sa pravim ani-cli tokom; prečice na ćiriličnom rasporedu (pokriveno unit testom).
