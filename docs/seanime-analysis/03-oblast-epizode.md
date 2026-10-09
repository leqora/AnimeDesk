# 03 — Oblast 3: Raspored i prikaz epizoda (Seanime vs AnimeDesk)

> Faza 3, oblast 3. Samo analiza; kod nije menjan. Reference za Seanime su `seanime/<putanja>:<linija>` (koren: `_ref/seanime`; `web/` = `seanime-web/src/`, `(main)` = `web/app/(main)/`). Reference za naš projekat su `src/...:<linija>` (koren: `AnimeDesk`). Seanime je GPL-3.0, pa su sve preporuke **samo inspiracija**: ideja i mere, bez prenošenja koda. Dokument ne sadrži spojlere ni za jedan anime. Primeri API odgovora nisu citirani, navedena su samo imena polja.
>
> Oznake: **uticaj / trud** — V (visok), S (srednji), N (nizak).

## 0. Kratak pregled

| Tema | Seanime | AnimeDesk |
|---|---|---|
| Izvor liste epizoda | metapodaci (animap/ani.zip) spojeni sa lokalnim fajlovima ili listom provajdera | ani-cli meni (samo brojevi) u pretrazi; sintetička lista `1..max` na detalju |
| Prikaz | karusel kartica + lista (slika levo, tekst desno) + grid „pilula” brojeva | samo grid „pilula” brojeva, grupe po 100 |
| Metapodaci epizode | naslov, sličica, trajanje, datum emitovanja, opis, filler | nema; ani-cli daje samo broj |
| Spoiler zaštita | postoji, podrazumevano **isključena** | nema je, ali nemamo ni šta da otkrijemo (nema naslova ni sličica) |
| Kalendar / nove epizode | kalendar, „Upcoming”, „Missing” | nema |
| Progres u epizodi | jedna stavka istorije po seriji | pozicija po epizodi se čuva, ali se ne prikazuje van plejera |

---

## 1. Lista vs grid epizoda, varijante rasporeda, paginacija i grupisanje

**Kako oni rade**
- Stranica serije (biblioteka) ima tri sloja:
  1. Na vrhu je **karusel „za gledanje”** (`episodesToWatch`) sa velikim karticama (`seanime/web/app/(main)/entry/_containers/episode-list/episode-section.tsx:136-201`). Lista se pravi od glavnih epizoda sa `progressNumber > progress`. Ako je serija odgledana, redosled se obrće (`seanime/web/app/(main)/entry/_lib/handle-episode-section.ts:39-49`).
  2. Ispod je **paginiran grid redova** (`EpisodeListPaginatedGrid`), gde je svaki red `EpisodeItem` → `EpisodeGridItem` (`episode-section.tsx:204-226`).
  3. Na kraju su posebne sekcije „Specials” i „Others” (NC) (`episode-section.tsx:235-277`). Podela na main/special/nc je u `handle-episode-section.ts:20-33`.
- Kolone grida: `grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 min-[2000px]:grid-cols-4`, uz `gap-4`. `maxCol` ograničava broj kolona (`seanime/web/app/(main)/entry/_components/episode-list-grid.tsx:134-140`).
- Paginacija: 24 stavke po strani, i to tek kad lista ima ≥ 29 stavki (`episode-list-grid.tsx:49-50,70`). Prikazuje se do 5 brojeva strana sa „…” (`:79-119`).
  - Komponenta ume da otvori stranu na kojoj je zadata epizoda (`shouldDefaultToPageWithEpisode`, `:58-67`), ali je `episode-section.tsx` **ne prosleđuje** (`:205-207`). Biblioteka zato uvek kreće od strane 1.
- **Online stream** ima prekidač **lista ↔ grid** koji se pamti u `localStorage` (`seanime/web/app/(main)/onlinestream/_containers/onlinestream-page.tsx:83,911-917`). Lista koristi isti `EpisodeGridItem` (`:996-1036`). Grid je `EpisodePillsGrid`, mreža dugmića sa brojevima (`:1040-1054`):
  - kolone: `grid-cols-6 sm:grid-cols-8 md:grid-cols-10 … 2xl:grid-cols-6`, `gap-2` (`seanime/web/app/(main)/_features/video-core/_components/episode-pills-grid.tsx:38`);
  - dugme: `h-10 rounded-md text-sm font-medium` (`:67`);
  - izabrana: `bg-brand-500 text-white`; odgledana: `text-[--muted]`; filler: narandžasti tekst i tačka (`:70-99`).
  - Grupisanja ni paginacije **nema**: prikazuju se sve epizode odjednom (`:42-45`).

**Kako mi radimo**
- Postoji samo jedan prikaz, grid „pilula” (`src/renderer/components/EpisodePicker.jsx:49-56`). CSS: `repeat(auto-fill, minmax(54px, 1fr))`, `gap: 6px` (`src/renderer/styles.css:125-126`).
- Grupe se prave po 100 **pozicija** u listi, a ne po broju epizode, pa podnose „0”, „12.5” i rupe (`src/shared/episodes.js:1-12`). Otvara se grupa sa prvom neodgledanom epizodom (`src/renderer/components/EpisodePicker.jsx:10`, `src/shared/episodes.js:28-33`).
- Polje „Idi na epizodu” skroluje do epizode i označi je (`EpisodePicker.jsx:23-32,43-46`).
- Lepljiva traka radnji sadrži kvalitet i sub/dub (`EpisodePicker.jsx:57-78`, `styles.css:132`).
- Detalj serije koristi isti picker nad sintetičkom listom `1..max(total, odgledano)` (`src/renderer/pages/AnimeDetail.jsx:36-38,102-113`).

**Razlika**
- Za obične serije naš grid je praktično isto što i njihov `EpisodePillsGrid`.
- Seanime ima i bogat prikaz sa slikom i tekstom. Mi ga nemamo jer nemamo metapodatke.
- Mi imamo grupe po 100 i skok na epizodu, a Seanime nema ni jedno ni drugo u gridu brojeva. Za serije sa 1000+ epizoda naše rešenje je bolje.
- Seanime pamti izbor prikaza; mi nemamo šta da biramo.

