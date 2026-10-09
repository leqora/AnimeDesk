# 03 — Oblast 6: Performanse i kvalitet koda (AnimeDesk naspram Seanime-a)

> Faza 3, samo analiza. Kod nije menjan. Seanime je GPL-3.0, pa služi **samo kao inspiracija**: ideje opisujemo, a kod ne kopiramo.
> Reference: `src/...` i `out/...` su u `C:\Users\Nikola\Desktop\Projekti\AnimeDesk`, a `seanime/...` u `C:\Users\Nikola\Desktop\Projekti\_ref\seanime`.
> Format teme: **Kako oni rade** → **Kako mi radimo** → **Razlika** → **Preporuka** (ocena uticaja i truda: V = veliki, S = srednji, N = mali).
> Merenja su urađena 2026-10-09 nad postojećim `out/` buildom (`out/renderer/assets/index-DEMv5hNv.js`, napravljen 2026-10-04 18:04, minut posle poslednjeg commit-a `af3cf54`) i nad lokalnim `%APPDATA%\AnimeDesk`. Build nije ponovo pokretan.

## 0. Ključna merenja

| Šta | Vrednost | Kako je izmereno |
|---|---|---|
| Renderer JS bundle | **2.067.210 B (≈2,0 MB)**, 54.277 linija, **neminifikovan** | `ls -la out/renderer/assets`, `awk 'END{print NR}'`; prva linija fajla je čitljiv izvorni kod (`var jsxRuntime = { exports: {} };`) |
| Isti bundle posle `esbuild --minify` | 965.710 B (≈943 KB); gzip 288.094 B | `esbuild` iz `node_modules/.bin`, izlaz u scratchpad, projekat nije diran |
| Isti bundle, gzip bez minifikacije | 418.382 B | `gzip -c | wc -c` |
| Udeo hls.js u bundle-u (približno, po opsegu linija) | ≈1,28 MB od 2,07 MB (≈62 %) | hls.js kod ide otprilike od `Events` enum-a (oko linije 16.600) do `class Hls` (`:52652`), pre `function PlayerView` (`:53742`) |
| Udeo React + ReactDOM (približno) | ≈0,64 MB (linije 1–14.230) | isti metod |
| Naš kod aplikacije u bundle-u | ≈23 KB za `PlayerView`…kraj (linije 53.742–54.277), ostale komponente su oko linije 15.446 (`function Poster`) | isti metod |
| Fontovi | 52 fajla (`.woff` + `.woff2`), `.woff` ukupno ≈364 KB, `.woff2` ≈288 KB | `du -ch` |
| CSS | 29,6 KB | `ls -la` |
| Main bundle / preload | 87,3 KB / 5,0 KB (`out/main/index.js`, `out/preload/index.js`) | `ls -la` |
| AniList keš na disku | 145 fajlova, 11 MB; prosečno **76.136 B** po fajlu, najveći 253.553 B | `%APPDATA%\AnimeDesk\cache\anilist` |
| Ostali JSON fajlovi | `library.json` 568 B, `positions.json` 269 B, `watchlog.json` 245 B, `settings.json` 488 B | `ls -l` |
| Naš izvorni kod | 75 fajlova `.js/.jsx`, 4.599 linija | `find src … | wc -l` |
| Naši testovi | 62 test fajla, 5.189 linija (više nego `src/`) | `find tests …` |

Uzrok neminifikovanog bundle-a: `electron-vite` za renderer podrazumevano postavlja `minify: false` (`node_modules/electron-vite/dist/chunks/lib-q6ns0vZr.js:536`; isto za main `:300` i preload `:407`). Naš `electron.vite.config.mjs:7` ne menja `build.minify` (postavlja samo `assetsInlineLimit: 0`).

---

## 1. Keširanje

**Kako oni rade**
- **Frontend (React Query):** jedan globalni `QueryClient` sa `refetchOnWindowFocus: false` i `retry: 0` (`seanime/seanime-web/src/app/client-providers.tsx:18-25`). Globalni `staleTime` nije postavljen, pa podaci važe za zastarele odmah, a keš u memoriji ostaje (podrazumevani `gcTime` React Query-ja). Zbog toga povratak na stranicu prvo prikaže keširane podatke, pa ih tiho osveži.
- Podešavanja po upitu: `gcTime: 0` za „živa” ili velika stanja (npr. `seanime/seanime-web/src/api/hooks/onlinestream.hooks.ts:34,57`, `mediastream.hooks.ts:44`, `debrid.hooks.ts:140,151`). `staleTime` se postavlja dinamički za detalj serije (`seanime/seanime-web/src/api/hooks/anime_entries.hooks.ts:21-23`).
- **Predučitavanje detalja (entry preloader):** pri hover-u ili fokusu kartice (`seanime/seanime-web/src/app/(main)/_features/media/_components/media-entry-card.tsx:198-201`, `seanime/seanime-web/src/components/shared/sea-link.tsx:55`) radi se `prefetchQuery` sa `staleTime` 10 s i `gcTime` 90 s (`seanime/seanime-web/src/lib/entry-preloader.ts:17-18,182-201`). Ima token-bucket ograničenje: 10 tokena, punjenje na 6 s, najviše 24 u redu (`:20-22,122-168`). Posle prefetch-a `getEntryPreloadStaleTime` daje preostali „sveži” prozor (`:247-253`), pa otvaranje stranice ne šalje dupli zahtev.
- Router takođe predučitava na nameru (`defaultPreload: "intent"`, `defaultPreloadStaleTime: 30 s`; `seanime/seanime-web/src/main.tsx:20-33,44-45`).
- **Backend:** metapodaci serije idu kroz ograničeni keš u memoriji (`BoundedCache`, 100 stavki; `seanime/internal/api/metadata_provider/provider.go:31,77`). Paralelni zahtevi za isti ključ spajaju se preko `singleflight` (`:108-122`). Postoji i `filecache` sa bucket-ima i TTL-om (`seanime/internal/util/filecache/filecache.go:15-50`).
- **Slike:** u online režimu frontend koristi direktne AniList CDN URL-ove (npr. `media.coverImage?.extraLarge`, `seanime/seanime-web/src/app/(main)/_features/media/_components/media-entry-card.tsx:291,306,418`), pa keširanje radi Chromium-ov HTTP keš. Slike na disk preuzima samo `ImageDownloader` za offline sinhronizaciju (`seanime/internal/local/sync_helpers.go:97,147,219`), sa ograničenjem od 10 u sekundi (`seanime/internal/util/image_downloader/image_downloader.go:79`).

