# 03 — Oblast 2: Kvalitet i izvori epizoda

> Faza 3, oblast 2. Samo analiza, kod nije menjan.
> Izvori: Seanime klon (`_ref/seanime`, GPL-3.0), naš repo (`src/...`), instalirani ani-cli **v5.1.0**.
> Putanja ani-clija je `%APPDATA%\AnimeDesk\tools\ani-cli\ani-cli` (zapisano u `tools/manifest.json`; izvor je `pystardust/ani-cli`, `src/main/toolSources.js:3`).
> Format referenci: `seanime/<putanja>:linija`, `src/...:linija`, `ani-cli:linija` (linije instalirane skripte, 657 linija).
>
> **Napomena o imenu sajta.** `docs/RIZICI.md` traži da repo ne sadrži kod ni reference za pristup sajtu (DMCA). Zato ovaj dokument ne navodi domen ni ime embed servera. Piše samo „provajder ani-clija”, „embed server” i daje linije u ani-cli skripti gde se to vidi (`ani-cli:213-214`, `ani-cli:429-432`).

---

## 0. ani-cli 5.1: kako tačno bira izvor i kvalitet

Ovo je osnova za sve ostale odeljke. Sve dole je pročitano iz skripte, ništa nije izmenjeno.

### 0.1 Provajder i lanac do linka
1. **Jedan provajder (sajt), fiksno ugrađen:** `base_api`, `search_api`, `episodes_api` i `servers_api` su konstante (`ani-cli:429-432`). ani-cli 5.1 nema opciju ni env varijablu za drugi provajder. Lista opcija (`ani-cli:479-547`) i env varijabli (`ani-cli:437-440`, `458-463`, `471`, `476-477`) ne sadrži ništa takvo.
2. **Pretraga:** scrape HTML stranice, a rezultat je `id \t naslov` (`ani-cli:186-197`). Kad je odgovor Cloudflare izazov, javlja se „Blocked by cloudflare” (`ani-cli:189-191`). curl se bira redom, prvo curl-impersonate varijante pa tek onda obični curl (`ani-cli:442`).
3. **Epizode:** samo `data-number` i `data-id` (`ani-cli:200-206`). Naslova i datuma epizoda nema.
4. **Serveri epizode:** dohvata se lista servera (`ani-cli:212`). Uzima se **samo jedan imenovani embed server** za traženi `data-type` (sub ili dub), i to prvi pogodak (`head -n 1`). Komentar u kodu to objašnjava: samo taj embed ume da dešifruje `deobfuscate_blob`, ostali serveri koriste druge plejere (`ani-cli:213-214`). **Ostali serveri se ignorišu.**
5. **Embed → konfiguracija:** iz embed URL-a se izvlače `refr` (origin embed sajta kao referer) i `mal_id` (`ani-cli:218-219`). Zatim se `window.__P` blob dešifruje XOR-om (`ani-cli:172-183`, `220-222`).
6. **Jedan master HLS playlist** (`"src":"...m3u8"`, `ani-cli:223`). Ako ga nema, `return 1` (`ani-cli:224`).
7. **Titl:** uzima se **samo jedna** traka, ona označena `"default":true`. Kod to opisuje kao englesku (`ani-cli:225-226`). Ako nijedna traka nije default, `sub_link` ostaje prazan.
8. **Varijante kvaliteta:** master playlist se preuzme sa refererom. Svaki `#EXT-X-STREAM-INF` red pretvara se u `"<visina>p >URL"`, relativni URL-ovi dobijaju prefiks master direktorijuma, a lista se sortira numerički opadajuće (`ani-cli:228`). **Broj linkova po epizodi = broj varijanti u jednom master playlistu jednog servera.** Koliko ih ima zavisi od sajta i nije fiksno u kodu.

### 0.2 Izbor kvaliteta (`-q` / `ANI_CLI_QUALITY`)
- Podrazumevano `best` (`ani-cli:440`); `-q` ga prepisuje (`ani-cli:499-503`).
- `select_quality` (`ani-cli:233-242`):
  - `best` → prvi red, tj. najveća rezolucija (`:235`);
  - `worst` → poslednji red koji počinje sa 3–4 cifre (`:236`);
  - bilo šta drugo → `grep -m 1 "$1"`, prvi red koji **sadrži** string (`:237`).
- **Kad traženog kvaliteta nema:** na stderr ide žuta poruka `"<q> not found, defaulting to best"` i bira se `best` (`ani-cli:239`). Sesija se **ne prekida**.
- **Zamka (uočeno u kodu):** `grep "$1"` nije usidren i pretražuje ceo red, zajedno sa URL-om (`ani-cli:237`). Ako URL varijante „1080p” sadrži, na primer, „720” ili „360”, a pre nje nema tačnog pogotka, izbor može pasti na pogrešnu varijantu. Pošto je sort opadajući (`:228`), redovi viših rezolucija dolaze prvi, pa se greška može desiti samo „naviše”. Ovo **nije izmereno** na stvarnim URL-ovima.
- Promena kvaliteta posle gledanja postoji samo u ani-cli meniju posle reprodukcije (`change_quality`, `ani-cli:628-632`). Taj meni nudi tačno postojeće `links`. **Mi ga nikad ne vidimo**: sa `ANI_CLI_EXIT_AFTER_PLAY=1` (`src/main/aniCliBridge.js:65`) ani-cli izlazi odmah posle plejera, kad nije u pitanju opseg (`ani-cli:369`).