**Preporuka**
- Zadržati grid brojeva kao podrazumevani **gust** prikaz i grupe po 100. Ne prelaziti na paginaciju od 24 stavke.
- Kad dođu metapodaci (sekcija 3), dodati **drugi prikaz „kartice/lista”** sa prekidačem koji se pamti u `settings` (globalno) ili u `series-prefs.json` (po seriji, `src/main/seriesPrefs.js`).
  - U režimu kartica, grupa od 100 je preteška za render sa slikama. Unutar grupe bi trebalo lenjo učitavanje slika (`loading="lazy"`) ili manja strana (npr. 24, kao kod njih).
  - Fajlovi: `EpisodePicker.jsx`, nova `EpisodeRow.jsx`, `styles.css`, `src/shared/episodes.js` (podela na main/special).
  - Uticaj S, trud S.
  - Rizik: dva režima traže dva skupa testova (`tests/unit/ui/...`).
- Iznad grida na detalju dodati jednu istaknutu karticu **„Sledeća: Epizoda N”**, ekvivalent njihovog karusela. Dovoljna je jedna kartica, ne ceo karusel. Uticaj S, trud N.

## 2. Kartice epizoda: sličica, naslov, trajanje, datum, opis, progres, stanje „odgledano”, hover

**Kako oni rade** — postoje dve komponente.

*A) `EpisodeCard`* je velika kartica za karusel, „Continue watching”, „Upcoming” i „Missing” (`seanime/web/app/(main)/_features/anime/_components/episode-card.tsx`).
- Kontejner: `rounded-xl`. Tip `grid` je `aspect-[4/2] w-72 lg:w-[26rem]`, a tip `carousel` je `w-full` (`:211-216`).
- Slika: `aspect-[4/2] rounded-xl overflow-hidden`, `object-cover` (`:230,244`). Na hover se uvećava `lg:group-hover:scale-[1.02]` (`:246`).
- Donji gradijent (`seanime/web/app/(main)/_features/custom-ui/item-bottom-gradients.tsx`):
  - obična varijanta: `bg-gradient-to-t from-[#0c0c0c] to-transparent opacity-50 md:h-[70%]` (`:55`);
  - varijanta sa tekstom preko slike („single container”): `opacity-90 md:h-[80%]` (`:46`).
- Hover sloj: `bg-gray-950 bg-opacity-60`, ikona play `text-6xl text-gray-200`, `opacity-0 → group-hover:opacity-100`. Na malim ekranima je skriven (`hidden md:flex`) (`episode-card.tsx:296-305`).
- Tekst (`:135-161`):
  - gornji naslov (naslov epizode ili serije): `w-[80%] line-clamp-1 text-md md:text-lg font-semibold`;
  - „Episode N / ukupno”: `text-base md:text-xl font-medium`, a „/ ukupno” ima `opacity-40`;
  - meta (datum ili „za X dana”) i trajanje u formatu `{n}m`: `text-[--muted] text-sm md:text-base`.
- Progres: `ProgressBar size="xs"` uz donju ivicu slike, plus „Xm left” (`:276-294`). Prikazuje se samo kad je uključen „watch continuity”.
- Bedž je u gornjem levom uglu (`absolute left-2 top-2`, `:266-268`). Za odrasli sadržaj postoji veo (`:256-261`).

*B) `EpisodeGridItem`* je red u listi epizoda: slika levo, tekst desno (`seanime/web/app/(main)/_features/anime/_components/episode-grid-item.tsx`).
- Red: `rounded-lg py-3 pr-12`, razmak `flex gap-4` (`:105-112,131-133`).
- Slika:
  - veličina `w-36 h-28 lg:w-44 lg:h-32`, odnosno `lg:w-40 lg:h-28` kad je opis isključen;
  - `rounded-[--radius-md]` (= `0.5rem`, `seanime/web/app/globals.css:78`);
  - hover: `lg:group-hover:scale-105` (`episode-grid-item.tsx:137-142`).
- Okviri slike: filler `border-2 border-yellow-900`, izabrana `border-2 border-[--brand]`, neispravna `border-red-700` (`:145-149`).
- Hover sloj: `bg-gray-950 bg-opacity-60` i ikona `text-4xl opacity-70` (`:67,160-168`).
- **Odgledana epizoda**: slika `opacity-25`, a na hover reda `opacity-100` (`:193-195`).
- Tekst:
  - „Episode N”: `font-medium`, u boji brenda kad je izabrana; trajanje `{n}m` sa `ml-4` (`:215-231`);
  - naslov epizode: `text-md lg:text-lg font-medium text-gray-300 line-clamp-2` (`:233-239`);
  - opis: `text-sm text-[--muted] line-clamp-2` (`:242-249`);
  - ime fajla: `text-xs tracking-wider opacity-75` (`:250-256`).
- Progres traka se vidi samo za neodgledanu epizodu koja je započeta (`:202-205`).
- Radnje (meni, info) su u gornjem desnom uglu (`:261-263`). Info popover prikazuje datum emitovanja, trajanje i opis (`seanime/web/app/(main)/entry/_containers/episode-list/episode-item.tsx:274-334`).

*Zajedničko*
- Slika se pojavljuje glatko: dok se učitava, placeholder je `bg-gradient-to-br from-gray-900/80 via-gray-800/70 to-gray-950/80`. Slika zatim prelazi sa `opacity-0 scale-[0.97]` na `opacity-100 scale-100` za `duration-400`, uz `motion-reduce:transition-none` (`seanime/web/app/(main)/_features/anime/_components/episode-card-image.tsx:40-62`).
- `ProgressBar xs` = `h-1 rounded-full bg-[--subtle]`, indikator `bg-brand` (`seanime/web/components/ui/progress-bar/progress-bar.tsx:13,17,30`).
- Udeo kartica u karuselu: `md:basis-1/2 lg:basis-1/2 2xl:basis-1/3 min-[2000px]:basis-1/4`, a u manjoj varijanti `…lg:basis-1/3 2xl:basis-1/4…` (`seanime/web/components/shared/classnames.ts:33-37`).