**Kako mi radimo**
- Renderer nema keš. Svaki `Poster` pri montiranju zove `api.anilist.forTitle` (`src/renderer/components/Poster.jsx:5-15`). Istu stvar rade `Hero` (`src/renderer/components/Hero.jsx:10`) i `AnimeDetail` (`src/renderer/pages/AnimeDetail.jsx:22-33`). Detalj tako za istu seriju traži podatke **dva puta**: jednom za `info` (`:24`) i jednom preko `<Poster>` (`:63`).
- Stranice se remontiraju pri svakoj navigaciji (`key={page}`, `src/renderer/App.jsx:154`). Lista biblioteke i svi posteri se zato ponovo traže (`src/renderer/pages/HomePage.jsx:50-54`, `src/renderer/pages/WatchlistPage.jsx:27-31`).
- Main ima keš na disku. Za svaki poziv se fajl čita sinhrono (`readJson` u `src/main/anilist.js:159`; `fs.readFileSync` u `src/main/jsonStore.js:7`). Keša u memoriji nema, pa se isti JSON od oko 76 KB (prosek, vidi §0) parsira pri svakom montiranju postera.
- Mrežni zahtevi idu kroz jedan red sa obradom 429 grešaka (`src/main/anilist.js:77-112`). Deduplikacije istovremenih zahteva za isti naslov nema. Ako se isti naslov traži dvaput pre prvog upisa u keš (npr. Hero i kartica u šini za istu seriju, `src/renderer/pages/HomePage.jsx:58,63`), oba poziva prolaze kroz `findByTitle` i dvaput troše AniList budžet (`src/main/anilist.js:170-182`).
- `posterTint` keš je `Map` čiji je ključ ceo data URL (`src/renderer/theme/posterTint.js:1,45,60`), dakle string od nekoliko desetina KB po ključu, bez ograničenja veličine.

**Razlika:** Seanime ima tri sloja keša (React Query u memoriji, keš i `singleflight` na backend-u, HTTP keš za slike). Mi imamo samo disk keš u main procesu: bez memorije, bez spajanja istovremenih zahteva i bez keša u rendereru.

**Preporuka**
1. **Keš u memoriji + deduplikacija u `src/main/anilist.js`:** `Map<cacheKey, Promise>` oko `getForTitle`, tako da istovremeni pozivi za isti ključ dobiju isti Promise (ideja kao `singleflight`), plus ograničen LRU (npr. 200 stavki) pre `readJson`. Uticaj **S**, trud **N**. Rizik: keš mora da se osveži pri `writeJsonAtomic` i da poštuje postojeću `refreshed` logiku (`:155-169`).
2. **Mali keš u rendereru (`usePosterInfo`):** `Map` obećanja po `title`+`aniListId` na nivou modula u `src/renderer/components/Poster.jsx`, tako da remount ne ide na IPC. Uticaj **V** za osećaj brzine pri navigaciji, trud **N**. Rizik: ograničiti veličinu, a `null` rezultate čuvati kratko, jer se poster može pojaviti kasnije posle rate-limit čekanja.
3. React Query za ovaj obim **nije neophodan** (vidi temu 6). Ako se uvede, onda samo za `library.list`, `stats`, `anilist.forTitle` i `downloads.list`.

## 2. Lenjo učitavanje (lazy loading)

**Kako oni rade**
- File-based rute sa `autoCodeSplitting: true` (`seanime/seanime-web/rsbuild.config.ts:120-124`). U `src/routes` ima 27 `*.lazy.tsx` fajlova (prebrojano `find`). Primer: `seanime/seanime-web/src/routes/_main/entry/index.lazy.tsx:1-6`.
- `hls.js` je izdvojen u poseban chunk (`performance.chunkSplit.forceSplitting`, `seanime/seanime-web/rsbuild.config.ts:97-102`).
- Slike: `SeaImage` podrazumevano daje `loading="lazy"` i `decoding="async"`, a `eager` samo uz `priority` (`seanime/seanime-web/src/components/shared/sea-image.tsx:146-153`). `SeaImage` se koristi u 48 fajlova.
- Upiti na Discover stranici kreću tek kad je sekcija vidljiva: `useInView(ref, { once: true })` se prosleđuje kao `enabled` (`seanime/seanime-web/src/app/(main)/discover/_lib/handle-discover-queries.ts:25,60,65,101`). `IntersectionObserver` se koristi i u `seanime/seanime-web/src/app/(main)/_features/anime-library/_containers/continue-watching.tsx:56`.

**Kako mi radimo**
- Sve stranice se uvoze statički (`src/renderer/App.jsx:5-17`), uključujući `PlayerView`, koji vuče `hls.js` (`src/renderer/components/PlayerView.jsx:2`). U `src/renderer` nema nijednog `import()` ni `React.lazy` (grep, 0 rezultata). Rezultat je jedan JS fajl od 2,07 MB.
- `<img>` nema `loading="lazy"` ni `decoding="async"` (`src/renderer/components/Poster.jsx:20`, `src/renderer/components/Hero.jsx:48`). Pošto je `src` data URL koji je već stigao kroz IPC, lazy atribut ovde ne bi mnogo pomogao. Skup deo je IPC poziv, a on kreće odmah pri montiranju za **sve** kartice u mreži (`src/renderer/pages/SearchPage.jsx:191-200`, `src/renderer/pages/WatchlistPage.jsx:68-87`).
- Nema `IntersectionObserver`-a (grep, 0 rezultata).

**Razlika:** oni dele kod po rutama i odlažu i slike i upite dok nisu vidljivi. Mi sve učitavamo odmah.