### 0.3 Sub/dub
- `ANI_CLI_MODE` (podrazumevano `sub`, `ani-cli:437`) ili `--dub` (`ani-cli:532`). Režim se samo prosleđuje kao `data-type` filter servera (`ani-cli:214`, `246`).
- Ako server za taj režim ne postoji: `die "No sources found for $mode!"` (`ani-cli:246`). Isti tekst se dobija kad pukne bilo koji korak lanca 0.1 (embed, blob, master). **ani-cli ne razlikuje „nema dub-a” od „server ne radi”.**

### 0.4 Šta ide plejeru
- Za ime plejera koje sadrži `mpv` (naš bridge se zato zove `animedesk-mpv-bridge.sh`, `resources/bridges/animedesk-mpv-bridge.sh:2`) ani-cli šalje `--referrer=$refr`, opcioni `--sub-file`, `--force-media-title` i **URL izabrane varijante** (media playlist, ne master) (`ani-cli:363-370`).
- Režim `debug` štampa `All links`, `Selected link` i `Subtitles` (`ani-cli:359`). Ovo je **zvaničan način da se bez gledanja dobiju svi dostupni kvaliteti**. Naš `selfTest` ga već koristi (`src/main/aniCliBridge.js:112-120`).
- `ANI_CLI_PLAYER_FLAGS` (`ani-cli:458`) je zvanična env varijanta za dodatne argumente plejera, odnosno downloadera (`ani-cli:384`). Mi je ne koristimo.

### 0.5 Preuzimanje u ani-cliju
- Titl (ako postoji) se preuzima curl-om kao `"$dir/<naslov> Episode <n>.vtt"` (`ani-cli:335`).
- Video: `yt-dlp --referer ... --no-skip-unavailable-fragments --fragment-retries infinite -N 16 -o "$dir/<naslov> Episode <n>.mp4"` (`ani-cli:336`). Ako yt-dlp nije u PATH-u ili padne: `ffmpeg -referer ... -c copy` (`ani-cli:337`). **Nema ponovnog enkodovanja**: kvalitet fajla jednak je kvalitetu izabrane stream varijante.
- `-e` prima opseg (`"5-6"`, `"5 6"`, `-1` = poslednja), pa se jedan proces vrti kroz više epizoda (`ani-cli:398-417`).

---

## 1. Tipovi izvora

**Kako oni rade (Seanime).**
- Četiri vrste izvora:
  - lokalna biblioteka;
  - torrent: ugrađeni klijent i streaming, ili eksterni klijent;
  - debrid: strim ili preuzimanje keširanog torrenta;
  - online stream.
- Autoselect ima dva režima, `torrent` i `debrid` (`seanime/internal/torrents/autoselect/autoselect.go:21-26`). Rezultat nosi ili torrent fajl, ili debrid torrent i ID fajla (`:53-60`).
- **Ugrađenih izvora sadržaja nema.** Jedina ugrađena ekstenzija je lokalni manga provajder (`seanime/internal/core/extensions.go:19-29`). Torrent i online stream provajderi dolaze isključivo kao eksterne ekstenzije (`:33-35`; JS/Goja loader `seanime/internal/extension_repo/goja_onlinestream_provider.go`, `goja_anime_torrent_provider.go`). Konstante `gogoanime`/`zoro` (`seanime/internal/onlinestream/providers/common.go:5-9`) su ostatak. Implementacija nema u `providers/`, gde je samo `common.go`.
- Online stream provajder je interfejs `Search → FindEpisodes → FindEpisodeServer(episode, server)`. Server može biti `"default"` (`seanime/internal/extension/hibike/onlinestream/types.go:4-13`).

**Kako mi radimo.**
- Imamo jedan izvor, originalni ani-cli. Taj ani-cli ima jedan ugrađen provajder i jedan embed server (odeljak 0.1).
- Lokalni fajlovi postoje samo kao naša preuzimanja (`src/main/downloads.js:84`), a puštaju se kroz `playLocal` (`src/main/watchService.js:99-103`).
- Torrenta, debrid-a i ekstenzija nema.

**Razlika.**
- Seanime je **platforma** za izvore (marketplace ekstenzija); kvalitet zavisi od toga šta korisnik instalira.
- Mi smo **tanak omotač oko jednog izvora**: kad taj sajt ili server padne, nemamo alternativu (`ani-cli:246`).

**Preporuka.** Ne uvoditi torrent ni debrid (odeljak 7). Jedini realan „drugi izvor” je **sopstveno preuzimanje**: offline fajl koji ne zavisi od sajta u trenutku gledanja. Njega treba ojačati.

---

## 2. Rangiranje i izbor (rezolucija, grupe, seederi, batch, profil)

