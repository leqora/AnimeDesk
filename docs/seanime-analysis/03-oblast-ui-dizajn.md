# 03 — Oblast 4: UI / dizajn (Faza 3, samo analiza)

> Poređenje: Seanime (`seanime/seanime-web`, GPL-3.0, React 19 + Tailwind 3 + Radix + `motion`) i AnimeDesk v0.5.0 (`src/renderer`, React + čist CSS sa tokenima). Sve putanje za Seanime su relativne u odnosu na `seanime/seanime-web/`, a za nas u odnosu na koren repoa. Preporuke su **samo inspiracija**: ništa iz GPL koda se ne kopira 1:1, sve se prevodi u naš stil (tokeni u `:root`, bez hex boja van `:root`, animiraju se samo `transform`/`opacity` — `tests/unit/styles.test.js:16-23`).
>
> Ocene: **trud / uticaj** = V (visok), S (srednji), N (nizak).

Polazni opis našeg dizajn sistema: `00-nas-projekat.md` §3. Seanime frontend: `01-seanime-arhitektura.md` §3. Seanime UI podešavanja: `02-seanime-features.md` §20.2.

---

## 1. Media kartice

### 1.1 Kako oni rade

**Struktura** (`src/app/(main)/_features/media/_components/media-entry-card.tsx:249-474`):
- Kontejner `div` sa `group/media-entry-card relative flex flex-col h-full flex-none`, `focus-visible:outline-0` (`media-entry-card-components.tsx:128-133`).
- Tri sloja: (1) **hover popup** u kontekst meniju (`media-entry-card.tsx:261-402`), (2) **telo** = link sa slikom i bedževima (`:405-465`), (3) **naslov ispod** (`:467-472`).
- Ceo popup je omotan u `SeaContextMenu` (desni klik): Preview, Add to Playlist, Open in Library Explorer, plugin stavke (`media-entry-card.tsx:261-283`).

**Telo / slika** (`media-entry-card-components.tsx:463-535`):
- `aspect-[6/8]` (= 3:4, ne 2:3), `rounded-[--radius]` (= `0.5rem`, `src/app/globals.css:77`), `overflow-hidden isolate` (`:474`).
- Slika na hover: `group-hover/media-entry-card:scale-110` (`:529`).
- Učitavanje slike (`:29-87`): ispod slike je placeholder `bg-gradient-to-br from-gray-900/80 via-gray-800/70 to-gray-950/80` koji ide na `opacity-0` kad se slika učita (`:60-66`); sama slika ide iz `opacity-0 scale-[0.95]` u `opacity-100 scale-100`, `transition-[opacity,transform] ease-out`, prvo `duration-400`, posle 1 s prelazi na `duration-200` (da hover bude brz) (`:48-56,76-83`). `motion-reduce:transition-none` (`:78`). `decoding="async"` (`:71`).
- Donji gradijent za čitljivost bedževa: `absolute -bottom-1 h-[50%] opacity-90 bg-gradient-to-t from-[#0c0c0c] to-40%`, `z-[5]` (`src/app/(main)/_features/custom-ui/item-bottom-gradients.tsx:23-28`).

**Bedževi na telu:**
| Bedž | Pozicija / izgled | Ref |
|---|---|---|
| Progres traka | gore, `h-1 w-full bg-gray-700`, punjenje `bg-brand-400` za CURRENT, inače `bg-gray-400`; skriveno za COMPLETED | `media-entry-card-components.tsx:481-500` |
| Progres „3/12" | dole levo, `bg-zinc-950/40`, `rounded-[--radius-md] rounded-tl-none rounded-br-none` (lepi se za ugao), `font-semibold tracking-wide`; „/12" u `text-[--muted]` | `media-entry-progress-badge.tsx:19-41`, `media-entry-card.tsx:425-445` |
| Neodgledano (▶ N) | iznad progres bedža; **podrazumevano isključeno** (`showAnimeUnwatchedCount: false`) | `anime/_containers/anime-entry-card-unwatched-badge.tsx:26-54`, `src/lib/theme/theme-hooks.ts:115` |
| Ocena korisnika | dole desno, `w-14 h-7`, `backdrop-blur-lg`, boja po skali (`getScoreColor`), puna zvezda ≥ 90 | `media-entry-score-badge.tsx:16-25`, `media-entry-card.tsx:446-451` |
| Emituje se / još nije | gore desno `right-1 top-2`, ikona tornja, `primary-solid` / `zinc-solid` | `media-entry-card-components.tsx:511-514` |
| U biblioteci | gore levo, ćilibar `bg-amber-600/80` | `:502-508` |
| Nedostaju epizode | dole sredina, `animate-pulse` | `media-entry-card.tsx:452-463` |
| 18+ veo | preko slike, `opacity-[0.97]` sa šarom | `media-entry-card-components.tsx:89-113` |

**Naslov ispod kartice** (`media-entry-card-components.tsx:561-572`): `pt-2`, `font-medium text-sm lg:text-[1rem] line-clamp-2 text-pretty`; red ispod „Sezona Godina" u `text-sm text-[--muted]`.

