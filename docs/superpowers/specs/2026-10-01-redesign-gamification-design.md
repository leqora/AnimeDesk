# AnimeDesk v0.2 — redizajn i gamifikacija (spec)

Datum: 2026-10-01
Status: čeka pregled
Prethodni spec: `2026-09-30-animedesk-design.md` (sva pravila iz njega i dalje važe, posebno pravilo bez spojlera)

## 1. Cilj

AnimeDesk dobija izgled „game launcher-a” za anime kulturu (moderan, futuristički) i lagane gaming elemente: nivo i XP, profil sa statistikom, zvuke i animacije za važne trenutke.

### Kriterijumi uspeha
- Aplikacija izgleda kao launcher (bočni meni, hero baner, staklene površine, neon akcenti), a sve postojeće funkcije rade kao pre.
- Naša slova (č ć š ž đ) se svuda prikazuju u istom fontu.
- Nivo i statistika se uvek mogu izračunati iz watchlist-e i dnevnika — nikad se ne „pokvare” i ne mogu da se razlikuju od stvarnih podataka.
- Level up se nikad ne prikazuje za stvari odgledane pre ove verzije, i nikad dvaput za isti nivo.
- Aplikacija radi bez interneta (fontovi i zvuci su ugrađeni/sintetizovani).

### Van opsega
- Dostignuća (achievements), rang liste, deljenje profila, više profila.
- Svetla tema.
- Promene funkcionalnosti gledanja/preuzimanja/watchlist-e (osim novog dnevnika i podataka za statistiku).

## 2. Vizuelni sistem

### 2.1 Pravac
Osnova: tamni „stakleni” launcher (mekše površine, boje izvučene iz postera). Akcenti: neon (aktivna stavka menija, semafor, XP traka, level up).

### 2.2 Tokeni (CSS custom properties u `styles.css`)

| Token | Vrednost | Upotreba |
|---|---|---|
| `--bg` | `#0B0B16` | pozadina aplikacije |
| `--bg-elev` | `#141428` | meni, modali (ispod stakla) |
| `--glass` | `rgba(255,255,255,0.06)` | kartice, paneli |
| `--glass-strong` | `rgba(255,255,255,0.10)` | hover, aktivno |
| `--glass-border` | `rgba(255,255,255,0.10)` | tanka ivica stakla |
| `--blur` | `16px` | `backdrop-filter` |
| `--text` | `#ECECF6` | glavni tekst |
| `--text-muted` | `#A3A3C2` | sporedni tekst (kontrast ≥ 4.5:1 na `--bg`) |
| `--accent` | `#8B5CF6` | neon ljubičasta — primarni akcenat |
| `--accent-2` | `#22D3EE` | cijan — aktivno, napredak, XP |
| `--cta` | `#F43F5E` | roze — glavna dugmad („Gledaj”, „Nastavi”) |
| `--ok` / `--warn` / `--bad` | `#22C55E` / `#EAB308` / `#EF4444` | semafor, statusi |
| `--poster-tint` | izračunato po seriji | hero i stranica serije |
| `--radius` / `--radius-sm` | `14px` / `8px` | |
| `--glow` | `0 0 18px color-mix(in srgb, var(--accent) 55%, transparent)` | neon sjaj |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | animacije |

Svaka boja se definiše samo kao token; komponente ne koriste sirove hex vrednosti.

### 2.3 Tipografija
Ugrađeni fontovi preko `@fontsource` paketa (OFL licenca, `.woff2` u bundle-u, bez mreže). Svi imaju `latin-ext` (naša slova).

| Uloga | Font | Gde |
|---|---|---|
| Naslovi, logo | **Russo One** | logo, h1/h2, hero naslov, level up |
| Tekst | **Exo 2** (400/500/600) | sav običan tekst i forme |
| HUD oznake | **Chakra Petch** (500/600) | brojevi epizoda, statusi, statistika, XP, semafor |

Bazna veličina 15px, line-height 1.5; HUD oznake u verzalu sa razmakom slova `0.08em`.

