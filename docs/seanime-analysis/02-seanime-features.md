# Seanime – kompletan katalog feature-a (Faza 2)

> Izvor: zvanična dokumentacija (https://seanime.app/docs, rspress sajt; sadržaj preuzet kao statički `.html` za svaku rutu iz route-manifesta), dokumentacija za ekstenzije (https://seanime.gitbook.io/seanime-extensions) i shallow clone izvornog koda u `C:\Users\Nikola\Desktop\Projekti\_ref\seanime`.
> Napomena: `docs/` folder u repou sadrži samo `images/seanime-logo.png` – izvorni tekstovi dokumentacije NISU u repou, pa je sve preuzeto sa sajta.
> Reference na kod su u formatu `seanime/<putanja>:<linija>` (relativno u odnosu na koren clone-a). Frontend = `seanime-web/src/...`, Desktop = `seanime-denshi/src/...`.
> Bez spojlera: primeri iz dokumentacije koji pominju konkretne naslove namerno nisu preneti.

## Posećene stranice dokumentacije

**seanime.app (35 stranica):**

1. https://seanime.app/docs (indeks / „Guides“ i „Resources“)
2. https://seanime.app/docs/getting-started
3. https://seanime.app/docs/changelog
4. https://seanime.app/docs/config
5. https://seanime.app/docs/logs (Troubleshooting)
6. https://seanime.app/docs/comparison
7. https://seanime.app/docs/local-anime-library
8. https://seanime.app/docs/autodownloader
9. https://seanime.app/docs/scanner
10. https://seanime.app/docs/access (Remote Access)
11. https://seanime.app/docs/mobile (Mobile & Other Devices)
12. https://seanime.app/docs/transcode
13. https://seanime.app/docs/streaming
14. https://seanime.app/docs/streaming-torrent
15. https://seanime.app/docs/streaming-debrid
16. https://seanime.app/docs/streaming-online
17. https://seanime.app/docs/autoselect
18. https://seanime.app/docs/manga
19. https://seanime.app/docs/nakama (Sharing & Watch Together)
20. https://seanime.app/docs/offline
21. https://seanime.app/docs/anime-entry (Anime Features)
22. https://seanime.app/docs/videocore
23. https://seanime.app/docs/mpvcore
24. https://seanime.app/docs/customization
25. https://seanime.app/docs/policies
26. https://seanime.app/docs/playlists
27. https://seanime.app/docs/playback („Documentation coming soon“ – prazna)
28. https://seanime.app/docs/hooks (referenca svih hook-ova za pluginove, ~115 KB)
29. https://seanime.app/docs/tenji/
30. https://seanime.app/docs/tenji/player
31. https://seanime.app/docs/tenji/manga
32. https://seanime.app/docs/tenji/downloads
33. https://seanime.app/docs/tenji/settings
34. https://seanime.app/docs/mobile-server/
35. https://seanime.app/docs/mobile-server/library

Route-manifest sadrži i alias rute (`/docs/debridstream`, `/docs/download`, `/docs/entry`, `/docs/manga-download`, `/docs/manga-reader`, `/docs/online-streaming`, `/docs/scanning`, `/docs/torrentstream`) – to su preusmerenja na gore navedene stranice. Stranica `/guides` sadrži interaktivne „step-through“ vodiče (Desktop Local Library Setup, Desktop Streaming Setup, Connect Tenji, Standalone Android/iOS, Nakama, Troubleshooting) koji se renderuju u JS-u i nemaju statički sadržaj; njihove teme su pokrivene gornjim stranicama.

**seanime.gitbook.io/seanime-extensions (11 stranica):** `llms.txt` (kompletan indeks ~70 stranica), `seanime/readme`, `content-providers/write-test-share`, `content-providers/anime-torrent-provider`, `content-providers/manga-provider`, `content-providers/online-streaming-provider`, `content-providers/custom-source`, `plugins/introduction`, `plugins/permissions`, `plugins/ui/anime-library/continuity`, `plugins/ui/anime-library/videocore`.

---

## 1. Instalacija i podešavanje

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 1.1 | Seanime Denshi (desktop klijent) | Electron GUI sa tray ikonom i ugrađenim serverom; daje i Web UI u browseru. Instaleri za Windows, macOS (.dmg) i Linux (AppImage). | /docs/getting-started | `seanime/seanime-denshi/src/main/index.ts:868` (createMainWindow) |
| 1.2 | Server verzija (headless) | Jedan binarni fajl; na Windowsu radi kao tray aplikacija, na macOS/Linux u terminalu; Web UI na `http://127.0.0.1:43211`. | /docs/getting-started | `seanime/main.go`, `seanime/internal/server/server.go`, `seanime/internal/core/app.go` |
| 1.3 | Treće strane: Docker, Scoop, NixOS, Termux | Zajednički održavani načini instalacije (nisu zvanični). | /docs/getting-started | kod nije pronađen (van repoa) |
| 1.4 | Getting Started ekran (onboarding) | Početni setup u aplikaciji pri prvom pokretanju. | /docs/getting-started, /docs/changelog (v2.2) | `seanime/seanime-web/src/app/(main)/_features/getting-started/getting-started-page.tsx:685` |
| 1.5 | Konfiguracija eksternih aplikacija | Uputstva za qBittorrent/Transmission Web UI, VLC (Lua HTTP), MPC-HC (web interfejs), MPV (u PATH), IINA (CLI putanja). | /docs/getting-started | `seanime/internal/mediaplayers/`, `seanime/internal/torrent_clients/` |
| 1.6 | Data direktorijum i `config.toml` | Jedna instanca = jedan data dir (`%APPDATA%\Seanime`), `config.toml` za cache, DB, logove, manga, offline, server (host/port/password), web asset dir. | /docs/config | `seanime/internal/core/config.go:27` |
| 1.7 | Više instanci | Pokretanje sa `--datadir` / `SEANIME_DATA_DIR` i različitim portom (nije moguće za desktop app). | /docs/config | `seanime/internal/core/flags.go`, `seanime/internal/core/config.go` |
| 1.8 | Env varijable | `SEANIME_DATA_DIR`, `SEANIME_SERVER_HOST`, `SEANIME_SERVER_PORT`, `SEANIME_WORKING_DIR`. | /docs/config | `seanime/internal/core/config.go` |
| 1.9 | Samoažuriranje i update kanali | Periodična provera GitHub release-a, notifikacija o novoj verziji; kanali GitHub / Seanime / Seanime Canary sa fallback-om. | /docs/getting-started, /docs/changelog (v3.5) | `seanime/internal/updater/updater.go:62`, `seanime/internal/updater/selfupdate.go:79`, `seanime/internal/handlers/releases.go:25` |
| 1.10 | Najave (announcements) | Server dohvata najave i prikazuje ih po verziji/platformi. | /docs/changelog | `seanime/internal/updater/announcement.go:65`, `seanime/seanime-web/src/app/(main)/_features/announcements.tsx` |
| 1.11 | Changelog tour / update modal | Prikaz novina posle ažuriranja i vođena tura. | /docs/changelog | `seanime/seanime-web/src/app/(main)/_features/tour/changelog-tour.tsx:14`, `seanime/seanime-web/src/app/(main)/_features/update/update-modal.tsx:30` |

## 2. Bezbednost i udaljeni pristup

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 2.1 | Server password | `server.password` uključuje autentifikovan udaljeni pristup; obavezno za hostovane instance. | /docs/config | `seanime/internal/core/hmac_auth.go:10`, `seanime/internal/handlers/auth.go:15`, `seanime/internal/handlers/server_auth_middleware.go` |
| 2.2 | Secure mode (`''`/hardened/lax/strict) | Granica za pristup bez lozinke: lokalno/LAN/samo loopback; strict dodatno ograničava ekstenzije, putanje i plugin API-je. | /docs/config | `seanime/internal/core/security.go:18`, `seanime/internal/handlers/strict_security.go`, `seanime/internal/handlers/request_boundary.go` |
| 2.3 | accessAllowlist / trustedProxies / externalURL | Izuzeci za javne hostove i podrška za reverse proxy (X-Forwarded-*). | /docs/config | `seanime/internal/core/config.go:27` |
| 2.4 | TLS (self-signed) | `[server.tls] enabled=true` generiše sertifikat. | /docs/config, /docs/changelog (v3.1) | `seanime/internal/core/tlsutil.go:27` |
| 2.5 | DNS over HTTPS | `dohurl` u configu za zaobilaženje ISP blokada. | /docs/config | `seanime/internal/doh/doh.go:12` |
| 2.6 | Remote access (LAN, VPN, port forwarding, reverse proxy) | Host `0.0.0.0`, pristup preko privatne IP adrese, Tailscale/WireGuard, Caddy/Nginx/Cloudflare Tunnel. | /docs/access | `seanime/internal/core/config.go` (host/port) |
| 2.7 | Extension Secure Mode | Prompt kada ekstenzija pokuša osetljivu akciju. | /docs/changelog (v3.8) | `seanime/internal/plugin/secure.go:11`, `seanime/internal/extension_repo/prompt` |
| 2.8 | Outbound security | Ograničenja odlaznih zahteva. | kod-only | `seanime/internal/security/outbound.go` |

## 3. Biblioteka i skener

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 3.1 | Skener lokalnih fajlova | Prolazi kroz library putanje, parsira imena (Habari parser), uparuje sa AniList kolekcijom i hidrira metapodatke. | /docs/scanner | `seanime/internal/library/scanner/scan.go:58` |
| 3.2 | Context-aware matching | Uparivanje sa varijacijama naslova, sezonama, delovima, analizom foldera i relacija (prequels). | /docs/scanner, /docs/changelog (v3.5) | `seanime/internal/library/scanner/matcher.go:112`, `seanime/internal/library/scanner/media_tree_analysis.go` |
| 3.3 | Skeniranje bez AniList kolekcije | Isključivanjem „Use my AniList collection only“ koristi eksterne izvore (Anime Offline Database). | /docs/local-anime-library | `seanime/internal/library/scanner/media_fetcher.go:54`, `seanime/internal/api/animeofflinedb/animeofflinedb.go:50` |
| 3.4 | Hidracija metapodataka | Dodela broja epizode, AniDB epizode i tipa (Main/Special/NC); normalizacija apsolutne numeracije preko prequel relacija; filmovi = ep. 1; epizoda 0. | /docs/scanner | `seanime/internal/library/scanner/hydrator.go:57` |
| 3.5 | Matching rules / Hydration rules | Regex pravila (JSON) koja forsiraju mediaId ili epizodu/tip po fajlu. | /docs/scanner | `seanime/internal/library/scanner/config.go:5` |
| 3.6 | Izbor algoritma i praga uparivanja | Podešavanje matching algoritma, praga i legacy matchinga. | /docs/changelog (v2.6, v3.5) | `seanime/internal/database/models/models.go:94` |
| 3.7 | Više library foldera | Dodavanje više putanja biblioteke. | /docs/local-anime-library | `seanime/internal/database/models/models.go:111` |
| 3.8 | Auto scan (directory watcher) | Automatsko osvežavanje biblioteke na promenu fajlova. | /docs/local-anime-library | `seanime/internal/library/scanner/watcher.go:47`, `seanime/internal/library/autoscanner/autoscanner.go:60` |
| 3.9 | Refresh library on start | Opcija za osvežavanje pri pokretanju. | podešavanje | `seanime/internal/database/models/models.go:86` |
| 3.10 | Scan summaries | Pregled razloga za (ne)uparene fajlove posle skeniranja. | /docs/local-anime-library | `seanime/internal/library/summary/scan_summary.go:76`, `seanime/seanime-web/src/app/(main)/scan-summaries/page.tsx:25` |
| 3.11 | Zaključavanje fajlova (lock) i ignorisanje | Zaključani fajlovi se ne skeniraju ponovo; fajlovi se mogu ignorisati. | /docs/local-anime-library | `seanime/internal/library/scanner/ignore.go`, `seanime/internal/library/anime/localfile.go` |
| 3.12 | Shelved local files | Zaključani fajlovi sa nedostupne putanje (eksterni disk) se „odlože“ i vrate bez punog skena. | /docs/changelog (v3.4) | `seanime/internal/database/models/models.go:40` |
| 3.13 | Resolve unmatched | Ručno rešavanje neuparenih fajlova sa pretragom i preview-om. | /docs/local-anime-library | `seanime/internal/handlers/localfiles.go`, `seanime/seanime-web/src/app/(main)/entry/_containers/entry-actions/anime-entry-unmatch-files-modal.tsx` |
| 3.14 | Library Explorer | Stablo fajlova: pregled pogrešnih uparivanja, match/unmatch, izmena metapodataka, brisanje fajlova, ignorisanje. | /docs/local-anime-library, /docs/anime-entry | `seanime/internal/library_explorer/explorer.go:32`, `seanime/seanime-web/src/app/(main)/_features/library-explorer/library-explorer.tsx:182` |
| 3.15 | Super Update (bulk rename/metadata) | Masovna promena imena fajlova i metapodataka pravilima (search/replace, enumeracija `${start=1}`). | /docs/anime-entry | `seanime/internal/library_explorer/superupdate.go:25`, `seanime/seanime-web/src/app/(main)/_features/library-explorer/library-explorer-super-update.tsx:16` |
| 3.16 | Bulk akcije | Preuzimanje, unmatch, brisanje i zaključavanje fajlova iz menija. | /docs/local-anime-library | `seanime/seanime-web/src/app/(main)/entry/_containers/entry-actions/anime-entry-bulk-delete-files-modal.tsx` |
| 3.17 | Ručna izmena metapodataka fajla | Override broja epizode/tipa. | /docs/local-anime-library | `seanime/internal/handlers/localfiles.go` |
| 3.18 | Export/import library podataka | Dump i uvoz lokalnih fajlova. | /docs/changelog (v2.2) | `seanime/internal/handlers/localfiles.go:38`, `seanime/internal/handlers/localfiles.go:67` |
| 3.19 | Missing episodes / „Missing from your library“ | Lista epizoda koje nedostaju (ignoriše dropped); može se utišati po animeu (zvonce). | /docs/local-anime-library, /docs/anime-entry | `seanime/internal/library/anime/missing_episodes.go:24`, `seanime/internal/database/db/silenced_media_entry.go:8`, `seanime/seanime-web/src/app/(main)/entry/_containers/entry-actions/anime-entry-silence-toggle.tsx:12` |
| 3.20 | Preuzimanje lokalnih fajlova na uređaj | Opcija za skidanje fajla iz biblioteke u browser. | /docs/changelog (v2.1) | `seanime/internal/mediastream/directplay.go:27` |
| 3.21 | Otvaranje foldera u Exploreru | Otvaranje direktorijuma u podrazumevanom file manageru. | /docs/changelog (v3.7) | `seanime/internal/handlers/explorer.go:18` |

## 4. Metadata, AniList, MAL i nalozi

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 4.1 | AniList integracija | Login, pregled i izmena lista (status, skor, progres, repeat, datumi). | /docs/comparison | `seanime/internal/platforms/anilist_platform/anilist_platform.go:40`, `seanime/internal/platforms/anilist_platform/anilist_platform.go:98` |
| 4.2 | Lokalni nalog (bez AniList-a) | Od v2.9 AniList nalog nije obavezan; sve se čuva lokalno (simulated platform). | /docs/changelog (v2.9) | `seanime/internal/platforms/simulated_platform/simulated_platform.go:49`, `seanime/seanime-web/src/app/(main)/settings/_containers/local-settings.tsx:18` |
| 4.3 | Cache layer (zero downtime) | Svi AniList zahtevi se keširaju na disk; app radi i kad je AniList pao, uz red čekanja izmena. | /docs/changelog (v3.0, v3.8) | `seanime/internal/platforms/shared_platform/cachelayer.go:205`, `seanime/internal/platforms/shared_platform/cachelayer_queue.go` |
| 4.4 | Periodično osvežavanje AniList podataka | Cron posao osvežava kolekcije i lokalne podatke. | kod-only | `seanime/internal/cron/refresh_anilist.go:7` |
| 4.5 | Metadata epizoda (AniDB/TheTVDB preko ani.zip / Animap) | Naslovi, slike (thumbnailovi), opisi i datumi epizoda na osnovu AniList→AniDB mapiranja. | /docs/local-anime-library | `seanime/internal/api/metadata_provider/anime.go:33`, `seanime/internal/api/anizip/anizip.go:73`, `seanime/internal/api/animap/animap.go:69` |
| 4.6 | Fallback metadata provider | Rezervni izvor metapodataka. | kod-only (podešavanje) | `seanime/internal/database/models/models.go:100` |
| 4.7 | Metadata Parent | Povezivanje specijala (zaseban AniList unos) sa roditeljskom serijom radi AniDB metapodataka, uz offset. | /docs/anime-entry | `seanime/internal/handlers/metadata.go:102`, `seanime/internal/database/db/media_metadata_parent.go:15` |
| 4.8 | MyAnimeList integracija | OAuth login i ažuriranje progresa na MAL-u (dokumentacija kaže da je u praksi „Plugin“ nivo). | /docs/comparison | `seanime/internal/handlers/mal.go:33`, `seanime/internal/api/mal/wrapper.go:28` |
| 4.9 | Custom Sources | Ekstenzije koje dodaju anime/mangu van AniList-a (sopstveni ID-evi, metapodaci). | /docs/changelog (v3.0), gitbook custom-source | `seanime/internal/customsource/customsource.go:59`, `seanime/seanime-web/src/app/(main)/custom-sources/page.tsx:24` |
| 4.10 | Adult sadržaj / blur, skrivanje audience skora | AniList podešavanja za 18+ sadržaj i skrivanje skora. | /docs/comparison | `seanime/internal/database/models/models.go:63` |
| 4.11 | AniList statistika | Statistika gledanja/čitanja. | /docs/comparison | `seanime/internal/api/anilist/stats.go:40`, `seanime/seanime-web/src/app/(main)/lists/_containers/anilist-stats.tsx:56` |
| 4.12 | Liste (My Lists) | Pregled AniList lista sa filterima. | /docs/comparison | `seanime/seanime-web/src/app/(main)/lists/_containers/anilist-collection-lists.tsx` |

## 5. Pretraga i otkrivanje

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 5.1 | Advanced search | Pretraga AniList-a sa filterima (žanr, sezona, format, tagovi od v3.7), čuva parametre pri navigaciji. | /docs/changelog (v2.6, v3.7) | `seanime/internal/handlers/anilist.go:302`, `seanime/seanime-web/src/app/(main)/search/_components/advanced-search-options.tsx:36` |
| 5.2 | Discover stranica | Trending, popular, upcoming, trending po zemlji, filmovi, manga, airing schedule. | /docs/comparison | `seanime/seanime-web/src/app/(main)/discover/page.tsx:21` |
| 5.3 | „You Might Have Missed“ (propušteni nastavci) | Lista nastavaka serija koje su završene u listi. | /docs/hooks (onListMissedSequels) | `seanime/seanime-web/src/app/(main)/discover/_containers/discover-missed-sequels.tsx:10` |
| 5.4 | Studio detalji, preporuke, relacije | Detalji studija i sekcija relacija/preporuka na stranici animea. | kod-only | `seanime/internal/handlers/anilist.go:194`, `seanime/seanime-web/src/app/(main)/entry/_components/relations-recommendations-section.tsx` |
| 5.5 | Command palette (Sea Command) | `Ctrl+J`/`q`: brza navigacija, pretraga, akcije, magnet linkovi, `/spoilers`. | /docs/changelog (v2.7, v3.8) | `seanime/seanime-web/src/app/(main)/_features/sea-command/sea-command.tsx:25` |
| 5.6 | Brza pretraga tasterom `S` | Prečica za pretragu bilo gde. | /docs/changelog (v3.5) | `seanime/seanime-web/src/app/(main)/_features/sea-command/sea-command-search.tsx` |

## 6. Detalji animea i epizode

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 6.1 | Anime entry stranica | Header, meta sekcija, tabovi izvora (Library/Torrent/Debrid/Online), sledeća epizoda u emitovanju. | /docs/anime-entry | `seanime/internal/library/anime/entry.go:75`, `seanime/seanime-web/src/app/(main)/entry/_containers/anime-entry-page.tsx:42` |
| 6.2 | Lista epizoda sa thumbnailovima | Kartice/grid epizoda sa slikom, naslovom, opisom; paginacija; grid brojeva za online stream. | /docs/changelog (v2.9) | `seanime/internal/library/anime/episode_collection.go:53`, `seanime/seanime-web/src/app/(main)/entry/_containers/episode-list/episode-section.tsx:31`, `seanime/seanime-web/src/app/(main)/entry/_components/episode-list-grid.tsx:10` |
| 6.3 | Filler info | Dohvatanje filler podataka (AnimeFillerList) iz menija; prikaz na karticama (i u online streamu). | /docs/anime-entry | `seanime/internal/library/fillermanager/fillermanager.go:52`, `seanime/internal/api/filler/filler.go:55` |
| 6.4 | Hide Anime Spoilers | Skrivanje naslova, opisa i thumbnailova neodgledanih epizoda (+ override po naslovu preko `/spoilers`). | /docs/changelog (v3.8) | `seanime/seanime-web/src/lib/theme/anime-spoilers.ts:100`, `seanime/seanime-web/src/app/(main)/_features/sea-command/sea-command-spoilers.tsx:22`, `seanime/internal/database/models/models.go:415` |
| 6.5 | Kontekst meni epizode | Desni klik: Add to Playlist, Play Externally (otvaranje u eksternom plejeru bez promene podešavanja). | /docs/anime-entry | `seanime/seanime-web/src/app/(main)/_features/context-menu/sea-context-menu.tsx` |
| 6.6 | Upcoming episodes | Lista predstojećih epizoda iz liste. | kod-only | `seanime/internal/library/anime/upcoming_episodes.go:38`, `seanime/seanime-web/src/app/(main)/schedule/_containers/upcoming-episodes.tsx:17` |
| 6.7 | Continue Watching + sortiranje po istoriji | Nastavak gledanja; sortiranje po poslednjem gledanju (watch history). | /docs/changelog (v2.8) | `seanime/internal/library/anime/collection.go:98`, `seanime/internal/database/models/models.go:395` |
| 6.8 | Uključivanje streaming epizoda u biblioteku | „Local anime + Streaming“: home/biblioteka uključuje i nepreuzete epizode koje gledaš. | /docs/streaming | `seanime/internal/database/models/models.go:80`, `seanime/internal/torrentstream/collection.go:33` |
| 6.9 | Trejleri na karticama | Prikaz trejlera na anime karticama (može se isključiti). | kod-only | `seanime/internal/database/models/models.go:81` |
| 6.10 | Random episode | Pusti nasumičnu epizodu. | kod-only | `seanime/internal/library/playbackmanager/play_random_episode.go:19` |
| 6.11 | Torrent availability badge | Opcioni bedž dostupnosti za nedavno izašle epizode (torrent). | /docs/changelog (v3.10) | `seanime/internal/torrents/availability/monitor.go:55`, `seanime/internal/handlers/anime_entries.go:510` |

## 7. Raspored / kalendar

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 7.1 | Release calendar | Kalendar prošlih i budućih epizoda za serije iz liste, sa filterima i izborom početka nedelje. | /docs/changelog (v2.9) | `seanime/internal/library/anime/schedule.go:42`, `seanime/internal/handlers/anime_collection.go:240`, `seanime/seanime-web/src/app/(main)/schedule/_components/schedule-calendar.tsx:32` |
| 7.2 | Recent releases / Airing recently | Nedavno emitovane epizode (media kartice). | /docs/changelog (v3.3) | `seanime/internal/handlers/anilist.go:391`, `seanime/seanime-web/src/app/(main)/schedule/_containers/recent-releases.tsx:9` |
| 7.3 | Next airing episode | Odbrojavanje do sledeće epizode na stranici animea. | kod-only | `seanime/seanime-web/src/app/(main)/entry/_components/next-airing-episode.tsx:8` |

## 8. Player

### 8.a Ugrađeni plejeri

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 8.1 | VideoCore (HTML5 player) | Ugrađeni plejer u browseru/Denshi: lokalni fajlovi, torrent/debrid stream, online stream, transcode. | /docs/videocore | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core.tsx:630`, `seanime/internal/videocore/videocore.go:82` |
| 8.2 | MpvCore (libmpv u Denshi) | Nativni libmpv engine (mpv-prism) u Electronu: široka podrška kodeka, ASS/PGS, HW dekodiranje, debanding, shaderi, `mpv.conf`, skripte. | /docs/mpvcore, /docs/changelog (v3.9) | `seanime/seanime-denshi/src/main/mpv-core.ts:38`, `seanime/seanime-web/src/app/(main)/_features/mpv-core/mpv-core.tsx:521`, `seanime/internal/mpvcore/mpvcore.go:69` |
| 8.3 | Native player bridge | Serverska strana za ugrađeni plejer (događaji, delegat ka VideoCore-u). | kod-only | `seanime/internal/nativeplayer/nativeplayer.go:89`, `seanime/seanime-web/src/app/(main)/_features/native-player/native-player.tsx:30` |
| 8.4 | Napredni titlovi (SSA/ASS, libass) | Konverzija soft-subova u ASS, custom fontovi iz `assets`, stilizovanje, delay, blacklist imena („signs & songs“). | /docs/videocore, /docs/changelog (v3.1) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-subtitles.ts:74`, `seanime/internal/videocore/subtitles.go` |
| 8.5 | PGS titlovi | Renderovanje bitmap PGS titlova. | /docs/changelog (v3.1) | `seanime/internal/pgs/pgs.go:82`, `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-pgs-renderer.ts:26` |
| 8.6 | Preferirani jezici audio/titlova | Lista jezika po prioritetu za automatski izbor traka. | /docs/videocore, /docs/mpvcore | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-preferences.tsx:52` |
| 8.7 | Lokalni titl fajlovi | Automatski uvoz `.srt/.ass` iz istog foldera; ručni uvoz eksternih titlova u online streamu. | /docs/changelog (v3.2, v3.8) | `seanime/internal/util/local_subtitles.go:29` |
| 8.8 | Prevod titlova u realnom vremenu | DeepL / OpenAI / OpenAI-kompatibilni lokalni LLM (alpha). | /docs/videocore, /docs/changelog (v3.3, v3.8) | `seanime/internal/videocore/translator.go:139`, `seanime/internal/database/models/models.go:202` |
| 8.9 | Anime4K | Real-time oštrenje (web shaderi u VideoCore; Fast/HQ, mode A/B/C u MpvCore) + custom shaderi. | /docs/videocore, /docs/mpvcore | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-anime-4k-manager.ts:103` |
| 8.10 | Prilagodljive prečice | Svaka akcija se može remapovati, uz numeričke parametre (seek, volume). | /docs/videocore | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-preferences.tsx:52` |
| 8.11 | Screenshot | Snimak frame-a, jednokratni izbor foldera. | /docs/videocore, /docs/changelog (v3.9) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-screenshot.ts:13`, `seanime/internal/database/models/models.go:210` |
| 8.12 | Picture-in-Picture | Plutajući prozor. | /docs/videocore | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-pip.ts:24` |
| 8.13 | Stats for nerds (`Z`) | Putanja fajla, kodeci, performanse. | /docs/changelog (v3.5) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-stats.tsx:33` |
| 8.14 | Character lookup / InSight (`H`) | Brz pregled likova tokom gledanja. | /docs/changelog (v3.5) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-in-sight.tsx:18`, `seanime/internal/videocore/insight.go` |
| 8.15 | Preview thumbnailovi na timeline-u | Sličice pri hover-u preko seek bara. | /docs/changelog (v3.1 „faster thumbnail generation“) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-preview.ts:7` |
| 8.16 | HLS izbor kvaliteta | Izbor nivoa kvaliteta za HLS; pamti se između epizoda (v3.10). | /docs/changelog (v3.10) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-hls.ts:26` |
| 8.17 | Skip intro/outro (AniSkip) + custom chapters | AniSkip podaci po MAL ID-u; auto-skip, skip dugmad i highlight na timeline-u; custom obrasci za poglavlja (v3.10). | /docs/changelog (v3.10) | `seanime/seanime-web/src/app/(main)/_features/video-core/_lib/aniskip.ts:36`, `seanime/seanime-web/src/app/(main)/_features/media-core/media-core-chapters.ts:70` |
| 8.18 | Mobilni gestovi, media session, fullscreen | Gestovi na dodir, OS media kontrole, dupli klik za fullscreen. | /docs/changelog (v3.7) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-mobile-gestures.ts:20`, `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-media-session.ts:7` |
| 8.19 | Casting | Cast iz ugrađenog plejera (Denshi cast sender/receiver). Napomena: comparison stranica kaže da Chromecast/DLNA nije podržan – kod postoji, verovatno novije/eksperimentalno. | /docs/comparison | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-cast.tsx:18`, `seanime/seanime-denshi/src/cast/sender.js:16` |
| 8.20 | Theater mode (online stream) | Teatarski raspored za online plejer. | /docs/changelog (v2.3) | `seanime/seanime-web/src/app/(main)/onlinestream/_containers/onlinestream-page.tsx` |
| 8.21 | Pauza pri minimizaciji (Denshi) | Video se pauzira kad se app sakrije. | /docs/changelog (v3.6) | `seanime/seanime-denshi/src/main/index.ts:157` |

### 8.b Eksterni plejeri i playback manager

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 8.22 | MPV | Pokretanje preko PATH/putanje, IPC socket za praćenje progresa, custom argumenti, nativna playlist. | /docs/getting-started | `seanime/internal/mediaplayers/mpv/mpv.go:262` |
| 8.23 | VLC | Kontrola preko Lua HTTP interfejsa. | /docs/getting-started | `seanime/internal/mediaplayers/vlc/start.go:41`, `seanime/internal/mediaplayers/vlc/status.go:107` |
| 8.24 | MPC-HC | Kontrola preko web interfejsa (port 13579). | /docs/getting-started | `seanime/internal/mediaplayers/mpchc/mpc_hc.go:74` |
| 8.25 | IINA (macOS) | IPC preko mpv socket-a, CLI putanja. | /docs/getting-started, /docs/changelog (v2.9) | `seanime/internal/mediaplayers/iina/iina.go:172` |
| 8.26 | Media player repository (praćenje) | Zajednički sloj za start/status/tracking svih eksternih plejera. | kod-only | `seanime/internal/mediaplayers/mediaplayer/repository.go:144`, `seanime/internal/mediaplayers/mediaplayer/repository.go:702` |
| 8.27 | Playback manager | Pokretanje lokalnog/stream playback-a, sinhronizacija progresa, pauza/seek, pretplate na status. | /docs/anime-entry | `seanime/internal/library/playbackmanager/playback_manager.go:297` |
| 8.28 | Automatsko ažuriranje progresa | Po završetku epizode (≥80%) progres ide na AniList (opcija „Automatically update progress“). | /docs/playlists | `seanime/internal/library/playbackmanager/progress_tracking.go:138`, `seanime/internal/database/models/models.go:73` |
| 8.29 | Manual progress tracking | Ručno praćenje za eksterne linkove/strimove. | /docs/mobile | `seanime/internal/library/playbackmanager/manual_tracking.go:41`, `seanime/seanime-web/src/app/(main)/_features/progress-tracking/manual-progress-tracking.tsx:21` |
| 8.30 | Auto-play next episode | Automatski sledeća epizoda (desktop plejeri, torrent/debrid stream, online). | /docs/changelog (v2.1), /docs/comparison | `seanime/internal/library/playbackmanager/playback_manager.go:542`, `seanime/seanime-web/src/app/(main)/_features/autoplay/autoplay.ts:17` |
| 8.31 | Watch continuity (resume) | Istorija gledanja po animeu, nastavak od poslednje pozicije (VideoCore, MPV, IINA). | /docs/changelog (v2.2, v3.10), gitbook continuity | `seanime/internal/continuity/history.go:100`, `seanime/internal/continuity/manager.go:56`, `seanime/internal/handlers/continuity.go:17` |
| 8.32 | Default playback source | Podrazumevani izvor (library/torrent/debrid/online/ekstenzija). | kod-only | `seanime/internal/database/models/models.go:107` |
| 8.33 | Playback metod po uređaju | Izbor plejera (ugrađeni / desktop / external link / transcode) čuva se po uređaju. | /docs/anime-entry | `seanime/seanime-web/src/app/(main)/settings/_components/playback-settings.tsx:52` |
| 8.34 | External player link (URI šeme) | Otvaranje fajla/strima u aplikaciji na drugom uređaju (VLC/MX/mpv Android intent, Outplayer/Infuse iOS, IINA), placeholderi `{url}`, `{subtitleUrl}`, base64 putanje. | /docs/mobile | `seanime/seanime-web/src/app/(main)/_features/external-player/external-player-link-button.tsx:10` |
| 8.35 | Discord Rich Presence | Aktivnost tokom gledanja/čitanja, dugmad za AniList, prikaz naslova u statusu; pluginovi mogu postaviti custom aktivnost. | /docs/comparison, /docs/changelog (v2.9, v3.10) | `seanime/internal/discordrpc/presence/presence.go:36`, `seanime/internal/discordrpc/presence/presence.go:284`, `seanime/internal/handlers/discord.go:76` |

### 8.c Transcoding / Direct play

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 8.36 | Direct play | Ako klijent podržava kodeke, fajl se servira direktno; auto-switch na direct play. | /docs/transcode | `seanime/internal/mediastream/directplay.go:64` |
| 8.37 | On-the-fly transcoding (FFmpeg) | HLS transkodovanje za bilo koji browser, preset/threads, putanje do ffmpeg/ffprobe. | /docs/transcode | `seanime/internal/mediastream/transcode.go:18`, `seanime/internal/mediastream/transcoder/transcoder.go` |
| 8.38 | Hardversko ubrzanje | QSV, NVENC, VAAPI + custom HW accel opcije. | /docs/transcode | `seanime/internal/mediastream/transcoder/hwaccel.go:17` |
| 8.39 | Auto-redirekcija mobilnih klijenata | Zahtev sa telefona/TV-a automatski vodi na streaming stranicu. | /docs/transcode | `seanime/seanime-web/src/app/(main)/mediastream/page.tsx` |
| 8.40 | Ekstrakcija priloga (fontovi/titlovi) iz MKV | Parsiranje MKV-a za titlove i fontove. | kod-only | `seanime/internal/mediastream/attachments.go`, `seanime/internal/mkvparser/mkvparser.go` |

## 9. Torrent streaming

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 9.1 | Ugrađeni BitTorrent klijent + streaming server | Strimuje jedan torrent bez čekanja preuzimanja, servira fajl plejeru. | /docs/streaming-torrent | `seanime/internal/torrentstream/stream.go:118`, `seanime/internal/torrentstream/client.go:303`, `seanime/internal/torrentstream/handler.go:28` |
| 9.2 | Seeding politika | Seeduje tokom i posle strima; brisanje ako je prekinuto pre 70%; slow seeding opcija. | /docs/streaming-torrent | `seanime/internal/torrentstream/stream.go:509`, `seanime/internal/database/models/models.go:505` |
| 9.3 | Izbor fajla iz batch-a | Bira samo fajl za traženu epizodu; ručni izbor preko file tree-a; pamćenje batch-a po animeu. | /docs/streaming-torrent, /docs/changelog (v3.0) | `seanime/internal/torrents/analyzer/analyzer.go:73`, `seanime/internal/torrentstream/history.go:37`, `seanime/internal/torrentstream/previews.go:38` |
| 9.4 | Preload next stream / accelerated startup | Pripremanje sledeće epizode i brži start. | /docs/changelog (v2.8, v3.9) | `seanime/internal/database/models/models.go:507` |
| 9.5 | Add to library | Opcija da strimovani fajl postane deo biblioteke. | kod-only | `seanime/internal/database/models/models.go:495` |
| 9.6 | Streaming magnet linkova | Lepljenje magnet linka bilo gde pokreće stream ili preuzimanje. | /docs/changelog (v3.6) | `seanime/internal/library/playbackmanager/stream_magnet.go:6`, `seanime/seanime-web/src/app/(main)/_features/sea-command/sea-command-torrent-magnet.tsx:32` |
| 9.7 | Info pill / overlay | Prikaz statusa strima (brzine, seederi). | /docs/changelog (v3.9) | `seanime/seanime-web/src/app/(main)/entry/_containers/torrent-stream/torrent-stream-overlay.tsx` |

## 10. Debrid

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 10.1 | Debrid servisi | TorBox, Real-Debrid, AllDebrid, Premiumize (API ključ). | /docs/streaming-debrid, /docs/changelog (v3.9) | `seanime/internal/debrid/client/repository.go:138`, `seanime/internal/debrid/torbox/torbox.go:100`, `seanime/internal/debrid/realdebrid/realdebrid.go:91`, `seanime/internal/debrid/alldebrid/alldebrid.go:129`, `seanime/internal/debrid/premiumize/premiumize.go:151` |
| 10.2 | Debrid streaming | Strim keširanih torrenata preko debrid servisa, uz auto-select. | /docs/streaming-debrid | `seanime/internal/debrid/client/stream.go:70`, `seanime/internal/directstream/debridstream.go` |
| 10.3 | Debrid preuzimanje | Preuzimanje sa debrid-a na disk kad postane dostupno (i iz Auto Downloader-a). | /docs/local-anime-library, /docs/autodownloader | `seanime/internal/debrid/client/download.go:104` |
| 10.4 | Instant availability | Provera keširanosti hash-eva. | kod-only | `seanime/internal/debrid/realdebrid/realdebrid.go:185` |

## 11. Online streaming

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 11.1 | Online streaming preko ekstenzija | Provider ekstenzije: `search`, `findEpisodes`, `findEpisodeServer` (m3u8/mp4, titlovi, headeri), sub/dub. | /docs/streaming-online, gitbook online-streaming-provider | `seanime/internal/onlinestream/repository.go:238`, `seanime/internal/extension_repo/goja_onlinestream_provider.go` |
| 11.2 | Izbor providera/servera/kvaliteta | Odabir providera (pamti se), servera i kvaliteta; best-match pretraga po naslovima. | /docs/streaming-online | `seanime/internal/onlinestream/repository_actions.go:327`, `seanime/seanime-web/src/app/(main)/onlinestream/_lib/onlinestream.atoms.ts:4` |
| 11.3 | Manual match | Ručno povezivanje AniList unosa sa rezultatom providera. | /docs/changelog (v2.2) | `seanime/internal/onlinestream/manual_mapping.go:53`, `seanime/seanime-web/src/app/(main)/onlinestream/_containers/onlinestream-manual-matching.tsx:28` |
| 11.4 | Video/M3U8 proxy | HTTP/1 proxy koji prepisuje HLS playliste i prosleđuje headere. | /docs/changelog (v2.5, v3.8) | `seanime/internal/handlers/proxy.go:68`, `seanime/internal/handlers/proxy.go:494` |
| 11.5 | Auto-cycle providera i oporavak | Kad izvor padne: osvežavanje zastarelih URL-ova, pa prelazak na sledeći provider uz čuvanje servera/kvaliteta/audio/titla. | /docs/changelog (v3.8, v3.10) | `seanime/seanime-web/src/app/(main)/onlinestream/_lib/use-onlinestream-auto-provider-cycler.ts:58`, `seanime/seanime-web/src/app/(main)/onlinestream/_lib/onlinestream-provider-trial.ts:15` |
| 11.6 | Preferencije titlova po animeu | Pamćenje izbora titla po naslovu i provider default. | /docs/changelog (v3.10) | `seanime/seanime-web/src/app/(main)/onlinestream/_lib/onlinestream-subtitle-preference.ts:17` |
| 11.7 | Prev/Next dugmad, auto next | Navigacija između epizoda u online plejeru. | /docs/changelog (v3.0, v2.7) | `seanime/seanime-web/src/app/(main)/onlinestream/_containers/onlinestream-page.tsx:83` |
| 11.8 | Keš epizoda | Keširanje liste epizoda po provideru, ručno pražnjenje. | kod-only | `seanime/internal/onlinestream/repository.go:143` |

## 12. Izvori i kvalitet (torrent pretraga, rangiranje, filteri)

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 12.1 | Torrent pretraga (multi-provider) | Pretraga preko provider ekstenzija; od v3.8 više providera odjednom; „smart search“ filteri. | /docs/local-anime-library, /docs/changelog (v3.8) | `seanime/internal/torrents/torrent/search.go:81`, `seanime/internal/handlers/torrent_search.go:24`, `seanime/seanime-web/src/app/(main)/entry/_containers/torrent-search/torrent-search-drawer.tsx:15` |
| 12.2 | Default torrent provider | Globalni podrazumevani provider. | /docs/autodownloader | `seanime/internal/torrents/torrent/repository.go:116`, `seanime/internal/database/models/models.go:75` |
| 12.3 | Auto-select (customizable) | Automatski izbor najboljeg torrenta pri streamu: do 3 providera po prioritetu, redosled release grupa i rezolucija, isključeni termini. | /docs/autoselect | `seanime/internal/torrents/autoselect/autoselect.go:159`, `seanime/seanime-web/src/app/(main)/settings/_components/autoselect-profile-form.tsx:70` |
| 12.4 | Metadata preferencije | Preferirani jezici (opciono obavezni), kodeci, izvori (BluRay > WebRip), više audio/titl traka, „Best“ release, batch tretman. | /docs/autoselect | `seanime/internal/torrents/autoselect/comparison.go` |
| 12.5 | Pragovi | Minimalni broj seedera i veličina fajla. | /docs/autoselect | `seanime/internal/torrents/autoselect/autoselect.go:159` |
| 12.6 | Preferred resolution | Brzo podešavanje ciljne rezolucije za torrent/debrid stream. | /docs/autoselect | `seanime/internal/database/models/models.go:492`, `seanime/internal/database/models/models.go:574` |
| 12.7 | Analiza fajlova u torrentu | Mapiranje fajlova na epizode (main/special). | kod-only | `seanime/internal/torrents/analyzer/analyzer.go:58` |

## 13. Preuzimanje i Auto Downloader

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 13.1 | Torrent klijenti | qBittorrent, Transmission (HTTPS podrška), „None“, eksperimentalni built-in; ugrađeni qBittorrent web UI. | /docs/getting-started, /docs/comparison | `seanime/internal/torrent_clients/torrent_client/repository.go:61`, `seanime/internal/torrent_clients/qbittorrent/client.go:57`, `seanime/internal/torrent_clients/transmission/transmission.go:29`, `seanime/internal/torrent_clients/builtin_client/builtin.go:134` |
| 13.2 | Ručno preuzimanje (multi-select) | Izbor više torrenata, izbor fajlova iz batch-a, destinacija u library putanji. | /docs/local-anime-library | `seanime/internal/torrent_clients/torrent_client/smart_select.go:86`, `seanime/internal/handlers/download.go:43` |
| 13.3 | Torrent lista / aktivni broj | Pregled aktivnih torrenata, opcioni brojač u sidebaru. | kod-only | `seanime/seanime-web/src/app/(main)/torrent-list/page.tsx:28` |
| 13.4 | Auto Downloader (RSS) | Periodična provera RSS-a provider ekstenzija (min. 15 min), samo nove epizode. | /docs/autodownloader | `seanime/internal/library/autodownloader/autodownloader.go:295` |
| 13.5 | Pravila (rules) | Po animeu: destinacija, provider override, comparison title (fuzzy/exact), epizode (recent/select), apsolutni offset, rezolucije, release grupe, dodatni/isključeni termini. | /docs/autodownloader | `seanime/internal/library/autodownloader/autodownloader.go:1156`, `seanime/seanime-web/src/app/(main)/auto-downloader/_containers/autodownloader-rule-form.tsx:75` |
| 13.6 | Bulk kreiranje pravila | „All Currently Watching“ / „All Upcoming“. | /docs/autodownloader | `seanime/seanime-web/src/app/(main)/auto-downloader/_containers/autodownloader-batch-rule-form.tsx:67` |
| 13.7 | Profili i skorovanje | Uslovi Score/Block/Require, minimalni skor, nasleđivanje release grupa. | /docs/autodownloader | `seanime/internal/library/autodownloader/autodownloader.go:705`, `seanime/seanime-web/src/app/(main)/auto-downloader/_containers/autodownloader-profile-form.tsx:75` |
| 13.8 | Odloženo preuzimanje (delay) | Čekanje X minuta na bolju verziju; Skip Delay Score; zamena kandidata tokom odbrojavanja. | /docs/autodownloader | `seanime/internal/library/autodownloader/autodownloader.go:764`, `seanime/internal/library/autodownloader/autodownloader.go:1081` |
| 13.9 | Queue i ručno odobravanje | Ako „Download immediately“ nije uključeno, nalazi idu u red. | /docs/autodownloader | `seanime/seanime-web/src/app/(main)/auto-downloader/_containers/autodownloader-queue.tsx:122` |
| 13.10 | Simulacija | Probni run bez preuzimanja. | kod-only | `seanime/internal/library/autodownloader/autodownloader.go:155` |
| 13.11 | Use Debrid u Auto Downloader-u | Preuzimanje preko debrid-a. | /docs/autodownloader | `seanime/internal/library/autodownloader/autodownloader.go:1009` |

## 14. Manga

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 14.1 | Manga biblioteka | Liste Reading/Planning/Completed iz AniList-a, unread bedž. | /docs/manga | `seanime/internal/manga/collection.go:43` |
| 14.2 | Manga provider ekstenzije | Pretraga, poglavlja, stranice; filteri jezika i scanlatora. | /docs/manga, gitbook manga-provider | `seanime/internal/manga/chapter_container.go:52` |
| 14.3 | Čitač | Long-strip / single / double page, podešavanja, pamćenje pozicije (i nezavršenih poglavlja). | /docs/comparison, /docs/changelog (v3.6) | `seanime/seanime-web/src/app/(main)/manga/_containers/chapter-reader/chapter-reader-drawer.tsx:50` |
| 14.4 | Refresh sources | Keš poglavlja nekoliko dana; osvežavanje svih/pojedinih, poređenje svih providera, alternativni izvor. | /docs/manga, /docs/changelog (v3.10) | `seanime/internal/manga/chapter_container.go:267`, `seanime/seanime-web/src/app/(main)/manga/_components/manga-source-refresh-modal.tsx:25` |
| 14.5 | Manual match | Ručno mapiranje na unos kod providera (online i lokalni). | /docs/manga | `seanime/internal/manga/chapter_container_mapping.go:121`, `seanime/seanime-web/src/app/(main)/manga/_containers/chapter-list/manga-manual-mapping-modal.tsx:32` |
| 14.6 | Preuzimanje poglavlja (queue) | Red preuzimanja koji preživljava restart; start/stop/clear; reset errored. | /docs/manga | `seanime/internal/manga/downloader/queue.go:56`, `seanime/internal/manga/download.go:109`, `seanime/internal/handlers/manga_download.go:17` |
| 14.7 | Lokalni izvor | CBZ/ZIP/RAR/slike iz `manga-local` foldera. | /docs/manga | `seanime/internal/manga/providers/local.go:49` |
| 14.8 | Auto progress update (manga) | Ažuriranje progresa po završetku poglavlja. | /docs/changelog (v2.8) | `seanime/internal/database/models/models.go:183` |
| 14.9 | Default manga provider | Izbor podrazumevanog izvora. | /docs/changelog (v2.0) | `seanime/internal/database/models/models.go:182` |

## 15. Ekstenzije, marketplace i pluginovi

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 15.1 | Tipovi ekstenzija | anime-torrent-provider, manga-provider, onlinestream-provider, custom-source, plugin. JS/TS u ugrađenom Goja (ES5) engine-u. | gitbook readme | `seanime/internal/extension/extension.go:14` |
| 15.2 | Marketplace / repozitorijumi | In-app instalacija iz repo URL-a; instalacija pojedinačne ekstenzije ili celog repozitorijuma; ažuriranje. | /docs/getting-started | `seanime/internal/extension_repo/marketplace.go:14`, `seanime/internal/handlers/extensions.go:78`, `seanime/seanime-web/src/app/(main)/extensions/_containers/marketplace-extensions.tsx:42` |
| 15.3 | User config ekstenzija | Podešavanja po ekstenziji (forme). | /docs/changelog (v2.2) | `seanime/internal/extension_repo/userconfig.go:89`, `seanime/seanime-web/src/app/(main)/extensions/_containers/extension-user-config.tsx:22` |
| 15.4 | Uređivanje koda i isključivanje | Edit koda ekstenzije u app-u; disable bez deinstalacije. | /docs/comparison, /docs/changelog (v3.8) | `seanime/seanime-web/src/app/(main)/extensions/_containers/extension-code.tsx:22` |
| 15.5 | Extension Playground | TS/JS playground za testiranje providera. | /docs/changelog (v2.1) | `seanime/internal/extension_playground/playground.go:69`, `seanime/seanime-web/src/app/(main)/extensions/playground/_containers/extension-playground.tsx:147` |
| 15.6 | Plugin UI API | Tray ikone, webview (sandbox iframe), toast, screen/navigacija, command palette, akcije (dugmad, meniji), DOM manipulacija, episode tab. | gitbook plugins/introduction, /docs/changelog (v2.8, v3.3) | `seanime/internal/plugin/ui/context.go:123`, `seanime/internal/plugin/ui/tray.go:20`, `seanime/internal/plugin/ui/webview.go:57`, `seanime/internal/plugin/ui/dom.go:39`, `seanime/internal/plugin/ui/command.go:58`, `seanime/internal/plugin/ui/episode_tab.go:41` |
| 15.7 | Plugin sistemski API-ji | Store/Storage, DB, AniList, fajl sistem, komande, downloader, cron, playback, VideoCore, MPV, continuity, scanner, auto downloader, torrent/debrid, Discord, app settings, auth, ekstenzije. | gitbook llms.txt | `seanime/internal/plugin/app_context.go`, `seanime/internal/plugin/system.go`, `seanime/internal/plugin/cron.go:44`, `seanime/internal/plugin/storage.go:46`, `seanime/internal/plugin/videocore.go` |
| 15.8 | Hooks | ~150 server-side hook-ova (Anilist, Anime, Autodownloader, Continuity, Debrid, Discord, Filler, Manga, MediaPlayer, Metadata, Playback, Scanner, Torrent, Torrentstream…) sa `preventDefault`. | /docs/hooks | `seanime/internal/hook/hooks.go:314`, `seanime/internal/hook_resolver/hook_resolver.go` |
| 15.9 | Permissions | Plugin traži dozvole (npr. system, DOM skripte). | gitbook plugins/permissions | `seanime/internal/plugin/secure.go:25` |

## 16. Notifikacije

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 16.1 | Sistemske (OS) notifikacije | Notifikacije za Auto Downloader i Auto Scanner (Windows/Unix/mobile), mogu se isključiti po tipu. | kod-only (settings) | `seanime/internal/notifier/notifier.go:95`, `seanime/internal/database/models/models.go:269` |
| 16.2 | In-app notification hub | Model notifikacija sa ozbiljnošću, hitnošću i progresom. | kod-only | `seanime/internal/notification/hub.go:3` |
| 16.3 | Notifikacija o novoj verziji | Update modal. | /docs/getting-started | `seanime/seanime-web/src/app/(main)/_features/update/update-modal.tsx:30` |
| 16.4 | Missing-file notifikacije po animeu | Zvonce za utišavanje. | /docs/anime-entry | `seanime/seanime-web/src/app/(main)/entry/_containers/entry-actions/anime-entry-silence-toggle.tsx:12` |

## 17. Nakama / watch together / deljenje

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 17.1 | Nakama (povezivanje instanci) | Peer se povezuje na host (URL + passcode) preko HTTP + WebSocket. | /docs/nakama | `seanime/internal/nakama/nakama.go:221`, `seanime/internal/nakama/peer.go:21` |
| 17.2 | Cloud Rooms | Watch party bez izlaganja servera, preko centralnog Rooms API-ja (`room://id`); samo torrent i online stream. | /docs/nakama, /docs/changelog (v3.2) | `seanime/internal/nakama/room.go:37`, `seanime/internal/nakama/host.go:87` |
| 17.3 | Watch party | Sinhronizovano gledanje (pauza, catch-up), lokalni fajlovi/torrent/online/debrid, custom source (v3.10). | /docs/nakama | `seanime/internal/nakama/watch_party_host.go:29`, `seanime/internal/nakama/watch_party_syncing.go:15` |
| 17.4 | Relay mode | Host prenosi poziciju izabranog „origin“ peer-a ostalima. | /docs/nakama | `seanime/internal/nakama/watch_party_host.go:113` |
| 17.5 | Chat u watch party-ju | Osnovni chat i u ugrađenim i eksternim plejerima. | /docs/changelog (v3.2) | `seanime/seanime-web/src/app/(main)/_features/video-core/video-core-watch-party-chat.tsx:21` |
| 17.6 | Library sharing | Host deli biblioteku (uz izuzetke po ID-u), peer konzumira i strimuje host fajlove. | /docs/nakama | `seanime/internal/nakama/share.go:109`, `seanime/internal/nakama/share.go:146` |
| 17.7 | UPnP port forwarding | Automatsko otvaranje porta za host. | kod-only (settings) | `seanime/internal/nakama/connect.go:26` |
| 17.8 | Multi-user | Nije podržan (jedan nalog sa server lozinkom). | /docs/comparison | — (nije implementirano) |

## 18. Offline mode

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 18.1 | Čuvanje medija za offline | Izbor serija čiji se metapodaci i slike čuvaju lokalno; opcija da se automatski čuva sve što gledaš/čitaš. | /docs/offline | `seanime/internal/local/manager.go:147`, `seanime/internal/handlers/local.go:45` |
| 18.2 | Sinhronizacija lokalnih podataka | Ručno ili automatski na 30 min. | /docs/offline | `seanime/internal/local/sync.go:144`, `seanime/internal/cron/refresh_anilist.go:25` |
| 18.3 | Offline režim | Rad bez interneta / kad je AniList pao, uz lokalne izmene. | /docs/offline | `seanime/internal/platforms/offline_platform/offline_platform.go:31`, `seanime/internal/handlers/local.go:16` |
| 18.4 | Upload lokalnih izmena na AniList | Po povratku online. | /docs/offline | `seanime/internal/local/sync.go`, `seanime/seanime-web/src/app/(main)/sync/page.tsx:36` |

## 19. Desktop app (Denshi) i mobilni

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 19.1 | Denshi tray i minimize-to-tray | Klik na tray menja vidljivost prozora. | /docs/changelog (v3.5) | `seanime/seanime-denshi/src/main/index.ts:502`, `seanime/seanime-denshi/src/main/denshi-settings.ts:7` |
| 19.2 | Pamćenje položaja/veličine prozora | Window state između sesija; scroll pozicija Search/Lists. | /docs/changelog (v3.8, v3.10) | `seanime/seanime-denshi/src/main/index.ts:143` |
| 19.3 | Auto-restart servera, back/forward navigacija | Desktop poboljšanja. | /docs/changelog (v2.5) | `seanime/seanime-denshi/src/main/index.ts` |
| 19.4 | GPU preference / Chromium flagovi | Izbor GPU-a za MpvCore (env varijable `MPV_PRISM_*`). | /docs/mpvcore | `seanime/seanime-denshi/src/main/gpu-preference.ts`, `seanime/seanime-denshi/src/main/chromium-flags.ts` |
| 19.5 | Denshi podešavanja | Posebna kartica u Settings. | kod-only | `seanime/seanime-web/src/app/(main)/settings/_containers/denshi-settings.tsx:6` |
| 19.6 | Seanime Tenji (mobilni klijent) | iOS/Android klijent: libmpv plejer sa gestovima, svi izvori, manga čitač, preuzimanja na uređaj, offline, eksterni plejeri, raspored, discover, OTA update. | /docs/tenji/*, /docs/mobile | kod nije pronađen u ovom repou (zaseban projekat) |
| 19.7 | Seanime Server (Mobile) | Ceo server u pozadini na Androidu/iOS-u (wake lock, keep-alive). | /docs/mobile-server/ | `seanime/mobile/mobile.go:13` |
| 19.8 | PWA | Instalacija web UI-ja kao PWA (samo HTTPS). | /docs/changelog (v2.9) | `seanime/seanime-web/` (manifest; tačna linija nije utvrđena) |

## 20. Podešavanja (sve kategorije)

Settings stranica: `seanime/seanime-web/src/app/(main)/settings/page.tsx:191` (tab triggeri). Serverski model: `seanime/internal/database/models/models.go:49`.

| # | Kategorija (tab) | Sadržaj | Kod |
|---|---|---|---|
| 20.1 | App (`seanime`) | Update check, kanal, otvaranje web URL/klijenta pri startu, offline auto-save/sync, watch history, extension secure mode, default playback source. | `seanime/internal/database/models/models.go:71` |
| 20.2 | User Interface | Boje (background/accent, swatch-evi), pozadinska slika/banner iz `assets`, blur efekti, sidebar, kartice, sortiranje, unread/unwatched brojači, spoileri, custom CSS (i mobilni), unpinned meni stavke. | `seanime/internal/database/models/models.go:358`, `seanime/seanime-web/src/app/(main)/settings/_containers/ui-settings.tsx:80`, `seanime/internal/handlers/theme.go:28` |
| 20.3 | Home screen layout | Dodavanje/premeštanje home stavki (anime/manga/carousel…). | `seanime/internal/handlers/status.go:704`, `seanime/seanime-web/src/app/(main)/_features/home/home-screen.tsx:58` |
| 20.4 | Local Anime Library | Putanje, auto scan, refresh on start, matching algoritam/prag, scanner config (rules), auto update progress, auto play next. | `seanime/seanime-web/src/app/(main)/settings/_containers/anime-library-settings.tsx:18` |
| 20.5 | Video Playback | Izbor plejera po uređaju, MpvCore (custom mpv opcije, logovi, shaderi), prevod titlova. | `seanime/seanime-web/src/app/(main)/settings/_components/playback-settings.tsx:52` |
| 20.6 | Desktop Media Player | MPV/VLC/MPC-HC/IINA putanje, portovi, socket-i, argumenti. | `seanime/seanime-web/src/app/(main)/settings/_components/mediaplayer-settings.tsx:23`, `seanime/internal/database/models/models.go:187` |
| 20.7 | External Player Link | Custom URI šema, base64 putanje. | `seanime/seanime-web/src/app/(main)/settings/page.tsx:808` |
| 20.8 | Transcoding / Direct Play | Enable, HW accel, preset, threads, ffmpeg/ffprobe putanje, direct-play-only. | `seanime/seanime-web/src/app/(main)/settings/_containers/mediastream-settings.tsx:50`, `seanime/internal/database/models/models.go:465` |
| 20.9 | Torrent Provider | Default provider ekstenzija, prikaz dostupnosti. | `seanime/seanime-web/src/app/(main)/settings/page.tsx:746` |
| 20.10 | Torrent Client | qBittorrent/Transmission/built-in/None, tagovi, kategorija, limiti. | `seanime/seanime-web/src/app/(main)/settings/page.tsx:816`, `seanime/internal/database/models/models.go:213` |
| 20.11 | Torrent Streaming | Enable, auto-select, rezolucija, download dir, IPv6, portovi, slow seeding, preload next. | `seanime/seanime-web/src/app/(main)/settings/_containers/torrentstream-settings.tsx:44`, `seanime/internal/database/models/models.go:488` |
| 20.12 | Debrid Service | Provider, API ključ, auto-select, rezolucija, include in library. | `seanime/seanime-web/src/app/(main)/settings/_containers/debrid-settings.tsx:56` |
| 20.13 | Online Streaming | Enable, include u biblioteci. | `seanime/seanime-web/src/app/(main)/settings/page.tsx:700` |
| 20.14 | Manga | Enable, default provider, auto progress, lokalni direktorijum. | `seanime/seanime-web/src/app/(main)/settings/_containers/manga-settings.tsx:22` |
| 20.15 | Nakama | Username, host mode, passcode, deljenje biblioteke, remote URL, port forwarding. | `seanime/seanime-web/src/app/(main)/settings/_containers/nakama-settings.tsx:32` |
| 20.16 | Discord | Rich presence (anime/manga), dugmad, naslov u statusu. | `seanime/seanime-web/src/app/(main)/settings/_containers/discord-rich-presence-settings.tsx:11` |
| 20.17 | Denshi | Desktop-specifična podešavanja. | `seanime/seanime-web/src/app/(main)/settings/_containers/denshi-settings.tsx:6` |
| 20.18 | Logs & Cache | Server/scanner logovi, brisanje, file cache veličine i čišćenje (uklj. mediastream). | `seanime/seanime-web/src/app/(main)/settings/_containers/logs-settings.tsx:39`, `seanime/internal/handlers/filecache.go:16` |
| 20.19 | Server / AniList / Local account / Data | Server lozinka i spoileri, AniList opcije (adult, cache layer), lokalni nalog, podaci. | `seanime/seanime-web/src/app/(main)/settings/_containers/server-settings.tsx:28`, `seanime/seanime-web/src/app/(main)/settings/_containers/anilist-settings.tsx:13`, `seanime/seanime-web/src/app/(main)/settings/_containers/data-settings.tsx:17` |
| 20.20 | Auto Downloader / Notifications | Enable, interval, provider, immediate vs queue, debrid; isključivanje notifikacija. | `seanime/internal/database/models/models.go:335`, `seanime/internal/database/models/models.go:269` |

## 21. Ostalo

| # | Feature | Opis | Dok | Kod |
|---|---|---|---|---|
| 21.1 | Playlists | Red do 10 epizoda, kombinuje metode reprodukcije; nativne MPV/IINA playliste; „Play Next“ iz progress modala; brisanje pri startu. | /docs/playlists, /docs/changelog (v3.0) | `seanime/internal/playlist/manager.go:145`, `seanime/internal/handlers/playlist.go:20`, `seanime/seanime-web/src/app/(main)/_features/playlists/playlist-list-modal.tsx:23` |
| 21.2 | Issue Recorder | Snimanje anonimizovanih logova + session replay UI-ja, screenshotovi, beleške. | /docs/logs, /docs/changelog (v3.5) | `seanime/internal/report/repository.go:55`, `seanime/seanime-web/src/app/(main)/_features/issue-report/issue-report.tsx:20` |
| 21.3 | Logovi u aplikaciji | Pregled i brisanje server/scanner logova. | /docs/logs | `seanime/internal/handlers/status.go:154` |
| 21.4 | Profilisanje memorije/CPU | Debug endpointi (memory stats, pprof, force GC). | kod-only | `seanime/internal/handlers/status.go:444` |
| 21.5 | Feature flags | Eksperimentalni feature-i (npr. built-in torrent client) i isključivanje feature-a. | kod-only | `seanime/internal/core/feature_flags.go:63` |
| 21.6 | Directory selector | Browser foldera sa autocomplete-om. | kod-only | `seanime/internal/handlers/directory_selector.go:33` |
| 21.7 | Image proxy | Proxy slika sa headerima (za ekstenzije/mangu). | kod-only | `seanime/internal/util/proxies/image_proxy.go:51` |
| 21.8 | Medialinks stranica | Lista eksternih linkova. | kod-only | `seanime/seanime-web/src/app/(main)/medialinks/page.tsx` |
| 21.9 | Policies / Terms | Uslovi korišćenja, odricanje odgovornosti, rizici ekstenzija. | /docs/policies | — (dokument) |
| 21.10 | Comparison | Tabela poređenja sa Jellyfin/Taiga/Hayase/Shiru/Mangayomi. | /docs/comparison | — (dokument) |

**Ukupno katalogizovano: 221 stavka** (201 feature + 20 kategorija podešavanja).

---

## Feature-i posebno relevantni za AnimeDesk

AnimeDesk = Electron + React GUI nad ani-cli (online streaming, hls.js ugrađeni plejer + opcioni mpv, AniList slike/metadata, watchlist, preuzimanje preko ani-cli, AniSkip, resume, auto-next, XP gamifikacija). Ispod su Seanime feature-i koji se mogu preslikati **bez torrenta i debrid-a**. Oznaka: ✅ već imamo (bar osnovno), ➕ realno za dodati, ⚠️ zahtevnije.

**Plejer (najveći prostor za napredak)**
- ✅/➕ **AniSkip + custom chapter obrasci** (8.17): već imamo AniSkip; Seanime dodaje auto-skip po tipu, highlight segmenata na timeline-u i korisničke obrasce za poglavlja.
- ✅/➕ **Resume / watch continuity** (8.31): imamo resume; vredi preuzeti pragove (ignorisanje istorije iznad X% / ispod Y sekundi) i čekanje da medij bude spreman pre seek-a u mpv-u.
- ✅ **Auto-next** (8.30) i ➕ **Playlists/queue** (21.1): red epizoda iz više naslova + „Play Next“; MPV nativna playlist za preuzete fajlove.
- ➕ **HLS izbor kvaliteta i pamćenje između epizoda** (8.16) – direktno primenljivo na hls.js.
- ➕ **Preferirani jezici audio/titlova, blacklist „signs & songs“** (8.6), **delay titlova**, **stilizovanje titlova** (8.4), **lokalni/eksterni titl fajlovi** (8.7).
- ➕ **Prilagodljive prečice** (8.10), **screenshot** (8.11), **PiP** (8.12), **stats for nerds** (8.13), **preview thumbnailovi na seek baru** (8.15), **media session** (8.18).
- ⚠️ **Anime4K shaderi** (8.9): WebGL shaderi u hls.js plejeru ili `glsl-shaders` u mpv-u (mpv je lakši put).
- ⚠️ **Prevod titlova preko LLM-a** (8.8): moguće, ali traži API ključ.
- ➕ **Mpv integracija preko IPC socket-a** (8.22): praćenje progresa i auto-next iz eksternog mpv-a – isti obrazac kao Seanime `mpvipc`.

**Online streaming (naša osnova preko ani-cli)**
- ➕ **Auto-cycle / oporavak izvora** (11.5): kad link padne, prvo osveži URL, pa probaj drugi izvor/kvalitet uz čuvanje izbora – vrlo relevantno za nestabilne ani-cli izvore.
- ➕ **Manual match** (11.3): ručno povezivanje AniList unosa sa ani-cli rezultatom pretrage kad automatsko uparivanje omaši.
- ➕ **Video/M3U8 proxy sa headerima** (11.4): rešava referer/CORS probleme za hls.js.
- ➕ **Keš liste epizoda po izvoru** (11.8) i **pamćenje izabranog izvora** (11.2).

**Metadata i otkrivanje (AniList)**
- ➕ **Thumbnailovi i naslovi epizoda preko ani.zip/AniDB mapiranja** (4.5) – besplatni API, bez torrenta.
- ➕ **Filler info** (6.3) preko AnimeFillerList.
- ➕ **Hide spoilers** (6.4): skrivanje naslova/opisa/thumbnailova neodgledanih epizoda – posebno usklađeno sa našim „bez spojlera“ pravilom.
- ➕ **Kalendar emitovanja, recent releases, next airing countdown** (7.1–7.3).
- ➕ **Discover sekcije i „You Might Have Missed“ nastavci** (5.2, 5.3), **advanced search sa tagovima** (5.1).
- ➕ **Cache layer za AniList** (4.3): app radi i kad AniList ne odgovara (rate limit / pad).
- ➕ **Lokalni nalog bez AniList-a** (4.2) i ⚠️ **MAL sync** (4.8).
- ➕ **AniList statistika** (4.11) – lepo se uklapa uz XP gamifikaciju.

**Preuzimanja (preko ani-cli)**
- ➕ **Red preuzimanja koji preživljava restart, retry/reset errored, start/stop** (po uzoru na manga downloader 14.6).
- ⚠️ **„Auto Downloader“ bez torrenta**: periodična provera nove epizode za seriju u watchlisti i automatsko preuzimanje preko ani-cli (koncept 13.4–13.9: pravila po seriji, rezolucija, odloženo preuzimanje); RSS deo nije primenljiv.
- ➕ **Lokalna biblioteka preuzetih fajlova** (pojednostavljen skener 3.1/3.4, Super Update za preimenovanje 3.15) i **offline gledanje** (18.x).

**Desktop UX**
- ➕ **Command palette** (5.5), **tray + minimize-to-tray, pamćenje položaja prozora** (19.1, 19.2), **Discord Rich Presence** (8.35), **sistemske notifikacije za novu epizodu/završeno preuzimanje** (16.1), **samoažuriranje sa kanalima** (1.9), **Issue recorder / logovi u aplikaciji** (21.2, 21.3), **custom tema/CSS/pozadina i raspored home ekrana** (20.2, 20.3).

**Nije primenljivo bez torrenta/debrid-a (ili van scope-a):** torrent streaming (9.x), debrid (10.x), torrent auto-select/profili (12.x), torrent klijenti (13.1–13.3), Nakama library sharing preko lokalnih fajlova je moguć tek uz server mod (17.x – watch party za online stream je tehnički izvodljiv, ali zahteva relay server), transcoding (8.36–8.40, korisno samo za mrežni pristup), manga (14.x – van fokusa), plugin/hook sistem (15.6–15.8 – veliki obim).