**Kako mi radimo**
- Epizoda je dugme sa brojem: `padding: 8px 0`, HUD font, `font-weight: 600` (`src/renderer/styles.css:126`).
- Stanja:
  - odgledana: cijan okvir i tekst (`:127`);
  - izabrana: `--accent` pozadina + `--glow` (`:128`);
  - ima belešku: tačka `•` u `--warn` boji (`:133`).
- Nema sličice, naslova, trajanja, datuma, opisa ni progres trake. Nema ni posebnog hover stanja, samo globalni hover dugmeta (`styles.css:37`).
- Na Početnoj, kartica serije (`src/renderer/components/SeriesCard.jsx:16-31`) ima poster, naslov, „X/Y epizoda”, XP traku sa procentom i dugme za puštanje.

**Razlika** — Seanime ima pune kartice epizoda. Mi ih nemamo, ali naša „pilula” ima stanje beleške, koje Seanime nema.

**Preporuka**
- Uvesti `EpisodeRow` (red sa slikom) samo za režim kartica (sekcija 1). Mere koje vredi preuzeti kao ideju:
  - slika 16:9 ili ~4:3 (njihov red je 176×128 px na `lg`), radius kao naš `--radius-sm`;
  - odgledana epizoda sa `opacity: .25` i punom vidljivošću na hover;
  - hover sloj `rgba(3,7,18,.6)` sa ikonom play;
  - opis u 2 reda (`-webkit-line-clamp: 2`);
  - traka progresa 4 px uz donju ivicu slike.
- Fajlovi: novi `src/renderer/components/EpisodeRow.jsx`, `styles.css`. Uticaj V (kad postoje metapodaci), trud S.
- Na postojeću „pilulu” dodati tanku traku za započetu epizodu (pozicija iz `positions.json`, sekcija 5). Uticaj S, trud N.
- Rizik: sličice i naslovi su **glavni izvor spojlera** i moraju ići zajedno sa sekcijom 8, nikako pre nje.

## 3. Izvor metapodataka epizoda (animap / ani.zip / AniList) i šta možemo iz Electron-a

**Kako oni rade**
- Redosled izvora: prilagođeni izvor (ekstenzija) → **ani.zip** ako je uključen fallback → inače **animap** (`seanime/internal/api/metadata_provider/provider.go:168-180`).
- Animap je Seanime-ov **interni server**. URL je kodiran: `constants.InternalMetadataURL` (`seanime/internal/constants/constants.go:26`), poziv `…/entry?<platform>_id=<id>` (`seanime/internal/api/animap/animap.go:90`). **Nije javni API za nas.**
- ani.zip: `GET https://api.ani.zip/v1/episodes?<from>_id=<id>`, gde je `from` npr. `anilist` (`seanime/internal/api/anizip/anizip.go:94`).
  - Polja epizode: `title{jezik}`, `image`, `airdate`, `runtime/length`, `summary/overview`, `episodeNumber`, `absoluteEpisodeNumber`, `seasonNumber`, `anidbEid`, `rating` (`anizip.go:15-30`);
  - mapiranja: `mal_id`, `anilist_id`, `anidb_id`, `thetvdb_id`, `kitsu_id`… (`anizip.go:32-45`).
- Keširanje: metapodaci serije stoje u memoriji 1 h (`provider.go:257,341`), uz `singleflight` (`provider.go:108-122`). Kolekcija epizoda za stream se kešira 10 min (`seanime/internal/library/anime/episode_collection.go:191`).
- Rezerve kad nema epizode u metapodacima:
  - slika je AniList banner (`seanime/internal/api/metadata_provider/anime.go:91,117`);
  - opis je generički „N-th episode of <naslov>.” (`anime.go:100,122,141-153`).
- Bez ikakvih metapodataka lista se pravi iz AniList broja epizoda, sa naslovom serije i bez sličica (`episode_collection.go:127-169`).
- Ključ epizode je AniDB string: `"1"`, `"S1"` za specijale. Brojanje main/special ide po prvom znaku (`provider.go:203-210`).

**Kako mi radimo**
- AniList GraphQL polja: `id idMal title coverImage genres seasonYear episodes duration description` (`src/main/anilist.js:5-8`). Nema metapodataka po epizodi.
- Red zahteva i rad sa `Retry-After` / `X-RateLimit-Remaining` (`src/main/anilist.js:90,108`).
- Uspešan keš **nema rok trajanja**: zapis sa `malId` se samo vraća (`src/main/anilist.js:160-162`). Zato `episodes` (null za seriju u emitovanju) i druga polja nikad ne zastarevaju.
- Imamo `aniListId` u watchlist-i (`AnimeDetail.jsx:28`) i `malId` (`src/main/anilist.js:49-62`). To su ključevi koje ani.zip i Jikan traže.

**Javni API-ji pogodni za Electron main proces** (zahtevi idu iz `main`-a, ne iz renderera, kao i postojeći AniList):

| API | Šta daje | Ključ | Ograničenja |
|---|---|---|---|
| **ani.zip** `https://api.ani.zip/v1/episodes?anilist_id=<id>` (ili `mal_id=`) | naslovi epizoda, sličice, `airdate`/`airDateUtc`, trajanje, opis, apsolutni broj, mapiranja ID-jeva | AniList ili MAL ID | Proba 2026-10-09 (ID 21): HTTP 200, `Cache-Control: public, max-age=900`, ključevi `titles, episodes, episodeCount, specialCount, images, mappings`. Zaglavlja za rate limit **nisu viđena**, a zvanično ograničenje nije dokumentovano: **nije provereno**. Treba ga koristiti štedljivo i keširati na disku. |
| **AniList** `Media{ nextAiringEpisode{ episode airingAt timeUntilAiring } airingSchedule(notYetAired:…){ nodes{…} } relations{ edges{ relationType(version:2) node{…} } } }` | raspored emitovanja, broj emitovanih epizoda, relacije | AniList ID | Već imamo red i rad sa zaglavljima (`anilist.js:90,108`). Tačnu kvotu (po AniList dokumentaciji oko 90/min, uz povremeno smanjenje) ovde nismo proverili uživo. Više ID-jeva ide u jedan upit (`id_in`). |
| **Jikan v4** `https://api.jikan.moe/v4/anime/<malId>/episodes?page=N` | lista epizoda sa oznakama `filler` i `recap` (po Jikan dokumentaciji) | MAL ID | Proba uživo 2026-10-09 je istekla (timeout), pa polja **nisu potvrđena**. Po dokumentaciji važe ograničenja po sekundi i minutu (~3/s, ~60/min), uz paginaciju od 100 epizoda. Obavezno: red, keš i tolerancija na pad servisa. |

