# AnimeDesk — dizajn (spec)

Datum: 2026-09-30
Status: čeka pregled

## 1. Cilj

AnimeDesk je desktop aplikacija za Windows koja je grafički interfejs za **ani-cli**
(pretraga, gledanje i preuzimanje animea), zajedno sa ličnom **watchlist-om**
(statusi, ocene, komentari, beleške po epizodi) i pregledom **preuzetih** epizoda.

Aplikacija se deli preko GitHub-a: prijatelj skine jedan `.exe` instaler i ne mora
ništa drugo ručno da instalira — aplikacija sama preuzima i ažurira potrebne alate.

### Kriterijumi uspeha
- Nova instalacija na čistom Windows-u: wizard instalira sve komponente i gledanje radi bez ijedne ručne komande.
- Kada ani-cli tim popravi skriptu (npr. zbog promene sajta), AnimeDesk tu popravku preuzme sam — **bez izmene koda AnimeDesk-a**.
- Status (semafor) uvek jasno pokazuje da li gledanje radi.
- Watchlist se ažurira automatski pri gledanju, a sve je moguće ručno izmeniti.

### Van opsega (v1)
- macOS / Linux (samo Windows).
- Sinhronizacija sa AniList / MyAnimeList nalozima.
- Više korisničkih profila.
- Preporuke.
- Automatsko ažuriranje same AnimeDesk aplikacije (nova verzija se ručno skida sa GitHub Releases).

## 2. Ključne odluke

| Odluka | Izbor |
|---|---|
| Platforma | Electron (desktop) |
| UI | React + Vite (electron-vite šablon) |
| Jezik koda | JavaScript |
| Podaci | JSON fajlovi u `%APPDATA%/AnimeDesk` |
| Izvor animea | **originalna ani-cli skripta** (ne prepisuje se) |
| Info o animeu | AniList javni GraphQL API (bez naloga) |
| Jezik UI | srpski + engleski, izbor u Settings (podrazumevano srpski) |
| Instaler | electron-builder, NSIS `.exe`, GitHub Releases |
| Testovi | Vitest, React Testing Library, Playwright (smoke) |

### Pravilo bez spojlera
Aplikacija nikad ne prikazuje opis radnje bez eksplicitnog klika. Opis sa AniList-a
je sakriven iza dugmeta „Prikaži opis” / „Show description”. Ne prikazuju se
nazivi epizoda koji mogu otkriti radnju — epizode se prikazuju samo brojem.

## 3. Arhitektura

```
┌──────────────── Electron aplikacija ─────────────────┐
│  Renderer (React)                                    │
│   Pretraga · Watchlist · Preuzeto · Settings · Wizard│
│   Semafor u zaglavlju                                │
│            │  IPC (contextBridge, preload)           │
│  Main proces (Node)                                  │
│   ├─ ToolManager   – instalira/ažurira alate         │
│   ├─ HealthCheck   – test ani-cli → update → semafor │
│   ├─ AniCliBridge  – pokreće ani-cli, meni/plejer most│
│   ├─ PlayerMonitor – prati % odgledanog u mpv-u      │
│   ├─ Downloads     – red preuzimanja, napredak       │
│   ├─ Library       – watchlist (library.json)        │
│   ├─ AniList       – posteri, žanrovi, opis (keš)    │
│   └─ Settings + i18n                                 │
└──────────────────────────────────────────────────────┘
      ↓ pokreće
  bash (Git Bash / PortableGit) → ani-cli → mpv / yt-dlp / ffmpeg
```

Svaki modul u main procesu je zaseban fajl sa jasnim interfejsom i bez zavisnosti od
Electron-a gde god je moguće (radi testiranja). Electron-specifične stvari (IPC,
dijalozi, prozori) su u tankom sloju `src/main/ipc.js`.

### 3.1 ToolManager

Upravlja alatima u `%APPDATA%/AnimeDesk/tools/`:

| Alat | Izvor | Napomena |
|---|---|---|
| bash | postojeći Git for Windows (`C:\Program Files\Git\bin\bash.exe` ili iz PATH-a), inače **PortableGit** sa `git-for-windows/git` GitHub Releases (`PortableGit-*-64-bit.7z.exe`, raspakuje se sa `-o<dir> -y`) | ne traži admin prava; daje i `curl`, `sed`, `grep`, `patch` |
| ani-cli | GitHub Releases `pystardust/ani-cli` (poslednji tag, fajl `ani-cli`) | ažurira se automatski |
| mpv | GitHub Releases `mpv-player/mpv` (`*-x86_64-pc-windows-msvc.zip`) | |
| yt-dlp | GitHub Releases `yt-dlp/yt-dlp` (`yt-dlp.exe`) | ažurira se automatski |
| ffmpeg | gyan.dev `ffmpeg-release-essentials.zip` | |