**Kako oni rade.**
- **Profil** (`AutoSelectProfile`, `seanime/internal/library/anime/autoselect_types.go:8-31`) sadrži:
  - poređane provajdere (najviše 3), release grupe, rezolucije i `ExcludeTerms`;
  - poređane jezike, kodeke i izvore (npr. „BDRip”);
  - preference `neutral/prefer/avoid/only/never` za multi-audio, multi-subs, batch i „best release” (`:34-40`);
  - `Require*` zastavice i pragove `MinSeeders`, `MinSize`, `MaxSize`.
- **Pretraga:**
  - najviše 3 provajdera iz profila, inače podrazumevani (`seanime/internal/torrents/autoselect/search.go:71-90`); svi se pretražuju paralelno, uz dedup po infohash-u (`:92-130`);
  - po provajderu se rezolucije probaju **redom dok nešto ne vrati rezultat** (`:168-175`);
  - batch pretraga ima fallback na pretragu jedne epizode, a uz validan batch dodaju se i rezultati za jednu epizodu (`:190-250`).
- **Filtriranje** (`seanime/internal/torrents/autoselect/comparison.go:214-358`):
  - izbacuju se exclude termini i kandidati ispod seeders/size pragova;
  - primenjuju se `Require*` zastavice (metapodaci parsirani `habari` parserom, `:62-70`) i `only`/`never` preference (`:174-182`).
- **Bodovanje** (`comparison.go:464-611`, konstante `:15-32`). Prioritet:
  - rezolucija 100−10·i;
  - grupa 50−5·i;
  - kodek 40−5·i;
  - izvor 30−5·i;
  - jezik 20−2·i;
  - provajder 5−i.

  Bonus/malus: multi-audio ±15, multi-subs ±10, batch ±20, best release ±20 (best release računa samo uz >2 seedera, `:602`).
- **Sortiranje:** prvo prioritet, zatim bonus, zatim ukupni skor, pa **seederi** kao poslednji tie-break (`comparison.go:360-382`). Osnovna torrent pretraga sortira „best release” na vrh, pa po seederima (`seanime/internal/torrents/torrent/search.go:351-359`).
- **Debrid „smart cached”:** keširani torenti sa skorom ≥70 % najboljeg idu prvi, zatim nekeširani, pa slabi keširani (`comparison.go:387-457`). Keš status daje `GetInstantAvailability` (`seanime/internal/debrid/client/finder.go:46-71`).
- **Izbor fajla:** analizira se najviše 3 kandidata (`seanime/internal/torrents/autoselect/file_selection.go:19-20`, `:32-60`). Pravi fajl epizode u batch-u nalazi analizator (`seanime/internal/torrents/analyzer/analyzer.go:72-118`).
- **Bez profila:** samo `[StreamPreferredResolution || "1080p"]` (`seanime/internal/debrid/client/finder.go:33-43`; isto za torrentstream, `seanime/internal/torrentstream/finder.go:48-56`; podrazumevano „1080p” i u `autoselect.go:170-177`).
- **UI transparentnost:** status sadrži korak, kandidate sa skorom i seederima i izabrani fajl (`autoselect.go:62-80`, `148-157`).

**Kako mi radimo.**
- Jedna dimenzija izbora, `quality ∈ best|1080|720|480|360|worst` (`src/main/settings.js:27`), globalno ili po seriji (`src/main/seriesPrefs.js:33-36`).
- Vrednost se samo prosleđuje kao `ANI_CLI_QUALITY` (`src/main/aniCliBridge.js:67`), a ani-cli radi `select_quality` (`ani-cli:233-242`).
- Kandidata nema. Imamo jedan server i jednu listu varijanti (0.1), dakle ni grupa, ni kodeka, ni seedera.

**Razlika.**
- Kod Seanime-a rangiranje ima smisla jer postoje desetine različitih release-ova iste epizode.
- Kod nas „kandidati” su samo rezolucije **istog** enkoda istog servera. Nema šta da se boduje osim rezolucije.

**Preporuka.**
- Ne prenositi profil i scoring; nema ulaznih podataka za to.
- Prenosi se **ideja „lista preferenci sa fallback-om”**, koju ani-cli već delimično radi: ako traženo nema, uzima `best` (`ani-cli:239`).
- Korisno je dodati „ako nema 1080, uzmi 720, a ne best”. To se može uraditi bez patcha, preko debug probe (odeljak 7, P1).
- Prenosi se i **transparentnost**: pokazati šta je izabrano i šta je bilo dostupno (P0).

---

## 3. Online stream: serveri, kvaliteti, headeri, titlovi, sub/dub

**Kako oni rade.**
- `EpisodeServer` ima `Server`, `Headers` i listu `VideoSources`. Svaki izvor ima `URL`, `Type` (mp4/m3u8), `Quality` („1080p”, „auto”, „default”) i **više titlova** sa jezikom i `IsDefault` (`seanime/internal/extension/hibike/onlinestream/types.go:95-132`, `145-149`). Provajder deklariše svoje servere i `SupportsDub` (`:61-64`).
- Backend za svaku epizodu prolazi kroz **sve servere** provajdera i zadržava one koji nisu vratili grešku (`seanime/internal/onlinestream/repository_actions.go:186-198`). Sve varijante svih servera spljošti u jednu listu sa `Server` i `Headers` (`seanime/internal/onlinestream/repository.go:257-279`).
- Keš (filecache):
  - lista epizoda 24 h;
  - izvori epizode 15 min (`seanime/internal/onlinestream/repository.go:41-42`, `111-120`);
  - ključ je `mediaId$provider$epizoda$dub` (`repository_actions.go:102`);
  - `refresh` zaobilazi keš (`:111`).