**Razlika** — Seanime se oslanja na sopstveni server (animap). Mi bismo mogli da koristimo samo javne izvore: ani.zip + AniList (+ Jikan za filler).

**Preporuka**
- Novi modul `src/main/episodeMeta.js`:
  - ulaz: `aniListId` (rezerva `malId`); izlaz: mapa `broj → {title, image, airDate, length, summary}`;
  - disk keš `cache/episodes/<anilistId>.json` sa TTL-om od 24 h za seriju u emitovanju, odnosno 30 dana za završenu;
  - sličice su URL-ovi ili poseban keš fajlova, **ne base64 u JSON-u**, jer bi to ponovilo problem sa posterima (`00-nas-projekat.md`, 1.8).
  - Uticaj V, trud S.
- U `anilist.js` dodati `status` i `nextAiringEpisode`, uz TTL za uspešan keš (npr. 12 h za `RELEASING`). Uticaj V, trud N.
- Rizici:
  - ani.zip je servis treće strane bez SLA. Aplikacija mora raditi i bez njega, kao danas.
  - Sličice dolaze sa spoljnih hostova. Proveriti CSP i `windowSecurity.js` pre prikaza u rendereru.

## 4. Filler / recap oznake

**Kako oni rade**
- Izvor je scraper `animefillerlist.com`. Spisak serija se pretražuje Levenshtein rastojanjem do 10 (`seanime/internal/api/filler/filler.go:55-162`). Parsiraju se samo redovi `tr.filler` (`filler.go:185-190`): **„mixed” i recap se ne razlikuju**.
- Pokreće se **ručno**, dugmetom „Fetch filler info” u meniju metapodataka (`seanime/web/app/(main)/entry/_containers/entry-actions/anime-entry-metadata-manager.tsx:61-81`, `seanime/internal/handlers/metadata.go:43`). Rezultat se čuva u bazi (`seanime/internal/library/fillermanager/fillermanager.go:138-160`). Poziv za `RefetchFillerData` (`:52`) van definicije **nije pronađen**.
- Hidracija upoređuje broj epizode kao string (`fillermanager.go:186-207,209-237`). Podrazumevana vrednost je `IsFiller=false` (`seanime/internal/library/anime/episode.go:293`).
- Prikaz:
  - u redu: bedž „Filler” `bg-orange-800 text-white text-base`, gornji levi ugao sa odsečenim uglovima (`episode-grid-item.tsx:116-127`), uz okvir slike `border-yellow-900` (`:147`);
  - u gridu brojeva: tekst `text-orange-300` i tačka `w-1.5 h-1.5 rounded-full bg-orange-400` u gornjem desnom uglu (`episode-pills-grid.tsx:77-79,91-99`).

**Kako mi radimo** — nemamo nikakve filler/recap oznake (pretraga po `filler` u `src/` nema rezultata).

**Razlika** — potpuno odsustvo kod nas.

**Preporuka**
- Za izvor koristiti **Jikan** (`filler` + `recap` po epizodi, po MAL ID-ju) umesto scrapinga HTML-a. Jikan je stabilniji, vraća JSON i razlikuje recap.
- Pokretati na zahtev ili jednom po seriji, uz keš od 30 dana.
- U „pilulu” dodati tačku (filler = narandžasta, recap = siva) i `title` sa rečju „Filler”/„Recap”. U režimu kartica dodati bedž.
- Fajlovi: `src/main/fillerInfo.js` (novo), `EpisodePicker.jsx`, `styles.css`, i18n. Uticaj S, trud S.
- Rizici:
  - Jikan je spor i povremeno nedostupan (videti proba u sekciji 3).
  - Filler oznaka sama po sebi ne otkriva radnju, ali neki korisnici ne žele ni nju. Zato treba da postoji opcija „Prikaži filler oznake”.

## 5. Progres po epizodi i logika „Continue watching” / sledeća epizoda

**Kako oni rade**
- Sledeća epizoda je ona čiji je `progressNumber == progress + 1`, gde je progress AniList broj (`seanime/internal/library/anime/entry_helper.go:18-31`). Progres je **jedan broj**, a ne skup odgledanih epizoda.
- `ProgressNumber` se pomera za 1 kad AniList broji epizodu 0, a AniDB ne (`seanime/internal/library/anime/entry.go:265-277,354-386`; komentar polja u `episode.go:22`).
- Lista „Continue watching” (`seanime/internal/library/anime/collection.go:349-428`):
  - uzima serije u statusu CURRENT;
  - **sortira ih po progresu opadajuće**, ne po skorašnjosti (`:400-403`);
  - izbacuje serije u kojima je sve odgledano (`:405-413`);
  - za svaku uzima sledeću epizodu (`:415-426`).
- U UI-ju je to karusel `EpisodeCard`-ova sa slikom epizode i rezervom (banner/cover) (`seanime/web/app/(main)/_features/anime-library/_containers/continue-watching.tsx:231-249`). Progres traka i „Xm left” dolaze iz „continuity” istorije.
- Istorija gledanja ima **jednu stavku po seriji** (`history[mediaId]`). Procenat se prikazuje samo ako je to baš ta epizoda i ako je odnos između 5 % i 90 % (`seanime/web/api/hooks/continuity.hooks.ts:41-59`).

**Kako mi radimo**
- Sledeća epizoda je **prva rupa** u `1..max(total, najveća odgledana)`. Ako je sve odgledano, a ukupan broj nije poznat, sledeća je `max+1`; inače je `1` (`src/shared/domain.js:14-21`).
- Šina „Nastavi gledanje” sadrži do 10 serija u statusu `watching`, sortiranih po `lastWatchedAt` (`src/renderer/pages/HomePage.jsx:9,12`). Kartica je serija (poster), a ne epizoda (`src/renderer/components/SeriesCard.jsx:16-31`).
- Odgledane epizode su skup brojeva (`src/main/library.js:87-101`).
- Pozicija se čuva **po epizodi** (ključ `naslov#epizoda`), briše se posle 60 dana i nudi se samo za 10 s ≤ poz ≤ 90 % (`src/main/positions.js:10,16-19,31-36`). Čuva se na svakih ~5 s tokom gledanja (`src/main/internalPlayer.js:41`), a koristi se **samo** pri otvaranju plejera (`src/main/internalPlayer.js:25`). Renderer je ne dobija ni na jednom drugom mestu: preload nema `positions` API (`src/preload/index.js`, pretraga).

