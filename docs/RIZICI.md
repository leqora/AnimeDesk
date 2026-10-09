# AnimeDesk — rizici

Rizici koji se posebno prate tokom razvoja. Svaki ima test koji ga „zakucava” (vidi plan: `docs/superpowers/plans/2026-09-30-animedesk.md`, sekcija *Review Focus*).

| # | Rizik | Šta bi se desilo | Kako je rešeno | Test |
|---|---|---|---|---|
| 1 | **CRLF u `.sh` skriptama** — Windows git (`core.autocrlf`) pretvori kraj reda u CRLF | bash puca sa `$'\r': command not found`, ništa ne radi | `.gitattributes`: `*.sh text eol=lf` | Task 6: „shell scripts have LF line endings” |
| 2 | **Putanje sa razmakom ili naših slova** (npr. `D:\Moji anime\Šou`) | preuzimanje završi u pogrešnom folderu ili padne | `toMsysPath` + navodnici u bash pozivima | Task 7: preuzimanje u temp folder sa razmakom i `š` |
| 3 | **Nazivi animea sa znakovima zabranjenim u Windows imenima** (`Re:Zero`, `Fate/stay night`) | folder serije ne može da se napravi | `safeDirName` pravi ispravno ime foldera | Task 1 (`safeDirName`) i Task 9 (folder `Re Zero`) |
| 4 | **Pauza preuzimanja ostavi yt-dlp da radi** — gašenje bash-a na Windows-u ne gasi „unuke” | fajl se i dalje piše iako piše „Pauzirano” | `taskkill /T /F` gasi celo stablo procesa | Task 5: „kills the whole process tree” |
| 5 | **Windows promenljiva se zove `Path`, ne `PATH`** | dve promenljive u okruženju, alati „ne postoje” | `buildEnv` zamenjuje postojeći ključ jednim `PATH` | Task 7: `buildEnv` test |

## Ostali poznati rizici (iz spec-a)

| Rizik | Ublažavanje |
|---|---|
| Sajt koji ani-cli koristi prestane da radi | HealthCheck + automatski update ani-cli; semafor 🔴 „čeka se popravka od ani-cli tima” |
| ani-cli promeni način pozivanja menija/plejera | koriste se samo zvanične env varijable (`ANI_CLI_MENU`, `ANI_CLI_PLAYER`); HealthCheck to odmah otkriva |
| Promena naziva fajlova u GitHub izdanjima alata | fajlovi se traže po šablonu; greška se jasno prikazuje u wizard-u |
| WSL bash (`C:\Windows\System32\bash.exe`) umesto Git Bash-a | traži se samo u Git for Windows lokacijama (test u Task 5) |
| DMCA zahtev prema GitHub repozitorijumu | napomena u README; aplikacija ne sadrži kod za pristup sajtu |
| Slična aplikacija (Hayase/Miru) je 2025. skinuta zbog DMCA | isto kao gore; pratiti, ne ugrađivati sajtove u aplikaciju |

## Automatsko ažuriranje i AniList (v0.3)

| Rizik | Šta bi se desilo | Kako je rešeno |
|---|---|---|
| Release bez `latest.yml` / `.blockmap` | ažuriranje se pokvari svima | objavljuje se samo preko `npm run release` (provera fajlova, draft → SHA-256 → Latest) |
| Tiha instalacija pri zatvaranju | ažuriranje usred gledanja/preuzimanja | `autoInstallOnAppQuit = false`; instalacija samo na dugme „Restartuj i ažuriraj” |
| HTML u beleškama izdanja | izvršavanje koda u prozoru | beleške se prikazuju samo kao čist tekst (`releaseNotes.js`) |
| Nepotpisana aplikacija | SmartScreen upozorenje | do sada se nije pojavio (lokalna proba i 0.3.0 → 0.3.1); prati se |
| AniList ograničenje (~30 zahteva/min, 429) | slike ostanu prazne u velikim pretragama | red zahteva jedan po jedan, čekanje po `Retry-After` / `X-RateLimit-Reset` (0.3.2) |
| Pogrešna slika iz preširoke pretrage | korisnik vidi tuđi anime | nikad se ne traži po jednoj reči (`searchCandidates`) |
| Keš „nije nađeno” nadživi bolju pretragu | posle ažuriranja slika i dalje fali do 7 dana | rešeno u 0.3.4: zapis nosi `searchVersion`; pravilo: povećaj `SEARCH_VERSION` pri svakoj izmeni pretrage (`docs/STATUS.md`, problem #1) |

## Ugrađeni plejer (v0.5)

| Rizik | Šta bi se desilo | Kako je rešeno |
|---|---|---|
| Sajt promeni zaštitu (zaglavlja, maskirani segmenti) | ugrađeni plejer ne može da pusti epizodu | popravka u `streamServer.js`; do tada ekran sa greškom + dugme „Pusti u spoljnom plejeru” (mpv) |
| Lokalni proxy dostupan drugim programima | tuđi proces koristi stream server | sluša samo na `127.0.0.1`, svaki zahtev traži token, dozvoljeni samo `http(s)` izvori |
| AniSkip nema podatke za seriju/epizodu | nema dugmadi za preskakanje | normalno ponašanje; dugmad se prikazuju samo kad podaci postoje |