- **Izbor kvaliteta u UI** (`seanime/seanime-web/src/app/(main)/onlinestream/_containers/onlinestream-page.tsx:527-581`):
  1. filter po izabranom serveru;
  2. tačan label;
  3. ista rezolucija (`getQualityResolution`, `:94-99`);
  4. `auto`/`default`;
  5. inače 1080p → 720p → 480p → 360p.

  Izbor se pamti (`onlinestream.atoms.ts:47`, `atomWithStorage`).
- **Headeri:** kad izvor ima headere, URL ide kroz server-proxy sa HMAC tokenom (`onlinestream-page.tsx:602-605`, `_lib/onlinestream-proxy.ts:1-3`).
- **Titlovi:** traka se bira po sačuvanoj preferenci jezika i labela (`_lib/onlinestream-subtitle-preference.ts:17-42`). Default traka se koristi kad nema preference (`:13-15`).
- **Dub:** u dub režimu cycler gleda samo provajdere sa `supportsDub` (`_lib/use-onlinestream-auto-provider-cycler.ts:94-98`).

**Kako mi radimo.**
- **Server:** jedan, fiksan u ani-cliju (`ani-cli:214`). Ne možemo ga promeniti bez patcha.
- **Kvaliteti:** dobijamo **samo URL izabrane varijante** (`ani-cli:367`, parsiranje `src/main/aniCliBridge.js:38-44`), ne master. Zato:
  - interni plejer nema ABR ni izbor nivoa; hls.js dobija jedan media playlist (`src/main/internalPlayer.js:24`, `src/renderer/components/PlayerView.jsx:63-78`);
  - korisnik ne vidi koje je rezolucije stream. mpv monitor posmatra samo `percent-pos`, `time-pos` i `duration` (`src/main/playerMonitor.js:77`).
- **Headeri:** proxy (`src/main/streamServer.js:84-89`) dodaje `User-Agent`, `Referer` i `Origin` iz ani-clijevog `--referrer` (`:78-82`). To je ekvivalent Seanime proxy-ja. Za mpv `--referrer` prosleđuje sam ani-cli.
- **Titlovi:**
  - najviše jedna traka, ona koju ani-cli označi kao default (`ani-cli:226`);
  - u internom plejeru preko `/sub` (`src/main/streamServer.js:143`), u mpv-u preko `--sub-file`;
  - za preuzete fajlove učitava se `.vtt` sa istim imenom (`src/main/streamServer.js:41-52`).
- **Sub/dub:** `ANI_CLI_MODE` (`src/main/aniCliBridge.js:68`). Greška `no-dub` prepoznaje se po tekstu (`:16`), sa dugmetom „Pusti sa titlom” (`src/renderer/pages/SearchPage.jsx:180`).

**Razlika.**
- Seanime vidi **sve** servere, **sve** varijante i **sve** titlove i bira u UI-ju.
- Mi vidimo samo jedan red koji je ani-cli već izabrao.

**Preporuka.**
- (a) Probom u `debug` režimu dobiti `All links` i prikazati dostupne rezolucije. Kvalitet se zatim bira tačnom vrednošću (P1).
- (b) Prikazati stvarnu rezoluciju: u internom plejeru `video.videoHeight`, u mpv-u observe `height` (P0).
- (c) Više titlova i više servera **nije moguće** bez izmene ani-clija. Ne raditi.

---

## 4. Fallback logika

**Kako oni rade.**
- **Online stream auto-cycler** (`seanime/seanime-web/src/app/(main)/onlinestream/_lib/use-onlinestream-auto-provider-cycler.ts`):
  - Stanje je `{providers, providerIndex, serverIndex}` (`:7-11`). Trenutni provajder ide prvi (`_lib/onlinestream-provider-trial.ts:15-19`).
  - Redosled pokušaja: sledeći server istog provajdera, pa sledeći provajder, pa „No working providers found” (`:105-152`).
  - Okidači prelaska:
    - greška ili prazna lista epizoda;
    - epizoda ne postoji (`:285-319`);
    - nema video izvora ili su serveri iscrpljeni (`:343-386`);
    - timeout liste ili izvora 15 s, a timeout početka reprodukcije 20 s (`:47-48`, `:331-341`, `:414-470`).
  - **URL refresh pre preskakanja.** Kod prve greške reprodukcije za kombinaciju `provider:server:epizoda`, izvor se ponovo dohvata sa `refresh: true`, mimo keša od 15 min (`:189-230`; `getRefreshKey`/`markSourceRefreshed`, `onlinestream-provider-trial.ts:5-13`). Na sledeći kandidat se prelazi tek ako ni refresh ne pomogne.
  - Oporavak važi samo dok reprodukcija nije prešla 1 s (`shouldRecoverStartup`, `onlinestream-provider-trial.ts:1-3`). Uspeh se priznaje na `timeupdate` (`:240-253`).