**Razlika**
- Naš model je bogatiji: skup odgledanih + pozicija po epizodi, naspram jednog broja i jedne stavke po seriji kod njih. Ipak, tu informaciju **ne prikazujemo**.
- Naše sortiranje po skorašnjosti je za korisnika logičnije od njihovog sortiranja po progresu.
- Naše „prva rupa” pravilo vraća korisnika na preskočenu epizodu. To je drugačije od „progress+1” i namerno je po komentaru u kodu (`domain.js:14`), ali korisnik to ne vidi unapred.

**Preporuka**
- Dodati IPC `positions.forSeries(title)` → `{ep: {position, duration}}`. Na osnovu njega:
  - (a) na `SeriesCard` i Hero prikazati „Ep N · ostalo X min” i traku progresa epizode, uz postojeću traku serije;
  - (b) u „pilulu” dodati tanku donju traku za započete epizode.
  - Fajlovi: `src/main/positions.js`, `src/main/ipc.js`, `src/preload/index.js`, `src/shared/channels.js`, `SeriesCard.jsx`, `Hero.jsx`, `EpisodePicker.jsx`. Uticaj V, trud N–S.
- Na dugmetu „Nastavi” jasno napisati broj epizode (već postoji u `aria-label`, `SeriesCard.jsx:28`, ali ne i vizuelno). Uticaj S, trud N.
- Opciono podešavanje „Nastavi od: prve neodgledane / posle poslednje odgledane”. Uticaj N, trud N.
- Rizik: ključ pozicije je naslov iz ani-cli-ja, pa preimenovanje serije gubi pozicije (`positions.js:10`).

## 6. Sezone, relacije (prequel/sequel), franšize

**Kako oni rade**
- AniList `relations { edges { relationType(version: 2) node { ...baseAnime } } }` (`seanime/internal/api/anilist/queries/anime.graphql:215-222,429-436`).
- UI prikazuje relacije kao kartice sa oznakom tipa („Prequel”, „Sequel”, „Side story”… iz `relationType`), uz filtriranje formata MANGA/NOVEL/ONE_SHOT/MUSIC i tipa CHARACTER (`seanime/web/app/(main)/entry/_components/relations-recommendations-section.tsx:36-39,69-70`). Hronološki lanac franšize ne postoji; prikazuju se samo direktne relacije.
- „Metadata parent”: specijali koji su poseban AniList unos se vezuju za roditelja sa pomerajem specijala (`seanime/internal/api/metadata_provider/provider.go:280-292`, `seanime/internal/api/metadata_provider/anime.go:40-46`).

**Kako mi radimo**
- AniList upit nema `relations` (`src/main/anilist.js:6`).
- Sezone su za nas zasebni ani-cli naslovi. Watchlist ih vodi kao nezavisne stavke (`src/main/library.js`); veze između njih nema.

**Razlika** — kod nas ne postoji nikakva veza između sezona.

**Preporuka**
- Dodati `relations` (samo `PREQUEL`/`SEQUEL`, format TV/MOVIE/OVA/ONA) u AniList polja. Na detalju prikazati „Prethodno” / „Sledeće” kao male poster-kartice, a klik bi pokretao ani-cli pretragu po naslovu.
- Kad je serija `completed`, a postoji SEQUEL, na Početnoj ponuditi „Nastavak je dostupan”.
- Fajlovi: `src/main/anilist.js`, `AnimeDetail.jsx`, `HomePage.jsx`. Uticaj S–V, trud S.
- Rizici:
  - **Spojler**: naslov i poster nastavka mogu otkriti detalje. Za seriju koja nije završena prikazivati samo „Ima nastavak”, bez naslova i postera, dok korisnik ne klikne (vezati za sekciju 8).
  - Naslov iz AniList-a ne mora biti isti kao ani-cli naslov. Postojeći `searchCandidates` (`anilist.js:24-46`) rešava suprotan smer, a ovaj smer treba posebno testirati.

## 7. Kalendar, raspored, „airing next”, propuštene epizode i obaveštenja

**Kako oni rade**
- Stranica Schedule (`seanime/web/app/(main)/schedule/page.tsx:13-40`) ima tri dela: „Missing episodes”, mesečni kalendar i „Upcoming episodes”.
- Raspored se gradi od AniList `airingSchedule` (prethodnih i budućih, po 30 stavki) za serije sa liste, kroz 5 stranica: tekuća, sledeća i prethodna sezona (`seanime/internal/api/anilist/queries/anime.graphql:461-487,497-514`). Upit koristi `onList: true`, pa **traži AniList nalog**.
- Stavka rasporeda ima vreme u UTC-u, sliku **serije** (cover), broj epizode i oznaku `isSeasonFinale` (= poslednja epizoda) (`seanime/internal/library/anime/schedule.go:14-26,67-83`). Serije u statusu DROPPED se preskaču (`:92`).
- Kalendar (`seanime/web/app/(main)/schedule/_components/schedule-calendar.tsx`):
  - izbor prvog dana nedelje (`:32,184`) i filter statusa liste (`:33-36`);
  - opcija „Indicate watched episodes” (`:35,205-212,432`);
  - do 4 događaja po danu (`:30`);
  - oznaka finala (`:439`).
  - Kalendar prikazuje samo naslov serije, cover i broj epizode, a **naslove epizoda ne prikazuje**.
