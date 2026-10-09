# 03 — Oblast: PLEJER (Seanime naspram AnimeDesk)

Faza 3, oblast 1 (najviši prioritet). Samo analiza, kod nije menjan.

**Konvencije**
- `seanime/...:linija` = fajl u shallow klonu `C:\Users\Nikola\Desktop\Projekti\_ref\seanime`. Skraćenice: `VC/` = `seanime-web/src/app/(main)/_features/video-core/`, `MC/` = `seanime-web/src/app/(main)/_features/media-core/`.
- `src/...:linija` = naš repo (`AnimeDesk`, v0.5.0).
- Napor / uticaj: **V** = visok, **S** = srednji, **N** = nizak.
- Seanime je GPL-3.0. Sve preporuke su **inspiracija** (ideja, ponašanje, pragovi), a ne kopiranje koda.
- Tvrdnje iz ranijih dokumenata (00/01/02) su ponovo proverene u kodu; gde nešto nije moglo da se proveri piše **„nije provereno”**.

---

## 1. Arhitektura plejera (komponente, stanje, izbor plejera)

### Kako oni rade
- **Više plejera, jedan koordinator.** Backend `mediacore.Coordinator` prima događaje od više backend-a (VideoCore = web `<video>`, MpvCore = libmpv u Denshi-ju, NativePlayer), drži jednu aktivnu sesiju i zajedničke efekte (continuity, Discord, AniList progres) (`seanime/internal/mediacore/mediacore.go:366-463`, `:465-518`). Nova `PlaybackLoadedEvent` preuzima sesiju (sledeća epizoda bez gašenja prethodne) (`:389-396`).
- **Web plejer (VideoCore)** je jedna velika komponenta (`VC/video-core.tsx`, 1947 linija) sa:
  - `VideoCoreProvider` koji preko jotai `ScopeProvider`-a pravi izolovan skup atoma po instanci plejera (vreme, trajanje, baferovanje, jačina, menadžeri…) (`VC/video-core.tsx:197-274`);
  - „menadžer” klasama koje se prave na `loadedmetadata`: titlovi (JASSUB ili MediaCaptions), audio, Anime4K, PiP, fullscreen, MediaSession (`VC/video-core.tsx:1064-1254`), plus preview menadžer za sličice (`:1256-1277`);
  - jednim hook-om koji sinhronizuje sve osobine `<video>` u atome, samo kad se vrednost promeni (`VC/video-core.utils.ts:60-170`);
  - centralnim `vc_dispatchAction` (seek/seekTo/togglePlay) (`VC/video-core.utils.ts:26-58`).
- **Životni ciklus** je opisan stanjem `{active, playbackInfo, playbackError, loadingState}` (`VC/video-core.atoms.ts:6-11`); bez `streamUrl` ili tokom `loadingState` prikazuje se `MediaCoreLoadingOverlay` (`VC/video-core.tsx:382,579-587`).
- **Dva režima prikaza:** „drawer” preko celog ekrana koji se na Esc smanjuje u **mini plejer**, i „inline” (`VC/video-core.tsx:1680-1853`).
- **Izbor plejera:** spoljni plejer je podešavanje `mediaPlayer.defaultPlayer` (`mpv | iina | vlc | mpc-hc`) (`seanime/seanime-web/src/app/(main)/settings/_components/mediaplayer-settings.tsx:30-42`, `seanime/internal/mediaplayers/mediaplayer/repository.go:234-337`). Ugrađeni (VideoCore/MpvCore) se biraju po vrsti strima i platformi (Denshi). Tačna logika „koji ugrađeni kada” **nije provereno**.

### Kako mi radimo
- Jedna komponenta `PlayerView` (213 linija) sa lokalnim `useState`/`useRef` (`src/renderer/components/PlayerView.jsx:20-44`), dete `PlayerControls` (`src/renderer/components/PlayerControls.jsx:5-33`), plus `SkipButton`, `NextEpisodeCard`, `ResumePrompt`.
- Main proces: `internalPlayer` vezuje ani-cli sesiju za renderer preko `event:player-open` i čeka `player:closed` (`src/main/internalPlayer.js:21-50`).
- Izbor plejera: `settings.playerMode` `internal|external`; ako ugrađeni baci grešku → mpv; dugme „Pusti u spoljnom” → mpv od iste pozicije (`src/main/watchService.js:24-38`).
- Plejer je overlay preko `.app-shell` koja dobija `inert`; remount po `playbackId` (`src/renderer/App.jsx:140,166-177`).

### Razlika
Seanime ima sloj „koordinatora” i razdvojene menadžere; mi imamo jednu komponentu. Za naš obim (jedan izvor: ani-cli HLS + lokalni mp4) jedna komponenta je dovoljna, ali `PlayerView` će brzo da raste kad dodamo kvalitet, audio, brzinu, ASS, preview. Nemamo mini plejer.

### Preporuka
- **Razbiti `PlayerView` na hook-ove** pre dodavanja novih funkcija: `useHls(video, src)` (greške/kvalitet/audio), `usePlayerKeys(...)`, `useIdle()`, `useSkipSegments()`. Fajlovi: `src/renderer/components/PlayerView.jsx` + novi `src/renderer/player/*.js`. Napor S, uticaj S (održivost). Rizik: regresije u postojećim UI testovima (`tests/unit/ui/*`) — refaktor raditi uz postojeće testove, bez promene ponašanja.
- Ne uvoditi jotai/koordinator — za nas je to preterano.

---

## 2. Kontrole

### Kako oni rade
- Kontrolna traka (desktop): play, playlist (prev/next), jačina, vreme, razmak, „play pill”, watch-party chat, **settings meni**, **meni rezolucije/izvora**, **meni titlova**, **meni audio staza**, Cast, **PiP**, fullscreen (`VC/video-core.tsx:532-553`). Posebna mobilna traka (`:553-577`).
- **Auto-hide:** pomeranje miša > 15 px postavlja `busy`, posle **1 s** mirovanja `busy=false` i kursor nestaje (`VC/video-core.tsx:149,1590-1609,376`); dok je meni otvoren klik ne pauzira (debounce 800 ms, `:1308-1321,1337`).
- **Seek bar** je sopstvena komponenta sa pointer capture-om: pauza dok se vuče, `seekTo` na otpuštanje, nastavak ako je išlo (`VC/video-core-time-range.tsx:167-253`); prikaz bafera (`:60,83-85`).
- **Preview sličice na traci:** `VideoCorePreviewManager` pravi **skriveni drugi `<video>` sa sopstvenom hls.js instancom** (mali bafer), crta kadrove u `OffscreenCanvas` širine 200 px na svakih **4 s**; usput hvata kadrove i iz glavnog videa na `timeupdate`, ima keš i prefetch unapred (`VC/video-core-preview.ts:7-8,29-34,36-88,145-169`). Za onlinestream prefetch je isključen (`VC/video-core.tsx:1266`, `VC/video-core-preview.ts:44`).
- **Chapter markeri:** iz MKV poglavlja ili sintetisani iz AniSkip-a (Prologue/Opening/Episode/Ending/Preview) (`VC/video-core.tsx:1652-1678`, `VC/video-core.utils.ts:315-387`); traka se deli na segmente sa labelom pri hover-u (`VC/video-core-time-range.tsx:87-118,345-351`).
- **Brzina:** prečice `[`/`]` ±0.1 u opsegu 0.2–8× (`VC/video-core-preferences.tsx:1182-1191`), meni „Playback Speed” (`VC/video-core-settings-menu.tsx:318-327`), pamti se u preferencama (`MC/media-core-preferences.ts:9,22`; `VC/video-core.tsx:1399-1407,1514-1519`).
- **Kvalitet:** lista HLS nivoa iz `MANIFEST_PARSED`, primena „preferiranog” kvaliteta (npr. `1080p`, inače najniži bitrate, `auto` = -1) (`VC/video-core-hls.ts:204-222`, `VC/_lib/hls-quality.ts:7-18`).
- **PiP:** `requestPictureInPicture` (`VC/video-core-pip.ts:162,422`); detalji renderovanja titlova u PiP-u **nije provereno**.
- **Overlay povratna informacija** („PLAY/PAUSE”, „Speed 1.20x”, vreme pri seek-u) (`VC/video-core.tsx:923-927`, `VC/video-core.utils.ts:39-41`).
- **Vreme: proteklo/preostalo** (`MC/media-core-preferences.ts:14,28`).
- Ostalo: „stats for nerds”, filter poboljšanja slike (kontrast/zasićenje/svetlina) na `<video>` (`VC/video-core.tsx:463-472`, `VC/video-core.atoms.ts:25-30,59-64`).