- **Backend** preskače server koji vrati grešku (`seanime/internal/onlinestream/repository_actions.go:186-191`). Epizoda čiji serveri ne rade se preskače (`:133-137`), a greška se vraća tek kad nijedna epizoda u opsegu nema server (`:158-161`).
- **Torrent:** rezolucija za rezolucijom i batch→single (`seanime/internal/torrents/autoselect/search.go:168-250`), pa do 3 kandidata za izbor fajla (`file_selection.go:19-20`).
- **Debrid:** provera da se strim može pustiti, 4 pokušaja na 8 s (`seanime/internal/debrid/client/stream.go:331-379`).

**Kako mi radimo.**
- **ani-cli:** nema retry-ja ni drugog servera; pri prvoj grešci lanca radi `die` (`ani-cli:246`). curl timeout je 10 s po zahtevu (`ani-cli:154`).
- **Kvalitet:** fallback postoji samo kao „not found → best” (`ani-cli:239`).
- **Interni plejer:** 3 pokušaja za fatalne mrežne greške hls.js; za greške manifesta se ponovo učitava izvor. Jedan `recoverMediaError`, a posle toga poruka o grešci (`src/renderer/components/PlayerView.jsx:15-18`, `63-77`). **Ne pokreće se nova ani-cli sesija.** Ako je URL istekao, ponovno učitavanje istog URL-a ne pomaže.
- **Mapiranje grešaka** (`src/main/aniCliBridge.js:11-18`): `"No sources found for sub!"` (pad servera u sub režimu, `ani-cli:246`) daje `unknown`. Korisnik ne dobija smislenu poruku ni dugme „Pokušaj ponovo”.

**Razlika.**
- Seanime ima tri nivoa fallback-a: server, provajder i URL refresh.
- Mi imamo samo mrežne retry-je u hls.js nad **istim** URL-om.

**Preporuka (bez patcha).**
- (a) **URL refresh po Seanime receptu:** kad interni plejer padne pre ~1 s reprodukcije, ili posle ponovljenih mrežnih grešaka, automatski pokrenuti novu ani-cli sesiju za istu epizodu (već postoji `continueWatching`, `src/renderer/App.jsx:173`). Raditi to **jednom** po epizodi, kao `markSourceRefreshed`, i nastaviti od sačuvane pozicije (`src/main/internalPlayer.js:25`) (P1).
- (b) **Retry sa nižim kvalitetom** kad izabrana varijanta ne radi: ista sesija, `quality` = sledeća niža iz liste probe (P2).
- (c) Bolje mapiranje grešaka: `No sources found for sub` → `no-sources` sa tekstom „server trenutno ne radi, pokušaj ponovo”. Žuta linija `not found, defaulting to best` → upozorenje (P0).

---

## 5. Kvalitet u praksi: da li Seanime dobija bolju sliku i zašto

| Put | Šta stiže do plejera | Izvor tvrdnje |
|---|---|---|
| Seanime torrent / debrid | Ceo **originalni fajl release-a** (mkv/mp4) koji je izabrao autoselect po profilu: rezolucija, grupa, kodek, izvor (npr. BDRip). Debrid strimuje isti fajl preko HTTP-a. | `comparison.go:464-552`; `autoselect_types.go:11-17`; `debrid/client/finder.go:73-106` |
| Seanime online stream | Ono što ekstenzija vrati: m3u8 ili mp4 sa labelom kvaliteta. Izbor ide 1080p→720p→… (`onlinestream-page.tsx:560-575`). | `hibike/onlinestream/types.go:112-124` |
| AnimeDesk | Jedna HLS media playlist varijanta jednog embed servera, birana po `best/1080/…`. Titl je zaseban VTT (soft). | `ani-cli:214`, `228`, `233-242`, `367` |

**Zaključak (šta je provereno, a šta nije):**
1. **Torrent i debrid mogu dati objektivno bolji kvalitet**, a mehanizam je vidljiv u kodu. Seanime bira među različitim enkodima i boduje izvor („BDRip”), kodek, grupu i rezoluciju (`comparison.go:472-552`). Mi uvek dobijamo jedini enkod koji servira jedan embed server.
   - Opšte je poznato, ali u ovoj analizi **nije mereno**, da su streaming HLS varijante tipično re-enkodovane na niži bitrate od BD/WEB-DL release-ova.
   - Torrent release-ovi često nose ASS titlove sa stilovima i više audio traka (`MultipleAudio`/`MultipleSubs`, `comparison.go:574-590`). ani-cli daje najviše jednu VTT traku (`ani-cli:226`).
2. **Online stream kod Seanime-a nije sam po sebi bolji od nas.** Nema ugrađenih provajdera (`seanime/internal/core/extensions.go:19-35`). Korisnik instalira ekstenzije koje skrejpuju isti tip sajtova kao ani-cli, pa je i kvalitet istog reda. Prednost Seanime-a ovde je **izbor i otpornost**, ne bolja slika:
   - više servera i provajdera (`repository_actions.go:186-191`);
   - više titlova;
   - cycler za fallback.