- Svi alati osim bash-a su uvek „app-managed” (u folderu aplikacije), da bi verzije bile predvidive.
- `tools/manifest.json` čuva instalirane verzije.
- Svaki korak javlja napredak (preuzeto bajtova / ukupno) UI-ju.
- Preuzimanje ide u privremeni fajl; tek posle uspeha se premešta na pravo mesto.

### 3.2 AniCliBridge

Koristi **zvanična** ani-cli podešavanja (env varijable):

| Varijabla | Vrednost |
|---|---|
| `ANI_CLI_MENU` | putanja do `menu-bridge.sh` |
| `ANI_CLI_PLAYER` | putanja do `animedesk-mpv-bridge.sh` (ime **mora** sadržati `mpv` — ani-cli prepoznaje plejer po imenu), ili `download`, ili `debug` |
| `ANI_CLI_NO_DETACH` | `1` |
| `ANI_CLI_EXIT_AFTER_PLAY` | `1` |
| `ANI_CLI_DOWNLOAD_DIR` | `<izabrani folder>/<Naziv animea>` |
| `ANI_CLI_QUALITY` | iz Settings (podrazumevano `best`) |
| `ANI_CLI_MODE` | `sub` ili `dub` (Settings) |
| `ANI_CLI_HIST_DIR` | `%APPDATA%/AnimeDesk/ani-cli-history` |

**Komunikacija mostova sa aplikacijom:** main proces pokreće lokalni HTTP server na
`127.0.0.1` (nasumičan port) sa nasumičnim tokenom. Port i token se prosleđuju kroz
env varijable `ANIMEDESK_PORT` i `ANIMEDESK_TOKEN`. Mostovi koriste `curl`
(dolazi uz Git Bash):

- **menu-bridge.sh** — ani-cli ga poziva kao `menu-bridge.sh <extra_flags> "<prompt>"`
  sa listom na stdin-u. Skripta šalje `POST /menu` (prompt + lista), čeka odgovor
  i ispisuje izabranu liniju na stdout. Prazan odgovor = otkazano (izlaz 1).
- **animedesk-mpv-bridge.sh** — ani-cli ga poziva sa `--referrer=`, `--sub-file=`,
  `--force-media-title=` i linkom. Skripta šalje `POST /play` sa argumentima i čeka
  dok aplikacija ne javi da je mpv zatvoren; vraća mpv-ov izlazni kod.

Svaka sesija (jedno gledanje ili jedno preuzimanje) je jedno pokretanje ani-cli.
Kada aplikacija već zna koji naslov/epizodu želi (npr. „Nastavi” iz watchlist-e),
menu-bridge automatski odgovara bez prikaza UI-ja (pronalazi liniju po nazivu).
Za opseg epizoda koristi se ani-cli opcija `-e "<od>-<do>"`.

Greške: stderr ani-cli-ja se čita; poznate poruke (`No results found!`,
`Episode not released!`, …) mapiraju se na i18n ključeve. Nepoznata greška se
prikazuje kao opšta greška sa detaljima u „Prikaži detalje”.

### 3.3 PlayerMonitor

Pravi mpv se pokreće sa `--input-ipc-server=\\.\pipe\animedesk-mpv-<id>`.
PlayerMonitor preko pipe-a periodično čita `percent-pos` i pamti maksimum.

- `percent ≥ threshold` (Settings, podrazumevano 85) → epizoda označena kao odgledana.
- Ako je uključeno „Pitaj pri zatvaranju” → po zatvaranju mpv-a UI pita „Označi epizodu N kao odgledanu?” (umesto automatskog praga).
- Ako je automatsko praćenje isključeno → ništa se ne upisuje.
- Isto važi i za puštanje preuzetih fajlova (mpv se pokreće direktno, bez ani-cli).

### 3.4 Downloads

- Klik „Preuzmi” (jedna epizoda ili opseg) → ako folder nije zapamćen, Windows dijalog za izbor foldera sa opcijom „Zapamti ovaj folder”.
- Red preuzimanja: jedna aktivna sesija u isto vreme; stavke imaju status `čeka / preuzima / pauzirano / gotovo / greška`.
- Napredak se čita iz stdout-a yt-dlp-a (`[download]  42.3% of ...`).
- Pauza = prekid procesa; nastavak = ponovno pokretanje (yt-dlp nastavlja `.part` fajl).
- Fajl: `<folder>/<Naziv animea>/<Naziv animea> Episode <N>.mp4` (ime određuje ani-cli).
- `downloads.json` čuva listu preuzetih fajlova (putanja, anime, epizoda, veličina, datum).
- Sekcija „Preuzeto”: grupisano po seriji, dugmad **Pusti**, **Otvori folder**, **Obriši** (sa potvrdom). Pri otvaranju sekcije proverava se da li fajlovi postoje; nestali se označe i mogu se ukloniti sa liste.