### 2.4 Ikone
`lucide-react` (ISC licenca), veličina 18/20px, `stroke-width` 1.75. Nijedan emoji kao ikona (zamenjuje se i placeholder postera).

### 2.5 Boja iz postera
`posterTint(dataUrl) → '#rrggbb'`: crta poster na mali canvas (32×48), računa prosečnu boju piksela sa zasićenjem iznad praga, pojačava zasićenje i ograničava svetlinu (da tekst preko nje ima kontrast). Neuspeh ili nema postera → `--accent`. Rezultat se kešira u memoriji po naslovu.

## 3. Raspored i ekrani

### 3.1 Okvir
- **Bočni meni** (levo, 232px; ispod 960px širine prozora sužava se na 72px sa samo ikonama):
  - logo „ANIMEDESK” (Russo One, gradijent `--accent → --accent-2`);
  - stavke: Početna, Watchlist, Preuzeto, Profil, Podešavanja (ikona + tekst); aktivna stavka ima neon traku levo i `--glow`;
  - dno: **semafor** (klik otvara wizard/detalje kao do sada), ispod njega **kartica profila** (inicijali u krugu, „LV 11”, titula, XP traka); klik vodi na Profil.
- **Sadržaj** desno, sa sopstvenim skrolom; meni ostaje fiksiran.
- Postojeći `Header.jsx` se zamenjuje komponentom `Sidebar.jsx`.

### 3.2 Početna (zamenjuje „Pretraga”)
1. **Hero baner** (visina ~280px):
   - ako postoji serija sa statusom „Gledam” i `lastWatchedAt`: najskorija takva serija. Pozadina je zamućen poster (`filter: blur(28px)`, uvećan) + gradijent u `--bg`, tint `--poster-tint`. Sadržaj: oznaka `NASTAVI GLEDANJE`, naziv (Russo One), `EP 05 / 24` + traka napretka, dugme „▶ Nastavi EP 06” (`--cta`, onemogućeno dok semafor nije zelen, kao i do sada) i „Detalji” (otvara stranicu serije); desno poster.
   - inače: pozdravni hero („Šta gledamo danas?”) sa poljem za pretragu u sebi.
2. **Pretraga** (polje + dugme), ista logika kao sada.
3. **Red „Gledam sada”**: horizontalna traka kartica serija sa statusom „Gledam” (najviše 10, najskorije prve); klik otvara stranicu serije.
4. Ispod: izbor animea / mreža epizoda / greške / „pušta se” — ista logika kao trenutni `SearchPage`, novi stil.

### 3.3 Watchlist i stranica serije
- Watchlist: isti filteri i sortiranje; kartice sa posterom preko cele kartice, HUD oznaka statusa i `EP x/y`, ocena kao `★ 8`.
- Stranica serije: baner preko cele širine (zamućen poster + `--poster-tint`), poster i naziv preko banera; ispod isti sadržaj kao sada (status, ocena, komentar, epizode sa beleškama, sakriven opis, „Nastavi gledanje”, uklanjanje).

### 3.4 Preuzeto i Podešavanja
Isti sadržaj, novi stil. Podešavanja dobijaju nove stavke (§6).

### 3.5 Profil (nova stranica)
- Zaglavlje: veliki inicijali, ime, `LV 11 · Veteran`, XP traka `1.240 / 1.500 XP` (do sledećeg nivoa).
- 4 HUD kartice: Epizode, Sati (`~`), Završene serije, Prosečna ocena.
- Omiljeni žanrovi: top 5 kao horizontalne trake.
- Niz dana: Lucide ikona `Flame` + `5 DANA`.
- Aktivnost: mreža 4 nedelje × 7 dana; intenzitet ćelije po broju epizoda (0, 1, 2–3, 4+), tooltip „N epizoda · datum”.
- Prazno stanje (nova instalacija): LV 1 · Početnik, sve nule, poruka „Odgledaj prvu epizodu da počneš”.