3. **Naša realna gornja granica je „best” varijanta tog jednog servera.** Kad je kvalitet `best` (podrazumevano, `src/main/settings.js:9`), već je dobijamo. `1080` nam ne daje ništa bolje od `best`; samo rizikuje lažni pogodak iz 0.2.
4. **Nevidljivi gubici kod nas:**
   - Korisnik koji je izabrao npr. `1080` ne zna kad ga ani-cli tiho prebaci na `best` (`ani-cli:239`).
   - Ne zna ni stvarnu rezoluciju, jer je ne prikazujemo (`src/main/playerMonitor.js:77`).
   - Interni plejer nema ABR (jedna varijanta, odeljak 3), pa na sporoj mreži baferuje umesto da spusti kvalitet. mpv se ponaša isto, jer dobija istu media playlistu (`ani-cli:367`).

---

## 6. Preuzimanje

**Kako oni rade.**
- Torrent preuzimanje ide preko klijenta (eksterni ili ugrađeni) ili debrid-a, u `Destination` pravila (`seanime/internal/library/anime/autodownloader_types.go:30-34`).
- **Auto-downloader:**
  - **Pravilo po seriji:** grupe, rezolucije, brojevi epizoda, poređenje naslova, dodatni i exclude termini, seederi, veličina, offset i provajderi (`autodownloader_types.go:30-62`).
  - **Profili:** globalni ili po pravilu, sa uslovima (term ili regex → skor ili akcija), `MinimumScore`, `DelayMinutes` i `SkipDelayScore` (`:64-98`). Odlaganje služi da se sačeka bolji release ili repack (`seanime/internal/library/autodownloader/autodownloader.go:730-751`). Skor svih profila se sabira, a važi najstroži prag (`:705-720`).
  - Provera ide periodično, podrazumevano na 20 min, a najmanje na 15 (`autodownloader.go:268-273`).
  - Postoji simulacija pravila (`autodownloader.go:155-166`).
- Online stream u Seanime-u nema preuzimanje u kodu koji je ovde pregledan. U `internal/onlinestream/` nijedan fajl ne pominje „download”.

**Kako mi radimo.**
- Preuzimanje radi ani-cli u `download` režimu, jedna epizoda po sesiji, sa redom čekanja (`src/main/downloads.js:41-67`, `102-115`). Kvalitet i režim su po seriji (`:50-54`).
- **Format:**
  - `.mp4` iz HLS-a preko yt-dlp (16 paralelnih fragmenata, beskonačni retry fragmenata) ili ffmpeg `-c copy` (`ani-cli:336-337`);
  - titl kao susedni `.vtt` (`ani-cli:335`).
- **Ime:** `<ani-cli naslov> Episode <n>.mp4` u `<dir>/<safeDirName(naslov)>` (`src/main/downloads.js:42`, `ani-cli:384`). Kad naslov sadrži `/`, nastaje podfolder, pa se fajl traži rekurzivno (`src/main/downloads.js:13-26`).
- **Napredak** se čita samo iz yt-dlp `[download] NN%` (`src/main/downloads.js:8-11`). Kad se uključi ffmpeg fallback, procenat ostaje 0 do kraja (zaključak iz `ani-cli:337` i regex-a).
- **Auto-download ne postoji.**
- `-e` opseg (`ani-cli:398-417`) ne koristimo: svaka epizoda je zasebna ani-cli sesija sa ponovljenom pretragom (`src/main/downloads.js:51-57`).

**Razlika.**
- Seanime ima pravila, profile i odlaganje radi boljeg release-a.
- Mi imamo ručni red sa jednim izvorom. „Bolji release” kod nas ne postoji, jer je enkod uvek isti.

**Preporuka.**
- (a) **Jednostavan auto-download „novih epizoda sa watchliste”:** periodična provera i enqueue u postojeći red. Bez profila, jer nemamo kandidate. Koristi se postojeći red i `resolvePrefs` (P2).
- (b) Zapisati u `downloads.json` i **stvarnu rezoluciju** fajla. `ffprobe.exe` već postoji u instaliranom ffmpeg essentials build-u, u istom `bin/` folderu kao `ffmpeg.exe`. Minimum je da se zapiše traženi kvalitet (P3).
- (c) Neodređen napredak kad nema `[download]` linija (P3).

---

## 7. Šta je realno za nas (bez torrenta i debrid-a, originalni ani-cli)

Sve dole koristi samo zvanične ulaze ani-clija: argumente (`-q`, `-e`, `-S`) i env varijable (`ANI_CLI_PLAYER`, `ANI_CLI_QUALITY`, `ANI_CLI_MODE`, `ANI_CLI_PLAYER_FLAGS`, `ANI_CLI_MENU`). Ništa ne zahteva izmenu skripte.

1. **Prikaz stvarno primljene rezolucije.**
   - Interni plejer: `video.videoHeight` posle `loadedmetadata`, ili `hls.levels[0].height`.
   - mpv: `observe_property` za `height` uz postojeća tri svojstva (`src/main/playerMonitor.js:77`).
   - Prikazati bedž „720p”, a ako je traženo bilo više, upozorenje „traženo 1080, sajt nudi 720”.