- Upcoming: `nextAiringEpisode` serija sa liste, sortirano po `timeUntilAiring`. Za svaku se dohvataju i metapodaci, uz limiter 20/s (`seanime/internal/library/anime/upcoming_episodes.go`, filter i sort u okviru `NewUpcomingEpisodes`). U UI-ju je kartica sa „za X” i `spoilerMode="replace"` (`seanime/web/app/(main)/schedule/_containers/upcoming-episodes.tsx:54-75`).
- Na stranici serije: „Episode N · za X · dan” (`seanime/web/app/(main)/entry/_components/next-airing-episode.tsx:8-25`, uključeno u `meta-section.tsx:237`).
- Missing: epizode koje su izašle, a nema ih u lokalnoj biblioteci. Grupišu se („… & N more”), a serije se mogu utišati (`seanime/internal/library/anime/missing_episodes.go:45-51,145,174-178`).
- **Obaveštenja o novoj epizodi nema.** Notifier ima samo kategorije Auto Downloader, Auto Scanner i Debrid (`seanime/internal/notifier/notifier.go:29-32`).

**Kako mi radimo** — ništa od ovoga ne postoji (pretraga `airing|schedule` u `src/` nalazi samo nevezani komentar u `sound.js`).

**Razlika** — kod nas potpuno odsustvo.

**Preporuka** (bez AniList naloga, samo po ID-jevima iz watchlist-e)
1. **„Sledeća epizoda izlazi …”** na detalju i u `SeriesCard` za `RELEASING` serije, iz `nextAiringEpisode` (sekcija 3). Uticaj V, trud N.
2. **„N novih epizoda”** bedž: (`nextAiringEpisode.episode − 1`) − najveća odgledana > 0. Prikazuje se samo broj, što je bez spojlera. Fajlovi: `SeriesCard.jsx`, `HomePage.jsx` (nova šina „Novo”). Uticaj V, trud N.
3. **Obaveštenje** preko Electron `Notification` kad prođe `airingAt` serije u statusu `watching`. Provera bi išla pri pokretanju i na nekoliko sati, jednim batch upitom `Page{ media(id_in: …) }` i poštujući postojeći red (`anilist.js`). Uticaj S, trud S.
   - Rizik: emitovanje u Japanu ≠ dostupnost kod ani-cli izvora. Zato tekst obaveštenja treba da bude „emitovana”, a ne „dostupna”. Proveru dostupnosti preko ani-cli-ja ne raditi automatski: pokreće bash i mrežu, `00-nas-projekat.md`, 4.8.
4. **Nedeljni raspored** (lista po danima, ne mesečni kalendar) sa coverom serije i brojem epizode, **bez naslova epizoda**. Uticaj S, trud S.

## 8. Spoiler zaštita (zamućenje sličica i naslova neodgledanih)

**Kako oni rade**
- Podešavanja: `hideAnimeSpoilers` (**podrazumevano `false`**), uz `hideAnimeSpoilerThumbnails`, `hideAnimeSpoilerTitles` i `hideAnimeSpoilerDescriptions` (podrazumevano `true`) i `hideAnimeSpoilerSkipNextEpisode` (`false`) (`seanime/web/lib/theme/theme-hooks.ts:123-127`).
- Pravilo: epizoda je spojler ako je `broj > progress (+1 ako je „skip next” uključen)` (`seanime/web/lib/theme/anime-spoilers.ts:89-98`).
- Ručno isključivanje po seriji se čuva u `localStorage` (`anime-spoilers.ts:24-27,39-87`). Prekidač postoji i u komandnoj paleti (`seanime/web/app/(main)/_features/sea-command/sea-command-spoilers.tsx:22`, prema `02-seanime-features.md` 6.4).
- Dva režima (`anime-spoilers.ts:100-135`):
  - **blur**: sličica `blur-2xl scale-110` (`episode-card.tsx:248`, `episode-grid-item.tsx:196`), naslov i opis `blur-sm` (`episode-card.tsx:142`, `episode-grid-item.tsx:237,246`), ime fajla `invisible` (`:254`);
  - **replace**: sličica se zamenjuje banerom ili coverom serije (`getSpoilerFreeAnimeImage`, `anime-spoilers.ts:149-151`), a naslov naslovom serije (`episode-card.tsx:127-132`).
- „Continue watching” koristi `replace` i aktivan je samo kad „skip next” nije uključen (`anime-spoilers.ts:137-141`, `continue-watching.tsx:234-239`). „Missing” i „Upcoming” koriste `replace` (`anime-spoilers.ts:143-147`, `seanime/web/app/(main)/schedule/_components/missing-episodes.tsx:57-62`, `upcoming-episodes.tsx:56-61`).
- **Uočene rupe** (izvor uči šta treba izbeći):
  - info popover epizode prikazuje naslov i ceo opis bez provere spojlera (`episode-item.tsx:302-311`);
  - grid brojeva stavlja naslov epizode u `title` atribut, koji se vidi kao tooltip na hover (`episode-pills-grid.tsx:63`);
  - `MediaEpisodeInfoModal` nema proveru spojlera (pretraga `spoiler` u `seanime/web/app/(main)/_features/media/_components/media-episode-info-modal.tsx` nema rezultata);
  - zamućenje je samo CSS: tekst ostaje u DOM-u i u `data-*` atributima (`episode-grid-item.tsx:99-100`).

**Kako mi radimo**
- Nema spoiler sistema. Za sada nema ni rizika: epizode su samo brojevi (`EpisodePicker.jsx:53`), a kartice prikazuju poster serije (`SeriesCard.jsx:18`).
- Opis serije sa AniList-a je **skriven iza klika** (`AnimeDetail.jsx:95-100`), što je dobro.
- Pravilo projekta je strogo „bez spojlera” (korisnički `CLAUDE.md`).

**Razlika** — Seanime ima zaštitu, ali je podrazumevano isključena i ima rupe. Mi je nemamo, ali još nemamo ni sadržaj koji otkriva radnju.

**Preporuka** — ovo je **preduslov** za sekcije 2–3 i 6–7.
- Zaštita mora biti **podrazumevano uključena** i važi za sliku, naslov i opis epizode.
- Pravilo: spojler = epizoda `> najveća odgledana`, osim sledeće. Opcija „prikaži i sledeću” je podrazumevano isključena.
- Podrazumevani režim je **replace**: ne renderovati tekst ni URL slike, nego prikazati „Epizoda N” i cover serije. Blur kao CSS ostavlja sadržaj u DOM-u i tooltipovima.
- Otkrivanje je ručno, po seriji (`series-prefs.json`), i po jednoj epizodi (dugme „Prikaži”).
- Isto pravilo važi za:
  - `title`/`aria-label` atribute;
  - info popover;
  - obaveštenja (sekcija 7: samo „Epizoda N”);
  - relacije (sekcija 6);
  - opis serije, koji i dalje ostaje iza klika.