### 3.6 Wizard i dijalozi
Isti sadržaj, novi stil (staklo, Chakra Petch za statuse komponenti).

## 4. Podaci

### 4.1 Dnevnik gledanja — `src/main/watchLog.js`, fajl `watchlog.json`
```json
{ "version": 1, "entries": [ { "id": "uuid", "animeId": "uuid", "episode": 5, "at": "ISO", "source": "auto | manual" } ] }
```
- `append({ animeId, episode, source })` — dodaje unos.
- `removeLatest(animeId, episode)` — briše poslednji unos za tu epizodu (ako postoji).
- `list()` — kopija svih unosa.
- Upis atomski preko `jsonStore` (kao ostali fajlovi).

Integracija:
- `watchService.afterPlayback` (automatski) i `INVOKE.libraryRecord` („Pitaj pri zatvaranju” → Da) → `append(source:'auto')`, samo ako epizoda pre toga NIJE bila odgledana.
- `INVOKE.libraryUpdate` sa `watchedEpisodes`: za svaku novo dodatu epizodu `append(source:'manual')`, za svaku uklonjenu `removeLatest`.
- Brisanje serije iz watchlist-e briše i njene unose iz dnevnika.

### 4.2 Profil — fajl `profile.json`
```json
{ "version": 1, "lastLevel": 11 }
```
Ako fajl ne postoji (prvo pokretanje v0.2): izračuna se trenutni nivo i upiše bez događaja.

### 4.3 AniList
- Upit dobija polje `duration` (minuta po epizodi); `info.duration` (broj ili `null`).
- Novi `anilist.getCached(title, aniListId)` — vraća keširani info bez mrežnog zahteva (ili `null`).

### 4.4 Podešavanja (dopuna `DEFAULT_SETTINGS`)
| Ključ | Podrazumevano | Validacija |
|---|---|---|
| `profileName` | `null` (prikazuje se ime Windows naloga, `os.userInfo().username`) | string 1–32 znaka ili `null` |
| `soundKey` | `true` | boolean |
| `soundUi` | `false` | boolean |
| `soundVolume` | `60` | ceo broj 0–100 |
| `animations` | `true` | boolean |

## 5. Statistika i nivoi — `src/shared/stats.js` (čiste funkcije, bez I/O)

```js
xpFor({ entries }) → number
levelForXp(xp) → { level, title, xpIntoLevel, xpForNext }   // xpForNext = XP potreban od početka trenutnog do sledećeg nivoa
xpNeeded(level) → number                                      // ukupan XP za dostizanje nivoa: round(100 × (level − 1)^1.5)
computeStats({ entries, log, infoById, now, tzOffsetMinutes }) → {
  xp, level, title, xpIntoLevel, xpForNext,
  episodes, hours, completed, avgRating,        // avgRating: null kad nema ocena; jedna decimala
  topGenres: [{ genre, episodes }],              // top 5
  streakDays,
  activity: [{ date: 'YYYY-MM-DD', count }]      // tačno 28 dana, najstariji prvi, poslednji je danas
}
```
- **XP** = 10 × (broj odgledanih epizoda u svim serijama) + 50 × (serije sa statusom `completed`) + 5 × (serije sa ocenom).
- **Titule** (i18n ključevi `title.*`): LV1 Početnik/Rookie, LV5 Gledalac/Watcher, LV10 Veteran/Veteran, LV20 Elita/Elite, LV35 Sensei/Sensei, LV50 Legenda/Legend — važi najviša dostignuta.
- **Sati** = Σ (odgledane epizode × (`duration` ili 24)) / 60, zaokruženo na ceo broj.
- **Žanrovi**: svaka odgledana epizoda serije doprinosi svakom žanru te serije (iz `infoById`, tj. AniList keša); serije bez keša se preskaču.
- **Niz dana**: broj uzastopnih lokalnih dana sa ≥ 1 unosom u dnevniku, koji se završava danas ili juče; inače 0.
- **Aktivnost**: broj unosa po lokalnom danu za poslednjih 28 dana.