**Preporuka**
1. **`React.lazy(() => import('./components/PlayerView.jsx'))`** u `src/renderer/App.jsx` sa `<Suspense fallback={null}>`. hls.js (≈62 % bundle-a) se tada učitava tek pri prvom puštanju. Uticaj **S** (brže parsiranje pri pokretanju; fajl je lokalan, pa nema mreže), trud **N**. Rizik: `App` testovi u `tests/unit/ui` koji otvaraju plejer moraće da sačekaju lazy modul (`findBy…`).
2. **Poster tek kad je vidljiv:** `IntersectionObserver` u `usePosterInfo` (`src/renderer/components/Poster.jsx`), tako da IPC kreće tek kad kartica uđe u viewport, uz `rootMargin` od oko 200px. Uticaj **S–V** za velike pretrage (manje troši AniList budžet od oko 30 zahteva u minutu, `src/main/anilist.js:75`), trud **N**. Rizik: jsdom nema `IntersectionObserver`, pa treba fallback (ako ga nema, učitaj odmah).
3. Lazy učitavanje stranica (Settings, Profile, Downloads) donosi malo jer su male (61–181 linija). Uticaj **N**, ne isplati se.

## 3. Virtualizacija lista

**Kako oni rade**
- `react-virtuoso ^4.18.10` je u zavisnostima (`seanime/seanime-web/package.json:127`), ali se koristi samo u tri fajla: `library-explorer.tsx` (`seanime/seanime-web/src/app/(main)/_features/library-explorer/library-explorer.tsx:56,589`), `issue-report/page.tsx` i `scan-log-viewer.tsx` (grep `Virtuoso`).
- Liste epizoda **nisu virtualizovane**, već **paginirane**: `EpisodeListPaginatedGrid` prikazuje 24 po strani kad epizoda ima 29 ili više, i automatski otvara stranu sa trenutnom epizodom (`seanime/seanime-web/src/app/(main)/entry/_components/episode-list-grid.tsx:44-76`).

**Kako mi radimo**
- `EpisodePicker` deli listu u grupe od 100 (`GROUP_SIZE = 100`, `src/shared/episodes.js:3-12`) i renderuje samo trenutnu grupu (`src/renderer/components/EpisodePicker.jsx:20-21,49-56`). Početna grupa je ona sa prvom neodgledanom epizodom (`:10`), a postoji i skok na epizodu (`:23-32`).
- Za seriju od 1.100 epizoda to znači najviše 100 dugmadi plus 11 dugmadi za grupe. Virtualizacija ovde nije potrebna.
- Manji trošak: za svako dugme se rade `selected.includes`, `watched.includes(Number(ep))` i `noted.includes` (`:51`), dakle O(n·m) po renderu. Sa 100 dugmadi i stotinama odgledanih epizoda to je reda 10⁴–10⁵ poređenja (računica, nije mereno).
- `AnimeDetail` pravi sintetički niz `1..max` (`src/renderer/pages/AnimeDetail.jsx:37-38`) i prosleđuje `key={episodes.length}` (`:103`), pa se picker remontira kad se broj promeni.
- Mreže kartica (pretraga, watchlist) nisu virtualizovane. Pretraga daje onoliko kartica koliko ani-cli vrati redova (`src/renderer/pages/SearchPage.jsx:192`). Watchlist prikazuje sve stavke (`src/renderer/pages/WatchlistPage.jsx:69`).

**Razlika:** za epizode smo u istoj klasi rešenja kao oni (paginacija, ne virtualizacija). Naše grupe su veće (100 naspram 24).

**Preporuka**
- Virtualizaciju **ne uvoditi** dok watchlist ne pređe nekoliko stotina stavki. Uticaj **N**, a dodala bi zavisnost.
- Jeftino: u `EpisodePicker` napraviti `Set` od `watched`, `selected` i `noted` jednom po renderu. Uticaj **N**, trud **N**.

## 4. Optimizacija slika

**Kako oni rade**
- AniList upiti traže više veličina odjednom, `extraLarge` i `large` (npr. `seanime/internal/api/anilist/queries/anime.graphql:199-200,357-358,409-410`), a ponegde samo `large` (`:455`). Kartica koristi `bannerImage || coverImage?.extraLarge` (`seanime/seanime-web/src/app/(main)/_features/media/_components/media-entry-card.tsx:291,306,418`). U `seanime-web/src` je 30 pojava `extraLarge` u `.tsx` fajlovima, 34 pojave `coverImage?.large` i 15 pojava `coverImage?.medium` (grep). Veličina se, dakle, bira po mestu prikaza.
- `SeaImage` (`seanime/seanime-web/src/components/shared/sea-image.tsx`):
  - podržava blur placeholder kao CSS pozadinu dok se slika ne učita (`:120-140`);
  - pri grešci prikazuje `/no-cover.png` (`:44-49`);
  - blokira spoljne URL-ove koji nisu png/jpg/webp/avif (`:34-42`);
  - daje `loading="lazy"` i `decoding="async"` (`:152-153`).
- Slika ide pregledaču kao URL, a ne kao bajtovi kroz API, pa je pregledač dekodira i kešira sam.

**Kako mi radimo**
- Upit traži samo `coverImage { large }` (`src/main/anilist.js:6`), i to se koristi i za karticu (`.poster`, `src/renderer/styles.css:121`), i za baner od 150px (`:139`), i za mutnu pozadinu hero-a (`src/renderer/components/Hero.jsx:34`, `src/renderer/styles.css:96`). Za kartice od 84px u preuzimanjima (`src/renderer/styles.css:179`) ista slika je veća nego što treba.
- Slika se preuzima i pretvara u **base64 data URL** (`src/main/anilist.js:114-120`). Base64 je oko 33 % veći od binarnog fajla. Upisuje se u JSON sa uvlačenjem (`JSON.stringify(data, null, 2)`, `src/main/jsonStore.js:25`). Izmereno: prosečan keš fajl ima 76.136 B, najveći 253.553 B (§0).
- Ceo data URL ide kroz IPC (structured clone) pri **svakom** montiranju `Poster`-a. Računica, nije mereno: mreža od 25 kartica × oko 76 KB ≈ 1,9 MB IPC-a po prikazu, i ponavlja se pri svakoj navigaciji (tema 1).
- Data URL-ovi se ne keširaju kao slike u Chromium HTTP kešu, pa se dekodiraju iznova pri svakom prikazu (posledica toga što nemaju URL; dekodiranje nije mereno).
- Nema placeholder-a ni fade-in-a. Dok stiže, prikazuje se ikonica filma (`src/renderer/components/Poster.jsx:19-21`). Raspored ne skače, jer `.poster` ima `aspect-ratio: 2 / 3` (`src/renderer/styles.css:121`).
- `posterTint` crta data URL na canvas 32×48 radi boje (`src/renderer/theme/posterTint.js:43-61`). To je jeftino, ali je ključ keša ceo data URL (tema 1).

