# Seanime analiza → unapređenje AnimeDesk-a — stanje rada (predaja smene)

Poslednje ažuriranje: 2026-10-16 (v0.7.3 objavljen kao Latest — kraj P1; v0.7.4 = sitnice iz pregleda 0.7.3 objavljen kao Latest; sledeće P2).

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
- [x] **P0-B korak 4 objavljen kao v0.6.1** (2026-10-10, Latest, spojeno u `main`) (titlovi: SRT→VTT, pomak `G`/`H` po seriji i režimu, sopstveni overlay, podešavanja sa pregledom, meni titlova; 621/621 testova, provereno u pravoj aplikaciji; vidi `docs/STATUS.md`).
- [x] **v0.6.2** (2026-10-10, Latest): mini ispravke titlova (veličina 25, razmak bez preklapanja, neprovidni paneli).
- [x] **P0-B korak 5 = v0.6.3** (nastavak u mpv-u, „odgledano” na pragu uz odloženo slavlje, normalizacija AniSkip intervala; objavljeno 2026-10-10 kao Latest, spojeno u `main`; 653 testa).
- [x] **P0-B korak 6 = v0.6.4** (lazy `PlayerView` + hls.js, hook-ovi u `src/renderer/player/`, brzina reprodukcije + meni, buffered traka + tooltip; 709 testova; objavljeno 2026-10-10 kao Latest, spojeno u `main`).
- [x] **P0-B korak 7 = v0.6.5** (prefetch linka sledeće epizode; 736 testova; ručna provera sa pravim ani-cli-jem: „Sledeća” 7,3 s → 0,87 s; objavljeno 2026-10-10 kao Latest, spojeno u `main`). **P0-B je završen.** Sledeće: P1 (v0.7).
- [x] **P1 korak 1 = v0.7.0 (objavljeno 2026-10-11, Latest, spojeno u `main`):** spoiler model (`src/shared/spoilers.js`, primena u main-u kroz `src/main/seriesEpisodes.js`) + metapodaci epizoda iz ani.zip (prebačeno iz P2) + keš stvarne ani-cli liste. 826 testova, završni pregled (Opus) urađen + talas ispravki. Ostatak P1 (kartice, progres po epizodi, „N novih”, istorija navigacije, `Modal.jsx`, toastovi, keš postera) ide u v0.7.1+ po dogovoru.
- [x] **P1 korak 2 = v0.7.1 (objavljeno 2026-10-16, Latest, spojeno u `main`):** zajednička `MediaCard` (bedž 3/12, traka, tačka statusa, ocena, ▶/★ na hover/fokus), `Poster` skeleton/fade-in, progres po epizodi (kartica, Hero, pilule, Lista) preko `positions.forSeries` + `event:positions-changed`. 857 testova, završni pregled (Opus) „Yes” + talas sitnih ispravki. Ostatak P1 ("sledeća izlazi…"/"N novih", header detalja, istorija navigacije, `Modal.jsx`, toastovi, keš postera) ide u v0.7.2+ — predlog: v0.7.2 = „sledeća izlazi…”/„N novih” + header detalja; v0.7.3 = `Modal.jsx`, toastovi, istorija navigacije + skrol, keš postera.

- [x] **P1 korak 3 = v0.7.2 (objavljeno 2026-10-16, Latest, spojeno u `main`):** „sledeća epizoda izlazi…” (Hero + detalj), bedž „N novih” (kartica, Hero, detalj; samo „Gledam” + `RELEASING`), header detalja (meta, žanrovi, akcije u baneru). AniList `nextAiringEpisode` u postojećem upitu + keš koji ističe posle emitovanja; `src/shared/airing.js`. 892 testa, završni pregled (Opus) „With fixes” → talas sitnih ispravki. Ostatak P1 (`Modal.jsx`, toastovi, istorija navigacije + skrol, keš postera/dedup) = v0.7.3.

- [x] **P1 korak 4 = v0.7.3 (objavljeno 2026-10-16, Latest, spojeno u `main`):** zajednički `Modal.jsx`, red toastova sa „Poništi” (uklanjanje serije bez potvrde + vraćanje iz korpe u main-u; označi/odznači epizodu) + `Ctrl+Z`, istorija navigacije (`Alt+←/→`, miš 4/5) + pamćenje skrola i filtera, keš AniList podataka u rendereru (+ live osvežavanje posle emitovanja) + `inflight` dedup u main-u. 995 testova, završni pregled (Opus) „With fixes” → talas ispravki + ponovni pregled. **P1 je ovim završen**; sledeće P2 (vidi STATUS „Sledeće”).
- [x] **v0.7.4 (između P1 i P2, objavljeno 2026-10-16, Latest, spojeno u `main`):** sitnice iz pregleda 0.7.3 (fokus/`Ctrl+Z`/`aria-live` toastova, osvežavanje posle emitovanja do kartica + ponovni pokušaji, „Poništi” oznake posle napuštanja detalja). 1020 testova, završni pregled (Opus) „With fixes” → jedna ispravka + ponovni pregled; ručna provera urađena. `npm run release` je dvaput stao na nestabilnim testovima (vitest radni procesi, `App.test.jsx` „Esc listener once”) — treći put prošao.