### Kako mi radimo
- `PlayerControls`: `<input type=range>` za vreme sa obojenim `op/ed/recap` segmentima; ⏮, −10, play/pauza, +10, ⏭, vreme, mute, klizač jačine, titlovi on/off, `<select>` S/M/L, fullscreen (`src/renderer/components/PlayerControls.jsx:9-30`).
- Gornja traka: Nazad + naslov + EP (`src/renderer/components/PlayerView.jsx:186-189`).
- Auto-hide posle **3 s**, samo dok video ide (`src/renderer/components/PlayerView.jsx:12,92-97`; `src/renderer/styles.css:223-224`).
- **BUG (P0):** `Icon` mapa nema `pause`, `rewind`, `fastForward`, `skipBack`, `skipForward`, `volumeX`, `subtitles` — uvoze se, ali `Icon` za nepoznato ime vraća `null` (`src/renderer/components/Icon.jsx:1,3-7,11`). Dugmad ⏮, −10, ⏸ (dok ide), +10, ⏭, mute (kad je utišano) i titlovi su **prazna** (`src/renderer/components/PlayerControls.jsx:16-25`).
- Nema: preview sličica, buffered trake, tooltip-a vremena pri hover-u, brzine, kvaliteta, audio menija, PiP-a, settings menija, overlay povratne informacije za play/pauzu/seek, preostalog vremena.

### Razlika
Najveći jaz u kontrolama: brzina, kvaliteti, tooltip vremena/preview, buffered prikaz, settings meni. Seek bar kao `<input range>` je jednostavan, ali „krade” fokus tastature (vidi §3).

### Preporuka
1. **P0 — popraviti `Icon.jsx` mapu** (dodati 7 ključeva). Fajl `src/renderer/components/Icon.jsx`. Napor N, uticaj V. Dodati test koji za svako `Icon name` korišćeno u `src/renderer` proverava da postoji u mapi (sprečava ponavljanje). Rizik: nikakav.
2. **Hover tooltip vremena + buffered traka** na postojećem `player__timeline` (`video.buffered`, `onMouseMove` → `%·duration`). Fajlovi `PlayerControls.jsx`, `styles.css`. Napor N, uticaj S.
3. **Brzina reprodukcije** (meni 0.5/0.75/1/1.25/1.5/2 + prečice `[`/`]`), pamćenje u `settings` (vidi §13). Fajlovi `PlayerControls.jsx`, `PlayerView.jsx`, `src/main/settings.js` (sanitize). Napor N, uticaj S.
4. **Settings meni (zupčanik)** koji grupiše: brzina, kvalitet, audio, titlovi (staza, veličina, offset). Zameniti `<select>` S/M/L. Napor S, uticaj S.
5. **Overlay povratna informacija** („▶/❚❚”, „+10 s”, „Brzina 1.25×”) kao kratka poruka — već imamo `player__flash` (`src/renderer/components/PlayerView.jsx:200`), samo je proširiti. Napor N, uticaj N.
6. **Preview sličice** — tek kasnije (P3): drugi skriveni `<video>` + hls.js kroz naš proxy duplira saobraćaj ka CDN-u i opterećuje izvor; za ani-cli strimove rizik od rate-limita. Ako se radi: samo iz već baferovanih delova glavnog videa (bez drugog strima). Napor S–V, uticaj N–S.
7. Auto-hide: 3 s je u redu; dodati da se kontrole **ne kriju dok je kursor iznad trake** (Seanime ima `vc_hoveringControlBar`, `VC/video-core.tsx:14`). Napor N, uticaj N.

---

## 3. Prečice

### Kako oni rade
Podrazumevane (`VC/video-core.atoms.ts:127-148`), sve **prilagodljive** i čuvaju se u localStorage `sea-video-core-keybindings` (`:150-167`), uz modal za izmenu i „reset” (`VC/video-core-preferences.tsx:171,275`). Isti set koristi i MpvCore (`seanime/seanime-web/src/app/(main)/_features/mpv-core/mpv-core.atoms.ts:41-51`).