**Razlika:** oni šalju **URL**, a bajtove obrađuje pregledač. Mi šaljemo **bajtove kao tekst** kroz JSON i IPC. Oni biraju veličinu po mestu prikaza, a mi svuda imamo jednu.

**Preporuka**
1. **Čuvati poster kao binarni fajl** (`cache/posters/<sha1>.jpg`) i servirati ga preko već postojećeg lokalnog servera (`src/main/streamServer.js`, sluša na `127.0.0.1` sa tokenom) ili preko custom protokola (`protocol.handle`, kao `app://` u `seanime/seanime-denshi/src/main/index.ts:249-291`). IPC bi tada vraćao samo kratak URL. Uticaj **V** (IPC, parsiranje JSON-a, HTTP keš pregledača, `loading="lazy"` počinje da radi), trud **S**. Rizici:
   - CSP u `src/renderer/index.html:5` mora da dozvoli `img-src` za taj izvor;
   - stari JSON keš sa `poster` poljem treba migrirati ili čitati unazad kompatibilno;
   - `posterTint` na canvasu traži sliku sa istog porekla ili CORS zaglavlje, inače je canvas „zaprljan”.
2. Ako se zadrži data URL: upisivati keš bez uvlačenja (`JSON.stringify(data)`) i odvojiti poster od metapodataka, da `getCached` za statistiku (`src/main/anilist.js:127-134`) ne parsira base64. Uticaj **S**, trud **N**.
3. Za `.group .poster` (84px) dovoljna bi bila `medium` veličina. Uticaj **N**, ne isplati se dok je keš po naslovu (dve veličine = dva fajla).

## 5. Veličina bundle-a

**Kako oni rade**
- Rsbuild (Rspack) uz automatsku podelu po rutama (`autoCodeSplitting`, `seanime/seanime-web/rsbuild.config.ts:120-124`) i ručno izdvojene chunk-ove za `hls.js` i `rrweb` (`:97-102`). Imena fajlova imaju hash (`:87-90`), a chunk-ovi koji se učitavaju naknadno idu u `static/js/async/` (`:114`).
- React Compiler je uključen (`pluginReact({ reactCompiler: true })`, `:18`); automatski memoizuje komponente, ne smanjuje bundle.
- Rsdoctor za analizu bundle-a uz `RSDOCTOR=1` (`:4,83,117,125`).
- Veličinu njihovog izlaza nismo merili, jer build Seanime-a nije pokretan.

**Kako mi radimo**
- Jedan chunk `index-DEMv5hNv.js` od **2.067.210 B, neminifikovan** (§0). Uzrok je podrazumevano `minify: false` u electron-vite (`node_modules/electron-vite/dist/chunks/lib-q6ns0vZr.js:536`), koje naš `electron.vite.config.mjs:7` ne menja.
- Sastav (približno, po opsezima linija): hls.js oko 1,28 MB (≈62 %), React i ReactDOM oko 0,64 MB, naš kod oko 0,1 MB.
- Uvozi se pun `hls.js` (`import Hls from 'hls.js'`, `src/renderer/components/PlayerView.jsx:2` → `dist/hls.mjs`, 1.484.971 B u `node_modules`). Postoji i `hls.light.min.mjs` (371.222 B); prema dokumentaciji hls.js, light build nema podršku za alternativne audio staze, titlove, EME/DRM i CMCD. Da li nam išta od toga treba, nije provereno: titlovi su kod nas spoljni VTT preko `<track>` (`docs/seanime-analysis/00-nas-projekat.md` §6.1 tačka 8), ali light build treba testirati na stvarnim strimovima.
- `lucide-react` se tree-shake-uje: uvezeno je 25 ikonica (`src/renderer/components/Icon.jsx:1`), a u bundle-u se „lucide” pojavljuje 4 puta.
- Fontovi: 52 fajla. Za svaku težinu ulaze i `.woff` i `.woff2`, i to za podskupove thai/vietnamese/cyrillic-ext (`src/renderer/main.jsx:1-6` uvozi `@fontsource/*/<težina>.css`, koji deklariše sve podskupove). Pregledač preuzima samo podskupove koji se koriste na stranici (`unicode-range`), pa je ovo trošak veličine instalacije (≈650 KB), a ne vremena učitavanja.
- Main bundle je 87,3 KB i takođe neminifikovan (`:300`); za main to nije bitno.

**Razlika:** oni dele kod i minifikuju (podrazumevano u Rsbuild produkciji), a mi šaljemo jedan neminifikovan fajl.

**Preporuka**
1. **`renderer: { build: { minify: 'esbuild' } }`** u `electron.vite.config.mjs`. Izmereno na istom fajlu: 2.067.210 → 965.710 B (−53 %). Uticaj **S** (brže parsiranje i manji instalater), trud **N** (jedna linija). Rizik: tragovi grešaka postaju nečitljivi bez sourcemap-a, pa ga uključiti uz `sourcemap: 'hidden'` ili ga ne pakovati.
2. **Lazy `PlayerView`** (tema 2, preporuka 1): hls.js izlazi iz početnog chunk-a. Uticaj **S**, trud **N**.
3. Proveriti `hls.js/light`. Uticaj **N–S**, trud **N**, ali uz ručni test plejera (rizik od regresije na strimovima).
4. Fontovi: uvoziti samo `latin` i `latin-ext` podskupove (npr. `@fontsource/exo-2/latin-400.css`). Uticaj **N** (samo veličina instalacije), trud **N**.

## 6. Upravljanje stanjem

**Kako oni rade**
- Stanje sa servera drži React Query preko `useServerQuery` i `useServerMutation` (`seanime/seanime-web/src/api/client/requests.ts:187-280`). Stanje klijenta drže jotai atomi, a `store` se deli sa routerom (`seanime/seanime-web/src/app/client-providers.tsx:27,40`, `seanime/seanime-web/src/main.tsx:26-29`).
- Server sam govori koje podatke treba osvežiti: WS događaj `INVALIDATE_QUERIES` sa listom ključeva → `queryClient.invalidateQueries` (`seanime/seanime-web/src/app/(main)/_listeners/invalidate-queries.listeners.ts:5-17`). Postoje i namenski slušaoci za specifične događaje (npr. `seanime/seanime-web/src/app/(main)/_listeners/anilist-collection.listeners.ts:10-27`). `invalidateQueries` se koristi u 47 fajlova, a `useWebsocketMessageListener` na 141 mestu (grep).