### 3.5 Library (watchlist)

`library.json`:
```json
{
  "version": 1,
  "anime": {
    "<id>": {
      "id": "<uuid>",
      "title": "Naziv",
      "aniCliTitle": "Naziv kako ga vraća ani-cli ili null",
      "aniListId": 12345,
      "status": "watching | completed | planned | paused | dropped",
      "rating": 8,
      "comment": "slobodan tekst",
      "totalEpisodes": 24,
      "watchedEpisodes": [1, 2, 3],
      "episodeNotes": { "5": "beleška" },
      "addedAt": "ISO datum",
      "updatedAt": "ISO datum",
      "lastWatchedAt": "ISO datum ili null"
    }
  }
}
```

- Ocena: ceo broj 1–10 ili `null`.
- Automatski statusi (kada je automatsko praćenje uključeno):
  - prva odgledana epizoda serije koja nije u listi ili je `planned` → `watching`;
  - odgledana poslednja epizoda (`totalEpisodes` poznat) → `completed`.
  - Ručno postavljeni `paused` / `dropped` se ne menjaju automatski, osim u `watching` kada se ponovo gleda.
- Ručni unos: moguće dodati seriju pretragom (AniList) ili samo nazivom; sva polja su izmenjiva, uključujući listu odgledanih epizoda.
- Upis: zapis u `library.json.tmp`, pa `rename` (atomski). Pri učitavanju oštećenog fajla pravi se kopija `library.corrupt-<datum>.json` i korisnik se obaveštava.

### 3.6 AniList

- Javni GraphQL API (`https://graphql.anilist.co`), bez naloga.
- Pretraga po nazivu → id, poster, žanrovi, godina, broj epizoda, opis.
- Keš u `%APPDATA%/AnimeDesk/cache/anilist/` (JSON + posteri). Bez interneta se koristi keš; bez keša se prikazuje placeholder.
- Povezivanje ani-cli naslova sa AniList unosom: automatski po najboljem poklapanju naziva; korisnik može ručno promeniti.
- Opis se u UI-ju prikazuje samo posle klika na „Prikaži opis” (pravilo bez spojlera).

### 3.7 HealthCheck i semafor

Pri pokretanju aplikacije, na zahtev (klik „Proveri ponovo”) i posle greške u ani-cli:

1. Da li su svi alati instalirani? Ne → 🔴 „Potrebna instalacija” (dugme otvara wizard).
2. Test: `ani-cli` sa `ANI_CLI_PLAYER=debug` i menu-bridge-om u režimu automatskog odgovora pretražuje fiksni naslov (npr. „one piece”, epizoda 1) i očekuje link u izlazu. Timeout 30 s.
3. Test prošao → 🟢.
4. Test pao → 🟡 „Ažuriranje…” → ToolManager proveri novi ani-cli (i yt-dlp) na GitHub-u → ako postoji, instalira i ponavlja test.
5. I dalje pada → 🔴 „Izvor trenutno ne radi — čeka se popravka od ani-cli tima”. Proverava se ponovo pri sledećem pokretanju i svakih 6 h dok aplikacija radi.
6. Nema interneta → 🔴 „Nema internet konekcije”.

Dodatno: jednom dnevno (pri pokretanju) provera novih verzija ani-cli i yt-dlp, i automatska instalacija (može se isključiti u Settings).

Dok semafor nije 🟢, dugmad **Gledaj** i **Preuzmi** su onemogućena, uz poruku
„Potrebno je instalirati komponente da bi se nastavilo” i dugme za wizard / detalje.
Watchlist, preuzete epizode (lokalno puštanje zahteva samo mpv) i Settings rade uvek.

### 3.8 Wizard

- Prikazuje se automatski pri prvom pokretanju ili kada neka komponenta nedostaje.
- Lista komponenti sa statusom (🔴 nedostaje / 🟡 instalira se + traka napretka / 🟢 instalirano).
- Dugme „Instaliraj sve”; pojedinačno ponavljanje ako neka instalacija padne.
- Na kraju automatski pokreće HealthCheck.

### 3.9 Settings