| Radnja | Taster (podrazumevano) | Ref |
|---|---|---|
| Pusti/pauza | Space, Enter (fiksno) | `VC/video-core-preferences.tsx:1033-1043` |
| Na početak / kraj | Home / End (fiksno) | `:1045-1059` |
| Izlaz iz fullscreen-a | Esc (fiksno) | `:1061-1066` |
| Skok na 0–90% | 0–9 (fiksno) | `:1068-1077` |
| Kadar napred/nazad (24 fps) | `.` / `,` (fiksno) | `:1079-1092` |
| Seek ±30 s | D / A (u OP/ED, D preskače ceo deo) | `:1105-1125`, atoms `:128-129` |
| Fini seek ±2 s | → / ← | `:1126-1137`, atoms `:130-131` |
| Sledeće/prethodno poglavlje | E / Q | `:1138-1143,1198-1254` |
| Jačina ±5% | ↑ / ↓ | `:1144-1151` |
| Mute | M | `:1152-1154` |
| Ciklus titlova (uklj. „off”) | J | `:1155-1157,1257-1292` |
| Ciklus audio staza | K | `:1158-1160,1294-1348` |
| Sledeća / prethodna epizoda | N / B | `:1161-1166,1352-1372` |
| Fullscreen | F | `:1167-1169` |
| PiP | P | `:1170-1172` |
| Screenshot | I | `:1173-1175` |
| InSight (likovi) | H | `:1176-1178` |
| Stats for nerds | Z | `:1179-1181` |
| Brzina ±0.1 | ] / [ | `:1182-1191` |

Detalji: ignoriše se kad je fokus u polju za unos (`isEditableKeyboardTarget`) i kad su pritisnuti Ctrl/Shift/Alt/Meta (`:1000-1012`); seek je prigušen na 100 ms (`:966-968,1094-1102`); koristi `e.code` (raspored tastature nezavisan) (`:1105`).

### Kako mi radimo
`src/renderer/components/PlayerView.jsx:105-126`: Space, ←/→ ±10 s, ↑/↓ ±10%, F, M, S (titlovi), N (sledeća); F11 u main-u (`src/main/fullscreen.js:3`), Esc samo izlazi iz fullscreen-a (`src/renderer/App.jsx:113-114`). Nisu prilagodljive. Koristi se `e.key` (zavisi od rasporeda; npr. ćirilični raspored ne bi radio — **nije provereno** ručno).

**Bag (P1):** prečice se ignorišu kad je fokus u `input/select/textarea` (`PlayerView.jsx:107`). Posle klika na **klizač vremena ili jačine** fokus ostaje na `<input type=range>`, pa **Space i strelice prestaju da rade** kao prečice plejera (strelice tada pomeraju klizač, Space ništa). Isto važi za `<select>` S/M/L. Razlog vidljiv u kodu; ručno nije provereno.

### Razlika
Imamo 8 prečica naspram ~25; nema P (prethodna), 0–9, Home/End, kadar, brzina, ciklus staza, ±5 s/±30 s varijanti. Nema prilagođavanja i nema filtera za modifikatore (Ctrl+F itd. bi okinuo F).

### Preporuka
- **P1:** filter `e.ctrlKey||e.altKey||e.metaKey` → return; prebaciti na `e.code`; posle `pointerup` na klizačima vratiti fokus na kontejner plejera (ili klizače izuzeti iz provere fokusa za Space/strelice). Fajl `PlayerView.jsx`. Napor N, uticaj S.
- **P2:** dodati P (prethodna), 0–9, Home/End, `[`/`]` brzina, `,`/`.` kadar, Shift+←/→ = ±85 s ili ±30 s. Napor N, uticaj S.
- **P3:** prilagodljive prečice (mapa u `settings.json`, sanitizacija u `src/main/settings.js`, stranica u Podešavanjima). Napor S, uticaj N.
- Dodati „?” overlay sa spiskom prečica (i18n sr/en). Napor N, uticaj N.

---

## 4. Titlovi

### Kako oni rade
- **ASS/SSA renderovanje: JASSUB** (libass u WebAssembly, worker, offscreen render) — `jassub ^2.5.6` (`seanime/seanime-web/package.json:92`), `new JASSUB({video, subContent, wasmUrl, workerUrl, modernWasmUrl, fonts, defaultFont, availableFonts})` (`VC/video-core-subtitles.ts:9,436-448`), `jassubOffscreenRender: true` (`VC/video-core.tsx:1141`). Fontovi: Roboto podrazumevano + fontovi iz MKV priloga preko `/api/v1/directstream/att/...` (`VC/video-core-subtitles.ts:434,455-464`).
- **Sve ide u ASS:** spoljni SRT/VTT/TTML se na serveru konvertuje u ASS (`fetchAndConvertToASS` → `useDirectstreamConvertSubs`) pa ide u JASSUB (`VC/video-core.tsx:1147-1154`, `VC/video-core-subtitles.ts:1101-1159`). Prepoznavanje formata po sadržaju (`VC/video-core.utils.ts:266-313`).
- **Alternativa bez libass-a:** `MediaCaptionsManager` (nativni cue-ovi sa sopstvenim stilom), sa konverzijom u VTT (`VC/video-core.tsx:1098-1130`); izbor libass on/off je podešavanje (`VC/video-core.atoms.ts:169`).
- **PGS** (bitmap) renderer (`VC/video-core-subtitles.ts:476-479`, `VC/video-core-pgs-renderer.ts`).
- **Stil:** za ASS — font, veličina, boje, outline, senka, pozadina (`VC/video-core.atoms.ts:31-42`); za nativne cue-ove — veličina, boja, pozadina i providnost, senka (`:43-51`, `VC/video-core-settings-menu.tsx:140-170`).
- **Offset (kašnjenje) titlova** u sekundama: `libassRenderer.timeOffset = -delay`, isto i za PGS (`VC/video-core-subtitles.ts:596-601`; podešavanje `VC/video-core-settings-menu.tsx:238,307,352`).
- **Više staza + automatski izbor:** preferirani jezici redom (`en,eng,english`), crna lista po labeli (npr. „signs”), pa default/forced (`VC/video-core.atoms.ts:55-56`, `VC/video-core-subtitles.ts:1172-1210`); ciklus J (§3); izbor po seriji se pamti (`seanime/seanime-web/src/app/(main)/onlinestream/_containers/onlinestream-page.tsx:760-766`).
- **Prevod titlova** (server, DeepL/OpenAI — prema 02-dokumentu) — klijent šalje zahtev za tekst ili celu stazu (`VC/video-core.tsx:1121-1128`, `VC/video-core-media-captions.ts:547-588`; backend `seanime/internal/videocore/translator.go`). Provajderi nisu ponovo provereni u kodu.
- hls.js: `enableWebVTT: true`, `renderTextTracksNatively: false` — HLS titlove ne prikazuje browser nego njihov menadžer (`VC/video-core-hls.ts:115-121`).

### Kako mi radimo
- Jedan `<track kind="subtitles" default>` (`src/renderer/components/PlayerView.jsx:184`). Proxy **uvek** šalje `Content-Type: text/vtt` (`src/main/streamServer.js:99-101`); preuzeti fajl traži samo `<ime>.vtt` (`:41-45`).
- ASS/SSA/SRT **ne rade** u ugrađenom plejeru (SRT bi browser odbio jer nije WEBVTT; ASS isto). Rade samo u mpv-u.
- Uključi/isključi samo `textTracks[0]` (`PlayerView.jsx:87-90`); veličina S/M/L preko `::cue` (`src/renderer/styles.css:236-238`).
- Nema offset-a, stila, izbora staze. hls.js je sa podrazumevanim podešavanjima (`PlayerView.jsx:63`) — ako HLS manifest ima `EXT-X-MEDIA TYPE=SUBTITLES`, hls.js bi napravio dodatne `textTracks`, pa `textTracks[0]` možda nije naš `--sub-file` — **nije provereno**.

### Razlika
Ovo je najveći funkcionalni jaz posle ikona. Koji format ani-cli daje kroz `--sub-file` za naše izvore **nije provereno** (spec v0.5 je radio sa VTT-om). Ako izvor nekad pošalje SRT/ASS, titlovi u ugrađenom plejeru tiho nestaju.

### Preporuka
1. **P1 — SRT→VTT konverzija u proxy-ju** (`src/main/streamServer.js`, nova čista funkcija u `src/shared/subtitles.js`): detekcija po sadržaju (`WEBVTT` / SRT vremenski kod / `[Script Info]`), SRT→VTT je trivijalna (zarez→tačka, header). Isto za lokalni `.srt` pored fajla. Napor N, uticaj S. Rizik: nizak; testovi sa fiksturama.
2. **P1 — offset titlova** (±0.1 s / ±1 s; prečice npr. `G`/`H` kao u mpv-u `z`/`x`): pomeranje `cue.startTime/endTime` svih cue-ova na `TextTrack` (radi za VTT bez biblioteke). Fajl `PlayerView.jsx`. Napor N, uticaj S.
3. **P2 — stil titlova** (boja, pozadina/providnost, senka, font) preko `::cue` CSS varijabli; postojeći tokeni u `:root` (pravilo bez hex boja van `:root`, `tests/unit/styles.test.js:15-23`). Napor N, uticaj S.
4. **P2 — ASS/SSA preko JASSUB-a** (biblioteka je odvojena od Seanime-a; licenca JASSUB-a i libass-a **nije provereno** ovde — proveriti pre uvođenja). Ugraditi WASM + worker lokalno (naš CSP: `worker-src blob:`, `src/renderer/index.html:5` — verovatno treba proširiti za `'self'` i `wasm-unsafe-eval`; **nije provereno**). Fontovi: lokalni podrazumevani font. Fajlovi: `PlayerView.jsx` (ili `src/renderer/player/useSubtitles.js`), `streamServer.js` (ne prepisivati ASS u `text/vtt`), `index.html` (CSP), `package.json`. Napor S–V, uticaj S (zavisi od toga da li izvori uopšte šalju ASS — prvo izmeriti). Rizik: CSP, veličina paketa, performanse.
5. **P3 — više staza i preferirani jezik**: tek kad bude više od jedne staze (ani-cli daje jedan `--sub-file`). Prevod titlova — ne preporučuje se (spoljni API ključevi, privatnost).

---

## 5. Audio staze / sub-dub prebacivanje

### Kako oni rade
- HLS audio staze iz `MANIFEST_PARSED` (deduplikacija po id/grupi/jeziku/imenu), setter `hls.audioTrack = id` (`VC/video-core-hls.ts:176-183,224-253,267-270`); za MKV preko `video.audioTracks` (`VC/video-core.tsx:1167-1191`, `VC/video-core-preferences.tsx:1318-1347`).
- Preferirani audio jezik `jpn,jp,jap,japanese` (`VC/video-core.atoms.ts:22,57`); meni (`VC/video-core-audio-menu.tsx`); ciklus K (§3).
- Sub/dub za onlinestream je izbor izvora (`dubbed` parametar pri dohvatanju epizode) (`seanime/seanime-web/src/app/(main)/onlinestream/_lib/use-onlinestream-auto-provider-cycler.ts:208-213`), ne audio staza.

### Kako mi radimo
- Nema izbora audio staze u ugrađenom plejeru (nijedna `audioTrack` referenca u `src/renderer`).
- Sub/dub je parametar ani-cli sesije (`ANI_CLI_MODE`), po seriji (`src/main/watchService.js:47-58`); promena = restart sesije. „Nema dub-a” → „Pusti sa titlom” (`src/renderer/pages/SearchPage.jsx:139,180`).

### Razlika
Za ani-cli izvore sub i dub su različiti strimovi, kao i kod Seanime onlinestream-a — tu nema suštinske razlike. Razlika je samo za HLS sa više audio grupa (retko kod ani-cli izvora; **nije provereno** za naše izvore).

### Preporuka
- **P2:** u plejeru dugme „Sub ⇄ Dub” koje zatvara plejer sa `reason:'switch-mode'` i pokreće istu epizodu u drugom režimu **od iste pozicije** (pozicija se već čuva po naslovu+epizodi, `src/main/positions.js:10`; ali ključ ne zavisi od režima, pa se nastavak prenosi sam). Fajlovi `PlayerView.jsx`, `App.jsx`, `watchService.js`. Napor S, uticaj S. Rizik: dub/sub verzije ponekad imaju različito trajanje — pozicija može biti malo pomerena.
- **P3:** HLS audio meni (isti obrazac kao kvalitet, §2) tek ako se pokaže da izvori daju više audio grupa.

---

## 6. Preskakanje uvoda/odjave (AniSkip, poglavlja, auto-skip, markeri)

### Kako oni rade
- AniSkip v2 sa klijenta: `types[]=ed,mixed-ed,mixed-op,op,recap` (`VC/_lib/aniskip.ts:40-41`); normalizacija: odbacuje nevalidne intervale i ED koji počinje pre kraja OP-a (`VC/_lib/aniskip.utils.ts:15-34`). Pluginovi mogu da zamene skip podatke (`VC/video-core.tsx:676-679,803-805`).
- AniSkip → **sintetička poglavlja** Prologue/Opening/Episode/Ending/Preview (`VC/video-core.utils.ts:315-387`); MKV poglavlja imaju prednost (`VC/video-core.tsx:1652-1678`). **Recap iz AniSkip-a se ne pretvara u poglavlje** (funkcija koristi samo `op/ed`, `VC/video-core.utils.ts:323`).
- Skip dugme „Skip Opening/Ending/<ime poglavlja>”, levo ili desno zavisno od polovine epizode (`VC/video-core-time-range.tsx:140-164`, `VC/video-core.tsx:405-430`).
- **Auto-skip** (podrazumevano isključen, `MC/media-core-preferences.ts:24`): `seekTo(chapter.end)` + poruka 1 s; ne radi dok traje vraćanje pozicije (`VC/video-core-time-range.tsx:149-154`).
- **Prilagodljivi regex obrasci** za dodatna poglavlja za preskakanje (`MC/media-core-chapters.ts:40-80`, `MC/media-core-preferences.ts:11,25`).
- Prečica D u OP/ED preskače ceo deo (§3). Markeri poglavlja i isticanje OP/ED su podešavanja (`VC/video-core.atoms.ts:171-179`).

### Kako mi radimo
- AniSkip u main-u, keš 7 dana po fajlu, `op/ed/recap` (+mixed) (`src/main/aniskip.js:4-30`), MAL id preko AniList-a (`src/main/skipLookup.js:4-10`).
- Dugme samo za `op` i `recap` (`src/renderer/components/SkipButton.jsx:5-6`); tokom `ed` ili poslednjih 30 s dugme „Sledeća epizoda” (`PlayerView.jsx:15,168,199`).
- Auto-skip jednom po delu, poruka 1.5 s; `ed` = kraj epizode (`PlayerView.jsx:157-164`).
- Obojeni segmenti na traci (`PlayerControls.jsx:10-12`).
- mpv: isti auto-skip preko IPC (`src/main/playerMonitor.js:56-67`).

### Razlika
- Mi **ne normalizujemo** AniSkip intervale (npr. `end <= start`, ED pre kraja OP-a, interval duži od trajanja). Seanime to radi.
- Mi pokrivamo `recap`, Seanime ne (prednost za nas).
- Ako korisnik ručno vrati video u OP posle auto-skip-a, ne preskače se ponovo — `autoSkipped` set (`PlayerView.jsx:43,158`). Dobro ponašanje.
- Nema prečice „preskoči deo” (Seanime D), nema poravnanja dugmeta levo/desno.
- AniSkip `episodeLength` šaljemo stvarno trajanje (`src/main/aniskip.js:16`), a keš je po `mal-ep` bez trajanja — ako se kasnije pusti verzija drugog trajanja (npr. preuzeti fajl), keš vraća vremena za drugu verziju. Uticaj mali; **nije provereno** da li AniSkip uopšte filtrira po dužini.

### Preporuka
- **P1:** normalizacija u `src/main/aniskip.js` (odbaci `!(end>start)`, ograniči na `[0,duration]`, odbaci `ed` koji počinje pre kraja `op`). Napor N, uticaj S. Testovi postoje za aniskip — proširiti.
- **P2:** prečica (npr. `S` je zauzet → `Enter` ili `D`) „preskoči trenutni deo”; Esc-sigurno. Napor N, uticaj S.
- **P2:** dugme „Preskoči odjavu” tokom `ed` kad nije poslednja epizoda već postoji kao „Sledeća”; dodati i „Preskoči odjavu (ostani)” za slučaj post-credits scene — tj. seek na `ed.end` umesto zatvaranja. Napor N, uticaj N.
- **P3:** ručno označavanje OP/ED po seriji (kad AniSkip nema podatke) i slanje nazad — van opsega.

---

## 7. Automatski sledeća epizoda, odbrojavanje, prefetch

### Kako oni rade
- **Ugrađeni VideoCore:** na `ended`, ako je `autoNext` uključen (podrazumevano **da**, `MC/media-core-preferences.ts:20`), odmah `playEpisode("next")` — **bez odbrojavanja** (`VC/video-core.tsx:1294-1306`). „Completed” događaj (za AniList) se šalje već na **80%** (`:1284-1290`).
- Za onlinestream `playEpisode` samo menja izabrani broj epizode i briše URL; izvori se zatim dohvataju iznova (`seanime/seanime-web/src/app/(main)/onlinestream/_containers/onlinestream-page.tsx:715-750`). Prefetch sledeće epizode za onlinestream: pretraga `prefetch|preload` u `onlinestream/` nema rezultata — **nema ga** (koliko je vidljivo).
- **Spoljni plejeri:** `useAutoplay` — odbrojavanje **5 s** (modal sa „otkaži”), pa lokalni fajl / torrent / debrid (`seanime/seanime-web/src/app/(main)/_features/autoplay/autoplay.ts:16,255-325,327-372`; modal `.../progress-tracking/_components/autoplay-countdown-modal.tsx`). Uključuje se podešavanjem `autoPlayNextEpisode` (`autoplay.ts:260`).
- **Prefetch postoji samo za torrent strim:** `preload` zastavica pri auto-izboru sledećeg torenta (`autoplay.ts:67-103`).
- Watch-party učesnici ne idu sami dalje (`VC/video-core.tsx:1298`).

### Kako mi radimo
- `finishEpisode` na `ended` ili auto-skip `ed`-a: poslednja → „Završio si seriju”; `autoNext` → odbrojavanje **10 s** sa „Pusti sada/Otkaži”; inače dugme (`src/renderer/components/PlayerView.jsx:128-141`, `src/renderer/components/NextEpisodeCard.jsx`).
- Sledeća/prethodna = **nova ani-cli sesija od nule** (bash → pretraga → izbor naslova → epizoda → link) (`src/renderer/App.jsx:170-175`). Nema prefetch-a. Vreme nije mereno.
- U spoljnom mpv režimu nema automatski sledeće (`ANI_CLI_EXIT_AFTER_PLAY=1`, `src/main/aniCliBridge.js:65`).

### Razlika
Naše odbrojavanje je bogatije od VideoCore-a (on nema odbrojavanje). Ali prelaz je spor: Seanime onlinestream ponovo dohvata samo izvore, a mi pokrećemo ceo ani-cli lanac.

### Preporuka
- **P1 — prefetch linka sledeće epizode**: kad gledanje pređe ~80% (ili na početku `ed`-a), u pozadini pokrenuti ani-cli sesiju za `ep+1` u režimu koji samo vraća link (po uzoru na self-test sa plejerom `debug`, `src/main/aniCliBridge.js:112-120`), sačuvati `{url, referrer, subUrl}` u memoriji main-a sa TTL-om (npr. 10 min), i pri „Sledeća” odmah pozvati `internalPlayer.play`. Ako je link istekao (greška manifesta) → normalan tok. Fajlovi: `src/main/watchService.js` (novi `prefetchNext`), `src/main/aniCliBridge.js`, `src/main/internalPlayer.js`, `src/renderer/App.jsx`. Napor S–V, uticaj **V** (najveća UX dobit u plejeru). Rizici: linkovi sa kratkim rokom (tokeni u URL-u), dvostruko opterećenje izvora, pravilo „ne menjaj logiku sajta” — koristiti samo zvanične ani-cli env/argumente.
- **P2:** odbrojavanje podesivo (5–15 s), na kartici prikazati broj sledeće epizode. Napor N, uticaj N.
- **P3:** automatski sledeća i u spoljnom mpv-u (nova sesija posle izlaska iz mpv-a, uz pitanje). Napor S, uticaj N.

---

## 8. Nastavak sa pozicije (continuity)

### Kako oni rade
- Backend `continuity.Manager`: `filecache` bucket `watch_history`, **jedan zapis po seriji** (ključ `mediaId`, čuva `episodeNumber`, `currentTime`, `duration`), najviše **100** serija, najstariji se izbacuje (`seanime/internal/continuity/history.go:15-19,30-47,99-146,387-412`).
- Pri čitanju se ne vraća ništa ako je odnos **≥ 0.9** ili **< 0.05** (`history.go:372-382`).
- Upis: na pauzu, na seek, na svaki `video-status` (klijent ga šalje **svake 1 s**) i na terminate (`seanime/internal/mediacore/mediacore.go:449-451,471-472,499-509`; `VC/video-core-events.ts:416-428`).
- Vraćanje: na `canplay`, **automatski seek bez pitanja** + poruka „Progress restored” (`VC/video-core.tsx:1428-1480`); kod spoljnih plejera seek posle pokretanja (VLC/MPC-HC uz pauze od 400 ms, mpv `SeekToSlow`) (`seanime/internal/mediaplayers/mediaplayer/repository.go:232-335`). Uključuje se podešavanjem `WatchContinuityEnabled` (`mediacore.go:575-578`).
- Zapažanje: u klijentskom `getEpisodeContinuitySeekTo` stoji provera `(currentTime/duration) > 90` (odnos se poredi sa 90, a ne 0.9), pa taj uslov praktično nikad ne važi (`seanime/seanime-web/src/api/hooks/continuity.hooks.ts:115`); serverski prag 0.9 ipak filtrira.

### Kako mi radimo
- `positions.json`, ključ `naslov#epizoda` (**po epizodi**), brisanje starijih od 60 dana (`src/main/positions.js:10,31-36`, `src/main/index.js:86`).
- Renderer šalje na **5 s** i na pauzu; main čuva samo ≥ 10 s (`src/renderer/components/PlayerView.jsx:13,82-85,178`; `src/main/internalPlayer.js:36-42`).
- Ponuda: 10 s ≤ pozicija ≤ 90% (`src/shared/player.js:20-21`); **pitanje** „Nastavi od mm:ss / Od početka” (`src/renderer/components/ResumePrompt.jsx:4-13`).
- Briše se kad je epizoda označena kao odgledana (`src/main/watchService.js:16`).
- **Spoljni mpv ne čuva pozicije** (`src/main/playerMonitor.js:92` vraća samo `exitCode/maxPercent`), iako već posmatra `time-pos` (`:77`).

### Razlika
Naš model (po epizodi + pitanje) je jasniji od Seanime-ovog (jedan zapis po seriji + tihi seek). Slabosti: sinhroni upis celog JSON-a na 5 s (`src/main/jsonStore.js:22-27`, `src/main/positions.js:11-13,20-24`) i mpv bez nastavka.

### Preporuka
- **P1 — nastavak u spoljnom mpv-u:** `playerMonitor` već dobija `time-pos`/`duration`; vratiti ih u rezultatu i periodično čuvati preko `positions.save`; pri pokretanju dodati `--start=<pos>` ako `positions.get` vrati poziciju. Fajlovi `src/main/playerMonitor.js`, `src/main/watchService.js`. Napor N–S, uticaj S.
- **P2 — upis bez blokiranja:** coalesce (upis najviše na 15–30 s, uvek na pauzu i zatvaranje) ili async upis. Fajl `src/main/positions.js`. Napor N, uticaj N–S.
- **P3 — opcija „nastavi automatski bez pitanja”** uz poruku „Nastavljeno od mm:ss”. Napor N, uticaj N.
- Zadržati gornji prag 90% (isti kao Seanime); donji prag 10 s je razumniji od 5%.

---

## 9. Sinhronizacija napretka (kada je odgledano, AniList)

### Kako oni rade
- **Ugrađeni:** „completed” na **80%** (`VC/video-core.tsx:1284-1290`) → `CompletedEvent` → `updateProgressOnCompletion`: ako je `AutoUpdateProgress` uključen i AniList progres je manji od broja epizode → `UpdateEntryProgress` i osvežavanje kolekcije (`seanime/internal/mediacore/mediacore.go:425-434,453-455,520-555`).
- **Spoljni:** `completionThreshold: 0.8` (`seanime/internal/mediaplayers/mediaplayer/repository.go:155,688,837-842`); status na **1 s** posle početnih 3 s, do 5 pokušaja (`:560-563`) → `autoSyncCurrentProgress` (isto pravilo „samo napred”) + toast (`seanime/internal/library/playbackmanager/progress_tracking.go:138-172,513-566`). Postoji i ručni „Sync progress” (`progress_tracking.go:567-597`).

### Kako mi radimo
- `maxPercent` = najveći dostignuti procenat (`src/shared/player.js:23`); kraj `ed`-a ili `next` tokom kraja = 100% (`src/renderer/components/PlayerView.jsx:55,131`).
- `decideWatched`: `autoTrack` isključen → ništa; `askOnClose` → pitanje; inače `maxPercent ≥ watchedThreshold` (podrazumevano **85**, 50–100) (`src/main/playerMonitor.js:11-15`, `src/main/settings.js:6,36-38`). Odluka se donosi **tek pri zatvaranju** (`src/main/watchService.js:72-75`).
- Beleženje je lokalno (biblioteka, dnevnik, XP). **AniList sinhronizacija ne postoji.**

### Razlika
Seanime beleži **u trenutku** dostizanja praga; mi pri zatvaranju. Ako se aplikacija sruši ili se sistem ugasi posle 95% epizode, epizoda nije zabeležena: `maxPercent` postoji samo u memoriji `internalPlayer`-a (`src/main/internalPlayer.js:39`).

### Preporuka
- **P2 — beleženje na pragu:** kad `maxPercent` iz `player:progress` pređe prag, odmah `afterPlayback` (jednom po reprodukciji); pri zatvaranju samo ako to nije urađeno. `askOnClose` ostaje na zatvaranju. Fajlovi `src/main/internalPlayer.js`, `src/main/watchService.js`. Napor N–S, uticaj S. Rizik: dvostruko beleženje — zastavica.
- **P3 — AniList sinhronizacija** (posebna oblast: OAuth, tokeni). Ovde samo: preuzeti ideju praga i pravila „samo napred”.

---

## 10. Spoljni plejeri (mpv / VLC / MPC-HC / IINA)

### Kako oni rade
- Zajednički `mediaplayer.Repository` sa `Play`, praćenjem i događajima (`seanime/internal/mediaplayers/mediaplayer/repository.go:225-339,555-848`).
- **mpv:** `--input-ipc-server=<pipe>` (`\\.\pipe\mpv_ipc_<sufiks>` na Windows-u), opciono `--idle`; posmatra `time-pos`, `pause`, `duration`, `filename`, `path` (`seanime/internal/mediaplayers/mpv/mpv.go:137-140,508-528,730-735`); korisnički argumenti i log fajl (`:837-846`).
- **VLC:** HTTP interfejs (`seanime/internal/mediaplayers/vlc/vlc.go:30-41`); **MPC-HC:** web interfejs (`seanime/internal/mediaplayers/mpchc/commands.go`); **IINA:** mpv opcije sa prefiksom `--mpv-` (`repository.go:312-335`).
- Nastavak: seek posle pokretanja (`repository.go:252-302`).
- **MpvCore (libmpv u Electron-u, „mpv-prism”)** (`seanime/seanime-denshi/package.json:10-18`, `seanime/seanime-denshi/src/main/mpv-core.ts`) sa folderom za **Anime4K/CNN šejdere** (`.glsl`/`.hook`) i ugrađenim profilima (`mpv-core.ts:438-493`). Web VideoCore ima Anime4K preko WebGPU (`anime4k-webgpu`, `seanime/seanime-web/package.json:66`; `VC/video-core-anime-4k-manager.ts`).

### Kako mi radimo
- Samo mpv: `spawn` sa `--input-ipc-server=\\.\pipe\animedesk-mpv-<uuid>`, povezivanje 40×250 ms, posmatra `percent-pos`, `time-pos`, `duration`; auto-skip preko `seek` + `show-text` (`src/main/playerMonitor.js:40-96`).
- uosc preko sopstvenog `--config-dir` (`src/main/mpvConfig.js:5-20`, `src/main/index.js:124-131`).
- Nema VLC/MPC-HC; nema šejdera; nema nastavka (§8).

### Razlika
Naš mpv most je čist i dovoljan (mpv se instalira sam). Fale nastavak, sledeća epizoda i opcioni dodaci kvaliteta slike.

### Preporuka
- **P1:** nastavak u mpv-u (§8).
- **P2 — opcioni „Anime4K” profil u našem `mpv.conf`** (isključeno / brzo / kvalitetno), šejderi kao opcioni alat preko `toolManager`-a (isti obrazac kao uosc, `src/main/toolSources.js`). Licenca šejdera — **nije provereno**. Fajlovi `src/main/mpvConfig.js`, `src/main/toolSources.js`, `src/renderer/pages/SettingsPage.jsx`. Napor S, uticaj S. Rizik: slabiji GPU → seckanje; podrazumevano isključeno.
- **P3:** polje „dodatni mpv argumenti” uz validaciju (zabraniti `--input-ipc-server`, `--config-dir`). Napor N, uticaj N.
- VLC/MPC-HC/IINA: **ne preporučuje se** (Windows aplikacija, mpv je već upakovan).
- Ugrađeni libmpv (kao MpvCore): **ne sada** — rešio bi ASS, kodeke i šejdere, ali je native modul (napor V). Razmotriti tek ako ASS/kodeci postanu čest problem.

---

## 11. Strim naspram lokalnog fajla (proxy, zaglavlja, range, transkodiranje)

### Kako oni rade
- **Onlinestream proxy** (`seanime/internal/handlers/proxy.go`): URL i zaglavlja (JSON) kao query parametri (`:206-230`); M3U8 se parsira bibliotekom i prepisuju se segmenti, `EXT-X-MAP`, ključevi, varijante i alternativne staze (`:278-365,393-445`); Range se prosleđuje, podrazumevani UA (`:446-470`); CORS uz izložena Range zaglavlja (`:487-492`); poseban tretman AES ključeva (`:159-205`); rezerva HTTP/2 → HTTP/1.1 (`:77-158`). Allow-list odredišta u ovom handleru **nije uočena** (bezbednost na nivou servera — **nije provereno** detaljno).
- **Directstream**: HTTP sa Range-om, HEAD, bez hop-zaglavlja (`seanime/internal/directstream/httpstream.go:205-270`); MKV metapodaci (titlovi, fontovi, poglavlja) (`VC/video-core.tsx:476-484,1652-1659`).
- **Transkodiranje:** `seanime/internal/mediastream/transcoder/` (ffmpeg → HLS, `hwaccel.go`, `keyframes.go`) i `mediastream/directplay.go`. Ako direktno puštanje ne uspe, plejer jednom pokuša kao HLS (`VC/video-core.tsx:1409-1417`).

### Kako mi radimo
- `streamServer` (`src/main/streamServer.js`): token u putanji, konstantno vreme, **allow-list po reprodukciji**, prepisuje ne-komentar linije i sve `URI="…"` (pokriva `EXT-X-KEY`, `EXT-X-MAP`, `EXT-X-MEDIA`) (`:11-18,34-39,103-108,122-146`); `Referer`/`Origin`/UA, Range, `Accept-Encoding: identity` (`:84-89`); prekid klijenta prekida odlazni zahtev (`:85-86`).
- Lokalni fajl: uvek `video/mp4`, Range (`:47-52,62-76`).
- Nema transkodiranja, ponovnog pokušaja ni timeout-a odlaznog zahteva.

### Razlika
Naš proxy je **bezbedniji** (allow-list) i jednostavniji — zadržati. Fale: retry/timeout za segmente; MIME je uvek `video/mp4`.

### Preporuka
- **P2 — jedan ponovni pokušaj za segment** (`r/<n>`) na mrežnu grešku/5xx pre slanja zaglavlja (ne za playlistu). Fajl `src/main/streamServer.js`. Napor N, uticaj S.
- **P2 — timeout odlaznog zahteva** (npr. 20 s do zaglavlja, `AbortSignal.any([ac.signal, AbortSignal.timeout(...)])`). Napor N, uticaj N–S.
- **P3 — MIME po ekstenziji** za lokalni fajl. Napor N, uticaj N.
- Transkodiranje: **ne** (bez jasne koristi za ani-cli izvore).

---

## 12. Baferovanje, učitavanje, greške i oporavak

### Kako oni rade
- **Overlay-i:** učitavanje, baferovanje, greška (`VC/video-core.tsx:369,403,579-587`; `MC/media-core-overlays.tsx`). Baferovanje = `readyState < 3 && !paused` (`VC/video-core.utils.ts:119-124`) + `waiting/stalled/canplay` (`VC/video-core.tsx:1424-1426,1453-1455,1494-1496`).
- **Detekcija zastoja:** baferovanje **12 s** bez pomaka → `onStalled` (`VC/video-core.tsx:595,1036-1054`); i hls.js `BUFFER_STALLED_ERROR` (`VC/video-core-hls.ts:281-283`).
- **hls.js oporavak:** fatalni `MEDIA_ERROR` → `recoverMediaError`, poslednji pokušaj uz `swapAudioCodec`; brojač se resetuje na `FRAG_CHANGED` (`VC/video-core-hls.ts:141-165,272-277,287-291`). Fatalne mrežne greške se ne ponavljaju u hls.js-u nego idu gore (`:129-139,291`).
- **Onlinestream oporavak:** na grešku/zastoj **pre 1. sekunde reprodukcije**: prvo **osveži izvor iste epizode** (jednom po provajder/server/epizoda), pa **sledeći server**, pa **sledeći provajder**; tajmauti 15 s / 20 s; dugme „Try all available providers” (`seanime/seanime-web/src/app/(main)/onlinestream/_lib/use-onlinestream-auto-provider-cycler.ts:47-48,105-187,189-234`; `.../_lib/onlinestream-provider-trial.ts:1-3`; `.../_containers/onlinestream-page.tsx:770-787,977-985`).
- Pauza pri minimizovanju/sakrivanju prozora (`VC/video-core.tsx:813-829`).

### Kako mi radimo
- hls.js: fatalni `NETWORK_ERROR` → do 3 puta (`loadSource` za greške manifesta, inače `startLoad`); `MEDIA_ERROR` → jednom `recoverMediaError`; zatim ekran greške sa „Pusti u spoljnom (mpv)” i „Nazad” (`src/renderer/components/PlayerView.jsx:16-18,60-80,190-196`).
- **Nema indikatora učitavanja/baferovanja** — crn ekran sa kontrolama do prvog kadra; nema `onWaiting/onStalled` (`PlayerView.jsx:175-183`).
- Nema detekcije „tihog” zastoja; nema „osveži link”.

### Razlika
Korisnik ne zna da li se nešto učitava ili je zaglavljeno. Seanime-ov obrazac „osveži izvor → sledeći izvor” kod nas se prevodi u „pokreni ani-cli ponovo za istu epizodu”.

### Preporuka
- **P1 — spinner učitavanja/baferovanja**: `loading` do `canplay`/`playing`, `buffering` na `waiting`/`stalled`; posle ~8 s poruka „Sporo učitavanje…”. Fajlovi `PlayerView.jsx`, `src/renderer/styles.css`, `src/renderer/i18n/sr.json`/`en.json`. Napor N, uticaj **V**. Animacija samo `transform/opacity` (`tests/unit/styles.test.js:15-23`), poštovati reduce-motion.
- **P1 — detekcija zastoja (12–15 s bez napretka dok nije pauzirano)** → ekran greške sa novim dugmetom **„Pokušaj ponovo”** (`reason:'retry'` → ista epizoda, svež link, nastavak od pozicije; grananje kao `next/prev` u `src/renderer/App.jsx:170-175`). Napor S, uticaj V.
- **P2 — jedan automatski „refresh”** pre ekrana greške, ako je greška u prvih nekoliko sekundi ili posle duže pauze (istekao token). Napor S, uticaj S.
- **P2 — `MEDIA_ERROR`:** drugi pokušaj uz `swapAudioCodec()`; reset brojača kad reprodukcija napreduje. Napor N, uticaj N–S.
- **P3 — pauza pri minimizovanju** (opciono). Napor N, uticaj N.

---

## 13. Ostalo

| Funkcija | Seanime | Mi | Preporuka |
|---|---|---|---|
| Pamćenje jačine/mute | da (`MC/media-core-preferences.ts:7-8,21-22`; `VC/video-core.tsx:1500-1512`) | **ne** — `useState(1)` pri svakom otvaranju (`src/renderer/components/PlayerView.jsx:32-33`) | **P1**, N/S: `playerVolume`, `playerMuted` u `settings`. |
| Pamćenje brzine | da (`MC/media-core-preferences.ts:9`) | nema brzine | uz §2, P2. |
| Dvoklik = fullscreen | da, klikovi u razmaku < 300 ms (`VC/video-core.tsx:1331-1348`) | **ne**; klik = pauza (`PlayerView.jsx:180`) | **P1**, N/S: `onDoubleClick` → fullscreen; klik odložiti ~200 ms da se ne pauzira dvaput. |
| Mini plejer / PiP | mini plejer na Esc (`VC/video-core.tsx:771-786,1780-1790`); PiP (`VC/video-core-pip.ts:162`) | nema | **P2** PiP (nativni API; prikaz VTT titlova u PiP-u pod Electron-om **nije provereno**), N/S. Mini plejer P3 (S). |
| Screenshot | clipboard + folder (`VC/video-core-screenshot.ts:44-65`), prečica I | nema | P3, N/N (CORS je u redu: proxy šalje `*`, `src/main/streamServer.js:8`; `<video crossOrigin>`, `PlayerView.jsx:176`). |
| Discord RPC | da (`seanime/internal/mediacore/mediacore.go:471-513`; `seanime/internal/discordrpc/presence/presence.go:284-308`) | nema | P3, opciono i podrazumevano isključeno (privatnost); S. |
| Media Session (OS/medija tasteri) | da (`VC/video-core-media-session.ts:92-144`) | nema | **P2**, N/S: metadata (naslov, EP) + play/pause/seek/next. |
| Gestovi na dodir | da (`VC/video-core-mobile-gestures.ts`) | nema | ne treba (desktop). |
| Poboljšanje slike | CSS filter (`VC/video-core.tsx:470-472`) | nema | P3, N. |
| Stats for nerds | da (`VC/video-core-stats.tsx`) | nema | P3: rezolucija/bitrate iz hls.js — korisno za dijagnostiku. |
| InSight (likovi) | da (`VC/video-core-in-sight.tsx`) | nema | ne (rizik spojlera, van opsega). |
| Esc | Esc → mini plejer, drugi Esc → potvrda prekida (`VC/video-core.tsx:1780-1848`) | Esc samo izlazi iz fullscreen-a (namerno, spec v0.5) | zadržati. |

---

## Top preporuke za plejer

**P0** = bag vidljiv odmah; **P1** = velika UX dobit, mali/srednji napor; **P2** = vredno, srednje; **P3** = kasnije/opciono. Uticaj / napor: V/S/N.

| # | Prio | Preporuka | Fajlovi | Uticaj | Napor |
|---|---|---|---|---|---|
| 1 | **P0** | Dodati 7 nedostajućih ikona u `ICONS` + test „svako korišćeno ime postoji” | `src/renderer/components/Icon.jsx`, test u `tests/unit/` | V | N |
| 2 | **P1** | Prečice prestaju posle klika na klizač/`select` (fokus); filtrirati Ctrl/Alt/Meta; `e.code` | `PlayerView.jsx` | S | N |
| 3 | **P1** | Spinner učitavanja/baferovanja + poruka za sporo učitavanje | `PlayerView.jsx`, `styles.css`, i18n | V | N |
| 4 | **P1** | Detekcija zastoja + „Pokušaj ponovo” (svež link, nastavak od pozicije) | `PlayerView.jsx`, `App.jsx`, `watchService.js` | V | S |
| 5 | **P1** | Prefetch linka sledeće epizode (od ~80%/`ed`), TTL keš, rezerva na normalan tok | `watchService.js`, `aniCliBridge.js`, `internalPlayer.js`, `App.jsx` | V | S–V |
| 6 | **P1** | Pamćenje jačine/mute | `PlayerView.jsx`, `src/main/settings.js` | S | N |
| 7 | **P1** | Dvoklik = fullscreen | `PlayerView.jsx` | S | N |
| 8 | **P1** | SRT→VTT (strim i lokalni `.srt`), detekcija formata po sadržaju | `streamServer.js`, novi `src/shared/subtitles.js` | S | N |
| 9 | **P1** | Offset titlova + prečice | `PlayerView.jsx` | S | N |
| 10 | **P1** | Nastavak u spoljnom mpv-u | `playerMonitor.js`, `watchService.js` | S | N–S |
| 11 | **P1** | Normalizacija AniSkip intervala | `src/main/aniskip.js` | S | N |
| 12 | **P2** | Brzina (meni + `[`/`]`, pamćenje) i settings meni | `PlayerControls.jsx`, `PlayerView.jsx`, `settings.js` | S | N–S |
| 13 | **P2** | Izbor HLS kvaliteta (ako ima nivoa) + pamćenje | `PlayerView.jsx` / `useHls` | S | S |
| 14 | **P2** | Tooltip vremena + buffered traka na seek baru | `PlayerControls.jsx`, `styles.css` | S | N |
| 15 | **P2** | „Odgledano” na pragu, ne samo na zatvaranju | `internalPlayer.js`, `watchService.js` | S | N–S |
| 16 | **P2** | Proxy: retry segmenta + timeout | `streamServer.js` | S | N |
| 17 | **P2** | hls.js: `swapAudioCodec`, reset brojača, jedan auto-refresh | `PlayerView.jsx` | S | N–S |
| 18 | **P2** | Dodatne prečice (P, 0–9, Home/End, kadar) + „?” pomoć | `PlayerView.jsx`, i18n | S | N |
| 19 | **P2** | Sub ⇄ Dub dugme u plejeru (nastavak od pozicije) | `PlayerView.jsx`, `App.jsx`, `watchService.js` | S | S |
| 20 | **P2** | Media Session API + PiP | `PlayerView.jsx` | S | N |
| 21 | **P2** | Stil titlova preko `::cue` tokena | `styles.css`, `SettingsPage.jsx` | S | N |
| 22 | **P2** | ASS/SSA preko JASSUB-a (prvo izmeriti da li izvori šalju ASS; CSP/WASM; licence) | `PlayerView.jsx`, `streamServer.js`, `index.html`, `package.json` | S | S–V |
| 23 | **P2** | Opcioni Anime4K profil za mpv | `mpvConfig.js`, `toolSources.js`, `SettingsPage.jsx` | S | S |
| 24 | **P2** | Razbiti `PlayerView` na hook-ove pre većih dodataka | `src/renderer/player/*` | S | S |
| 25 | **P3** | Preview sličice (samo iz baferovanog), prilagodljive prečice, screenshot, Discord RPC, mini plejer, stats, coalesce upisa pozicija, auto-next u mpv-u | razno | N–S | N–V |

**Predlog redosleda:** 1 → (2, 3, 6, 7) kao jedan mali „polish” PR → (4, 17) oporavak → (8, 9, 11) titlovi i skip → (10, 15) praćenje → 5 prefetch (poseban spec zbog ani-cli toka) → P2 kontrole (12–14, 18–21) → 22–24.