**Kako mi radimo**
- Nema globalnog store-a. `App` drži 15 `useState`-ova (`src/renderer/App.jsx:45-60`) i props-e prosleđuje dva do tri nivoa niže (npr. `settings` i `onSettings` → `HomePage` → `SearchPage`, `src/renderer/App.jsx:157`, `src/renderer/pages/HomePage.jsx:68`). Za aplikaciju ove veličine to je pregledno.
- Svaka stranica sama poziva `library.list()` i sluša `onLibraryChanged` (`src/renderer/pages/HomePage.jsx:50-54`, `src/renderer/pages/WatchlistPage.jsx:27-31`). `SearchPage` dodatno zove `library.list()` pri izboru serije i pri dodavanju (`src/renderer/pages/SearchPage.jsx:66,155`). Main na svaki poziv radi `structuredClone` cele biblioteke (`src/main/library.js:36,117`).
- **Statistika pri svakoj promeni stranice:** efekat ima zavisnost `[api, page]` (`src/renderer/App.jsx:76-80`). Svaka navigacija zato poziva `stats.get` → `progress.snapshot()` → `computeSnapshot()` (`src/main/ipc.js:89`, `src/main/progress.js:49`). `computeSnapshot` za **svaku seriju sinhrono čita AniList keš fajl** (sa base64 posterom) i prolazi ceo dnevnik gledanja (`src/main/index.js:90-99`). Potvrđeno u kodu. Statistika se menja samo kad se promeni biblioteka ili dnevnik, a to `onLibraryChanged` već pokriva (`:79`).
- Isti `computeSnapshot` se zove i u `progress.check` pri svakoj promeni biblioteke (`src/main/tracker.js:10,21,29`, `src/main/progress.js:31-35`). Odmah posle toga renderer na `libraryChanged` traži `stats.get`, pa se računa **dvaput** za istu promenu.
- `DownloadsPage` na **svaki** `downloads.onChange` ponovo traži celu listu preuzetog (`src/renderer/pages/DownloadsPage.jsx:25`). Main šalje `onChange` za **svaku liniju napretka** (`src/main/downloads.js:63-66`), a `listDownloaded` za svaku stavku radi `fs.existsSync` (`src/main/downloads.js:149,153`). Tokom preuzimanja to su desetine sinhronih `existsSync` poziva u sekundi, zavisno od toga koliko često yt-dlp ispisuje napredak (nije mereno).

**Razlika:** njihov keš preživljava navigaciju i osvežava se ciljano, na signal servera. Kod nas svaka navigacija ponovo traži sve, a jedan događaj (`libraryChanged`) osvežava sve.

**Preporuka**
1. **P0, jedna linija:** zavisnost u `src/renderer/App.jsx:80` promeniti u `[api]`. Uticaj **S**, trud **N**. Rizik: ako neki tok menja statistiku bez `libraryChanged` (npr. `onLevelUp`), on već poziva `refresh()` (`:85-86`), pa je pokriveno.
2. **Keširati poslednji snapshot u main-u** (`src/main/progress.js`): `check()` izračuna i zapamti, a `snapshot()` vrati zapamćeno dok ne stigne nova promena. Uticaj **S**, trud **N**. Uz temu 4, preporuku 2, `getCached` prestaje da parsira base64.
3. `DownloadsPage`: `loadList()` zvati samo kad se promeni status stavke (`done`), a ne pri promeni procenta; u main-u prigušiti `onChange` za napredak (npr. najviše 4 puta u sekundi). Uticaj **S**, trud **N**.
4. Umesto React Query-ja: mali sopstveni hook `useIpcQuery(key, fn, { invalidateOn })` sa keš mapom na nivou modula. Pokriva 4–5 upita i nema novu zavisnost. Uticaj **S**, trud **S**. React Query postaje opravdan tek kad dođu AniList sinhronizacija i raspored emitovanja (ideje iz `docs/STATUS.md`).
5. jotai/Zustand **ne treba**: globalnog klijentskog stanja ima malo (`player`, `health`, `settings`), a kontekst je dovoljan.

## 7. Obrada grešaka

**Kako oni rade**
- **Error boundary na dva nivoa:**
  - `errorComponent: AppErrorBoundary` na korenskoj ruti (`seanime/seanime-web/src/routes/__root.tsx:26`);
  - `<ErrorBoundary FallbackComponent={AppErrorBoundary}>` oko glavnog layout-a (`seanime/seanime-web/src/routes/_main.tsx:45`);
  - lokalna granica oko liste poglavlja mange (`seanime/seanime-web/src/app/(main)/manga/_containers/chapter-list/chapter-list.tsx:383-426`).
  `AppErrorBoundary` se sam resetuje pri promeni putanje (`seanime/seanime-web/src/components/shared/app-error-boundary.tsx:12-29`).
- **Toast-ovi za greške su centralizovani:** svaka greška u query-ju ili mutaciji ide u `toast.error(...)`, osim kad je `muteError` (`seanime/seanime-web/src/api/client/requests.ts:196-208,261-275`). Biblioteka je `sonner` (`seanime/seanime-web/package.json:132`, `seanime/seanime-web/src/components/ui/toaster/toaster.tsx:3`). Backend šalje toast-ove i preko WS-a (`docs/seanime-analysis/01-seanime-arhitektura.md` §2.14).
- **Tipiziran odgovor:** svaki handler vraća `SeaResponse[R]{ Error, Data }` (`seanime/internal/handlers/response.go:5-7`, konstruktori `:10,17`), a `_handleSeaError` ga prevodi u poruku (`seanime/seanime-web/src/api/client/requests.ts:283-…`).
- **Logovanje:** zerolog (`seanime/internal/core/app.go:61,73,200`), log fajlovi u posebnom folderu (`:235`) i pražnjenje bafera u fajl pri izlasku (`seanime/internal/util/logger.go:39,95`).