## Odluke korisnika (važe za dalje)
1. Serija je „Završeno” tek kad su **sve** epizode odgledane (urađeno u 0.5.1).
2. Hotfix odvojeno (urađeno), plejer kao v0.6.
3. Spoiler model: otkrivanje **i po seriji i po epizodi**; podrazumevano uključen; režim „ne renderuj” (ne CSS blur).

## Preostalo po roadmap-u (detalji u `04-plan.md` §3)

### P0-B — plejer — koraci 1–3 urađeni u v0.6, korak 4 u v0.6.1, korak 6 u v0.6.4, ostaje 7 (redosled iz `03-oblast-player.md`)
1. Spinner učitavanja/baferovanja (`waiting`/`playing`/`canplay`), pamćenje jačine/mute, dvoklik = pun ekran.
2. Transparentan kvalitet: bedž stvarne rezolucije (`videoHeight`, mpv `height`), upozorenje kad ani-cli spusti kvalitet na `best` (stderr `ani-cli:239`, `watchService` mora da prosledi `onLine`), nova greška `no-sources` + „Pokušaj ponovo”.
3. Detekcija zastoja + „Pokušaj ponovo” = nova ani-cli sesija, nastavak od pozicije, max 1 automatski po epizodi; hls.js `recoverMediaError`/`swapAudioCodec`; retry + timeout segmenta u `streamServer.js`.
4. (URAĐENO u v0.6.1) Titlovi: SRT→VTT (strim i lokalni `.srt`, detekcija po sadržaju), offset titlova + prečice, stil preko `::cue` tokena.
5. (URAĐENO u v0.6.3) Nastavak sa pozicije u spoljnom mpv-u (`time-pos` već pratimo → `positions.js`, `--start=`); „odgledano” na pragu tokom gledanja (bez duplog XP-a); normalizacija AniSkip intervala.
6. (URAĐENO u v0.6.4) Lazy `PlayerView` (`React.lazy`, hls.js ≈62 % bundle-a), brzina reprodukcije + meni, tooltip vremena + buffered traka; razbiti `PlayerView` na hook-ove pre većih dodataka.
7. ★ Prefetch linka sledeće epizode (poseban spec; `debug` sesija od ~80 %, TTL).

### P1 — v0.7 (kartice i epizode)
Spoiler model `src/shared/spoilers.js` (PRE svakog naslova/sličice/opisa epizode) · redizajn kartice (spec `03-oblast-ui-dizajn.md` §10) · progres po epizodi na karticama · keš stvarne ani-cli liste epizoda (umesto `1..max`) · „sledeća epizoda izlazi…” + bedž „N novih” · header detalja · istorija navigacije + pamćenje skrola · zajednički `Modal.jsx` (a11y) · red toastova · keš postera u rendereru.

### P2 — v0.8+ (novi feature-i)
Obaveštenja o novim epizodama (Seanime ovo NEMA) · tray/autostart/single-instance · OS notifikacija za preuzimanja · „Propušteni nastavci” · uvoz AniList liste po korisničkom imenu · watchlist filteri/pretraga + sekcija „Podaci” · proba kvaliteta preko ani-cli `debug` + izbor rezolucije (`^720p`) · metapodaci epizoda (ani.zip) + kartice epizoda · filler (Jikan) · auto-preuzimanje novih epizoda · AniList prijava + slanje progresa · optimistično pokretanje · posteri kao fajlovi.

### P3 — nice-to-have
JASSUB/ASS, Anime4K za mpv, nedeljni raspored, command palette, Discord RPC (bez naziva epizode), discover/preporuke, dostignuća, `@ts-check`.

