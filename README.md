# AnimeDesk

Desktop aplikacija (Windows) za gledanje i preuzimanje animea preko [ani-cli](https://github.com/pystardust/ani-cli), sa ličnom watchlist-om.
*A Windows desktop app for watching and downloading anime through ani-cli, with a personal watchlist.*

## Srpski

### Šta radi
- Pretraga, izbor epizode (grupe, „idi na epizodu”) i gledanje u **ugrađenom plejeru** ili spoljnom **mpv**-u.
- Preskakanje uvoda/rezimea (AniSkip, i automatski), sledeća epizoda sa odbrojavanjem, „Nastavi od…”.
- Plejer: krug učitavanja i „Sporo učitavanje…”, pamćenje jačine zvuka, dvoklik = pun ekran, bedž prave rezolucije i obaveštenje kad ani-cli ne dâ traženi kvalitet (u ugrađenom plejeru), automatski oporavak zaglavljenog strima.
- Kvalitet i sub/dub po seriji, favoriti i „Nastavi gledanje”, pun ekran (F11).
- Watchlist: status (Gledam, Završeno, Planiram, Pauzirano, Odustao), ocena 1–10, komentar i beleške po epizodi. Napredak se prati automatski (podesivo).
- Preuzimanje epizoda u izabrani folder, red preuzimanja sa pauzom.
- Semafor pokazuje da li sve radi; ako izvor prestane da radi, aplikacija sama preuzme novu verziju ani-cli.
- Bez spojlera: opisi su sakriveni dok ne klikneš „Prikaži opis”.
- Slike i podaci o animeu sa [AniList](https://anilist.co) (sa kešom; slike se pojavljuju postepeno jer AniList ograničava broj zahteva).
- Moderan izgled: bočni meni, „Nastavi gledanje” baner, animacije (mogu da se isključe).
- Profil sa nivoima i XP-om za odgledane epizode, statistika, zvuci (podesivo).
- Automatsko ažuriranje aplikacije na klik; trenutna verzija piše u donjem levom uglu.

### Instalacija
1. Skini `AnimeDesk-Setup-<verzija>.exe` sa [Releases](https://github.com/leqora/AnimeDesk/releases) i instaliraj.
2. Pri prvom pokretanju klikni **Instaliraj sve** — aplikacija sama preuzima potrebne alate u `%APPDATA%\AnimeDesk\tools`.

### Ažuriranja
Od verzije 0.3.0 aplikacija sama proverava da li postoji nova verzija (pri pokretanju i na svakih 6 sati) i preuzima je u pozadini. Kad je spremna, klikni **Restartuj i ažuriraj** — ništa se ne instalira bez tvog klika. Automatsko preuzimanje možeš isključiti u Podešavanjima. Verzije 0.1 i 0.2 nemaju ovu opciju, pa 0.3.0 treba jednom instalirati ručno.

### Šta aplikacija preuzima i odakle
| Alat | Izvor |
|---|---|
| ani-cli | github.com/pystardust/ani-cli (GPL-3.0) |
| mpv | github.com/mpv-player/mpv (GPL-2.0+/LGPL) |
| yt-dlp | github.com/yt-dlp/yt-dlp (Unlicense) |
| ffmpeg | github.com/GyanD/codexffmpeg (GPL) |
| PortableGit (samo ako Git nije instaliran) | github.com/git-for-windows/git (GPL-2.0) |

### Napomena
ani-cli koristi neoficijalne izvore sadržaja. To je pravno siva zona; korisnik je sam odgovoran za način upotrebe. Za legalno gledanje koristi zvanične servise.

## English

### Features
- Search, pick an episode (groups, "go to episode") and watch it in the **built-in player** or external **mpv**.
- Skip intro/recap (AniSkip, optionally automatic), next episode with a countdown, "Resume from…".
- Player: loading spinner and "Slow connection…", remembered volume, double-click = fullscreen, real-resolution badge and a notice when ani-cli cannot deliver the requested quality (built-in player only), automatic recovery of a stalled stream.
- Per-series quality and sub/dub, favourites and "Continue watching", fullscreen (F11).
- Watchlist with status, 1–10 rating, comment and per-episode notes; progress is tracked automatically (configurable).
- Download episodes to a folder of your choice, with a pausable queue.
- A status light shows whether everything works; if the source breaks, the app fetches the newest ani-cli by itself.
- Spoiler-free: descriptions stay hidden until you click "Show description".
- Posters and anime details from [AniList](https://anilist.co) (cached; posters appear gradually because AniList rate-limits requests).
- Modern look: sidebar, "Continue watching" banner, animations (can be turned off).
- Profile with levels and XP for watched episodes, statistics, sounds (configurable).
- One-click app updates; the current version is shown in the bottom-left corner.

### Install
1. Download `AnimeDesk-Setup-<version>.exe` from [Releases](https://github.com/leqora/AnimeDesk/releases) and install it.
2. On first launch click **Install all** — the app downloads the tools it needs into `%APPDATA%\AnimeDesk\tools`.

### Updates
Since 0.3.0 the app checks for a new version (on start and every 6 hours) and downloads it in the background. When it is ready, click **Restart and update** — nothing is installed without your click. You can turn automatic downloads off in Settings. Versions 0.1 and 0.2 cannot update themselves, so install 0.3.0 manually once.

### Disclaimer
ani-cli relies on unofficial content sources. This is a legal grey area and you are responsible for how you use it. Use official services for legal streaming.

## Development
```bash
npm install
npm run dev        # start the app
npm test           # unit + integration tests
npm run test:live  # real ani-cli self-test (needs internet)
npm run test:e2e   # Electron smoke test
npm run dist       # build the Windows installer
```
Release: bump `version` in package.json, write `docs/releases/v<version>.md`, merge to `main`, push, then `npm run release` (publishes a draft, verifies SHA-256 of the installer, blockmap and `latest.yml`, then marks it Latest).

Project status, verified behaviour and known issues: [`docs/STATUS.md`](docs/STATUS.md). Design specs and plans: `docs/superpowers/`. Tracked risks: [`docs/RIZICI.md`](docs/RIZICI.md).