| Podešavanje | Podrazumevano |
|---|---|
| Jezik | `sr` |
| Automatsko praćenje gledanja | uključeno |
| Prag „odgledano” (%) | 85 |
| Pitaj pri zatvaranju plejera (umesto praga) | isključeno |
| Folder za preuzimanje | nije postavljen (pita svaki put) |
| Kvalitet | `best` |
| Režim | `sub` |
| Automatsko ažuriranje ani-cli i yt-dlp | uključeno |

Čuva se u `%APPDATA%/AnimeDesk/settings.json` (isti atomski upis kao Library).

### 3.10 i18n

- `src/renderer/i18n/sr.json` i `en.json`, isti ključevi.
- Promena jezika se primenjuje odmah, bez restarta.

## 4. UI ekrani

- **Zaglavlje**: naziv, navigacija (Pretraga · Watchlist · Preuzeto · Settings), semafor.
- **Pretraga**: polje za pretragu → kartice rezultata (iz ani-cli, obogaćene AniList posterom) → izbor epizode (mreža brojeva, odgledane označene) → Gledaj / Preuzmi / Dodaj u watchlist.
- **Watchlist**: kartice sa posterom, filteri po statusu, sortiranje (naziv, ocena, poslednje gledano). Detalj serije: status, ocena 1–10, komentar, napredak (N / ukupno), mreža epizoda sa beleškama, „Nastavi gledanje”, žanrovi, godina, skriven opis.
- **Preuzeto**: red preuzimanja (trake napretka, pauza/otkaži) + lista preuzetog po seriji.
- **Settings**: sve iz 3.9, plus verzije alata i dugme „Proveri ažuriranja”.
- **Wizard**: vidi 3.8.

## 5. Struktura projekta

```
AnimeDesk/
  package.json
  electron.vite.config.js
  electron-builder.yml
  resources/bridges/menu-bridge.sh
  resources/bridges/animedesk-mpv-bridge.sh
  src/main/        index.js, ipc.js, bridgeServer.js,
                   toolManager.js, healthCheck.js, aniCliBridge.js,
                   playerMonitor.js, downloads.js, library.js,
                   anilist.js, settings.js, jsonStore.js, paths.js
  src/preload/     index.js
  src/renderer/    App.jsx, components/, pages/, i18n/
  tests/unit/  tests/integration/  tests/e2e/
  tests/fixtures/fake-ani-cli.sh
  docs/superpowers/specs/
```

## 6. Testiranje

TDD — testovi se pišu pre implementacije.

1. **Unit (Vitest)**: Library (CRUD, automatski statusi, beleške, atomski upis, oštećen fajl), PlayerMonitor (prag, promenljiv prag, „pitaj pri zatvaranju”, isključeno praćenje), Downloads (parsiranje yt-dlp izlaza, red, pauza/nastavak), Settings (podrazumevane vrednosti), i18n (isti ključevi u `sr` i `en`), HealthCheck (sve kombinacije stanja → boja semafora).
2. **Integracioni**: `tests/fixtures/fake-ani-cli.sh` poziva `$ANI_CLI_MENU` i `$ANI_CLI_PLAYER` na isti način kao pravi ani-cli; testira se ceo tok pretraga → izbor → plejer → watchlist bez interneta.
3. **UI (React Testing Library)**: boja semafora, blokirana dugmad kad komponente nisu spremne, skriven opis dok se ne klikne.
4. **Živi test (ručno)**: `npm run test:live` — pravi ani-cli, isti test kao HealthCheck.
5. **Smoke (Playwright za Electron)**: aplikacija se pokreće i prikazuje wizard kada alati nedostaju.

## 7. Distribucija

- `electron-builder` → NSIS instaler `AnimeDesk-Setup-<verzija>.exe`, objavljen na GitHub Releases.
- Instaler ne sadrži mpv/yt-dlp/ffmpeg/ani-cli/PortableGit — preuzima ih wizard.
- README (sr + en): instalacija, šta aplikacija preuzima i odakle, licence alata, i napomena da ani-cli koristi neoficijalne izvore (pravna siva zona; korisnik je odgovoran za upotrebu).

## 8. Rizici

| Rizik | Ublažavanje |
|---|---|
| Sajt koji ani-cli koristi prestane da radi | HealthCheck + automatski update ani-cli; jasna poruka na semaforu |
| ani-cli promeni način pozivanja menija/plejera | koriste se samo zvanične env varijable; HealthCheck to odmah otkriva; izmena je ograničena na `resources/bridges/` i `aniCliBridge.js` |
| Promena naziva fajlova na GitHub Releases alata | nazivi fajlova se traže po šablonu, ne po tačnom imenu; greška se jasno prikazuje u wizard-u |
| DMCA zahtev prema GitHub repozitorijumu | napomena u README; aplikacija ne sadrži kod za pristup sajtu (sve radi ani-cli) |
