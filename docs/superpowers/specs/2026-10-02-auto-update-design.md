# AnimeDesk v0.3 — automatsko ažuriranje (spec)

Datum: 2026-10-02
Status: čeka pregled
Prethodni spec-ovi i dalje važe: `2026-09-30-animedesk-design.md`, `2026-10-01-redesign-gamification-design.md`.

## 1. Cilj

Kad objavimo novu verziju, korisnik je dobija iz same aplikacije: aplikacija sama otkrije i preuzme novu verziju, pokaže „Šta je novo” i na klik „Restartuj i ažuriraj” se ponovo pokrene kao nova verzija.

### Kriterijumi uspeha
- Korisnik sa 0.3.0, kada objavimo 0.3.1, vidi traku sa 0.3.1, klikne „Restartuj i ažuriraj”, aplikacija se ponovo pokrene kao 0.3.1, a watchlist, nivo, dnevnik i podešavanja su netaknuti.
- **Ništa se ne instalira bez klika** korisnika (uključujući zatvaranje aplikacije).
- Release bez `latest.yml` / `.blockmap` ne može da se objavi preko naše skripte.
- Greška u proveri ili preuzimanju nikad ne obara aplikaciju niti blokira njeno korišćenje.

### Van opsega
- Digitalno potpisivanje (code signing).
- Kanali (beta / stable), ručni izbor verzije, vraćanje na prethodnu verziju.
- Automatsko objavljivanje iz CI-ja (GitHub Actions) — objavljuje se lokalno, skriptom.
- Ažuriranje sa 0.1.0 / 0.2.0 (nemaju updater) — te verzije se jednom ručno nadograđuju na 0.3.0.

## 2. Ključne odluke

| Odluka | Izbor |
|---|---|
| Biblioteka | `electron-updater` (^6.8), GitHub provider iz postojećeg `electron-builder.yml` (`leqora/AnimeDesk`) |
| Preuzimanje | automatski u pozadini; prekidač „Automatski preuzimaj ažuriranja” (podrazumevano uključen); isključen → traka nudi „Preuzmi” |
| Instalacija | samo klikom na „Restartuj i ažuriraj” (`quitAndInstall`); `autoInstallOnAppQuit = false` |
| Provera | 10 s posle pokretanja, zatim svakih 6 h dok aplikacija radi, i dugme „Proveri ažuriranja”; isključeno kad aplikacija nije spakovana (`app.isPackaged === false`) |
| „Šta je novo” | pre ažuriranja (iz trake) i jednom posle ažuriranja na novu verziju |
| Beleške | `docs/releases/vX.Y.Z.md` u repozitorijumu; isti tekst na GitHub release i u aplikaciji; u aplikaciji se prikazuju kao čist tekst |
| Objavljivanje | `npm run release` (`scripts/release.mjs`) preko `gh` CLI |

## 3. Glavni proces — `src/main/updater.js`

`createUpdater({ autoUpdater, isPackaged, getSettings, notify, setTimeoutFn?, setIntervalFn?, now? })` — `autoUpdater` se ubacuje (u testovima lažni EventEmitter; u aplikaciji `require('electron-updater').autoUpdater`).

### Stanje (šalje se interfejsu)
```js
{
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error' | 'disabled',
  currentVersion: '0.3.0',
  version: '0.3.1' | null,        // nova verzija kad postoji
  percent: 0..100 | null,         // tokom preuzimanja
  notes: 'čist tekst' | null,     // beleške nove verzije
  lastCheckedAt: ISO | null,
  error: 'poruka' | null,
}
```
- `isPackaged === false` → `status: 'disabled'`, ništa se ne proverava.
- Događaji electron-updater-a → stanje: `checking-for-update` → `checking`; `update-not-available` → `none`; `update-available` → `available` (verzija, beleške); `download-progress` → `downloading` + `percent`; `update-downloaded` → `ready`; `error` → `error` (poruka; prethodno `ready` stanje se ne gubi ako je greška nastala pri novoj proveri).
- Svaka promena stanja → `notify(EVENTS.updateState, state)`.