**Kako mi radimo**
- **Nema error boundary-ja** (grep `ErrorBoundary|componentDidCatch` u `src/`, 0 rezultata). Greška pri renderovanju bilo koje komponente obara ceo prozor u prazan ekran.
- **`App` ostaje prazan ako `settings.get` ne uspe:** `api.settings.get().then(setSettings)` nema `catch` (`src/renderer/App.jsx:63`), a dok je `settings` `null`, `App` vraća `null` (`:127`). Isto važi za `health.get` i `wasCorrupt` (`:64-65`). Potvrđeno u kodu.
- U `.jsx` fajlovima renderera ima 22 linije sa `.then(` i samo 6 sa `catch` (grep). Primeri bez `catch`: `src/renderer/pages/HomePage.jsx:51`, `src/renderer/pages/DownloadsPage.jsx:21-25`, `src/renderer/pages/SearchPage.jsx:65-70`.
- Preload samo prosleđuje `ipcRenderer.invoke` (`src/preload/index.js:4`). Kad handler u main-u baci grešku, Promise u rendereru se odbija, a neuhvaćena odbijanja niko ne prikazuje.
- **`main()` nema `catch`** (`src/main/index.js:159`). Greška u `streams.start()` (`:88`), `server.start()` (`:110`) ili pri sinhronom čitanju JSON-a ostaje neobrađena: prozor se ne otvori i nema poruke korisniku. Potvrđeno u kodu.
- Lanac `health.run().then(…dailyUpdate).then(…installOptional)` nema `catch` (`src/main/index.js:151-152`).
- Format odgovora nije ujednačen. Neki kanali vraćaju `{ ok, error }` (`librarySetPinned`, `src/main/ipc.js:42-51`; rezultat ani-cli sesije `{ ok, code, error, … }`, `src/main/aniCliBridge.js:103-108`), a ostali bacaju izuzetak ili vraćaju `null`.
- Logovanja skoro nema: 4 poziva `console.error`/`console.warn` u celom `src/` (grep), npr. `src/main/progress.js:16,27,37` i `src/main/positions.js:12`. Log fajla nema.
- `Toast` komponenta postoji, ali se koristi samo za proslave (`src/renderer/App.jsx:28-39`), ne za greške.

**Razlika:** oni imaju zaštitnu mrežu na svakom sloju: boundary, centralni toast, tipiziran odgovor i log fajl. Kod nas greška ili ostane neprimećena, ili obori prikaz.

**Preporuka**
1. **P0:** `try/catch` oko tela `main()` (`src/main/index.js:72-157`) sa `dialog.showErrorBox` i `app.quit()`, plus `process.on('unhandledRejection')` koji upisuje grešku u log. Uticaj **S** (retko se dešava, ali je tada fatalno i bez traga), trud **N**.
2. **P0:** `catch` za `settings.get` u `src/renderer/App.jsx:63`, sa rezervom na podrazumevana podešavanja i porukom. Uticaj **S**, trud **N**.
3. **P0/P1:** jedan `ErrorBoundary` (klasna komponenta, oko 25 linija, bez zavisnosti) oko `<main className="content">` i oko `PlayerView` u `src/renderer/App.jsx`, sa resetom kad se promeni `page`, kao kod njih. Uticaj **V** za otpornost, trud **N**.
4. **P1:** omotač u preload-u ili u `src/renderer/api.js` koji hvata odbijanja i šalje ih u globalni „error toast” (proširiti postojeći `Toast`). Uticaj **S**, trud **S**.
5. **P2:** jednostavan log fajl u main-u (`%APPDATA%\AnimeDesk\logs\main.log`, rotacija po veličini), pa uključiti njegov sadržaj u „Detalji” greške. Uticaj **S** (podrška korisnicima), trud **N–S**.

## 8. I/O u main procesu, pokretanje, veličina IPC poruka

**Kako oni rade**
- Backend je poseban Go proces. Disk I/O (npr. `filecache.Set` → `saveToFile`, `seanime/internal/util/filecache/filecache.go:126`) radi se u gorutinama, pa ne blokira UI ni Electron main.
- Pozicija gledanja se upisuje pri `StatusEvent`, `PausedEvent` i `SeekedEvent` (`seanime/internal/mediacore/mediacore.go:471-509`, `updateContinuityState` `:601-620`), i to sinhrono u fajl keš (`seanime/internal/continuity/history.go:100,131`). Učestalost `StatusEvent`-a nije proverena. Dakle **ni oni ne prigušuju upis**, ali taj upis ne blokira proces koji crta prozor.
- Pokretanje: Denshi pokrene server i proverava `/api/v1/status` svakih 500 ms dok se ne javi (`docs/seanime-analysis/01-seanime-arhitektura.md` §4: `seanime/seanime-denshi/src/main/index.ts:713-727`).

**Kako mi radimo**
- **Sav I/O je sinhron u Electron main procesu**, koji obrađuje i IPC i prozor:
  - `writeJsonAtomic`: `mkdirSync` + `writeFileSync` + `renameSync` (`src/main/jsonStore.js:22-27`);
  - `readJson`: `readFileSync` (`:7`).