## Napomene za sledeću sesiju
- Iskustvo iz v0.7.4: svi zadaci prošli pregled iz prvog puta (mali, precizni brief-ovi + kontrolorova upozorenja u dispatch-u — npr. da `useEffect` cleanup vidi već uklonjen čvor, pa se fokus beleži u `useLayoutEffect` cleanup-u). Kontrolor je u kodu našao da live tajmer „ne pada” — main posle neuspeha vraća stari unos sa istim `airingAt` — pa je ponovni pokušaj morao da prepozna i taj slučaj. Završni pregled (Opus) je opet našao interakciju koju pregledi zadataka nisu (rezervni fokus iza modala, z-index toasta > modala). Ručna provera live osvežavanja: keš serije upisan sa `fetchedAt` pre `airingAt` i `airingAt = sada − 1 h + 90 s` → main i renderer keš ističu za ~90 s, live tajmer za ~120 s, pravi AniList vrati `FINISHED` i bedž nestane (treba mreža). Playwright `keyboard.down` ponovljen šalje `repeat: true`. Dugačak tekst sa navodnicima ne pisati kroz heredoc u Bash-u — Write alat u scratchpad pa `node`.
- Iskustvo iz v0.7.3: kontrolor je u main kodu proverio redosled događaja (`progress.check` šalje „serija završena” PRE „novi nivo”) i tako našao da prva ispravka toastova pokriva pogrešan redosled — tvrdnje pregleda o redosledu/vremenu proveriti u kodu. Završni pregled (Opus) je opet našao ono što pregledi zadataka nisu (tastatura ne stiže do „Poništi” za 6 s). Ručna provera: Playwright `isVisible({timeout})` NE čeka (koristiti `waitFor`); programski `focus()` posle klika mišem ne pali `:focus-visible` — fokus proveravati pravim Tab-om. Skripta `manual.mjs` (scratchpad): 22 serije iz pravog keša (`FINISHED`, prepisane pod ključ sha1(`id:<id>`)), bez alata (čarobnjak se otvori sam — zatvoriti Esc-om). Neki implementeri nisu prilagali izlaz testova — kontrolor je sam pokrenuo `npx vitest run` za dokaz.
- Iskustvo iz v0.7.2: ručna provera bez hover-a nije uhvatila da ▶/★ prekrivaju nov bedž — završni pregled (Opus) jeste; skripta za ručnu proveru sada snima i hover (`manual.mjs` u scratchpad-u: izolovan profil + AniList keš upisan unapred sa izmenjenim `status`/`nextAiring`, ključ fajla = sha1(`id:<aniListId>`), slike iz pravog keša u `%APPDATA%\AnimeDesk\cache\anilist`). Pregled zadatka 2 je našao petlju preuzimanja koju je plan sam propisao — zato „plan-mandated” nalaze uvek razmotriti. Podagenti na Sonnet-u su svi stavili ispravan trailer (izričito pravilo u `implementer-instructions.md` radi). Mnogi fajlovi imaju CRLF — skriptovane izmene u podagentima su delimično padale; Edit alat je pouzdaniji.
- Iskustvo iz v0.7.1: Sonnet podagent je u prvom commit-u stavio „Claude Sonnet 5.5”, jer ga je sesijski podsetnik za atribuciju na to naveo — u `implementer-instructions.md` izričito napisati da pravilo projekta (Opus 5.5) ima prednost; posle toga su svi commit-ovi bili ispravni. Ručna provera sa snimkom ekrana je opet našla nešto što testovi i pregledi nisu (sivi pravougaonik iza naslova kartice na hover — opšte `button:hover` pravilo). Skripta za ručnu proveru (izolovan profil sa 5 serija + `positions.json`, junction za alate) bila je u scratchpad-u (`manual.mjs`); ffmpeg `crop`+`scale` je zgodan za uveličavanje detalja na snimku.
- Iskustvo iz v0.7.0: Haiku je opet stavio svoj potpis u commit (ispravljeno amend-om pre pregleda) — za implementere koristiti Sonnet ili u dispatch-u izričito tražiti tačan trailer; zajednička uputstva za podagente u fajl u radnom folderu (`implementer-instructions.md`, `reviewer-instructions.md`) skraćuju dispatch. Pozadinska bezbednosna provera commit-a je uhvatila SSRF/neograničeno preuzimanje sličica koje pregled zadatka nije (sada allowlist hosta + ograničen tok). Ručna provera sa pravim alatima: junction `<izolovan profil>	ools` → `%APPDATA%AnimeDesk	ools` + `autoUpdateTools: false`; junction ukloniti (`cmd /c rmdir`) PRE brisanja profila.
- Ručna provera aplikacije: Playwright `_electron` skripta sa izolovanim `ANIMEDESK_USER_DATA` i probnim videom ubačenim u `downloads.json` (ffmpeg `testsrc`). Chrome-devtools MCP ne radi za ovo (nema preload-a).
- Python na ovoj mašini ne pokretati preko heredoc-a (Windows alias visi) — koristiti `node -e`.
- vitest ponekad prijavi „Timeout waiting for worker” pri prvom pokretanju — samo ponoviti.
- Podagenti (iskustvo iz v0.6.3): u dispatch-u izričito navesti da je potpis commit-a tačno `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pravilo projekta je jače od podrazumevanog potpisa modela — Haiku je jednom stavio svoj); lažni plejeri u testovima moraju da prate stvarni ugovor (`closed` → `onProgress`), inače testovi kriju greške.
- Iskustvo iz v0.6.4: ručna provera UI mora da uključi **snimak ekrana** koji se stvarno pogleda — merenje širine elementa nije uhvatilo buffered traku koju je prekrivao nativni klizač (uhvatio tek završni pregled na Opus-u). Završni pregled cele grane raditi na najjačem modelu; pregledi pojedinačnih zadataka ne vide interakcije između zadataka.
- Podagenti: kad brief ne odgovara fajlu, podagent treba da pita (NEEDS_CONTEXT) — u 0.6.4 je to sprečilo tiho brisanje koda. Odluke kontrolora iz dnevnika `.superpowers/sdd/<plan>/progress.md` preneti u STATUS pre brisanja radnog foldera.
- Dugačak tekst sa backtick-ovima ne upisivati preko `node -e "…"` u Bash-u (bash ih izvrši) — napisati `.mjs` skriptu u scratchpad ili koristiti Edit.
- Uživo još neprovereno iz 0.5.1: duplikati u redu preuzimanja sa pravim ani-cli tokom; prečice na ćiriličnom rasporedu (pokriveno unit testom).