### API
- `start()` — postavlja `autoUpdater.autoDownload = settings.autoDownloadUpdates`, `autoUpdater.autoInstallOnAppQuit = false`, zakazuje prvu proveru za 10 s i ponavljanje na 6 h.
- `check()` — `autoUpdater.checkForUpdates()`; greške (i odbijen promise) se hvataju i prevode u `status: 'error'`.
- `download()` — samo kad je `status === 'available'`: `autoUpdater.downloadUpdate()` (greške hvatane).
- `install()` — samo kad je `status === 'ready'`: `autoUpdater.quitAndInstall(false, true)`.
- `applySettings()` — ponovo postavlja `autoDownload` kad se prekidač promeni; ako je prekidač upravo uključen a stanje je `available`, odmah pokreće `download()`.
- `getState()`.

### Beleške — `releaseNotesToText(notes)` (čista funkcija, `src/shared/releaseNotes.js`)
- Ulaz: string (HTML ili tekst), niz `[{ version, note }]` ili `null`.
- Izlaz: čist tekst: `<br>`, `</p>`, `</li>`, `</h1-6>` → novi red; `<li>` → `• `; sve ostale oznake uklonjene (sadržaj `<script>`/`<style>` potpuno uklonjen); HTML entiteti (`&amp; &lt; &gt; &quot; &#39;`) dekodirani; više praznih redova sažeto na jedan; trim.
- Niz → spojeni tekstovi verzija, najnovija prva, sa naslovom `vX.Y.Z`.

## 4. „Šta je novo” posle ažuriranja

- Novo polje u podešavanjima: `lastSeenVersion` (string ili `null`; ne prikazuje se u UI).
- Pri pokretanju (glavni proces): ako je `lastSeenVersion` `null` → upiši trenutnu verziju i **ne** prikazuj ništa (prva instalacija ili nadogradnja sa verzije bez ovog polja).
- Ako je `lastSeenVersion` različita od trenutne verzije → interfejs dobija `{ version, notes }` za prikaz „Ažurirano na X” jednom; posle prikaza (ili zatvaranja) upisuje se trenutna verzija.
- Beleške trenutne verzije su ugrađene u build: `docs/releases/v<version>.md` se pri build-u kopira u aplikaciju (electron-vite `define`/import kao tekst), pa prikaz radi i bez interneta.
- Isto `lastSeenVersion` ostaje → ništa se ne prikazuje.

## 5. Interfejs

### Traka ažuriranja (`UpdateBanner.jsx`, iznad sadržaja stranice)
| Stanje | Tekst | Akcije |
|---|---|---|
| `available` (auto preuzimanje isključeno) | „Dostupna je verzija {version}” | „Šta je novo”, „Preuzmi” |
| `downloading` | „Verzija {version} se preuzima… {percent}%” | — (traka napretka) |
| `ready` | „Verzija {version} je spremna” | „Šta je novo”, „Restartuj i ažuriraj” |
| ostala stanja | traka se ne prikazuje | |

### Prozor „Šta je novo” (`WhatsNewDialog.jsx`)
- Naslov: „Šta je novo u {version}” (pre ažuriranja) ili „Ažurirano na {version}” (posle).
- Telo: beleške kao čist tekst (`white-space: pre-wrap`), skrol ako su duge.
- Dugmad: pre ažuriranja „Restartuj i ažuriraj” (u stanju `ready`) ili „Preuzmi” (u stanju `available`) + „Zatvori”; posle ažuriranja samo „Zatvori”.
- Escape i klik na „Zatvori” zatvaraju prozor.

### Podešavanja — nova sekcija „Ažuriranja”
- „Verzija {currentVersion}”.
- Prekidač „Automatski preuzimaj ažuriranja” (`autoDownloadUpdates`, podrazumevano `true`).
- Dugme „Proveri ažuriranja” (onemogućeno dok je `checking`/`downloading`; u stanju `disabled` prikazuje „Ažuriranja rade samo u instaliranoj aplikaciji”).
- Poslednja provera: vreme i rezultat („Imaš najnoviju verziju”, „Dostupna je verzija X”, „Provera nije uspela”).

### i18n
Svi novi tekstovi u `sr.json` i `en.json` (prefiks `update.*` i `settings.update*`).

## 6. IPC