- Čista funkcija `isSpoiler(entry, ep, prefs)` u `src/shared/` + unit testovi. Fajlovi: `src/shared/spoilers.js` (novo), `src/main/seriesPrefs.js`, `src/main/settings.js`, `EpisodeRow.jsx`, `SettingsPage.jsx`, i18n. Uticaj V, trud S.
- Rizik: ako se metapodaci (sekcija 3) puste pre ovoga, **prekršeno je osnovno pravilo korisnika**. Redosled isporuke je obavezan.

## 9. Mapiranje ani-cli liste epizoda (stvarni brojevi) na metapodatke

**Kako oni rade**
- Online stream je najbliži našem slučaju. Lista epizoda dolazi od provajdera, a svaka epizoda se traži u kolekciji metapodataka **po broju** (`FindEpisodeByNumber`) (`seanime/internal/onlinestream/repository.go:186-227`, posebno `:203`).
  - Ako se nađe, preuzimaju se naslov, slika, opis i filler.
  - Ako se ne nađe, ostaje naslov provajdera i **cover serije** (`:215-226`).
  - Delovi epizode „Episode 6 [{6.5}]” dobijaju banner i ne mapiraju se (`:188-198`).
- Neslaganje AniList ↔ AniDB (epizoda 0, specijali) rešava se pomerajem `ProgressNumber` (`entry.go:265-277,354-386`).

**Kako mi radimo**
- U pretrazi su epizode tačno stavke ani-cli menija: stringovi koji mogu biti „0”, „12.5” ili sa rupama (`src/renderer/pages/SearchPage.jsx:210`, `src/shared/episodes.js:1-2`).
- Na detalju je lista sintetička, `1..max` (`AnimeDetail.jsx:36-38`). Zato prikazuje epizode koje izvor možda nema i ne prikazuje „0” i decimale (`00-nas-projekat.md`, 5.4).
- Odgledano se čuva kao broj; „12.5” postaje 12.5 (`src/main/library.js:10`), a `nextEpisode` koristi `Math.ceil` (`domain.js:16`).

**Razlika** — Seanime ima metapodatke, ali ih mapira jednostavno (isti broj = ista epizoda). Mi imamo stvarnu listu samo tokom ani-cli sesije, ne i na detalju.

**Preporuka**
- Pravilo mapiranja (čista funkcija `src/shared/episodeMap.js`):
  - ceo broj `n` ≥ 1 → ključ `"n"` u ani.zip `episodes`;
  - `"0"` i decimale → bez metapodataka (prikaz „Epizoda 0” / „Epizoda 12.5” + cover, kao njihova rezerva);
  - specijali (`S*`) se ne nude jer ih ani-cli ne lista na isti način.
  - Uticaj V, trud N.
- **Keširati poslednju ani-cli listu** po seriji (`availableEpisodes` + vreme) kad sesija vidi meni epizoda, pa je koristiti na detalju umesto `1..max`. Detalj tada prikazuje stvarno dostupne epizode i „0”/decimale. Fajlovi: `src/main/library.js` ili `seriesPrefs.js`, `src/main/watchService.js`, `AnimeDetail.jsx`. Uticaj V, trud S.
- **Kontrola pomeraja**: kad se broj ani-cli epizoda i `episodeCount` iz ani.zip razlikuju (npr. izvor broji kroz sezone, a AniList po sezoni), ne prikazivati naslove i sličice. Bolje je pasti na „Epizoda N” i označiti „metapodaci nepouzdani” nego prikazati pogrešnu (možda buduću, dakle spojler) epizodu.
  - Da li ani-cli izvor numeriše apsolutno kroz sezone **nije provereno**: repo namerno ne zna izvor, `00-nas-projekat.md` 5.1.
  - Uticaj V (sprečava i spojlere i greške), trud N.

---

## 10. Prioritizovane preporuke

| P | Preporuka | Sekcija | Uticaj | Trud | Glavni fajlovi |
|---|---|---|---|---|---|
| **P0** | Spoiler model `isSpoiler()` (podrazumevano uključen, režim „replace”, otkrivanje po seriji/epizodi). **Mora** da prethodi svakom prikazu naslova, sličica ili opisa epizoda. | 8 | V | S | `src/shared/spoilers.js`, `seriesPrefs.js`, `settings.js`, `SettingsPage.jsx` |
| **P0** | TTL za uspešan AniList keš + polja `status`, `nextAiringEpisode` | 3, 7 | V | N | `src/main/anilist.js` |
| **P1** | Prikaz pozicije po epizodi (traka + „ostalo X min”) na `SeriesCard`/Hero/pilulama; IPC `positions.forSeries` | 5 | V | N–S | `positions.js`, `ipc.js`, `preload/index.js`, `SeriesCard.jsx`, `EpisodePicker.jsx` |
| **P1** | „Sledeća epizoda izlazi …” i bedž „N novih” (bez naslova epizoda) | 7 | V | N | `AnimeDetail.jsx`, `SeriesCard.jsx`, `HomePage.jsx` |
| **P1** | Keš stvarne ani-cli liste po seriji i njeno korišćenje na detalju umesto `1..max` | 9 | V | S | `library.js`/`seriesPrefs.js`, `watchService.js`, `AnimeDetail.jsx` |
| **P2** | `episodeMeta.js` (ani.zip, disk keš, mapiranje po broju, kontrola pomeraja) + režim „kartice” (`EpisodeRow`) sa prekidačem | 1, 2, 3, 9 | V | S | `src/main/episodeMeta.js`, `src/shared/episodeMap.js`, `EpisodeRow.jsx`, `styles.css` |
| **P2** | Relacije PREQUEL/SEQUEL (spoiler-bezbedno) i „Nastavak je dostupan” | 6 | S–V | S | `anilist.js`, `AnimeDetail.jsx`, `HomePage.jsx` |
| **P2** | Filler/recap oznake iz Jikan-a (na zahtev, keš 30 dana, opcija za isključivanje) | 4 | S | S | `src/main/fillerInfo.js`, `EpisodePicker.jsx` |
| **P3** | Obaveštenja o emitovanoj epizodi (Electron `Notification`) | 7 | S | S | `src/main/` novi `airingWatcher.js`, `settings.js` |
| **P3** | Nedeljni raspored (cover + broj, bez naslova epizoda) | 7 | S | S | nova stranica, `Sidebar.jsx` |
| **P3** | Opcija „Nastavi od: prve rupe / posle poslednje” | 5 | N | N | `src/shared/domain.js`, `settings.js` |