### 5.1 Događaji (main → renderer)
`src/main/progress.js` (`createProgress({ library, watchLog, anilist, file, notify, now })`):
- `snapshot()` → rezultat `computeStats` (za IPC `stats:get`).
- `check({ completedAnimeId? })` — poziva se posle svake promene watchlist-e/dnevnika: računa nivo, i ako je veći od `lastLevel` → `notify(EVENTS.levelUp, { level, title })` i upis novog `lastLevel`; ako je manji → samo upis (bez događaja). Ako je promena prevela seriju u `completed` → `notify(EVENTS.seriesCompleted, { title, xp: 50 })`.
- Prvo pokretanje bez `profile.json` → upis bez događaja.

Novi kanali: `INVOKE.statsGet = 'stats:get'`; `EVENTS.levelUp = 'event:level-up'`, `EVENTS.seriesCompleted = 'event:series-completed'`. „Preuzimanje završeno” se izvodi u renderer-u iz postojećeg `EVENTS.downloads` (prelaz stavke u `done`).

## 6. Zvuci, animacije, podešavanja

### 6.1 Zvuci — `src/renderer/sound.js`
Web Audio sinteza (bez fajlova). `createSound({ getSettings, audioContextFactory })` → `{ play(name) }`.

| Ime | Vrsta | Opis |
|---|---|---|
| `levelUp` | ključni | uzlazni durski akord (3 tona) + šum „sjaj”, ~0,8 s |
| `seriesCompleted` | ključni | kratka fanfara (2 tona), ~0,6 s |
| `downloadDone` | ključni | dvotonski „ding”, ~0,3 s |
| `click` | interfejs | kratak „tick”, ~40 ms |
| `navigate` | interfejs | filtrirani šum „whoosh”, ~150 ms |

- Ključni sviraju samo ako `soundKey`, interfejs samo ako `soundUi`; jačina `soundVolume / 100`.
- Ako zvuk već svira: novi ključni zvuk prekida zvuk interfejsa; `levelUp` ima prednost nad ostalim ključnim.
- `AudioContext` se pravi lenjo (pri prvom zvuku).

### 6.2 Animacije
- Promena stranice: `opacity 0→1` + `translateY(6px→0)`, 200 ms `--ease`.
- Level up (`LevelUpOverlay.jsx`): poluprovidna zavesa, neon „zrak” koji prelazi ekran, natpis `LEVEL UP · LV 11 · Veteran`, XP traka se puni; nestaje posle 2 s ili na klik/Escape.
- Serija završena (`Toast.jsx`): traka u dnu sa Lucide ikonom `Check` i tekstom `ZAVRŠENO · Naziv · +50 XP`, 3 s.
- Hover kartica: `translateY(-2px)` + `--glow`; XP trake animiraju `transform: scaleX`.
- Semafor žut: lagano „disanje” (opacity).
- Animira se samo `transform` i `opacity`.
- `animations: false` ili `prefers-reduced-motion: reduce` → bez pokreta: level up je samo `Toast`, prelazi trenutni (CSS klasa `reduce-motion` na korenu).

### 6.3 Podešavanja (UI)
Nova sekcija „Profil i zvuk”: ime na profilu (polje, prazno = ime Windows naloga), ključni zvuci, zvuci interfejsa, jačina (klizač + dugme „Probaj”), animacije.

## 7. i18n
Svi novi tekstovi u `sr.json` i `en.json` sa istim ključevima (test pokrivenosti već postoji). Novi prefiksi: `nav.home`, `nav.profile`, `home.*`, `profile.*`, `title.*`, `levelup.*`, `toast.*`, `settings.profileName`, `settings.sound*`, `settings.animations`.

## 8. Fajlovi