- **Pozicija na 5 s:** `PROGRESS_MS = 5000` (`src/renderer/components/PlayerView.jsx:13,83`) → `internalPlayer.remember` → `positions.save` (`src/main/internalPlayer.js:41`) → ceo `positions.json` (`src/main/positions.js:20-24`). Fajl je sada 269 B, pa je jedan upis jeftin. Ipak, to je 12 sinhronih upisa sa `rename` u minuti, tokom celog gledanja. Potvrđeno u kodu.
- **Napredak preuzimanja:** svaka linija `[download] x%` → `onChange()` (`src/main/downloads.js:63-66`) → `send(EVENTS.downloads, downloads.queueItems())` (`src/main/index.js:133`) → `DownloadsPage` ponovo traži `downloads.list()`, a to radi `existsSync` za svaku stavku (tema 6). Prigušivanja nema.
- **`toolManager`:** `toolPaths()` (`src/main/toolManager.js:154-165`) poziva `exePath` šest puta, a svaki poziv čita `manifest.json` sinhrono (`:28,59-64`). `toolPaths()` se zove pri svakom startu ani-cli sesije (`src/main/aniCliBridge.js:85`).
- **Pokretanje:**
  1. sve se radi redom pre otvaranja prozora (`src/main/index.js:72-149`): sinhrona čitanja podešavanja i biblioteke, `positions.prune`, `streams.start`, `progress.init()` (pri prvom pokretanju poziva `computeSnapshot`, `src/main/progress.js:22-29`), `server.start()`;
  2. tek onda `createWindow` (`src/main/index.js:149`);
  3. zatim `health.run()` (`:151`): `isOnline()`, pa **pravi ani-cli upit** `'one piece'` sa `player: 'debug'` i timeout-om od 30 s (`src/main/aniCliBridge.js:112-120`, `src/main/healthCheck.js:27-32`).
  Dok ne dobije `ok`, semafor je žut, a pretraga i „Nastavi” su onemogućeni (`ready = health.light === 'green'`, `src/renderer/App.jsx:129`; `disabled={!ready…}` u `src/renderer/pages/SearchPage.jsx:171`, `src/renderer/components/Hero.jsx:42`, `src/renderer/components/SeriesCard.jsx:28`, `src/renderer/pages/AnimeDetail.jsx:110`). Koliko traje nije mereno u ovoj analizi; zavisi od sajta izvora i mreže.
- **Sledeća epizoda:** `PlayerView` se zatvara sa `reason === 'next'`, pa se poziva `continueWatching` (`src/renderer/App.jsx:170-174`). To pokreće **ceo** ani-cli tok iznova: bash, pretraga, meni, link (`src/renderer/pages/SearchPage.jsx:98-106`). Unapred pripremljenog linka nema.
- **Veličina IPC poruka:** posteri kao data URL (prosek ≈76 KB po pozivu, tema 4) i cela lista biblioteke kao `structuredClone` pri svakom `library.list` (`src/main/library.js:36,117`). Biblioteka je sada 568 B, pa ovo drugo nije problem.

**Razlika:** njihov I/O ne može da zamrzne UI jer je u drugom procesu, a naš blokira isti proces koji prima IPC. Oni nemaju test izvora koji blokira pokretanje. Mi namerno čekamo self-test, jer on štiti od pokvarenog ani-cli-ja (`docs/seanime-analysis/00-nas-projekat.md` §7).

**Preporuka**
1. **Optimistično pokretanje** (`src/main/healthCheck.js`, `src/main/index.js:151`):
   - ako je poslednji self-test uspeo pre manje od N sati i verzija ani-cli-ja se nije promenila (`toolManager.version`), odmah postaviti stanje `ok` (ili novo „verovatno ok”), a self-test pustiti u pozadini;
   - ako test kasnije padne, ide se na postojeći tok `updating` → `source-down`.
   Uticaj **V** na to koliko brzo aplikacija deluje spremno, trud **S**. Rizik: korisnik može da klikne pre nego što test padne; to je prihvatljivo, jer sesija ionako vraća grešku sa porukom (`src/main/aniCliBridge.js:105-107`).
2. **Pozicija:** upis u main-u odložiti na 15–30 s, uz obavezan upis pri `closed` i pauzi (oba toka već postoje: `src/main/internalPlayer.js:45`, `src/renderer/components/PlayerView.jsx:178`). Uticaj **N–S**, trud **N**.
3. **Asinhroni upis sa redom** u `src/main/jsonStore.js` (`fs.promises.writeFile` + `rename`, jedan upis u toku po fajlu, a poslednja vrednost pobeđuje). Uticaj **S**, trud **S**. Rizik: testovi koji odmah posle upisa čitaju fajl; podaci se gube ako proces padne pre upisa, pa treba flush na `before-quit`.
4. **Prigušiti napredak preuzimanja** u `src/main/downloads.js:65` (npr. najviše 4/s, ili samo kad se ceo procenat promeni). Uticaj **S**, trud **N**.
5. **Memoizovati manifest** u `toolManager` (keš u memoriji, invalidacija pri `save`). Uticaj **N**, trud **N**.
6. **Prefetch sledeće epizode** (ideja): kad gledanje pređe ~80 %, pokrenuti ani-cli sesiju u režimu `player: 'debug'` (isti mehanizam kao self-test, `src/main/aniCliBridge.js:114-116`) za epizodu N+1 i zapamtiti link. „Sledeća” onda pušta odmah, a ako link istekne ili ne radi, vraća se na pun tok. Uticaj **V**, trud **V**. Rizici: linkovi mogu da isteknu (nije provereno koliko traju); dodatno opterećenje izvora; poštovati `mode` i `quality` serije (`src/main/seriesPrefs.js`).

## 9. Kvalitet koda: testovi, tipovi, veličina komponenti

**Kako oni rade**
- TypeScript sa `"strict": true` (`seanime/seanime-web/tsconfig.json:25`). Tipovi i endpoint-i se generišu iz Go koda: `seanime/seanime-web/src/api/generated/types.ts` ima 6.166 linija, a `endpoints.ts` 2.418 (codegen opisan u `docs/seanime-analysis/01-seanime-arhitektura.md` §6, `seanime/codegen/main.go:31-54`).
- Testovi: 159 Go `_test.go` fajlova u `internal/` i samo 8 `*.test.ts(x)` fajlova u `seanime-web/src` (prebrojano `find`), na oko 771 `.ts/.tsx` fajl.
- Postoje vrlo veliki fajlovi, npr. `seanime/seanime-web/src/app/(main)/_features/mpv-core/mpv-core-player-inner.tsx` sa 2.167 linija.

**Kako mi radimo**
- Čist JavaScript. Nema `jsconfig.json` ni `tsconfig.json`, a `@ts-check`, `@param` i `@typedef` se ne pojavljuju nijednom (grep, 0). Ugovor IPC-a postoji samo kao imena kanala (`src/shared/channels.js`) i ručno pisan preload (`src/preload/index.js:11-68`).
- Testovi:
  - vitest za `tests/unit/**` i `tests/integration/**` (`vitest.config.mjs:6-9`);
  - posebno `test:live` i Playwright `test:e2e` (`package.json` skripte);
  - 62 test fajla sa 5.189 linija, naspram 4.599 linija u `src/`. Testova je više nego koda.
  - Pokrivenost se ne meri: nema `coverage` u `vitest.config.mjs`, a `@vitest/coverage-*` nije u `devDependencies`.