2. **Hvatanje upozorenja „not found, defaulting to best”.** Linija dolazi na stderr (`ani-cli:239`). `run.js` već šalje stderr linije kroz `onLine` (`src/main/run.js:27-28`), ali `watchService.watch` ne prosleđuje `onLine` (`src/main/watchService.js:53-78`). Dovoljno je dodati `onLine` koji prepozna liniju i pošalje događaj.
3. **Proba kvaliteta (`debug` režim) i izbor sa liste.**
   - `startSession({player:'debug', ...})` već radi u `selfTest` (`src/main/aniCliBridge.js:112-120`). Izlaz sadrži `All links:` sa redovima `"<visina>p >URL"` (`ani-cli:228`, `359`).
   - Rezolucije se parsiraju, pokažu korisniku, i pokrene se pravi `play` sa `quality` = tačna vrednost.
   - **Tačan izbor bez patcha:** ani-cli radi `grep -m 1 "$1"` (`ani-cli:237`), a to je BRE regex. Zato `ANI_CLI_QUALITY="^720p"` pogađa **samo** red koji počinje sa `720p` i uklanja lažni pogodak iz 0.2.
   - Rizik: oslanja se na detalj implementacije. Na promeni ani-clija bi tiho prešlo na `best` (`:239`), što nije gore od današnjeg stanja.
   - Cena: jedna dodatna pretraga i scrape (~4–5 zahteva, `ani-cli:188`, `202`, `212`, `220`, `228`).
4. **„Preferenca sa fallback-om” (kao Seanime `Resolutions[]`).** Iz probe izabrati prvu rezoluciju sa liste korisnika (npr. `1080 → 720 → best`) umesto ani-clijevog „ako nema, onda best”.
5. **Retry / URL refresh** (odeljak 4): nova sesija za istu epizodu, uz nastavak od pozicije, jednom po epizodi. Opciono drugi pokušaj sa nižim kvalitetom.
6. **Prefetch sledeće epizode.**
   - Dok traje epizoda N, pokrenuti `debug` probu za N+1 i zapamtiti da li postoji i koje rezolucije ima. Tada „Sledeća” zna unapred da li će uspeti.
   - **Ne keširati sam URL za puštanje:** referer se ne vidi u debug izlazu (`ani-cli:359` štampa samo links, video i sub), a URL-ovi mogu da isteknu. Seanime iz istog razloga drži keš izvora samo 15 min i ima refresh (`seanime/internal/onlinestream/repository.go:41`).
7. **Keš lista epizoda i rezolucija (metapodaci, ne linkovi).** Rezultat probe po `(naslov, epizoda, režim)` sa TTL-om od oko 15 min, kao Seanime (`repository.go:41`). Služi samo za UI (dostupne rezolucije, dub da/ne), nikad kao zamena za ani-cli sesiju.
8. **„Više provajdera preko ani-cli opcija”: NIJE MOGUĆE u v5.1.** Nema opcije ni env varijable za provajder ili server (odeljak 0.1). `ANI_CLI_BRANCH` (`ani-cli:477`) utiče samo na `-U` update (`ani-cli:110-127`). Jedina „otpornost izvora” je zato:
   - automatski update ani-clija (`src/main/toolSources.js:10`);
   - lokalna preuzimanja kao offline rezerva.
9. **Preuzimanje u boljem kvalitetu nego strim:** nemoguće, isti URL (`ani-cli:384`, `336`). Ali preuzimanje rešava baferovanje: na sporoj mreži fajl se puni brže od realnog vremena, sa `-N 16` (`ani-cli:336`).
10. **Dub dostupnost unapred:** proba sa `mode=dub` pre prikaza dugmeta „Dub”. Danas se za nedostatak dub-a saznaje tek posle greške (`src/main/aniCliBridge.js:16`).

---

## 8. Prioritizovane preporuke

Uticaj/Napor: V = visok, S = srednji, N = nizak.