```
src/shared/stats.js                    NOVO  čiste funkcije XP/nivo/statistika
src/main/watchLog.js                   NOVO  dnevnik gledanja
src/main/progress.js                   NOVO  nivo, lastLevel, događaji
src/main/anilist.js                    IZMENA duration, getCached
src/main/settings.js                   IZMENA nova podešavanja, profileName default
src/main/ipc.js, src/preload/index.js  IZMENA stats:get, nova podešavanja, događaji, dnevnik
src/main/watchService.js               IZMENA upis u dnevnik
src/main/index.js                      IZMENA povezivanje
src/shared/channels.js                 IZMENA novi kanali
src/renderer/styles.css                PREPISANO tokeni, staklo, fontovi
src/renderer/theme/posterTint.js       NOVO
src/renderer/sound.js                  NOVO
src/renderer/components/Sidebar.jsx    NOVO (zamenjuje Header.jsx)
src/renderer/components/ProfileCard.jsx, XpBar.jsx, Hero.jsx, LevelUpOverlay.jsx, Toast.jsx, Icon.jsx  NOVO
src/renderer/pages/HomePage.jsx        NOVO  Hero + red „Gledam sada” + postojeći SearchPage (logika SearchPage-a se ne menja, samo se renderuje unutar Početne)
src/renderer/pages/ProfilePage.jsx     NOVO
ostale stranice/komponente             IZMENA samo markup/klase
package.json                           + lucide-react, @fontsource/russo-one, @fontsource/exo-2, @fontsource/chakra-petch
```

## 9. Testiranje
TDD kao u v0.1.
1. **`stats.js`**: XP formula; `xpNeeded` (LV2 = 100, LV10 = 2.700); titule na granicama (LV 9/10, 19/20…); sati sa i bez `duration`; prosečna ocena (null kad nema); žanrovi; niz dana (danas, juče, prekid od 1 dana, preko ponoći u lokalnoj zoni); aktivnost tačno 28 dana; prazni podaci → LV1, 0 XP; poništena epizoda smanjuje XP.
2. **`watchLog.js`**: append, removeLatest, brisanje po seriji, atomski upis, oštećen fajl.
3. **`progress.js`**: bez `profile.json` → nema događaja; prelazak nivoa → tačno jedan `levelUp`; pad nivoa → nema događaja; završena serija → `seriesCompleted`.
4. **Integracija main**: auto/ručno označavanje upisuje dnevnik; poništavanje briše; brisanje serije čisti dnevnik; `stats:get` vraća snapshot.
5. **`sound.js`** (lažni AudioContext): poštuje `soundKey`/`soundUi`/jačinu; prioritet `levelUp`.
6. **`posterTint.js`**: tamni/svetli/sivi poster i neuspeh → razumna boja ili `--accent`.
7. **UI**: Sidebar navigacija i aktivna stavka; kartica profila; hero „Nastavi” (i pozdravni bez serija, dugme onemogućeno kad semafor nije zelen); red „Gledam sada”; Profil (brojke, prazno stanje); level up se prikaže i nestaje na klik; `reduce-motion` → toast umesto overlay-a; nova podešavanja.
8. **Postojeći testovi** se prilagođavaju novom markup-u, ali nijedno ponašanje koje testiraju se ne gubi.
9. **Na kraju**: i18n pokrivenost, build, e2e smoke, živi test, Playwright vožnja prave aplikacije.

## 10. Rizici

| Rizik | Ublažavanje |
|---|---|
| `backdrop-filter` usporava na slabijim grafičkim | blur samo na meniju, hero-u i modalima; kartice koriste providnu boju bez blur-a |
| Statistika pogrešno broji dane zbog vremenskih zona | dnevnik čuva ISO (UTC), grupisanje po lokalnom danu sa eksplicitnim offset-om; testovi preko ponoći |
| „Level up” eksplozija posle nadogradnje | prvo pokretanje bez `profile.json` samo zapisuje nivo |
| Zvuci smetaju | zvuci interfejsa podrazumevano isključeni; jačina; prekidač |
| Kontrast teksta preko boje postera | tint ograničene svetline + tamni gradijent ispod teksta; test na svetlom posteru |
