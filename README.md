# AnimeDesk

Desktop aplikacija (Windows) za gledanje i preuzimanje animea preko [ani-cli](https://github.com/pystardust/ani-cli), sa ličnom watchlist-om.
*A Windows desktop app for watching and downloading anime through ani-cli, with a personal watchlist.*

## Srpski

### Šta radi
- Pretraga, izbor epizode i gledanje u **mpv** plejeru.
- Watchlist: status (Gledam, Završeno, Planiram, Pauzirano, Odustao), ocena 1–10, komentar i beleške po epizodi. Napredak se prati automatski (podesivo).
- Preuzimanje epizoda u izabrani folder, red preuzimanja sa pauzom.
- Semafor pokazuje da li sve radi; ako izvor prestane da radi, aplikacija sama preuzme novu verziju ani-cli.
- Bez spojlera: opisi su sakriveni dok ne klikneš „Prikaži opis”.

### Instalacija
1. Skini `AnimeDesk-Setup-<verzija>.exe` sa [Releases](https://github.com/leqora/AnimeDesk/releases) i instaliraj.
2. Pri prvom pokretanju klikni **Instaliraj sve** — aplikacija sama preuzima potrebne alate u `%APPDATA%\AnimeDesk\tools`.

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
- Search, pick an episode and watch it in **mpv**.
- Watchlist with status, 1–10 rating, comment and per-episode notes; progress is tracked automatically (configurable).
- Download episodes to a folder of your choice, with a pausable queue.
- A status light shows whether everything works; if the source breaks, the app fetches the newest ani-cli by itself.
- Spoiler-free: descriptions stay hidden until you click "Show description".

### Install
1. Download `AnimeDesk-Setup-<version>.exe` from [Releases](https://github.com/leqora/AnimeDesk/releases) and install it.
2. On first launch click **Install all** — the app downloads the tools it needs into `%APPDATA%\AnimeDesk\tools`.

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