- `INVOKE.updateGetState` (`update:get-state`), `INVOKE.updateCheck` (`update:check`), `INVOKE.updateDownload` (`update:download`), `INVOKE.updateInstall` (`update:install`), `INVOKE.whatsNewGet` (`whats-new:get` → `{ version, notes } | null`), `INVOKE.whatsNewSeen` (`whats-new:seen`).
- `EVENTS.updateState` (`event:update-state`).
- Preload: `window.animedesk.update = { getState, check, download, install, onState(cb) }`, `window.animedesk.whatsNew = { get, seen }`.
- `settings.update` sa `autoDownloadUpdates` → glavni proces poziva `updater.applySettings()`.

## 7. Objavljivanje — `scripts/release.mjs` (`npm run release`)

Koraci (svaki neuspeh prekida pre objavljivanja, sa jasnom porukom):
1. Verzija `V` iz `package.json`; tag `v<V>`.
2. Provere: radni folder čist (`git status --porcelain` prazan); trenutna grana `main`; lokalni `main` jednak `origin/main`; tag `v<V>` ne postoji ni lokalno ni na GitHub-u; postoji `docs/releases/v<V>.md` i nije prazan; `gh` je prijavljen.
3. `npm test` mora proći.
4. `npm run dist`.
5. Postoje tačno: `dist/AnimeDesk-Setup-<V>.exe`, `dist/AnimeDesk-Setup-<V>.exe.blockmap`, `dist/latest.yml`; `latest.yml` sadrži `version: <V>` i `path: AnimeDesk-Setup-<V>.exe`.
6. `gh release create v<V> <exe> <blockmap> <latest.yml> --target main --title "AnimeDesk <V>" --notes-file docs/releases/v<V>.md`.
7. Preuzimanje sva tri fajla nazad i poređenje SHA-256 sa lokalnim; ispis rezultata.

Pravila iz koraka 2 i 5 su čiste funkcije u `scripts/releaseChecks.mjs` (testirane); pozivi `git`/`gh`/`npm` se ubacuju, pa se skripta testira bez stvarnog objavljivanja.

## 8. Testiranje

1. `releaseNotesToText`: HTML → tekst, `<script>` uklonjen, entiteti, liste, niz verzija, `null`.
2. `updater.js` (lažni autoUpdater): `disabled` kad nije spakovano; `autoInstallOnAppQuit === false`; `autoDownload` prati podešavanje i `applySettings`; prelazi stanja za sve događaje; `download()`/`install()` samo u dozvoljenom stanju; greške (event i odbijen promise) → `error` bez izuzetka; prva provera posle 10 s i ponavljanje na 6 h (lažni tajmeri).
3. „Šta je novo” posle ažuriranja: `null` → upis bez prikaza; različita verzija → prikaz jednom; ista → ništa.
4. IPC: svi novi kanali imaju handler; `settings.update` sa `autoDownloadUpdates` poziva `applySettings`.
5. UI: tri oblika trake; „Šta je novo” (pre i posle, Escape); Podešavanja (verzija, prekidač, dugme, `disabled` poruka, rezultat provere); klik „Restartuj i ažuriraj” poziva `update.install`.
6. `releaseChecks.mjs`: prljav folder, pogrešna grana, postojeći tag, nedostaju beleške, nedostaje `latest.yml`/blockmap, pogrešna verzija u `latest.yml` → odbijeno; sve ispravno → prolazi.
7. Pravi prelaz (ručno, uz dogovor sa korisnikom): objaviti 0.3.0 → korisnik instalira → objaviti 0.3.1 → Playwright nad instaliranom aplikacijom potvrđuje traku sa 0.3.1 → korisnik klikne „Restartuj i ažuriraj” → potvrda da je instalirana 0.3.1 i da su podaci netaknuti; beleži se da li se pojavio SmartScreen.

## 9. Rizici

| Rizik | Ublažavanje |
|---|---|
| Release bez `latest.yml` pokvari ažuriranje svima | objavljuje se samo skriptom koja proverava sva tri fajla |
| Tiha instalacija pri zatvaranju | `autoInstallOnAppQuit = false` + test |
| HTML u beleškama izvrši kod | beleške samo kao čist tekst |
| Nepotpisana aplikacija → SmartScreen pri ažuriranju | dokumentovano; proverava se u pravom prelazu 0.3.0 → 0.3.1 |
| GitHub API limit (60/h bez tokena) | provera najviše svakih 6 h + ručno |
| Ažuriranje usred gledanja/preuzimanja | instalacija samo na klik; korisnik bira trenutak |