Redosled isporuke: P0 (spojleri) → P1 (koristi samo podatke koje već imamo + AniList) → P2 (spoljni metapodaci) → P3.

---

## 11. Dodatak za dizajn: konkretne vrednosti iz Seanime kartica epizoda

Tailwind vrednosti su prevedene u px (Tailwind: 1 jedinica = 4 px; `text-sm` 14px, `text-base` 16px, `text-lg` 18px, `text-xl` 20px). Služe samo kao referenca mera, ne kao kod za kopiranje.

**Velika kartica (`EpisodeCard`)** — `seanime/web/app/(main)/_features/anime/_components/episode-card.tsx`
| Element | Vrednost | Ref |
|---|---|---|
| Odnos slike | `aspect-[4/2]` (2:1) | `:215,230` |
| Širina (grid tip) | `w-72` = 288px, `lg:w-[26rem]` = 416px | `:215` |
| Radius | `rounded-xl` = 12px | `:212,230,244` |
| Hover slike | `scale-[1.02]` | `:246` |
| Hover sloj | `bg-gray-950` @ 60 %, ikona 60px (`text-6xl`), `transition-opacity` | `:298-302` |
| Donji gradijent | `to-top`, `#0c0c0c → transparent`, `opacity .5`, visina 70 % (`md`); sa tekstom preko slike `opacity .9`, 80 % | `item-bottom-gradients.tsx:46,55` |
| Gornji naslov | 16→18px, `font-semibold`, 1 red, širina 80 % | `:140` |
| „Episode N / T” | 16→20px `font-medium`; „/ T” `opacity .4` | `:149-150` |
| Meta + trajanje | 14→16px, muted, format „`{n}m`”, separator „ • ” | `:157-158` |
| Progres | traka 4px (`h-1`), puna širina, uz donju ivicu; „Xm left” `bottom-2 right-2` (8px) | `:276-293` |
| Bedž | `top-2 left-2` (8px) | `:266` |
| Spoiler blur | slika `blur-2xl` (40px) + `scale-110`; tekst `blur-sm` (4px) | `:142,248` |
| Karusel (udeo) | 1/2 (md–lg) · 1/3 (2xl) · 1/4 (≥2000px) | `seanime/web/components/shared/classnames.ts:35-36` |

**Red liste (`EpisodeGridItem`)** — `seanime/web/app/(main)/_features/anime/_components/episode-grid-item.tsx`
| Element | Vrednost | Ref |
|---|---|---|
| Slika | 144×112px (`w-36 h-28`), `lg` 176×128px (`w-44 h-32`); bez opisa `lg` 160×112px | `:138-139` |
| Radius slike | `--radius-md` = 0.5rem = 8px | `:140`, `globals.css:78` |
| Red | `py-3` (12px), `pr-12` (48px za radnje), `rounded-lg` (8px), razmak slika–tekst `gap-4` (16px) | `:107-109,132` |
| Hover | slika `scale-105`; sloj `gray-950` @ 60 %, ikona 36px (`text-4xl`), `opacity .7` | `:67,142,163-164` |
| Odgledana | slika `opacity .25` → `1` na hover reda | `:194` |
| Okviri | filler `2px yellow-900`; izabrana `2px --brand`; nevažeća `2px red-700` | `:146-148` |
| Filler bedž | `bg-orange-800`, beli tekst 16px, `font-semibold`, `top-3 left-0`, bez donjeg levog i gornjeg desnog radiusa | `:116-126` |
| Naslov epizode | 16→18px `font-medium`, `gray-300`, 2 reda, `leading-6` | `:236` |
| Opis | 14px muted, 2 reda | `:245` |
| Kolone liste | 1 · 2 (`lg`) · 3 (`2xl`) · 4 (≥2000px), `gap-4` | `episode-list-grid.tsx:135-139` |

**Grid brojeva (`EpisodePillsGrid`)** — `seanime/web/app/(main)/_features/video-core/_components/episode-pills-grid.tsx`
| Element | Vrednost | Ref |
|---|---|---|
| Kolone | 6 · 8 (`sm`) · 10 (`md`–`xl`) · 6 (`2xl`, uska bočna kolona plejera), `gap-2` (8px) | `:38` |
| Dugme | visina 40px (`h-10`), `rounded-md` (6px), 14px `font-medium`, `transition-colors 150ms ease-out` | `:66-68` |
| Stanja | obično `bg-[--subtle]`, hover providno; izabrana `brand-500` + beli tekst; odgledana muted tekst; filler `orange-300` tekst | `:70-82` |
| Filler tačka | 6×6px (`w-1.5 h-1.5`), `rounded-full`, `orange-400` (`orange-200` kad je izabrana), `top-1 right-1` (4px) | `:91-99` |

**Učitavanje slike** — `seanime/web/app/(main)/_features/anime/_components/episode-card-image.tsx:40-62`: placeholder `linear-gradient(to bottom right, gray-900/80, gray-800/70, gray-950/80)`; ulaz `opacity 0 → 1` i `scale .97 → 1`, 400ms (`duration-400`; brža varijanta 200ms), `ease-out`; bez animacije kod `prefers-reduced-motion`.

**Naše postojeće vrednosti za poređenje**: pilula `minmax(54px,1fr)`, `gap 6px`, `padding 8px 0` (`src/renderer/styles.css:125-126`); `--radius: 14px` (`styles.css:19`); dugme koristi `--radius-sm` (`styles.css:36`).