**Hover popup („expanded card")** (`media-entry-card-components.tsx:187-247`, `media-entry-card.tsx:288-400`):
- Apsolutno preko kartice, `z-[15]`, malo veći od kartice: `h-[105%] -top-[5%] w-[103%] -left-[1.5%]`, `rounded-[0.7rem]`, `border rgb(255 255 255 / 5%)` (`:193,197,201`).
- Pojavljivanje: `opacity-0` → `group-hover:opacity-100`, `transition ease-in-out duration-150`, `transform-gpu will-change-[opacity,transform]`, `[contain:layout_paint_style]` (`:193-198`). Takođe se otvara na `group-focus-visible` (`:195-196`).
- Pozadina: `--media-card-popup-background` (= `gray.950`, `globals.css:120`) ili, uz opciju, `bg-gray-950/90 backdrop-blur-sm` (`:192`).
- **Samo na `lg` (≥1024px)**: `hidden lg:block` (`:200`).
- Sadržaj se renderuje tek posle `pointerenter`; zatvaranje kasni 35 ms da ne treperi (`media-entry-card.tsx:203-220`, `media-entry-card-components.tsx:236`).
- Sadržaj popupa: banner `aspect-[4/2]` sa progres trakom, bedžom „emituje se" sa tooltipom i „3/12" (`:635-691`); opcioni **trailer** (YouTube, prikazuje se 1–1,5 s posle učitavanja) (`:693-721`); gradijent `h-[80%] from-[--media-card-popup-background]` (`:723-729`); naslov centriran `line-clamp-2` + alternativni naslov (`:345-361`); „📅 Sezona Godina – Format" (`:363-371`); dugme **Watch/Continue** (`media-entry-card.tsx:330-341`); „Epizoda N za X dana" (`media-entry-card-components.tsx:394-404`); status liste ako nije CURRENT (`media-entry-card.tsx:367-372`); futer sa AniList edit dugmetom i prosečnom ocenom (`:387-399`).

**Skeleton:** `MediaEntryCardSkeleton` je fiksnih `250×350`, `bg-gray-900`, `rounded-[--radius-md]` (`media-entry-card-skeleton.tsx:7-10`); osnovni `Skeleton` je `animate-pulse rounded-[--radius-md] bg-[--subtle]` (`src/components/ui/skeleton/skeleton.tsx:10-13`). Lazy grid za >48 stavki crta skeleton visine izmerene stavke (`media-card-grid.tsx:76-88,217-223`).

### 1.2 Kako mi radimo

- **`Poster`** (`src/renderer/components/Poster.jsx:17-22`, `src/renderer/styles.css:121-122`): `<img class="poster">`, `aspect-ratio: 2/3`, `object-fit: cover`, `border-radius: var(--radius-sm)` (8px). Dok se info učitava i kad nema postera, prikazuje se isti `poster--empty` gradijent sa ikonom `film` 28px — nema razlike između „učitava se" i „nema slike"; nema fade-in-a.
- **Kartica u pretrazi** (`src/renderer/pages/SearchPage.jsx:191-198`): ceo `<button class="card">` = poster + naslov. `.card`: `padding 8px`, `background: var(--glass)`, `radius 14px`; hover `translateY(-2px)` + `box-shadow: var(--glow)` (`styles.css:117-118`). Tranzicija je samo `transform 180ms, opacity 180ms` (`:117`) → **glow „iskače" bez prelaza**.
- **`SeriesCard`** (`src/renderer/components/SeriesCard.jsx:15-32`): dugme (poster + naslov), ispod meta „X/Y epizoda" (HUD 12px, `styles.css:120`), XpBar sa procentom (`:22-27`) i okruglo CTA dugme ▶ `top 14px; right 14px; padding 6px` preko postera (`styles.css:113`).
- **Watchlist kartica** (`src/renderer/pages/WatchlistPage.jsx:70-85`): meta `status · 3/12 · ★ 8` kao tekst, zvezdica za kačenje gore desno (`styles.css:214-215`).
- Nema: bedževa preko postera, donjeg gradijenta, zoom-a slike, hover popupa, kontekst menija, skeletona, line-clamp-a naslova (dug naslov širi karticu u visinu).

### 1.3 Razlika

| Aspekt | Seanime | AnimeDesk |
|---|---|---|
| Odnos | 3:4 (`aspect-[6/8]`) | 2:3 (AniList cover je ~2:3 → mi manje sečemo) |
| Radijus slike | 8px | 8px unutar 14px glass okvira |
| Hover | zoom slike 1.1 + popup preko kartice | lift −2px + glow (bez prelaza za senku) |
| Info na posteru | progres traka, „3/12", ocena, airing, biblioteka | ništa; sve je tekst ispod |
| Loading | gradijent placeholder + fade/scale-in 400ms | isti prazan placeholder kao „nema slike" |
| Naslov | `line-clamp-2` | bez ograničenja |
| Desni klik | kontekst meni | nema |

**Gde smo već bolji:** glass okvir + neon glow su prepoznatljiviji od Seanime-ovog „ravnog" crnog stila; HUD tipografija za brojeve (`.card__meta`, `styles.css:120`) daje „gamer" karakter koji Seanime nema; XpBar progres sa gradijentom accent→accent-2 i glow-om (`styles.css:86`) je vizuelno bogatiji od njihove `h-1` sive trake. Pristupačnost: naše dugme za kartu je pravi `<button>` sa jasnim fokusom, a njihov popup ima dugmad sa `tabIndex={-1}` (`media-entry-card.tsx:335`) i kontejner sa `focus-visible:outline-0` (`media-entry-card-components.tsx:131`).

### 1.4 Preporuka

1. **P1 — Info overlay na posteru** (`Poster.jsx` dobija `children` slot, `SeriesCard.jsx`, `WatchlistPage.jsx`, `styles.css`): donji gradijent (`linear-gradient(0deg, var(--scrim), transparent 50%)`) + bedž „3/12" dole levo u HUD fontu, pilula ocene „★ 8" dole desno, status traka/tačka gore levo. Trud S / uticaj V.
2. **P1 — Progres traka na samom posteru** (gore ili dole, 3px, `--accent-2` + `--glow-cyan`), umesto zasebne XpBar ispod (oslobađa visinu kartice). Trud N / uticaj S.
3. **P1 — Loading stanje odvojeno od „nema slike"**: shimmer (pseudo-element koji se pomera preko `transform: translateX`) dok `info === null`; fade-in slike `opacity 0→1` 300ms posle `onLoad`. Trud N / uticaj S.
4. **P1 — Glow sa prelazom**: senku staviti na `.card::after` (apsolutno, `box-shadow: var(--glow)`, `opacity: 0`) i animirati samo `opacity` — poštuje pravilo testa, a glow više ne „iskače". Trud N / uticaj S.
5. **P2 — Zoom slike na hover** (`transform: scale(1.06)` unutar `overflow: hidden` omotača, 300ms `--ease`). Trud N / uticaj S.
6. **P2 — `line-clamp: 2`** za `.card__title`. Trud N / uticaj S.
7. **P3 — Hover popup** kao Seanime-ov: ne preporučujem sada. Naš najmanji prozor je 800px (`00-nas-projekat.md` §3.8), a i Seanime ga gasi ispod 1024px (`media-entry-card-components.tsx:200`); uz to opis u popupu je rizik za spojlere. Umesto toga: brze akcije (▶ / zvezdica) koje se pojavljuju na hover/fokus (vidi §10). Trud V / uticaj N.
8. **P2 — Kontekst meni na desni klik** (Nastavi, Detalji, Zakači, Promeni status, Ukloni) — videti §8.

---

## 2. Grid / carousel / listing

### 2.1 Kako oni rade
- **Grid** (`src/app/(main)/_features/media/_components/media-card-grid.tsx:6-8`): fiksni koraci kolona: 2 → 3 (≥768) → 4 (≥1080) → 5 (≥1320) → 6 (≥1750) → 7 (≥1850) → 8 (≥2000), `gap-4` (16px). Varijante sa max 4–7 kolona (`:9-20`).
- **Prazno stanje**: ilustracija „LuffyError" + „Nothing to see" (`:35-39`).
- **Lazy grid** za >48 stavki: IntersectionObserver `rootMargin: 200px`, van ekrana se crta skeleton izmerene visine (`:76-88,132-174,217-223`).
- **Horizontalni red (carousel)** (`src/app/(main)/_features/anime/_components/anilist-media-entry-list.tsx:41-68`): Embla carousel, `dragFree: true`, stavka `basis-[200px] md:basis-[250px] mx-2 mt-8`, tačkice za navigaciju (`src/components/ui/carousel/carousel.tsx:511-518,569-583`).
- **Maske na ivicama reda**: `w-8 bg-gradient-to-r from-[--background]` levo i desno (`carousel.tsx:596-597`). Draggable scroll ima overlay strelice `w-16` sa gradijentom koji se gasi kad nema više sadržaja (`src/components/ui/horizontal-draggable-scroll/horizontal-draggable-scroll.tsx:20-31`).
- Carousel epizoda: `md:basis-1/2 lg:basis-1/2 2xl:basis-1/3` (`src/components/shared/classnames.ts:33-38`).

### 2.2 Kako mi radimo
- Grid: `repeat(auto-fill, minmax(160px, 1fr))`, `gap 14px` (`src/renderer/styles.css:116`) — fluidno, bez breakpointa.
- Šina: `grid-auto-flow: column; grid-auto-columns: 150px; gap 14px; overflow-x: auto; scroll-behavior: smooth` (`styles.css:107`). Strelice u zaglavlju šine, vidljive samo kad ima prelivanja; skrol za `clientWidth` (`src/renderer/pages/HomePage.jsx:15-42`).
- Prazno stanje: običan tekst `watchlist.empty` (`WatchlistPage.jsx:66`).
- Nema maski na ivicama, nema `scroll-snap`, nema drag-a, nema virtualizacije (biblioteke su male).

### 2.3 Razlika
Naš `auto-fill/minmax` je jednostavniji i za desktop prozor 800–1920px praktično daje isto (5–10 kolona). Seanime kartice su šire (200–250px u redu vs naših 150px). Nama nedostaju maske ivica i snap.

### 2.4 Preporuka
- **P2 — Maske ivica šine** preko `mask-image: linear-gradient(90deg, transparent, black 24px, black calc(100% - 24px), transparent)` na `.rail__track` (bez boja → bez problema sa testom). Trud N / uticaj S.
- **P2 — `scroll-snap-type: x mandatory`** na `.rail__track` + `scroll-snap-align: start` na kartici; širina kroz token `--rail-card-w: 160px` (sada 150px u `styles.css:107`, a grid koristi 160px u `:116` → uskladiti). Trud N / uticaj S.
- **P2 — Prazno stanje sa ikonom i CTA** („Pretraži anime") umesto golog teksta. Trud N / uticaj S.
- **P3 — Virtualizacija** tek ako watchlist pređe ~200 stavki. Trud S / uticaj N.

---

## 3. Layout i navigacija

### 3.1 Kako oni rade
- **Ljuska** (`src/app/(main)/_features/layout/main-layout.tsx:91-102`): `AppLayout withSidebar sidebarSize="slim"`. Sidebar je `lg:fixed lg:inset-y-0`, `z-50`, `w-20` (80px) (`src/components/ui/app-layout/app-layout.tsx:53-62`); sadržaj dobija `lg:pl-20` (`:37`). Ispod `lg` sidebar je skriven i otvara se kao drawer preko `AppSidebarTrigger` (`src/app/(main)/_features/layout/top-navbar.tsx:58`). Na desktopu `pt-4 select-none` (`app-layout.tsx:179`).
- **Sidebar** (`src/app/(main)/_features/navigation/main-sidebar.tsx:126-150`): podrazumevano samo ikone; opcija `expandSidebarOnHover` širi na `w-[260px]` uz `transition-[width] duration-300` (`:129,132`); podrazumevano je **providan** (`bg-transparent`, `:133`), pa se banner stranice vidi ispod njega. Logo 60×40 (`:413-416`).
- **Stavke menija** (`src/components/ui/vertical-menu/vertical-menu.tsx:18-48`): `rounded-lg` (u sidebaru `rounded-2xl`), `h-10 px-3 text-sm font-medium`, `text-[--muted]` → hover `--foreground`, aktivna `data-[current=true]:bg-[--subtle]`. U skupljenom stanju svaka stavka ima **tooltip desno** (`:218-220`). Korisnik može da otkači stavke iz menija (`unpinnedMenuItems`, `src/lib/theme/theme-hooks.ts:121`).
- **Top navbar**: `h-[5rem]`, ali je u desktop buildu skriven (`(ts.hideTopNavbar || __isDesktop__) && "lg:hidden"`, `top-navbar.tsx:40-41`).
- **Prelazi stranica (Denshi/Electron)**: View Transitions API — samo `main` radi fade 200ms `ease`, a sidebar i titlebar ostaju statični (`src/app/globals.css:181-297`), uz izuzetak za `prefers-reduced-motion` (`:299`). Entry header ima i `motion` fade 0.18s (`media-page-header-components.tsx:67-71`).
- **Ruting**: TanStack Router sa URL-om (`01-seanime-arhitektura.md` §3), pa „nazad" kroz istoriju radi. `grep` po `src/` ne nalazi `scrollRestoration` (samo lokalne `scrollTo` u modalima i čitaču), pa pamćenje skrola nije eksplicitno podešeno.
- **Scrollbar**: 8px, thumb `rgba(255,255,255,.2)` → hover `.3`, `rounded-full`, providna staza (`globals.css:383-408`); klasa `.hide-scrollbar` (`:526-535`).

### 3.2 Kako mi radimo
- Ljuska: grid `232px 1fr`, `height: 100vh`, skroluje samo `.content` (`src/renderer/styles.css:54-55`).
- Sidebar: uvek proširen (232px), `color-mix(--bg-elev 85%)` + `backdrop-filter: blur(16px)` (`:60`); logo sa gradijentom accent→accent-2 (`:61`); aktivna stavka `glass-strong` + **neon traka 3px sa glow-om** levo (`:64-65`); semafor, profil sa XP-om, pun ekran i verzija u dnu (`src/renderer/components/Sidebar.jsx:28-38`).
- Ispod 960px: samo ikone (72px), bez tooltipa (labele dobijaju `display:none`, `aria-label` ostaje — `Sidebar.jsx:20`, `styles.css:200-205`).
- Prelaz stranica: `page-in` 200ms, `translateY(6px)` + fade (`styles.css:56-57`, `src/renderer/App.jsx:154`).
- Navigacija: `useState('home')`, bez istorije i bez pamćenja skrola (`App.jsx:49,131`; `00-nas-projekat.md` §1.7). Detalj serije je stanje unutar Watchlist-a (`src/renderer/pages/WatchlistPage.jsx:33-34`); „Nazad" je obično tekstualno dugme (`src/renderer/pages/AnimeDetail.jsx:56`).
- Scrollbar: podrazumevani Chromium (u `styles.css` nema pravila).

### 3.3 Razlika
Naš sidebar je informativniji (semafor, XP, profil) i ima jači identitet (neon indikator). Seanime ima tooltipove u skupljenom režimu, providan sidebar preko banera i stilizovan scrollbar. Najveća funkcionalna rupa kod nas: **nema „nazad" istorije ni pamćenja skrola** — iz detalja serije se vraća na vrh liste.

### 3.4 Preporuka
- **P0 — Stilizovan scrollbar** u našim tokenima (`::-webkit-scrollbar` 8px, thumb `var(--glass-strong)`, hover `color-mix(in srgb, var(--accent) 50%, transparent)`) u `styles.css`. Podrazumevani svetlosivi scrollbar kvari tamnu temu. Trud N / uticaj S.
- **P1 — Mini istorija navigacije** u `App.jsx`: stek `{page, openAnimeId, scrollTop}`; „Nazad" (dugme, `Alt+←`, taster miša 4) vraća stranu i `content.scrollTop`. Trud S / uticaj V.
- **P1 — Pamćenje skrola po stranici** (ref na `main.content`, mapa `page → scrollTop`). Trud N / uticaj S.
- **P2 — Tooltip za ikone** u uskom sidebaru (CSS `[data-tip]::after` sa prelazom za `opacity`, ili `title`). Trud N / uticaj S.
- **P2 — Uskladiti pozadinu prozora** (`src/main/index.js:55`, `#15151c`) sa `--bg` `#0B0B16` da pri startu nema bljeska (`00-nas-projekat.md` §3.1). Trud N / uticaj N.
- **P3 — View Transitions** (`document.startViewTransition`) umesto `page-in`. Electron ih podržava, ali je naš `page-in` već dovoljno dobar. Trud S / uticaj N.

---

## 4. Entry / detail header

### 4.1 Kako oni rade (`src/app/(main)/_features/media/_components/media-page-header-components.tsx`)
- **Baner**: `fixed top-0`, `h-[20rem] lg:h-[30rem]` (mala varijanta `lg:h-[26rem]`), `z-[3]` (`:108-119`). Slika ulazi `opacity 0→1` za 0.22s `easeOut` (`:157-172`).
- **Gradijenti**: gornji `h-[8rem] opacity-40` od `--background` (`:125-130`); dva leva `bg-gradient-to-r from-[--background]` čiji se `max-w` **širi na hover** headera, `transition-all duration-500 ease-out` (`:180-194`); donji `h-[70%]`, `from-[--background] via-[--background]/80 via-30%` (`:198-205`); na mobilnom je ceo baner zatamnjen `opacity-70` (`:207-213`).
- **Ponašanje pri skrolu**: posle `y > 100` baner pada na `opacity-15` (posle 300 na `opacity-5`) (`:114-116`); detalji blede i dižu se najviše −40px posle `y > 200/400` (`:239-245`); poster blago zumira `scale 1 + y·0.0002` (najviše 1.05) (`:378-380`).
- **Opcije banera** u podešavanjima: Default / Blur when unavailable / Dim when unavailable / Hide when unavailable / Dim / Blur / Hide (`src/lib/theme/theme-hooks.ts:11-50`). Blur je sloj `backdrop-blur-xl` (`:174-177`). Opciona „zamućena pozadina” cele strane, `backdrop-blur-2xl` posle skrola (`:80-104`).
- **Poster**: `aspect-[6/8]`, `max-w-[150px] sm:200 lg:230` (fluid `lg:270`), `rounded-[--radius-md] shadow-md` (`:357-361`).
- **Naslov**: efekat „text generate” (reč po reč), `text-[1.5rem] lg:text-[2rem] 2xl:text-[2.6rem]`, `text-shadow 0 1px 10px rgb(0 0 0 / 20%)`, `line-clamp-2` (`:395-401`); engleski i romaji naslov u `--muted` ispod (`:402-405`).
- **Meta red**: ocena + progres, AniList edit dugme, status liste, separator `w-0.5 h-5` (`:408-451`).
- Ulazak detalja: spring `damping 26, stiffness 220` (`:266-276`).
- „Continue watching” header na početnoj: menja seriju na 8 s, uz **pauzu dok je miš iznad** (`src/app/(main)/_features/anime-library/_containers/continue-watching-header.tsx:112-121`), poster 180×280 (`:164`), baner `lg:h-[35rem]` (`:362-368`), crossfade slike 1000ms (`:388-394`).

### 4.2 Kako mi radimo
- `.banner` u `AnimeDetail.jsx:60-66`: zamućen poster kao pozadina (preuzima `.hero__bg`: `blur(28px) saturate(1.3)`, `opacity .55`, `inset -40px`, `scale 1.1` — `styles.css:96`), gradijent `0deg --bg 5% → poster-tint 30%` (`styles.css:137`), poster 150px + naslov `h2` (`:138-139`).
- Boja iz postera (`--poster-tint`) računa se iz piksela (`src/renderer/theme/posterTint.js:24-62`). **Seanime to nema** — koristi samo `--background`.
- Meta (žanrovi, godina) je **ispod** banera, kao `muted` paragraf (`AnimeDetail.jsx:69-74`); status i ocena su `select` polja (`:76-90`); „Nastavi” je u traci epizoda (`:110-112`); „Nazad” i „Zakači” su iznad banera (`:55-58`).
- Hero na početnoj: najmanje 280px, isti blur i dva gradijenta, poster 150px desno (`styles.css:95-103`, `src/renderer/components/Hero.jsx:33-49`).
- Nema slike banera: AniList `bannerImage` ne tražimo, polja upita su `id idMal title cover genres seasonYear episodes duration description` (`00-nas-projekat.md` §1.8).

### 4.3 Razlika
Seanime ima veliki, „filmski” header (320–480px), više slojeva gradijenata i reakciju na skrol. Mi imamo kompaktan baner sa jedinstvenom bojom iz postera (naša prednost). Kod nas su akcije razbacane (iznad banera, u `select` poljima, u traci epizoda), a meta nije u headeru.

### 4.4 Preporuka
- **P1 — Preraspodela headera detalja** (`AnimeDetail.jsx`, `styles.css .banner*`): u `banner__body` staviti HUD red (godina · broj epizoda · trajanje), čipove žanrova i red akcija („▶ Nastavi ep N” kao primarno, „★ Zakači”, pilula statusa). `min-height: 260px`. Trud S / uticaj V.
- **P2 — AniList `bannerImage`** kao pozadina (dodati polje u upit u `src/main/anilist.js`), sa padom na zamućen poster (kao njihov „Blur when unavailable”). Trud S / uticaj S.
- **P2 — Levi gradijent** `linear-gradient(90deg, var(--bg) 20%, transparent 70%)` iza teksta (kao Hero, `styles.css:97`) radi čitljivosti. Trud N / uticaj S.
- **P3 — Reakcija na skrol** (baner bledi): ima smisla samo ako header postane visok; dok je kompaktan, ne treba. Trud S / uticaj N.
- Opis ostaje **skriven do klika** (`AnimeDetail.jsx:95-100`), u skladu sa pravilom „bez spojlera”. Seanime prikazuje opis u headeru i popupu.

---

## 5. Boje i tema

### 5.1 Kako oni rade
- Tokeni su **RGB trojke** zbog Tailwind alfe: `--color-brand-50…950`, `--color-gray-50…950` (`src/app/globals.css:23-73`; mapiranje `rgb(var(--color-brand-500) / <alpha-value>)`, `tailwind.config.ts:249-262`).
- Osnova: `--background: #070707`, `--foreground: gray.200`, `--brand: brand.300`, akcent `#6152df` (`globals.css:82-85`, `theme-hooks.ts:91-92`). U tamnom režimu `--border: rgba(255,255,255,.1)`, `--muted: rgba(255,255,255,.4)`, `--subtle: rgba(255,255,255,.06)` (`globals.css:157-166`). Radijus `0.5rem` (`:77-78`). `darkMode: "class"` (`tailwind.config.ts:6`).
- **Prilagođavanje teme** (`02-seanime-features.md` §20.2): uključi „color settings”, pa izaberi pozadinu i akcent ili preset iz banke (Seanime, Midnight, Deep purple, Desert flower, Pink, Sun, JJK, Rainforest — `src/lib/theme/theme-bank.ts:1-12`). `CustomThemeProvider` iz te dve boje izvodi ceo niz (`--paper`, `--border`, gray i brand skale) mešanjem preko `colord` (`src/components/shared/custom-theme-provider.tsx:14-79`). Podešavanja imaju živi pregled (`src/app/(main)/settings/_containers/ui-settings.tsx:339-412`).
- **Pozadinska slika** biblioteke sa providnošću (podrazumevano 10%) i blurom; custom baner sa pozicijom i providnošću (`theme-hooks.ts:96-103`); providnost sidebara (`:105`); globalni „blurring effects” (`:122`); **custom CSS** za desktop i mobilni (`:119-120`, `src/components/shared/custom-css-provider.tsx:6-18`).
- **Spojleri**: `hideAnimeSpoilers` sa pod-opcijama za thumbnail, naslov i opis, plus „preskoči sledeću” (`theme-hooks.ts:123-127`). Epizoda veća od progresa smatra se spojlerom (`src/lib/theme/anime-spoilers.ts:89-98`). Izuzetak po seriji čuva se u localStorage (`:24-27,53-82`). Slika dobija `blur-2xl scale-110`, naslov `blur-sm` (`src/app/(main)/_features/anime/_components/episode-card.tsx:142,248`).

### 5.2 Kako mi radimo
- 28 tokena u `:root` (`src/renderer/styles.css:1-28`): `--bg #0B0B16`, `--bg-elev #141428`, tri glass tokena, `--accent #8B5CF6`, `--accent-2 #22D3EE`, `--cta #F43F5E`, `--ok/--warn/--bad`, `--glow`, `--glow-cyan`, `--ease`, tri fonta. Pravila za hex i animacije zaključava test (`tests/unit/styles.test.js:8-23`).
- Dinamički akcent **po posteru** (`--poster-tint`, `posterTint.js:24-62`, `Hero.jsx:33`, `AnimeDetail.jsx:60`).
- Nema korisničkog izbora teme, pozadinske slike ni custom CSS-a. Postoji samo tamna tema.

### 5.3 Razlika
Seanime je neutralno crn sa jednim akcentom i nudi korisniku da ga prefarba. Mi imamo jaču, ručno dizajniranu paletu (ljubičasta + cijan + roza CTA + glass) i automatsku boju po posteru. Naši tokeni su **semantički** (`--cta`, `--ok`, `--glass-*`) i za ovaj obim čitljiviji od Seanime-ovih skala.

### 5.4 Preporuka
- **P2 — Preseti akcenta** (3–4: „Neon” (sadašnji), „Sakura”, „Matrix”, „Sunset”) kao blokovi `:root[data-theme="…"]` koji menjaju samo `--accent`, `--accent-2` i `--cta`. Hex vrednosti ostaju u `:root` selektorima, ali test (`tests/unit/styles.test.js:5`) gleda samo prvi `:root {` blok, pa ga treba proširiti da priznaje i `:root[data-theme]`. Podešavanje ide u `SettingsPage.jsx`, a primena u `App.jsx` preko `document.documentElement.dataset.theme`. Trud S / uticaj S.
- **P2 — Opcija „Ambijent iz postera”** (uključi/isključi `--poster-tint`) i jačina blura (`--blur`), umesto Seanime-ove pozadinske slike. Trud N / uticaj N.
- **P1 — Semantički tokeni za status** (vidi §10): `--status-watching`, `--status-completed`, `--status-planned`, `--status-paused`, `--status-dropped`. Trud N / uticaj S.
- **P3 — Custom CSS**: ne preporučuje se (CSP u `src/renderer/index.html:5`, plus održavanje).
- **Spojleri (P2, kad dodamo thumbnailove ili naslove epizoda)**: poštovati naše pravilo — sve posle odgledanog se zamućuje (`filter: blur()` je statičan, nije animacija, pa je dozvoljen). Sada nemamo ni thumbnailove ni naslove epizoda, pa tog rizika nema.

---

## 6. Tipografija

### 6.1 Kako oni rade
- Jedan font: **Inter Variable** sa sistemskim rezervama (`tailwind.config.ts:186-188`). U plejeru takođe Inter (`globals.css:566-570`).
- Naslovi: h1 `text-4xl font-extrabold tracking-tight lg:text-5xl`, h2 `text-3xl font-bold`, h3 `text-2xl font-semibold`, h4 `text-xl`, h5 `text-lg`, h6 `text-base` (`globals.css:359-381`).
- Kartica: naslov `text-sm lg:text-[1rem] font-medium`, meta `text-sm --muted` (`media-entry-card-components.tsx:565,569`); bedž `font-semibold tracking-wide` (`media-entry-progress-badge.tsx:22`). Dugmad od `text-xs` do `text-base`, visine 24–48px (`src/components/ui/button/button.tsx:63-69`).

### 6.2 Kako mi radimo
- Tri fonta: Russo One (display), Exo 2 (body 15px/1.5) i Chakra Petch (HUD, verzal, `letter-spacing .08em`) (`src/renderer/main.jsx:1-6`, `styles.css:24-26,31-34,48`).
- Skala: h2 22px, h3 17px, hero 34px, level-up 56px, meta 12px (`00-nas-projekat.md` §3.2). `h1` nema eksplicitnu veličinu (dobija podrazumevanih 2em).

### 6.3 Razlika
Naša tipografija ima mnogo više karaktera (display + HUD) i tu smo **bolji** za „gaming/anime” identitet. Seanime ima doslednu skalu za svih 6 nivoa, a kod nas je skala rasuta po komponentama i nema tokena.

### 6.4 Preporuka
- **P2 — Tokeni skale** u `:root`: `--fs-xs: 12px; --fs-sm: 13px; --fs-md: 15px; --fs-lg: 17px; --fs-xl: 22px; --fs-2xl: 34px`, pa zameniti doslovne vrednosti (`styles.css:33-34,67,100-101,120,142,153,186`). Dodati `h1 { font-size: var(--fs-2xl) }`. Trud N / uticaj S.
- **P2 — `font-variant-numeric: tabular-nums`** na `.hud`, da se brojevi („3/12”, tajmeri) ne pomeraju. Trud N / uticaj N.
- **P3 — `text-wrap: pretty`** za naslove kartica (Seanime koristi `text-pretty`, `media-entry-card-components.tsx:565`). Trud N / uticaj N.

---

## 7. Responsive ponašanje

### 7.1 Kako oni rade
- Tailwind breakpointi plus dodatni `3xl` 1600, `4xl` 1800, `5xl` 2000, `6xl` 2200, `7xl` 2400 (`tailwind.config.ts:170-177,190-196`).
- Ispod `lg` (1024): sidebar postaje drawer (`app-layout.tsx:55`), hover popup kartice se gasi (`media-entry-card-components.tsx:200`), baner detalja se zatamnjuje (`media-page-header-components.tsx:207-213`), continue-watching header se skriva (`continue-watching-header.tsx:128-129`).
- Grid ide od 2 do 8 kolona (`media-card-grid.tsx:6-8`). Na vrlo širokim ekranima tekst raste (`min-[2000px]:text-lg`, `media-entry-card-components.tsx:565`).

### 7.2 Kako mi radimo
- Jedan breakpoint `max-width: 960px`: sidebar ostaje samo sa ikonama (72px), kriju se labele, profil i semafor tekst, a poster u hero-u nestaje (`styles.css:199-205`). Najmanji prozor je 800×560 (`00-nas-projekat.md` §3.8).
- Grid je fluidan (`minmax(160px, 1fr)`, `styles.css:116`), pa breakpointi za kolone nisu potrebni.
- `.modal__box` ima `min-width: 400px` (`styles.css:168`), što pri 800px prolazi.

### 7.3 Razlika
Desktop app sa minimumom 800px ne treba mobilni raspored. Nedostaje nam samo prilagođavanje za **velike** ekrane (1440p/4K): kartice ostaju 160px i grid dobija 12+ sitnih kolona.

### 7.4 Preporuka
- **P2 — Skaliranje za široke prozore**: `@media (min-width: 1600px) { :root { --card-min: 190px; --rail-card-w: 180px } }` (vrednosti nisu boje, pa test prolazi), uz `.card-grid { grid-template-columns: repeat(auto-fill, minmax(var(--card-min), 1fr)) }`. Opciono `max-width: 1800px` za `.page`. Trud N / uticaj S.
- **P3 — Hero visina** `clamp(280px, 32vh, 420px)` umesto fiksnog `min-height: 280px` (`styles.css:95`). Trud N / uticaj N.

---

## 8. Mikro-interakcije

### 8.1 Kako oni rade
| Element | Vrednosti | Ref |
|---|---|---|
| Tooltip | Radix, `delayDuration 50ms`, `rounded-xl px-3 py-1.5 text-sm bg-gray-900`, `fade-in-50` + `slide-in-from-*-1` po strani | `src/components/ui/tooltip/tooltip.tsx:10-17,60` |
| Toast | Sonner, `top-right`, najviše 4 vidljiva, `z-[150]`, `rounded-xl backdrop-blur-sm`, `duration-200`, boje po tipu (success zelena, warning narandžasta, error crvena, info plava), dugmad za akciju i otkaz | `src/components/ui/toaster/toaster.tsx:10-95` |
| Dugme | `rounded-lg`, fokus `ring-1 ring-white/40 ring-offset-1`, hover/active preko `bg-opacity`, `disabled:opacity-50`; **nema** pomeraja na klik | `src/components/ui/button/button.tsx:10-69` |
| Kontekst meni | Radix, `min-w-[12rem] rounded-xl bg-[--paper-lighter] p-2 shadow-sm`, stavke `px-1.5 py-2 text-sm` | `src/components/ui/context-menu/context-menu.tsx:17,41`; na kartici `media-entry-card.tsx:261-283` |
| Command palette | `cmdk`, prečice `meta+j` i `q` (korisnik ih menja), pretraga, navigacija, akcije, spojleri | `src/app/(main)/_features/sea-command/sea-command.tsx:25`, isti folder: `sea-command-navigation.tsx`, `sea-command-spoilers.tsx` |
| Keyframes | `slide-down/up` 0.15s, `shake` 0.5s, `indeterminate-progress` 1s, podrazumevano trajanje animacije 0.25s | `tailwind.config.ts:197-241` |
| Animacije | `motion` ^12 u 33 fajla; spring za ulaske (`damping 20–26`, `stiffness 100–220`) | `package.json:106`, `continue-watching-header.tsx:141-152`, `media-page-header-components.tsx:266-276` |

### 8.2 Kako mi radimo
- **Toast**: jedan, centriran dole (`bottom: 24px`), `z-index: 25`, glass + akcent ivica + `--glow`, `fade-in 200ms`, 3000ms, `role="status"` (`src/renderer/components/Toast.jsx:4-15`, `styles.css:188`). Prikazuje se samo jedan istovremeno (`App.jsx:36`) i nema tipove (uspeh/greška).
- **Dugme**: na klik `translateY(1px)` (`styles.css:38`); hover menja pozadinu i ivicu **bez prelaza** (tranzicija je samo `transform, opacity`, `:36-37`); primarno dugme dobija CTA glow (`:42`); fokus `outline 2px var(--accent-2)`, offset 2px (`:39`).
- **Zvuk** na klik i navigaciju, sintetisan preko WebAudio (`src/renderer/sound.js`, `App.jsx:93,131`) — **Seanime nema zvučni feedback**.
- **Potvrda u dva koraka** za brisanje (`src/renderer/components/ConfirmButton.jsx:4-15`).
- **Level-up overlay** sa „beam” i „pop” animacijom (`styles.css:183-191`) — jedinstveno za nas.
- Nema tooltipa (osim `title` na semaforu i ćelijama aktivnosti — `Semaphore.jsx:7`, `ProfilePage.jsx:56`), kontekst menija ni command palette.
- Tastatura: prečice postoje u plejeru (`00-nas-projekat.md` §4.4) i Esc za pun ekran (`App.jsx:110-118`). Globalnih prečica (pretraga, navigacija) nema.

### 8.3 Razlika
Mi imamo bogatiji „juice” (zvuk, level-up, glow, pomeraj dugmeta), a Seanime ima bolju infrastrukturu (tooltip, red toastova sa tipovima, kontekst meni, command palette).

### 8.4 Preporuka
- **P1 — Red toastova sa tipovima** (`Toast.jsx` → `ToastStack`): do 3 naslagana, varijante `success/error/info` preko tokena (`--ok/--bad/--accent-2` za ivicu i glow), opciono dugme akcije („Poništi” pri brisanju sa watchlist-e). Pozicija ostaje dole u sredini (naš identitet). Trud S / uticaj S.
- **P1 — Globalne prečice**: `Ctrl+K` ili `/` fokusira pretragu (`#search-input` već postoji, `HomePage.jsx:63`), `Alt+←` nazad, `1–5` za stavke menija. Trud N / uticaj S.
- **P2 — Lagani tooltip** (CSS `[data-tip]` + `::after`, `opacity` 150ms, kašnjenje preko `transition-delay: 300ms`) za ikonična dugmad (▶, ★, strelice šine, pun ekran). Trud N / uticaj S.
- **P2 — Kontekst meni na karticama** (naša komponenta, `position: fixed` prema `clientX/Y`, glass + blur, zatvaranje na Esc ili klik van): Nastavi, Detalji, Zakači, Status ▸, Ukloni. Trud S / uticaj S.
- **P3 — Command palette** (`Ctrl+K`): za naš obim (5 strana) dovoljna je prečica za pretragu; puna paleta je preterana. Trud V / uticaj N.
- **P2 — Hover prelaz za pozadinu dugmeta** uz poštovanje pravila: sloj `button::before` sa `background: var(--glass-strong)` i `opacity 0→1`. Trud N / uticaj N.

---

## 9. Accessibility

### 9.1 Kako oni rade
- Radix primitivi (tooltip, context menu, dialog, select) daju fokus zamku, Esc i ARIA uloge (`01-seanime-arhitektura.md` §1.3, `package.json:33-50`).
- U `src/` ima malo eksplicitnih atributa: `aria-label` se pojavljuje **21 put**, a `role="` 31 put (grep po `*.tsx`).
- Kartica: link tela ima `focus-visible:ring-2 ring-[--brand]` (`media-entry-card-components.tsx:468`), a popup se otvara i na `focus-visible` (`:195-196`). Dugmad u popupu imaju `tabIndex={-1}` (`media-entry-card.tsx:335,354`), pa su Watch/Continue nedostupni tastaturom.
- Reduced motion: `motion-reduce:transition-none` na slikama (`media-entry-card-components.tsx:78`), `useReducedMotion` u tabovima (`src/components/ui/tabs/tabs.tsx:3`), izuzetak za View Transitions (`globals.css:299`). Ukupno 12 pogodaka za `prefers-reduced-motion|useReducedMotion|motion-reduce`.
- Kontrast: `--muted: rgba(255,255,255,.4)` na `#070707` (`globals.css:160`) daje približno 3,8:1 (sopstvena procena), što je ispod AA (4,5:1) za mali tekst.

### 9.2 Kako mi radimo
- 57 pogodaka za `aria-label|role="` u `src/renderer`; navigacija ima `aria-current="page"` (`Sidebar.jsx:19`); `XpBar` je `role="progressbar"` sa vrednostima (`XpBar.jsx:4`); dugmad za kačenje imaju `aria-pressed` (`WatchlistPage.jsx:79`); plejer je odvojen sa `inert` i `aria-hidden` (`App.jsx:140`).
- Reduced motion je globalan i jak: OS podešavanje **ili** prekidač u aplikaciji gasi sve animacije (`styles.css:207-211`, `App.jsx:98-102`), a level-up tada postaje toast (`App.jsx:32-35`). **Ovde smo bolji od Seanime-a.**
- Fokus je jasan: `outline 2px --accent-2` (`styles.css:39`).
- Nedostaci:
  - dijalozi `AskDialog`, `WhatsNewDialog` i `SetupWizard` imaju `role="dialog"`, ali nemaju `aria-modal`, zamku fokusa ni početni fokus (`AskDialog.jsx:12`, `WhatsNewDialog.jsx:15`, `SetupWizard.jsx:46`; `autoFocus` postoji samo u `ResumePrompt.jsx:9`). Esc zatvara samo `WhatsNewDialog` i `LevelUpOverlay` (`WhatsNewDialog.jsx:9-11`, `LevelUpOverlay.jsx:9-11`), a `AskDialog` nema ni Esc ni `aria-label`;
  - `Poster` ima `alt=""` (`Poster.jsx:20`), što je u redu jer naslov stoji pored, ali kartica u šini ima akcije bez vidljivog opisa;
  - `.card__meta` je `--text-muted` `#A3A3C2` na glass/`#0B0B16`, približno 7:1 (prolazi AA).

### 9.3 Razlika
Mi smo eksplicitniji u ARIA atributima i imamo bolji reduced-motion. Seanime dobija modal/meni pristupačnost „besplatno” od Radix-a, a mi je u dijalozima nemamo.

### 9.4 Preporuka
- **P0 — Dijalozi**: `aria-modal="true"`, `aria-labelledby`, početni fokus na primarnom dugmetu, zamka fokusa (Tab kruži unutar `.modal__box`), Esc zatvara, a fokus se vraća na okidač. Jedan zajednički `Modal.jsx` za `AskDialog`, `WhatsNewDialog` i `SetupWizard`. Trud S / uticaj V.
- **P1 — Brze akcije na kartici vidljive i na `:focus-within`**, ne samo na hover (vidi §10). Trud N / uticaj S.
- **P2 — Navigacija strelicama** kroz `.card-grid` i `.rail__track` (roving tabindex). Trud S / uticaj S.
- **P2 — `aria-live="polite"`** na `ToastStack`; za greške `role="alert"`. Trud N / uticaj N.

---

## 10. Predlog redizajna kartice (`Poster` + `SeriesCard` + watchlist kartica)

Cilj: zadržati glass/neon identitet, a dodati informacije **na posteru** (kao Seanime) bez hover popupa.

### 10.1 Novi tokeni (dodati u `:root`, `src/renderer/styles.css:1-28`)
```css
--card-ratio: 2 / 3;              /* ostajemo na 2:3 (AniList cover), Seanime je 3:4 */
--card-min: 160px;                /* grid; na >=1600px 190px (vidi §7) */
--rail-card-w: 160px;             /* sada 150px u .rail__track — uskladiti sa gridom */
--card-radius: 12px;              /* poster unutar glass okvira od 14px */
--dur-fast: 150ms;
--dur: 220ms;
--dur-slow: 400ms;
--card-zoom: 1.06;                /* Seanime koristi 1.1 */
--card-lift: -3px;
--badge-bg: color-mix(in srgb, var(--bg) 72%, transparent);
--poster-fade: linear-gradient(0deg, var(--scrim) 0%, transparent 55%);
--status-watching: var(--accent-2);
--status-completed: var(--ok);
--status-planned: var(--text-muted);
--status-paused: var(--warn);
--status-dropped: var(--bad);
--z-card-media: 0;
--z-card-fade: 1;
--z-card-badge: 2;
--z-card-actions: 3;
```
Nijedan token nije nova hex boja; sve se izvodi iz postojećih. Nove tokene vredi dodati u listu u `tests/unit/styles.test.js:10-12`.

### 10.2 Struktura (DOM)
```
div.card.media-card[data-status=watching]      ← glass okvir, ::after = glow sloj
 ├─ button.media-card__open (aria-label="Naslov — 3/12, gledam")
 │   ├─ div.media-card__media                    ← overflow:hidden, radius --card-radius, aspect --card-ratio
 │   │   ├─ img.poster (fade-in) | div.poster--skeleton | div.poster--empty
 │   │   ├─ span.media-card__fade                ← --poster-fade
 │   │   ├─ span.media-card__bar (gore, 3px)     ← progres, scaleX(ratio)
 │   │   ├─ span.media-card__status (gore levo)  ← tačka 8px u --status-*
 │   │   ├─ span.badge.badge--progress (dole levo)  "3/12" HUD
 │   │   └─ span.badge.badge--score (dole desno)    "★ 8" (samo watchlist)
 │   └─ span.card__title (line-clamp: 2)
 └─ div.media-card__actions (gore desno)         ← ▶ (CTA) i ★ (pin), sibling dugmad
```
`Poster.jsx` dobija prop `children` (overlay) i stanje `loading | loaded | missing`. `SeriesCard.jsx` i kartica u `WatchlistPage.jsx:70-85` prelaze na zajedničku `MediaCard.jsx`; kartica u pretrazi (`SearchPage.jsx:195-198`) koristi istu, bez bedževa.

### 10.3 Stanja i vrednosti
| Stanje | Šta se dešava | Vrednosti |
|---|---|---|
| **loading** | skeleton: `--glass-strong` pozadina + `::after` shimmer traka | `transform: translateX(-100% → 100%)`, 1.2s `linear` infinite; gasi se pod reduced-motion |
| **missing** | sadašnji `poster--empty` (ikona `film`) | bez promene (`styles.css:122`) |
| **loaded** | slika ulazi | `opacity 0→1` + `scale(1.02→1)`, `var(--dur-slow) var(--ease)` |
| **rest** | glass okvir, bedževi vidljivi, akcije sakrivene | akcije `opacity: 0; transform: translateY(-4px)` |
| **hover** | okvir se diže, slika zumira, glow se pali, akcije se pojavljuju | `.card` `translateY(var(--card-lift))`; `img` `scale(var(--card-zoom))`; `::after` (box-shadow `--glow`) `opacity 0→1`; akcije `opacity 1; translateY(0)`; sve `var(--dur) var(--ease)` |
| **focus-visible / focus-within** | kao hover + `outline 2px var(--accent-2)` na okviru | akcije vidljive i tastaturom |
| **active** (klik) | `translateY(0) scale(.98)` | `var(--dur-fast)` |
| **watching** | gornja traka `--accent-2` + `--glow-cyan`; ▶ CTA vidljiv | `data-status` bira `--status-*` |
| **completed** | traka puna u `--ok`, bedž „✓ 12/12” | bez ▶ (ili „ponovo”) |
| **pinned** | ★ u `--accent-2` (postojeće pravilo `styles.css:215`) | — |
| **disabled** (semafor nije zelen) | ▶ `opacity .45`, tooltip „Alati nisu spremni” | postojeće `button:disabled` (`styles.css:40`) |
| **reduced-motion** | nema zoom-a, lifta ni shimmer-a; glow i dalje (bez prelaza) | postojeći blok `styles.css:207-211` već sve gasi |

### 10.4 Bedževi (CSS skica, samo tokeni)
```css
.badge { position: absolute; z-index: var(--z-card-badge); padding: 2px 7px;
  font: 600 12px/1.4 var(--font-hud); letter-spacing: .06em;
  background: var(--badge-bg); backdrop-filter: blur(6px);
  border: 1px solid var(--glass-border); }
.badge--progress { left: 0; bottom: 0; border-radius: 0 var(--radius-sm) 0 var(--card-radius); }
.badge--progress .muted { color: var(--text-muted); }          /* "/12" kao kod Seanime-a */
.badge--score { right: 0; bottom: 0; border-radius: var(--radius-sm) 0 var(--card-radius) 0; color: var(--warn); }
.media-card__bar { position: absolute; inset: 0 0 auto; height: 3px; transform-origin: left;
  background: var(--status-watching); box-shadow: var(--glow-cyan); }
```
Inspiracija za ugaone bedževe je `media-entry-progress-badge.tsx:22` (zaobljen samo spoljni ugao), ali u našem HUD/glass stilu.

### 10.5 Šta namerno **ne** preuzimamo
- Hover popup sa opisom i trailerom (`media-entry-card-components.tsx:187-247,693-721`): rizik za spojlere, a ispod 1024px ni Seanime ga ne prikazuje.
- Pulsirajući bedž (`media-entry-card.tsx:458` `animate-pulse`): kod nas je „breathe” rezervisan za semafor (`styles.css:74`).
- Odnos 3:4: 2:3 bolje odgovara AniList coveru i našem hero/baner posteru.

---

## 11. Prioritizovane preporuke

| Prior. | Preporuka | Fajlovi | Trud / uticaj | § |
|---|---|---|---|---|
| **P0** | Pristupačni dijalozi: `aria-modal`, početni fokus, zamka fokusa, Esc, vraćanje fokusa; zajednički `Modal.jsx` | `components/AskDialog.jsx`, `WhatsNewDialog.jsx`, `pages/SetupWizard.jsx`, novi `components/Modal.jsx` | S / V | 9.4 |
| **P0** | Stilizovan scrollbar u tokenima | `styles.css` | N / S | 3.4 |
| **P1** | Redizajn kartice: overlay bedževi, traka na posteru, skeleton + fade-in, glow sa prelazom, zoom, `line-clamp` | `components/Poster.jsx`, `SeriesCard.jsx`, novi `MediaCard.jsx`, `pages/WatchlistPage.jsx`, `SearchPage.jsx`, `styles.css` | S / V | 1.4, 10 |
| **P1** | Istorija navigacije („Nazad”, `Alt+←`, taster miša 4) + pamćenje skrola | `App.jsx`, `pages/WatchlistPage.jsx`, `AnimeDetail.jsx` | S / V | 3.4 |
| **P1** | Header detalja: meta, žanr čipovi i akcije u baneru | `pages/AnimeDetail.jsx`, `styles.css` | S / V | 4.4 |
| **P1** | Red toastova sa tipovima i akcijom „Poništi” | `components/Toast.jsx`, `App.jsx`, `styles.css` | S / S | 8.4 |
| **P1** | Globalne prečice (`Ctrl+K` pretraga, `1–5` meni) | `App.jsx` | N / S | 8.4 |
| **P1** | Status tokeni `--status-*` | `styles.css` | N / S | 5.4 |
| **P2** | Maske ivica + scroll-snap na šini, uskladiti 150/160px | `styles.css` | N / S | 2.4 |
| **P2** | Tooltipovi (uski sidebar, ikonična dugmad) | `styles.css`, `Sidebar.jsx`, `SeriesCard.jsx` | N / S | 3.4, 8.4 |
| **P2** | Kontekst meni na karticama | novi `components/ContextMenu.jsx` | S / S | 8.4 |
| **P2** | Tokeni tipografske skale, `tabular-nums` | `styles.css` | N / S | 6.4 |
| **P2** | Preseti akcenta (`:root[data-theme]`) + proširenje testa | `styles.css`, `SettingsPage.jsx`, `App.jsx`, `tests/unit/styles.test.js` | S / S | 5.4 |
| **P2** | AniList `bannerImage` za detalj | `src/main/anilist.js`, `AnimeDetail.jsx` | S / S | 4.4 |
| **P2** | Skaliranje za široke prozore (`--card-min`) | `styles.css` | N / S | 7.4 |
| **P2** | Navigacija strelicama kroz grid i šinu | `HomePage.jsx`, `WatchlistPage.jsx` | S / S | 9.4 |
| **P3** | View Transitions, reakcija banera na skrol, command palette, hover popup, custom CSS | — | V / N | 3.4, 4.4, 8.4, 1.4 |

### Gde smo već bolji (ne dirati)
1. **Identitet**: glass + neon glow + tri fonta (display/body/HUD) naspram Seanime-ovog neutralnog crnog stila sa jednim Inter fontom (`styles.css:1-28`, `tailwind.config.ts:186-188`).
2. **Boja po posteru** (`posterTint.js`) — Seanime je nema; kod njih je akcent globalan (`custom-theme-provider.tsx:14-79`).
3. **Reduced motion**: globalan prekidač u aplikaciji + OS, plus zamena za level-up (`styles.css:207-211`, `App.jsx:32-35,98-102`); Seanime to rešava po komponentama (12 mesta).
4. **Feedback**: zvuk, level-up, `translateY(1px)` na klik — Seanime nema zvuk ni pomeraj dugmeta (`button.tsx:10-15`).
5. **Spojleri**: opis je podrazumevano skriven (`AnimeDetail.jsx:95-100`), a kartice ne prikazuju ništa iz radnje.
6. **ARIA**: 57 eksplicitnih `aria-label|role` u manjem kodu naspram 52 kod Seanime-a (21 + 31); tastatura dolazi do akcija kartice, dok su kod njih dugmad u popupu `tabIndex={-1}`.