- Veličina fajlova (najveći u `src/`, linije): `SearchPage.jsx` 226, `PlayerView.jsx` 213, `anilist.js` 189, `App.jsx` 185, `SettingsPage.jsx` 181, `toolManager.js` 173, `downloads.js` 164, `streamServer.js` 159, `index.js` 159. Nijedan fajl ne prelazi 250 linija.
- Memoizacija se skoro ne koristi (4 pojave `useMemo`/`useCallback`/`memo` u `src/renderer`), ali na ovim veličinama stabla to nije usko grlo (nije profilisano).

**Razlika:** oni imaju jake tipove na granici frontend–backend i slabu pokrivenost frontenda testovima. Mi imamo obrnuto: puno testova, a tipova nema. Naše komponente su red veličine manje.

**Preporuka**
1. **Postepeno uvesti tipove kroz JSDoc** (bez prepisivanja u TS):
   - `jsconfig.json` sa `checkJs: true` i `strict: false`;
   - `// @ts-check` prvo u `src/shared/*.js` (čista logika: `stats.js`, `episodes.js`, `domain.js`, `player.js`);
   - zatim `@typedef` za IPC payload-e (`LibraryEntry`, `AniListInfo`, `HealthState`, `WatchResult`) u jednom `src/shared/types.js`.
   Skripta `tsc --noEmit -p jsconfig.json` kao `npm run typecheck`. Uticaj **S** (hvata greške na granici IPC-a), trud **S** (postepeno). Rizik: `typescript` je nova devDependency, a u početku će biti mnogo upozorenja, zato `strict: false`.
2. **Meriti pokrivenost:** `@vitest/coverage-v8` + `vitest run --coverage`, samo radi uvida, bez praga. Uticaj **N**, trud **N**.
3. Komponente za sada **ne deliti**. Kandidat za kasnije je `SearchPage.jsx` (226 linija, 12 `useState`-ova, `:15-28`): mašina stanja sesije bi mogla u poseban hook `useWatchSession`. Uticaj **N**, trud **S**.

---

## 10. Prioritizovane preporuke

| P | Preporuka | Fajlovi | Uticaj | Trud | Tema |
|---|---|---|---|---|---|
| **P0** | Ukloniti `page` iz zavisnosti efekta statistike (`[api, page]` → `[api]`) | `src/renderer/App.jsx:80` | S | N | 6 |
| **P0** | Minifikacija renderera (`build.minify: 'esbuild'`): 2,07 MB → ~0,97 MB (izmereno) | `electron.vite.config.mjs:7` | S | N | 5 |
| **P0** | `catch` u `main()` + `unhandledRejection`; `catch` za `settings.get` (inače prazan prozor) | `src/main/index.js:72-159`, `src/renderer/App.jsx:63,127` | S | N | 7 |
| **P0** | Jedan `ErrorBoundary` oko sadržaja i plejera | `src/renderer/App.jsx:152-177` | V | N | 7 |
| **P1** | Keš postera u rendereru (Map obećanja) + keš u memoriji i deduplikacija istovremenih zahteva u main-u | `src/renderer/components/Poster.jsx`, `src/main/anilist.js:157-186` | V | N | 1 |
| **P1** | Lazy `PlayerView` (hls.js ≈62 % bundle-a izlazi iz početnog učitavanja) | `src/renderer/App.jsx:17,166-177` | S | N | 2, 5 |
| **P1** | Prigušiti napredak preuzimanja; `DownloadsPage` da ne učitava listu ponovo pri svakom procentu | `src/main/downloads.js:65`, `src/renderer/pages/DownloadsPage.jsx:25` | S | N | 6, 8 |
| **P1** | Keširati poslednji stats snapshot u main-u (ne računati ga dvaput po promeni) | `src/main/progress.js`, `src/main/index.js:90-99` | S | N | 6 |
| **P2** | Posteri kao binarni fajlovi + URL (lokalni server ili `protocol.handle`) umesto base64 kroz IPC | `src/main/anilist.js:114-120,180`, `src/renderer/index.html:5` (CSP) | V | S | 4 |
| **P2** | Optimistično pokretanje: zapamćen uspešan self-test → odmah zeleno, test u pozadini | `src/main/healthCheck.js`, `src/main/index.js:151` | V | S | 8 |
| **P2** | Poster se učitava tek kad je vidljiv (`IntersectionObserver` + fallback za jsdom) | `src/renderer/components/Poster.jsx` | S | N | 2 |
| **P2** | Upis pozicije ređe (15–30 s) + asinhroni red za upis JSON-a | `src/main/internalPlayer.js:41`, `src/main/jsonStore.js:22-27` | N–S | N–S | 8 |
| **P2** | Global error toast + log fajl u main-u | `src/renderer/api.js`, `src/main/*` | S | S | 7 |
| **P3** | Prefetch linka sledeće epizode (`player: 'debug'` sesija pri ~80 %) | `src/main/watchService.js`, `src/main/aniCliBridge.js` | V | V | 8 |
| **P3** | JSDoc + `@ts-check` + `npm run typecheck`, počev od `src/shared` | novi `jsconfig.json`, `src/shared/*.js` | S | S | 9 |
| **P3** | `hls.js/light` (uz ručni test strimova), fontovi samo latin/latin-ext | `src/renderer/components/PlayerView.jsx:2`, `src/renderer/main.jsx:1-6` | N–S | N | 5 |
| **P3** | Sitnice: memoizacija manifesta, `Set` u `EpisodePicker`, merenje pokrivenosti | `src/main/toolManager.js:28`, `src/renderer/components/EpisodePicker.jsx:51`, `vitest.config.mjs` | N | N | 3, 8, 9 |
| — | **Ne raditi sada:** React Query/jotai, virtualizacija lista, deljenje stranica na chunk-ove | — | N | S–V | 3, 6 |

**Šta nije mereno** (ostaje za ručnu proveru u aplikaciji):
- trajanje self-testa i pokretanja do zelenog semafora;
- trajanje „sledeće epizode”;
- vreme parsiranja bundle-a pre i posle minifikacije;
- koliko često yt-dlp ispisuje napredak;
- učestalost Seanime `StatusEvent`-a;
- veličina Seanime build-a.