| P | Preporuka | Uticaj | Napor | Naši fajlovi | Rizici |
|---|---|---|---|---|---|
| **P0** | Prikazati **stvarnu rezoluciju** (bedž u PlayerView-u; mpv `height` preko IPC-a) | V | N | `src/renderer/components/PlayerView.jsx`, `src/main/playerMonitor.js`, `src/main/internalPlayer.js` | `videoHeight` je 0 do `loadedmetadata`; mpv svojstvo stiže asinhrono |
| **P0** | Hvatati `"<q> not found, defaulting to best"` (stderr, `ani-cli:239`) i prikazati upozorenje | S | N | `src/main/watchService.js` (proslediti `onLine`), `src/main/aniCliBridge.js`, i18n | Tekst poruke se može promeniti u novom ani-cliju. Regex treba da bude tolerantan, a izostanak poruke ništa ne kvari |
| **P0** | Mapirati `No sources found for sub` → nova greška `no-sources` sa dugmetom „Pokušaj ponovo” | S | N | `src/main/aniCliBridge.js:11-18`, `src/renderer/pages/SearchPage.jsx`, i18n | Isti tekst ani-cli koristi i za „nema dub-a” (`ani-cli:246`); razlikovati po `mode` |
| **P1** | **Debug proba kvaliteta**: lista dostupnih rezolucija u EpisodePicker-u; izbor šalje `ANI_CLI_QUALITY="^<h>p"` | V | S | `src/main/aniCliBridge.js` (nova `probe()`), `src/main/ipc.js`, `src/renderer/components/EpisodePicker.jsx`, `src/main/settings.js`/`seriesPrefs.js` (dozvoliti tačne vrednosti) | Dodatno vreme pre puštanja (dupli scrape); oslanjanje na regex semantiku `ani-cli:237`; `QUALITIES` validacija (`src/main/settings.js:27`) mora prihvatiti nove vrednosti |
| **P1** | **Automatski URL refresh** pri ranom padu internog plejera (nova sesija, jednom po epizodi, nastavak od pozicije) | V | S | `src/renderer/components/PlayerView.jsx`, `src/renderer/App.jsx`, `src/main/watchService.js` | Petlja ponovnih pokušaja: obavezan limit od 1 po `naslov:epizoda`, kao `markSourceRefreshed` |
| **P2** | Lista preferenci rezolucija sa fallback-om (`1080→720→best`) na osnovu probe | S | S | `src/main/seriesPrefs.js`, `src/main/settings.js`, `src/main/watchService.js` | Zavisi od P1 probe |
| **P2** | Retry sa nižim kvalitetom kad izabrana varijanta ne radi | S | S | `src/renderer/App.jsx`, `src/main/watchService.js` | Korisnik mora videti da je kvalitet spušten (P0 bedž) |
| **P2** | Prefetch/proba sledeće epizode i dub dostupnosti (samo metapodaci, TTL ~15 min) | S | S | `src/main/watchService.js` ili novi `src/main/probeCache.js` | Dodatni zahtevi ka sajtu (rate limit, Cloudflare `ani-cli:189-191`); ne keširati URL-ove |
| **P2** | Jednostavan auto-download novih epizoda sa watchliste u postojeći red | S | S | `src/main/downloads.js`, `src/main/library.js`, `src/main/index.js` | Opterećenje sajta; interval ≥15 min kao kod Seanime-a (`autodownloader.go:268-273`) |
| **P3** | Zapisati rezoluciju i kvalitet uz preuzeti fajl (ffprobe); neodređen napredak za ffmpeg fallback | N | N | `src/main/downloads.js`, `src/main/toolManager.js` (putanja ffprobe-a) | Dodatni proces po fajlu |
| **P3** | Opseg `-e "a-b"` za grupno preuzimanje jednom sesijom (manje ponovljenih pretraga) | N | S | `src/main/downloads.js` | Gubi se zaseban status po epizodi; teže pauziranje (`ani-cli:398-417`) |
| — | **NE raditi:** torrent ili debrid, scoring po grupama, više servera ili titlova, izbor provajdera | — | — | — | Zahtevalo bi izmenu ani-clija ili nove izvore, a to je suprotno pravilu iz `CLAUDE.md` i `docs/RIZICI.md` |

---

## 9. Najvažniji nalazi (sažetak)

1. ani-cli 5.1 ima **jedan provajder i jedan embed server**. Ostale servere izričito ignoriše (`ani-cli:213-214`, `429-432`). Ne postoji opcija ni env varijabla za drugi izvor, pa „više provajdera preko ani-cli opcija” nije moguće.
2. „Linkovi po epizodi” su varijante **jednog** HLS master playlista, sortirane opadajuće (`ani-cli:228`). Titl je najviše jedna, default traka (`ani-cli:226`).
3. Kad traženog kvaliteta nema, ani-cli **tiho** uzima `best` uz žutu stderr poruku (`ani-cli:239`). Mi tu poruku ne hvatamo (`src/main/watchService.js:53-78` nema `onLine`) i ne prikazujemo stvarnu rezoluciju (`src/main/playerMonitor.js:77`).
4. `select_quality` koristi neusidren `grep` nad celim redom, zajedno sa URL-om (`ani-cli:237`), pa je lažni pogodak moguć. Zaobilazi se bez patcha vrednošću `ANI_CLI_QUALITY="^720p"`.
5. `debug` režim (`ani-cli:359`) je zvaničan način da se dobije lista svih kvaliteta bez puštanja. Već ga koristimo u `selfTest` (`src/main/aniCliBridge.js:112-120`), pa je osnova za UI izbor kvaliteta.
6. Seanime **nema ugrađene izvore** (`seanime/internal/core/extensions.go:19-35`). Njegov online stream nije kvalitetniji od nas; prednost je izbor i fallback: server → provajder → URL refresh, timeouti 15/20 s (`use-onlinestream-auto-provider-cycler.ts:47-48`, `105-152`, `189-230`).
7. Objektivno bolji kvalitet Seanime dobija samo preko **torrenta i debrid-a**: bira originalne release fajlove po profilu (rezolucija, grupa, kodek, izvor) i seederima (`comparison.go:464-611`). Za nas je to van opsega.
8. Naš fallback je samo 3 mrežna retry-ja hls.js nad **istim** URL-om (`src/renderer/components/PlayerView.jsx:15-18`, `63-77`). Pad servera u sub režimu se mapira u `unknown` (`src/main/aniCliBridge.js:11-18` naspram `ani-cli:246`). Najjeftiniji dobitak: URL refresh novom sesijom i jasna greška.
