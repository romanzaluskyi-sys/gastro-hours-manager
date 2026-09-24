# Gastro Hours Manager — kontekst projektu

> Ten plik czyta Claude Code automatycznie przy starcie w tym repo. Zawiera
> pełen kontekst: architekturę, znane błędy (już naprawione — nie wprowadzaj
> ich ponownie), oraz plan rozwoju produktu.

## Co to za projekt

MVP do rejestracji godzin pracy dla sieci gastronomicznej (4 lokale w Polsce:
Bułka i Jacek, Marynata i Chińczyk, Ceglana, Sunset). Pracownicy odbijają
rozpoczęcie/zakończenie zmiany, kierownicy zarządzają grafikiem i godzinami,
dane synchronizują się też ze starym systemem opartym na Google Forms +
Sheets, który był używany przed tą aplikacją.

Produkt nazywa się **Shiftro** (nazwa wybrana 2026-09-09; domeny
`shiftro.pl` i `shiftro.team`). Nazwa siedzi w `PRODUKT` w `src/config.ts` i
da się ją nadpisać przez `REACT_APP_PRODUKT` — obok niej stoi `TENANT`, czyli
nazwa konkretnej sieci-klienta. Nie wpisuj żadnej z nich na sztywno w
komponentach.

Znak (logo, wariant 1a "Zsuw") żyje jako **inline SVG** w
[`src/components/ShiftroMark.tsx`](src/components/ShiftroMark.tsx), a nie jako
plik w `public/` — harnessy ładują komponenty prosto w przeglądarce, bez
serwera CRA, więc `%PUBLIC_URL%` i ścieżki z `public/` tam nie działają.
Statyczny plik został tylko dla favikony (`public/shiftro-favicon.svg`), którą
ładuje przeglądarka, nie React. `tone="dark"` dla sidebara. Znak jest zawsze
kwadratowy i bez zaokrągleń — reszta UI ma `rounded`, on nie. Stoi w trzech
miejscach: ekran logowania, sidebar kierownika i nagłówek Tabletu Służbowego.

⚠️ Sam termin **"Tablet Służbowy" zostaje w słowniku aplikacji** — tak nazywa
się typ konta w karcie pracownika ("Konto Służbowe (Tablet lokalu)"), tak mówi
o nim Przewodnik i ta dokumentacja. Marka zastąpiła tylko NAPIS w nagłówku
tego jednego ekranu, nie pojęcie.

Pierwszym klientem jest sieć "Gastro Emka" (cztery lokale wymienione wyżej);
drugi klient — pilotaż u innej właścicielki — jest w przygotowaniu, stąd cała
sekcja "Konfiguracja najemcy" niżej.

## Stack techniczny

- **Frontend**: React 18 + TypeScript (create-react-app / react-scripts 5),
  Tailwind CSS **przez CDN** w `index.html` (nie ma kompilatora Tailwind —
  tylko podstawowe klasy narzędziowe, żadnych `@apply` czy configów).
- **Ikony**: `lucide-react`
- **Baza danych**: Supabase (Postgres + REST/PostgREST). Klucz w kodzie to
  `sb_publishable_...` (respektuje RLS — każda nowa tabela potrzebuje
  polityki RLS pozwalającej na insert/select, inaczej zapisy/odczyty cicho
  zawodzą bez widocznego błędu w UI).
- **Hosting**: Vercel, auto-deploy z GitHub. Zalecany flow: branch → PR →
  Vercel Preview URL → test → merge → prod. Rollback: Vercel Dashboard →
  Deployments → wybierz poprzedni → "Promote to Production" (natychmiastowy,
  bez gita).
- **Synchronizacja z Google Sheets**: Google Apps Script (`Odbior_Danych.gs`)
  — `doPost` odbiera zapisy z aplikacji i pisze do arkuszy per-lokal;
  `syncFormEntriesToSupabase()` czyta historyczne wpisy z Google Forms i
  wstawia je do Supabase (uruchamiane cyklicznie triggerem czasowym).
- **Cron**: Vercel Cron (`vercel.json` → `crons`), NIE Supabase Edge
  Function — wybrane świadomie, żeby zostać na jednym stacku (Vercel +
  zwykły `fetch` do Supabase REST, ten sam styl co reszta `api/`) bez
  dokładania Supabase CLI/Deno do projektu. Funkcje cron żyją w
  root-level `api/` (konwencja Vercel Functions — **osobne** od
  `src/api/`, które jest wbudowywane do bundla Reacta; `tsconfig.json`
  ma `include: ["./src/**/*"]`, więc `api/` na roocie świadomie NIE jest
  przez niego pokrywane). Każda funkcja cron wymaga nagłówka
  `Authorization: Bearer $CRON_SECRET` — zmienna `CRON_SECRET` musi być
  ustawiona w Vercel → Project Settings → Environment Variables, inaczej
  wywołania z harmonogramu dostaną 401.
  ⚠️ **Pliki w root-level `api/` pisz jako zwykły CommonJS `.js`, NIE
  `.ts`.** Vercel buduje je osobnym, legacy `tsc`-pipeline'em (innym niż
  babel, który kompiluje CRA) i stara wersja `typescript` w `package.json`
  (4.4.4, patrz błąd #4 niżej — nie da się jej bezpiecznie podbić bez
  ryzyka zepsucia reszty builda) powoduje tam błąd `TS6046` i zepsutą
  kompilację (`SyntaxError: Cannot use import statement outside a module`
  w runtime, mimo że sam build się "kończy sukcesem"). Sprawdzone na
  `api/cron/check-document-terms.js` — jeśli dodajesz kolejną funkcję
  cron, pisz ją tak samo: `.js`, `module.exports = async (req, res) => {}`,
  bez `import`/`export`, bez importów z `src/` (duplikuj potrzebne parę
  linijek zamiast importować — patrz komentarz na górze tego pliku).

## Konfiguracja najemcy (tenant) — od 0.33.0

Model silo: **jeden repozytorium, N klientów**, każdy z własnym projektem
Supabase i własnym projektem Vercel. Wszystko, co różni klientów, siedzi w
zmiennych środowiskowych — pełna procedura uruchomienia nowego klienta jest w
[`docs/NOWY-KLIENT.md`](docs/NOWY-KLIENT.md).

Do 0.32.0 klucze stały **w kodzie, w sześciu miejscach** (`src/config.ts` plus
cztery crony w `api/cron/`). Przy takim stanie "drugi klient" znaczył "kopia
repozytorium", a każda kolejna poprawka musiałaby być wklejana ręcznie w obie
kopie. Jeśli kiedykolwiek pojawi się pokusa dopisania czegoś
klientozależnego wprost do kodu — to jest ten moment.

Front: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY`,
`REACT_APP_GOOGLE_SCRIPT_URL`, `REACT_APP_TENANT`, `REACT_APP_PRODUKT`.
Crony (`api/cron/*.js`, runtime): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`CRON_SECRET` (od 3c-1 — patrz niżej; `SUPABASE_KEY` czyta już tylko
`api/admin/ustaw-haslo.js`). Te same wartości trzeba wpisać dwa razy — to dwa różne
mechanizmy (build-time DefinePlugin kontra runtime `process.env`).

⚠️ **`src/config.ts` musi mieć `// @ts-nocheck`.** Do 0.32.0 był jedynym
plikiem w `src/` bez tej linii, bo składał się z samych literałów. Odczyt
zmiennych dokłada funkcje pomocnicze, a `strict: true` wywala wtedy TS7006 na
nietypowanych parametrach — build lokalnie przechodzi (babel typów nie
sprawdza), a pada dopiero na Vercelu. Jedyny plik w `src/` bez tej linii to
dziś `index.tsx`, który jest w pełni otypowany.

⚠️ **Pułapki `src/config.ts`, obie sprawdzone eksperymentalnie:**
- CRA podmienia CAŁE wyrażenie `process.env` na literał obiektu, i robi to
  **przez dopasowanie tekstu**. Dlatego `process.env` występuje w tym pliku
  dosłownie dokładnie raz, a dalej czytamy ze zwykłego obiektu.
- Osłoną jest `try/catch`, a **nie** `typeof process !== "undefined"`.
  DefinePlugin podmienia `process.env`, ale samego `process` już nie — więc
  `typeof process` w zbudowanej paczce daje `"undefined"`, warunek się nie
  spełnia i konfiguracja spada na fallback, czyli na bazę PIERWSZEGO klienta.
  Cicha awaria najgorszego rodzaju: aplikacja działa, tylko pokazuje cudze
  dane.

⚠️ **Fallbacku na dane pierwszego klienta NIE MA od 0.41.0 — ani w
`src/config.ts`, ani w żadnym z pięciu kronów. Nie dopisuj go z powrotem.**
Do 0.40.0 stał w sześciu miejscach jako bezpiecznik na czas wdrażania modelu
silo (bez niego merge 0.33.0 zgasiłby produkcję, zanim ktokolwiek ustawi
zmienne). Bezpiecznik zrobił swoje i zamienił się w pułapkę odwrotną do
zamierzonej: wdrożenie NOWEGO klienta bez ustawionych zmiennych po cichu
czytało i **zapisywało** bazę pierwszego, wyglądając przy tym na sprawne.

Co się dzieje dziś, gdy zmiennych brakuje:
- **front** — `isConfigured` jest `false` i App renderuje
  [`KonfiguracjaBrak.tsx`](src/components/KonfiguracjaBrak.tsx): ekran z listą
  brakujących zmiennych (`brakujaceZmienne` w `config.ts`) zamiast logowania;
- **crony** — 500 z nazwą brakującej zmiennej zamiast zapisu gdziekolwiek.
  ⚠️ Przy okazji naprawione: nieustawiony `CRON_SECRET` sprawiał, że
  `` `Bearer ${process.env.CRON_SECRET}` `` dawało dosłowne `"Bearer undefined"`
  — czyli brakująca zmienna OTWIERAŁA endpoint każdemu, kto wyśle taki nagłówek.
  Sprawdzenie obecności sekretu stoi teraz PRZED porównaniem nagłówka.

⚠️ `REACT_APP_TENANT` świadomie **nie** wchodzi do `isConfigured` — brak nazwy
klienta nie jest powodem, żeby zgasić działającą aplikację. Wchodzi za to do
`brakujaceZmienne`, a tam, gdzie nazwa najemcy stoi na ekranie (logowanie,
sidebar kierownika), pusta wartość renderuje się jako czerwone
„⚠ brak REACT_APP_TENANT". Nazwa najemcy dalej jest JEDYNYM widocznym gołym
okiem sygnałem, czyją bazę czyta to wdrożenie — ale przestała być sygnałem
fałszywie uspokajającym, bo nie ma już domyślnej wartości „Gastro Emka".

⚠️ **Zmienne muszą być ustawione dla Production, Preview i Development.**
Ustawione tylko dla produkcji dają podgląd PR-a z ekranem „brak konfiguracji" —
każdy PR wygląda wtedy na zepsuty, choć zepsute są ustawienia projektu.

⚠️ **Harnessy nie przechodzą przez build CRA**, więc nie mają skąd wziąć
zmiennych. Ten, który ich potrzebuje, ustawia `window.__SHIFTRO_ENV` PRZED
załadowaniem modułu (`harness-karta.html` — prawdziwa baza, `harness-app.html`
— atrapa wyglądająca jak prawdziwa, bo `api/supabase` jest tam podmienione).
To jedyna droga podania konfiguracji z pominięciem builda i ma być jawna:
harness sięgający do prawdziwej bazy musi mieć to napisane u siebie.

## Logowanie i dostęp do danych — W TRAKCIE (Etap 3, od 0.41.0)

⚠️ **Stan na dziś: wszystkie polityki RLS to `using (true)`, a PIN-y porównuje
PRZEGLĄDARKA** po pobraniu całej tabeli `users`. Klucz publishable jedzie w
paczce do każdego, kto otworzy stronę, więc każdy, kto zna adres, może odczytać
i zapisać wszystko — stawki, daty urodzenia, PIN-y. Migracja `0025` NIE
zmieniła tego; dołożyła tylko fundament. Nie opisuj tego systemu jako
zabezpieczonego, dopóki Etap 3c nie jest zrobiony.

**Kto się faktycznie loguje** (29 aktywnych kont, pomiar z 2026-09-20):
4 kierowników + 4 tablety (e-mail + 6-cyfrowy `pin`) i 4 pracowników z
prywatnym telefonem (e-mail + `kiosk_pin`). **Pozostałych 17 nie loguje się
w ogóle** — wybiera się ich z listy na tablecie, który jest już zalogowany.
Dlatego kont w Auth jest 12, nie 29.

⚠️ **Tożsamością na wspólnym tablecie jest TABLET, nie pracownik** (decyzja
właściciela, 2026-09-20). Urządzenie stoi w lokalu pod fizyczną kontrolą i to
jest jego zabezpieczenie; logowanie przed każdym odbiciem zabiłoby sens kiosku.
Konsekwencja, którą trzeba znać: RLS zawęzi tablet do JEGO lokalu, ale
wewnątrz lokalu nie odróżni, która osoba odbija — tak samo jak dziś.

⚠️ **PIN docelowo ma wszędzie co najmniej 6 znaków** (Supabase Auth nie
przyjmie krótszego hasła). Podnosi je `scripts/utworz-konta-auth.py`,
dopisując `01` — także kontom BEZ e-maila, żeby na tablecie nie powstała
mieszanka długości (klawiatura ma zatwierdzać sama, a nie prosić o "OK").

⚠️ **To siedzi za osobną flagą `--podnies-piny`** i do 0.41.1 nie wolno jej
było użyć: `KioskDashboard.tsx` miał zaszyte `length === 4` w dwóch miejscach
i zatwierdzał sam na czwartej cyfrze, więc podniesiony PIN zablokowałby tym
osobom wejście na tablecie — nazajutrz rano, przed zmianą.

**Od 0.41.2 PIN ma DOKŁADNIE sześć cyfr i zatwierdza się sam**
(`DLUGOSC_PIN = 6` w `KioskDashboard.tsx`) — tak jak wcześniej cztery, bez
przycisku i bez potwierdzania. 0.41.1 miała przejściowo dwa progi (sześć
zatwierdzało samo, od czterech przycisk "Otwórz"); właściciel odrzucił to
jako zbędne dotknięcie płacone kilkanaście razy dziennie przy urządzeniu
obsługiwanym jedną ręką w biegu. Przycisku nie ma i nie dokładaj go.

⚠️ **Od 0.42.1 PIN-u sprawdza BAZA** (`api.rpc("sprawdz_kiosk_pin", …)` w
`KioskDashboard.tsx`, migracja `0027`). Trzy rzeczy, które z tego wynikają i
których nie widać przy ręcznym kliknięciu:
1. **Kłódkę przy nazwisku rysuje kolumna wyliczana `users.ma_kiosk_pin`**, nie
   obecność PIN-u. Helper `maPin()` spada z powrotem na `kiosk_pin`, gdy tej
   kolumny nie ma — baza bez migracji `0027` inaczej po cichu odblokowałaby
   wszystkie profile przy samej aktualizacji aplikacji.
2. **Błąd wywołania to NIE zły PIN.** Sprawdzenie wymaga teraz sieci, a wi-fi w
   kuchni pada kilka razy dziennie; komunikat „niepoprawny PIN" kazałby
   człowiekowi wpisywać w kółko coś, co jest dobre. Stąd osobny tekst o
   połączeniu i profil, który przy błędzie zostaje ZAMKNIĘTY (fail-closed).
3. **`sprawdz_kiosk_pin` wpuszcza też WYPOŻYCZONYCH** — wersja z `0025`
   sprawdzała sam `default_lokal`, a ekran wyboru osoby pokazuje również tych,
   których opublikowany grafik stawia dziś tutaj. Okno grafiku to wczoraj–jutro,
   bo baza liczy `current_date` w UTC, a lokale pracują w czasie polskim.

⚠️ **Wynika z tego twardy warunek na dane: KAŻDY ustawiony `kiosk_pin` musi
mieć sześć cyfr.** Krótszego nie da się na tym ekranie wpisać, więc profil z
PIN-em czterocyfrowym jest nie do otwarcia — nie "trudniej", tylko wcale.
Pole w karcie pracownika ma `maxLength="6"` (0.41.2), ale wiersze sprzed tej
wersji trzeba poprawić ręcznie.

**Etapy** (3a zrobione, reszta nie):
- **3a — fundament.** Migracja `0025`: `users.auth_id`, helpery
  `moje_konto`/`moja_rola`/`widzi_wszystko`/`moje_lokale` i RPC
  `sprawdz_kiosk_pin`. Konta zakłada `scripts/utworz-konta-auth.py`
  (SUCHY przebieg domyślnie, wymaga klucza SERVICE ROLE z pominięciem repo).
  Nic jeszcze tego nie używa.
- **3b — logowanie przez Auth. ZROBIONE w 0.42.0.** Klient GoTrue
  ([`api/auth.ts`](src/api/auth.ts), sprawdzian `harness-auth.html`),
  `api/supabase.ts` wysyła token użytkownika i ponawia raz po 401, LoginScreen
  nie pobiera już `users` ani nie porównuje PIN-u, App wznawia sesję z Auth i
  pobiera dane DOPIERO po zalogowaniu, a `api/admin/ustaw-haslo.js` pilnuje,
  żeby PIN w karcie i hasło w Auth były tą samą rzeczą.

  ⚠️ **Blokada PIN-em na tablecie przeszła na RPC w 0.42.1** (pierwsza część
  3c-2, migracja `0027`). Do 0.42.0 tablet porównywał wpisane cyfry z kolumną
  `kiosk_pin`, którą pobierał razem z całą tabelą `users` — czyli PIN-y
  wszystkich osób z lokalu leżały w pamięci urządzenia stojącego na sali.
  Dziś pyta `sprawdz_kiosk_pin` i dostaje wyłącznie tak/nie. Świadomie zrobione
  DOPIERO po `0026`: dopóki polityki były otwarte, osobny deploy tej zmiany
  niczego by nie zabezpieczył, bo tablet i tak czytał `users`.

  ⚠️ **Trzy rzeczy w `api/auth.ts`, których nie widać przy ręcznym
  logowaniu, a każda wyłącza lokal:**
  1. **Refresh tokeny ROTUJĄ.** Drugie odświeżenie zużytym tokenem unieważnia
     całą sesję, a `App.tsx` startuje od `Promise.all` z pięcioma
     zapytaniami — stąd jedno wspólne `trwajaceOdswiezenie` zamiast pięciu
     równoległych. Bez tego użytkownik wylatuje dokładnie przy wejściu.
  2. **Brak sieci to NIE powód do wylogowania.** Tablet w kuchni traci wi-fi
     kilka razy dziennie; wyjątek z `fetch` zostawia sesję nietkniętą, a
     dopiero ODPOWIEDŹ serwera, że token jest nieważny, ją czyści.
  3. **`odswiezPoBledzie` istnieje osobno**, bo zegar tabletu bywa
     przestawiony: token "ważny jeszcze 40 minut" według urządzenia może być
     martwy według serwera, więc samo wyprzedzające odświeżanie nie
     wystarcza — potrzebna jest reakcja na 401.
- **3c — zawężenie polityk.** Rozbite na trzy, bo to trzy różne rozmiary
  ryzyka i tylko pierwszy nie dotyka aplikacji:
  - **3c-1 (migracja `0026`, gotowa):** anonim traci WSZYSTKO. Zalogowani
    widzą dokładnie to, co widzieli — ani jeden ekran się nie zmienia. To jest
    największa część bezpieczeństwa za najmniejsze ryzyko: dziś do danych
    wystarczy adres strony, po tej migracji trzeba konta.
  - **3c-2:** zawężenie per lokal. Rozbite na porcje, bo tabele różnią się
    ryzykiem. Zrobione: blokada PIN-em na RPC (0.42.1, `0027`) i **porcja 1
    polityk** (`0031`) — patrz „Dane lokalu" niżej. Zostają tabele „ludzkie"
    (`shifts`, `grafik_shifts`, `absences`, `issues`, `notifications`,
    `shift_swaps`, `task_completions`) oraz warunek na wiersze w `users_widok`.
  - **3c-3 — ZROBIONE w 0.43.0** (migracje `0029` i `0030`). `GRANT` działa na
    ROLĘ, a kierownik i pracownik to oboje `authenticated`, więc rozróżnienie
    daje **widok `users_widok`** maskujący kolumny zależnie od tego, kto pyta.
    Szczegóły niżej, w „Kartoteka pracownika".

  ⚠️ **Regresją jest [`scripts/sprawdz-dostep.py`](scripts/sprawdz-dostep.py)**
  — chodzi po WSZYSTKICH tabelach (bierze listę z migracji, nie z pamięci) i
  sprawdza odczyt oraz zapis. Od 0.43.0 ma też sekcję **KARTOTEKA**: bierze
  `users_widok` oczami zalogowanego i sprawdza CUDZE wiersze — czy stawki, dane
  osobowe, PIN-y i notatki faktycznie są puste, czy tabela `users` wydaje sam
  własny wiersz i czy zapis do niej jest zamknięty. ⚠️ Uruchom ją kontem
  TABLETU albo pracownika: kierownik ma widzieć wszystko, więc jego kontem nie
  da się tego zmierzyć (skrypt mówi to wprost zamiast udawać „OK"). Ekran, na
  którym „lista pracowników jest", nie mówi nic o tym, CO w tej liście
  przyjechało. Zapis testuje `PATCH`-em z filtrem, który nie
  trafia w żaden wiersz: dostajemy odpowiedź "czy wolno" bez dotykania danych.
  Uruchom `--etap przed` PRZED migracją (zdjęcie stanu) i `--etap po` po niej.

  ⚠️ **Crony i skrypty chodziły jako ANONIM** — `api/cron/*.js` oraz
  `import-grafik.py`/`backfill-pogoda.py` autoryzowały się kluczem
  publishable. Po 3c-1 przestałyby cokolwiek zapisywać, więc wszystkie sześć
  przeszło na `SUPABASE_SERVICE_KEY` (kod serwerowy i skrypty właściciela to
  miejsca, w których klucz z pełnymi prawami jest na miejscu). Przy okazji
  zniknął ostatni wpisany w kod klucz klienta.

  ⚠️ **Jedyny wyjątek w `0026`: anonim może ZAPISAĆ do `app_errors`** (INSERT
  tak, SELECT nie). Awaria, która najbardziej potrzebuje śladu, zdarza się
  przed zalogowaniem — komponent wywala się na ekranie logowania i zostaje
  biała strona. Bez tego wyjątku dokładnie ta klasa błędów byłaby niewidoczna.

  ⚠️ **Stara, nieodświeżona karta przeglądarki przestaje działać po 3c-1** i
  wygląda to na błąd uprawnień w bazie. Bundle sprzed 0.42.0 wysyłał żądania
  kluczem publishable, czyli jako anonim — dopóki anonimowi było wszystko
  wolno, działało. Objaw: `permission denied for table ...` przy zapisie i
  puste listy przy odczycie, u zalogowanego kierownika, na jednym urządzeniu,
  gdy na innych jest dobrze. Lekarstwo to odświeżenie strony; `UpdateBanner`
  mówi o tym sam, ale pasek trzeba zauważyć. **Sprawdź to PRZED szukaniem
  dziury w GRANT-ach** (22.09.2026 zdarzyło się dokładnie to).

  ⚠️ **Poza repo zostaje Google Apps Script** (`syncFormEntriesToSupabase`),
  który pisze do Supabase własnym kluczem. Nie widać go stąd — jeśli używa
  publishable, po 3c-1 przestanie działać i zrobi to po cichu.

### Dane lokalu zostają w lokalu (migracja `0031`, Etap 3c-2 porcja 1)

Do `0031` każde zalogowane konto — w tym cztery tablety stojące w salach —
czytało utargi, cele finansowe, wymagania obsady, godziny otwarcia i
checklisty WSZYSTKICH lokali. Dziś:

| Tabele | Kto widzi | Predykat |
|---|---|---|
| `day_logs`, `day_log_entries`, `staffing_rule_sets`, `grafik_wyjatki`, `lokale_godziny` | swój lokal | `widzi_lokal()` |
| `tasks`, `task_blocks`, `day_log_templates` | swój lokal **albo ten, w którym dziś pracuję** | `pracuje_w_lokalu()` |
| `staffing_rules` | przez `set_id`/`wyjatek_id` | oba skoki naraz |
| `grafik_budzet_cele`, `grafik_budzet_dni` | swój lokal **i tylko kierownik** | + `jest_kierownikiem()` |
| `shift_edits` | tylko kierownik | `jest_kierownikiem()` |
| `app_errors` | pisze każdy, czyta tylko admin | `widzi_wszystko()` na SELECT |

⚠️ **`pracuje_w_lokalu()` istnieje dla WYPOŻYCZONYCH.** Pracownik ma w karcie
lokal macierzysty, a stoi dziś gdzie indziej — sama `widzi_lokal` zabrałaby mu
checklistę tam, gdzie faktycznie pracuje. Dotyczy WYŁĄCZNIE zadań i tego, co
się mierzy; utargi i budżet zostają przy `widzi_lokal`, bo do pracy na sali nie
są potrzebne.

⚠️ **`lokale` i `stanowiska` zostają OTWARTE świadomie.** Formularz „Popraw
zmianę" używa pełnych słowników, bo opisuje przeszłą zmianę, która mogła być w
innym lokalu — zawężenie zabrałoby wypożyczonemu możliwość poprawienia własnej
zmiany. To same nazwy, bez danych osobowych.

**Porcja 2 (migracja `0033`)** — „czyje to dane": `notifications`, `issues`,
`absences`, `shift_swaps`, `task_completions` i WIERSZE `users_widok`. Trzy
rzeczy, które trzeba znać:
- ⚠️ **Tablet widzi wiadomości WSZYSTKICH osób ze swojego lokalu** —
  `imiona_moich_ludzi()`, nie samo swoje imię. Koperta przy nazwisku na liście
  wyboru jest jedynym sygnałem, że ktoś ma nieprzeczytaną wiadomość; nikt nie
  wchodzi na wspólnym urządzeniu na cudzą stronę.
- ⚠️ **`with check (true)` na tych tabelach jest ŚWIADOME.** Powiadomienie
  tworzy się DLA KOGOŚ INNEGO — pracownik budzi kierownika, kierownik
  odpowiada pracownikowi. Warunek zapisu lustrzany do odczytu zablokowałby to,
  po co te tabele istnieją.
- ⚠️ **Zgłoszenie anonimowe nie ma `user_id`**, więc nie da się z niego
  odczytać lokalu — polityka wpuszcza je KAŻDEMU kierownikowi. Inaczej wraca
  błąd z 0.32.0: znaczek w menu liczył zgłoszenie, którego ekran nie pokazywał.
- ⚠️ **Pytanie „w którym lokalu jest ta osoba" ma w tej bazie DWIE
  odpowiedzi**: `default_lokal` (pracownik) i `allowed_lokale` (tablet,
  kierownik). Konta tabletów mają `default_lokal` PUSTY — `KioskDashboard.tsx`
  czyta `allowed_lokale`. Pierwsza wersja `0033` pytała tylko o
  `default_lokal`, więc cztery tablety wypadły kierownikowi z kartoteki i
  przestał móc nimi administrować (`users_widok` 42→37, `notifications`
  553→537). Naprawia to `0034`: odpowiedź siedzi w JEDNYM miejscu —
  `moi_ludzie()` — i pytają o nią zarówno polityki, jak i widok.
- ⚠️ **Wiersz BEZ żadnego lokalu zostaje widoczny dla kierownika** (konto
  właściciela). Wiersz, którego nie widzi nikt, znika z administracji po cichu.

⚠️ **W polityce RLS każde wywołanie funkcji owijaj w PODZAPYTANIE SKALARNE:**
`kolumna = any ((select public.funkcja()))`, nigdy `any (public.funkcja())`.
Podzapytanie bez odwołań do wiersza planer robi InitPlanem i liczy RAZ; gołe
wywołanie — zwykle raz na wiersz, nawet gdy funkcja jest `stable` i bez
argumentów. To ten sam powód, dla którego w Supabase pisze się
`(select auth.uid())`. Owijaj też wywołania WEWNĄTRZ funkcji pomocniczych:
`moi_ludzie()` woła `moje_lokale()` w `where` nad `users`, czyli raz na każdego
z 42 pracowników.

⚠️ **Nie pisz też `funkcja_z_argumentem(kolumna)`** — argument z wiersza
gwarantuje wywołanie na każdy wiersz i żadne owijanie tego nie uratuje.
Dlatego `kolumna = any (…)` zamiast `widzi_lokal(kolumna)`. Wynik logiczny ten sam, koszt różni się o
rząd wielkości: `widzi_lokal(lokal)` w polityce `notifications` (553 wiersze)
dał `57014 — canceling statement due to statement timeout`, a na Tablecie
Służbowym **wszystkie wiadomości zniknęły** — `loadNotifications` w `App.tsx`
celowo nie przerywa reszty, więc awaria wygląda jak „nikt nic nie napisał"
(23.09.2026, naprawione w `0035`). Tabele z `0031` przeżyły tę samą pomyłkę
tylko dlatego, że mają po kilkadziesiąt wierszy. **Zanim zawęzisz `shifts`
(3071 wierszy) czy `grafik_shifts` (1613), sprawdź kształt predykatu.**

⚠️ **Sposób, w jaki to wyszło, jest wart zapamiętania.** Kierownik z KOMPLETEM
lokali po zawężeniu per lokal nie ma prawa stracić ani jednego wiersza — więc
każdy spadek u niego to perezawężenie. Zmierz nim PRZED i PO każdą kolejną
porcję (`--zapisz` / `--porownaj`); konto tabletu pokazuje drugą stronę, że
zawężenie w ogóle zadziałało. Te dwa konta razem obejmują obie pomyłki.

⚠️ **`shifts` i `grafik_shifts` zostały POZA obiema porcjami i to nie jest
zapomnienie.** Mają udowodnione wyjątki: widok miesiąca POKAZUJE kierownikowi
zmiany jego ludzi w CUDZYCH lokalach (ustalenie właściciela, patrz 5c), a
`ostrzezeniaKodeksu` liczy odpoczynek przez wszystkie lokale naraz. Do tego
3071 i 1613 wierszy, na których pomyłka wygląda jak pusty ekran, nie jak błąd.
Godziny są też mniej wrażliwe niż czyjaś wiadomość — dlatego idą na końcu.

⚠️ **Zdejmując politykę, ENUMERUJ ją z `pg_policies` — nigdy nie wypisuj nazw
z pamięci.** Polityki permisywne składają się przez LUB, więc JEDNA
zapomniana, otwarta polityka unieważnia każdą następną: nowa wygląda w
katalogu poprawnie i nie robi nic. `0026` brała listę TABEL z `pg_tables`
(żeby nie zapomnieć o nowej), ale listę NAZW POLITYK wypisała ręcznie — i pięć
tabel miało nazwy spoza tej listy (`tasks_open_all`, `task_blocks_open_all`,
`task_completions_open_all`, `notifications_public_all`, `"open access"`).
Skutek: od `0026` do `0032` każde ZALOGOWANE konto czytało cudze powiadomienia,
wykonania zadań i historię korekt, a `0031` nie zawęziło zadań ani bloków.
Znalazł to dopiero inwentarz `pg_policies` — polecenie stoi na końcu `0032`
i **warto je puścić po każdej migracji ruszającej polityki**: tabela z liczbą
polityk > 1 (poza `app_errors` x3 i `users` x2) to polityka unieważniająca
sąsiadkę.

⚠️ **Polityka RLS zwraca MNIEJ WIERSZY, nie błąd.** To zaleta (ekran, który
tych danych nie używa, dostaje pustą listę zamiast „permission denied") i wada
przy diagnozie: pustej listy nie odróżnisz okiem od dnia, w którym nic się nie
działo. Dlatego `scripts/sprawdz-dostep.py` ma `--zapisz` i `--porownaj`:
zdjęcie liczby wierszy per tabela PRZED migracją i różnica PO niej. **Bez tego
porównania nie wdrażaj kolejnej porcji 3c-2.**

### Kartoteka pracownika — kto co widzi (0.43.0, migracje `0029`/`0030`)

**Aplikacja czyta listę załogi WYŁĄCZNIE przez `users_widok`** — dwa miejsca:
`App.tsx` (pierwszy fetch i poll) oraz `wczytajKonto` w `api/auth.ts`. Zapis
idzie dalej wprost do tabeli `users`. Dokładając odczyt kartoteki, użyj widoku;
`harness-app.html` sprawdza to wprost (rejestruje, o co App pytał, i wywraca
się na odczycie z `users`).

Trzy poziomy widoczności w widoku:
- **jawne** — `id, auth_id, name, role, active, archived, default_lokal,
  default_stanowisko, allowed_lokale, allowed_stanowiska, probny_*, puls_do,
  ma_kiosk_pin, typ_umowy, etat, wymiar_etatu, created_at`. ⚠️ Dane umowy są tu
  świadomie: z nich liczy się NORMA GODZIN w Raporcie pracownika, a Raport
  pokazuje się także na tablecie, gdzie patrzącym nie jest właściciel konta. To
  są godziny, nie pieniądze — `stawka` i `wynagrodzenie_mies` zostają zakryte.
- **własne albo kierownik** — `email, pin, kiosk_pin, stawka,
  wynagrodzenie_mies, telefon, data_urodzenia, data_zatrudnienia,
  sanepid_*, umowa_*, ostatni_dzien`.
- **tylko kierownik** — `notatki` i jej ślad. To notatnik prowadzącego, nie
  dokument dla zainteresowanego.

⚠️ **Widok ma prawa WŁAŚCICIELA (bez `security_invoker`) i to jest cały
mechanizm.** Z prawami wołającego potrzebowałby od niego uprawnienia do
`users` — a wtedy każdy pominąłby widok i odpytał tabelę wprost. Konsekwencja:
widok NIE przechodzi przez RLS `users`, więc **warunek 3c-2 na WIERSZE trzeba
będzie dopisać w `where` widoku**, a nie w polityce tabeli.

⚠️ **Lista kolumn w widoku jest wypisana ręcznie — to świadome.** Kolumna
dopisana w przyszłości ma NIE przeciekać sama z siebie. Ceną jest ryzyko
pominięcia czegoś, co aplikacja czyta, więc `0029` kończy się zapytaniem
wypisującym kolumny `users`, których w widoku nie ma. **Dodając kolumnę do
`users`, dopisz ją do widoku** i zdecyduj, do którego poziomu należy.

⚠️ **Zapis do `users` tylko dla kierownika** (`admin`/`manager`/
`manager_lokalu`, helper `widzi_kartoteke()`). Maskowanie odczytu przy otwartym
zapisie byłoby teatrem: nie przeczytasz cudzej stawki, ale przestawisz sobie
`role` na `admin`. Dlatego tablet zakłada osobę na próbę przez RPC
`dodaj_probnego` (`utils/probni.ts`), a nie INSERT-em — warunki sprawdza baza.

⚠️ **Kolejność wdrożenia jest DWUSTOPNIOWA i nie wolno jej skleić.** `0029`
(widok + RPC) idzie PRZED deployem, bo nowy bundle pyta o `users_widok`.
`0030` (polityki na tabeli) DOPIERO PO deployu i po odświeżeniu tabletów, bo
stary bundle pyta o `users` i po tej migracji dostanie z niej sam swój wiersz —
czyli pustą listę osób na ekranie wyboru.

⚠️ **Helpery MUSZĄ być `security definer` i `stable`, z `set search_path`.**
Polityka na `users`, która czyta `users` po rolę, zapętliłaby się bez definera;
`volatile` kazałoby Postgresowi wołać funkcję raz na wiersz (przy `shifts` to
dziesiątki tysięcy wywołań na jedno wejście w Rejestr Godzin); bez
`search_path` ktoś podstawia własną tabelę `users` pod funkcję działającą z
prawami właściciela.

⚠️ **`moje_lokale()` i `hasAccessToLokal` w `ManagerDashboard.tsx` muszą mówić
to samo** — puste `allowed_lokale` u kierownika sieci znaczy "wszystkie". Gdy
się rozjadą, ekran pokaże coś, czego baza nie wyda (albo odwrotnie), a to
wygląda jak losowa awaria, nie jak błąd uprawnień.

⚠️ **Zmiana cudzego hasła wymaga klucza SERVICE ROLE**, którego front mieć nie
może — dlatego robi to [`api/admin/ustaw-haslo.js`](api/admin/ustaw-haslo.js).
Funkcja weryfikuje token wołającego W SUPABASE (samodzielne rozkodowanie JWT
bez sprawdzenia podpisu znaczyłoby tyle, co uwierzenie na słowo komuś, kto
właśnie prosi o zmianę cudzego hasła), sprawdza rolę i — dla
`manager_lokalu` — czy pracownik jest z jego lokalu. Zakłada też konto, gdy
pracownik dostaje e-mail i PIN po raz pierwszy.

⚠️ **Wymaga NOWEJ zmiennej `SUPABASE_SERVICE_KEY` w Vercelu.** Bez niej
endpoint zwraca 500 z wyjaśnieniem, a kierownik widzi "PIN na tablecie
zmieniony, ale hasło do logowania NIE". Klucz omija RLS — nigdy w repo, nigdy
z przedrostkiem `REACT_APP_`, nigdy w przeglądarce.

## Struktura plików

Frontend jest rozbity na moduły wg odpowiedzialności (refaktoryzacja z
jednego pliku `App.tsx` — Roadmap punkt 0, zrobione w całości, łącznie z
zakładką powiadomień dla kierowników). Każdy plik komponentu/modułu ma
`// @ts-nocheck` na górze, tak jak miał oryginalny `App.tsx` — kod nie
jest w pełni otypowany, nie usuwaj tej linii przy edycji istniejących
plików (chyba że robisz świadomą migrację do prawdziwych typów).

```
api/                         — root-level, POZA src/ — funkcje Vercel Cron
  cron/
    check-document-terms.js    — codzienna weryfikacja terminów sanepid/umowy,
                                 patrz Roadmap punkt 1 i sekcja "Cron" wyżej
    check-porzucone.js         — codzienne przypomnienie o zmianach bez
                                 odbitego końca (pracownik + kierownik),
                                 patrz "Zmiany bez zakończenia" niżej
  admin/
    ustaw-haslo.js             — zmiana PIN-u pracownika RAZEM z hasłem jego
                                 konta w Auth; wymaga SUPABASE_SERVICE_KEY,
                                 patrz "Logowanie i dostęp do danych" wyżej
vercel.json                  — harmonogram crona
.github/workflows/ci.yml     — CI na każdym PR-ze: zgodność numeru wersji i
                                 przebieg harnessów. ⚠️ Świadomie BEZ zadania
                                 `npm run build` — Vercel buduje każdy PR jako
                                 Preview i drugi build mówiłby to samo
CHANGELOG.md                 — historia wersji, patrz "Wersjonowanie i CHANGELOG" niżej
docs/GRAFIK.md               — pełna specyfikacja Grafiku z uzasadnieniami decyzji właściciela
docs/KOPIE-ZAPASOWE.md       — co obejmuje kopia, czego NIE obejmuje, kolejność
                                 odtwarzania i ćwiczenie odtworzenia
docs/sql/migrations/          — migracje, stosowane przez scripts/migrate.py (NIE ręcznie w SQL Editor)
docs/sql/tools/               — zapytania pomocnicze (zrzut schematu, weryfikacja Grafiku,
                                 ostatnie-bledy.sql — dziennik błędów aplikacji)
scripts/migrate.py            — runner migracji, domyślnie SUCHY przebieg
scripts/sprawdz-dostep.py     — co widzi i co może zmienić ktoś, kto ma sam
                                 klucz z paczki; regresja Etapu 3c, NICZEGO
                                 nie zapisuje (zapis sprawdza PATCH-em w
                                 filtr, który nie trafia w żaden wiersz)
scripts/utworz-konta-auth.py  — zakłada konta w Supabase Auth dla tych 12 kont,
                                 które faktycznie się logują, i podnosi PIN-y
                                 do 6 znaków; SUCHY przebieg domyślnie
scripts/sprawdz-wersje.py     — czy numer wersji stoi ten sam w czterech
                                 miejscach (config.ts, version.json,
                                 CHANGELOG.md, Przewodnik.tsx); woła go CI
scripts/harness-ci.cjs        — uruchamia harness-*.html bez głowy (Playwright).
                                 ⚠️ Kontrakt: harness kończy pracę zmieniając
                                 `#status` albo dopisując "ZDANYCH n, OBLANYCH m"
                                 do `#out`, a awarię oznacza klasą "zle" albo
                                 słowem "BŁĄD". harness-karta.html jest pominięty
                                 (jako jedyny rozmawia z prawdziwą bazą)
scripts/import-grafik.py     — import grafiku z arkusza Google (domyślnie SUCHY przebieg)
public/
  version.json                — { "version": "X.Y.Z" }, czytany przez
                                 UpdateBanner.tsx — patrz "Wersjonowanie i
                                 CHANGELOG" niżej
src/
  index.tsx                  — punkt wejścia (bez zmian)
  App.tsx                    — globalny stan, fetch danych z Supabase, routing widoków
  config.ts                  — konfiguracja NAJEMCY (zmienne środowiskowe),
                                 TENANT/PRODUKT, isConfigured, APP_VERSION —
                                 patrz "Konfiguracja najemcy" niżej
  types.ts                   — (jeszcze nie istnieje — miejsce na wspólne typy przy przyszłej migracji)
  api/
    supabase.ts               — obiekt `api` (get z paginacją/post/patch/
                                  delete/patchByFilter/rpc). `rpc` istnieje po
                                  to, żeby zadać bazie pytanie BEZ pobierania
                                  danych, na których opiera się odpowiedź —
                                  i rozróżnia błąd wywołania od odpowiedzi "nie" 
    googleSheets.ts            — sendToGoogleSheets, toLocalYMD
    auth.ts                    — logowanie przez Supabase Auth (GoTrue) pisane
                                  ręcznie na fetchu: zaloguj/odswiez/token/
                                  wyloguj, sesja w localStorage. Patrz
                                  "Logowanie i dostęp do danych" wyżej
    errors.ts                  — zapiszBlad/ustawKontekstBledow/
                                  wlaczGlobalneNasluchy: dziennik błędów do
                                  tabeli app_errors, patrz "Błędy" niżej
    notifications.ts           — createManagerNotification(lokal, message, type),
                                  createEmployeeNotification(userName, message, type)
  utils/
    format.ts                 — getShort, getDayOfWeek, getMonthName, getAvailableYears, formatNotificationText
    shifts.ts                  — findOverlappingShift, getTodaysShiftsForUser
    corrections.ts              resolveCorrection/askAboutCorrection —
                                  wspólna logika zatwierdzania korekt godzin
                                  (Zatwierdzanie zmian + inline w Rejestr
                                  Godzin), patrz "Panel kierownika" niżej
    grafik.ts                   cała arytmetyka Grafiku: kontrola obsady
                                  (addytywne wymagania, dziury w godzinach),
                                  zmiany przez północ, plan vs fakt,
                                  publikacja (publishGrafik), widok
                                  pracownika (publishedShiftsFor — filtruje
                                  niewysłane i oznaczone do usunięcia).
                                  NIE duplikuj tego w komponentach.
    budzet.ts                   CAŁA arytmetyka pieniędzy w Grafiku: koszt
                                  godziny (z narzutem), cel dnia, koszt i
                                  zapas dnia, podsumowanie tygodnia. NIE licz
                                  kosztu grafiku nigdzie indziej — patrz
                                  "Budżet Grafiku" niżej.
    umowy.ts                    typ umowy, norma miesięczna, koszt lokalu i
                                  bilans okresu rozliczeniowego — patrz
                                  "Umowa, norma i koszt" niżej. NIE licz
                                  kosztu pracownika nigdzie indziej.
    swaps.ts                    giełda zmian — jedyne miejsce piszące do
                                  shift_swaps i przepisujące zmianę na
                                  innego pracownika (resolveSwap)
    porzucone.ts                zmiany zaczęte i niezakończone: progi lokalu,
                                  rozpoznanie (czyPorzucona/zmianaTrwa) i
                                  decyzja kierownika. NIE licz nigdzie indziej,
                                  czy zmiana wciąż trwa — patrz "Zmiany bez
                                  zakończenia" niżej
    probni.ts                   pracownik na próbę dodany z Tabletu: kto czeka
                                  na decyzję, jak powstaje konto i co robi
                                  zatwierdzenie/odrzucenie
    tasks.ts                    bloki zadań i pomiary: blokiNaDzien/
                                  zadaniaNaDzien/buildEmployeeBlocks/
                                  toggleTaskCompletion/
                                  zapiszWykonanieZPomiarem/
                                  poprawPomiarZadania/BLOKI_STARTOWE —
                                  cała logika modułu Zadania, patrz sekcja
                                  "Zadania — bloki i pomiary" niżej. NIE
                                  duplikuj jej w ZadaniaISprzatanie.tsx,
                                  ZadaniaKonfiguracja.tsx ani w
                                  employeeSessionShared.tsx.
    pola.ts                     definicja PÓL do wpisania (parsePola,
                                  polaSzablonu, pozaNormaPola, opisNormy,
                                  slugKlucza) — wspólna dla dziennika i dla
                                  zadań z pomiarem. Osobny plik, bo
                                  dziennik.ts importuje z tasks.ts i
                                  sięgnięcie w drugą stronę zrobiłoby cykl.
  components/
    ErrorBoundary.tsx           siatka pod całym drzewem (index.tsx) — ekran
                                  "Coś się zepsuło" zamiast białej strony;
                                  komponent KLASOWY, bo componentDidCatch nie
                                  ma odpowiednika w hookach
    KonfiguracjaBrak.tsx        ekran "wdrożenie nieskonfigurowane" z listą
                                  brakujących zmiennych — to on pozwala nie
                                  mieć fallbacku na bazę pierwszego klienta
    LoginScreen.tsx             redesign 2026-09-02, ten sam język wizualny
                                  co reszta apki (patrz niżej)
    UpdateBanner.tsx            pasek "dostępna nowa wersja — odśwież
                                  stronę", zamontowany w App.tsx dla
                                  wszystkich ról, patrz "Wersjonowanie i
                                  CHANGELOG" niżej
    TimeEntryForm.tsx          — wspólny formularz start/koniec zmiany (kiosk i self-tracking)
    HoursReport.tsx            — raport miesięczny (zakładka "Raport")
    IssueForm.tsx               — zakładka "Zgłoś"
    NotificationsPanel.tsx      — zakładka "Wiadomości"/"Powiadomienia" (wspólna dla closed, open i managera)
    employeeSessionShared.tsx   — WSPÓLNE dla KioskDashboard.tsx i
                                  PersonalDashboard.tsx: `Shell` (nagłówek +
                                  tabbar) i `EmployeeSessionScreens`
                                  (ekrany Pulpit/Zmiana/Raport/Zadania/
                                  Więcej/Wiadomości/Zgłoś) — patrz "Tablet
                                  Służbowy — KioskDashboard" niżej. NIE
                                  duplikuj tej logiki przy kolejnych
                                  zmianach, edytuj tu.
    PersonalDashboard.tsx       — dashboard na osobisty telefon pracownika
                                  (role `closed`/`open`), redesign
                                  2026-08-31, korzysta z
                                  employeeSessionShared.tsx bez ekranu
                                  wyboru/PIN-u (konto to już jedna
                                  konkretna osoba) — patrz niżej.
    ClosedEmployeeDashboard.tsx — POPRZEDNIA wersja dashboardu osobistego,
                                  zastąpiona przez PersonalDashboard.tsx w
                                  App.tsx (już nierenderowana). Zostawiona
                                  jako rollback, tak jak OpenDeviceDashboard.tsx.
    KioskDashboard.tsx          — dashboard "Tablet Służbowy" (kiosk),
                                  redesign z 2026-08-31 — patrz niżej
    OpenDeviceDashboard.tsx     — POPRZEDNIA wersja dashboardu kiosku,
                                  zastąpiona przez KioskDashboard.tsx w
                                  App.tsx (już nierenderowana). Zostawiona
                                  w repo świadomie jako łatwy rollback —
                                  usuń dopiero po tym, jak nowy design
                                  postoi w produkcji jakiś czas bez
                                  problemów, nie od razu.
    ManagerDashboard.tsx        — redesign 2026-09-02 (patrz "Panel
                                  kierownika" niżej): host/orkiestrator —
                                  cały wspólny stan (editingUser/
                                  editingShift/shiftForm/przewodnikTab...),
                                  handlery (handleSaveUser,
                                  handleSaveShiftEdit z trybem tworzenia,
                                  handleArchiveEntity...) i routing tab →
                                  komponent z manager/. Stare wersje
                                  poszczególnych zakładek WCIĄŻ w tym pliku,
                                  za `{false && tab === "..." && (...)}` —
                                  celowo nieusunięte (żywa referencja przy
                                  dalszych zmianach), NIE dodawaj tam kodu.
    manager/                    — nowe komponenty zakładek Panelu
                                  Kierownika, po jednym pliku na zakładkę:
      designTokens.ts              wspólne kolory/klasy Tailwind (ten sam
                                    język co employeeSessionShared.tsx —
                                    #DE3A22, font Archivo, grube ramki),
                                    import stąd zamiast wpisywać hexy ręcznie
      ManagerShell.tsx              sidebar (desktop) / dolny pasek +
                                    "Więcej" (mobile) — patrz "Panel
                                    kierownika" niżej po szczegóły nawigacji
      WBudowie.tsx                  wspólny placeholder dla zakładek bez
                                    jeszcze własnej treści (obecnie: Grafik)
      ZadaniaISprzatanie.tsx        zakładka Zadania, widok dnia: karty
                                    bloków z obsadą z grafiku, postępem i
                                    pomiarami — patrz "Zadania — bloki i
                                    pomiary" niżej
      ZadaniaKonfiguracja.tsx       ustawienia bloków i zadań (przycisk
                                    "Konfiguracja", ten sam układ co
                                    Konfiguracja w Grafiku i w Pulsie)
      Grafik.tsx                    host zakładki Grafik: tydzień/miesiąc/
                                    konfiguracja, tryb Podgląd/Edycja,
                                    przycisk publikacji
      GrafikTydzien.tsx             siatka tygodnia (jedna tabela na lokal)
      GrafikMiesiac.tsx             kalendarz miesiąca + druk A4 poziomo
      ModalWpisu.tsx                jeden wpis dziennika — wspólny dla karty dnia
                                    i ekranu kierownika zmiany, NIE duplikuj
      PrzepiszZmianyModal.tsx       co ze zmianami odchodzącego pracownika:
                                    przepisać na następcę albo zdjąć
      GrafikZmianaModal.tsx         modal przypisania zmiany + modal blokady
      GrafikWymagania.tsx           wymagania obsady, godziny otwarcia, wyjątki,
                                    budżet (czwarty podwidok)
      GrafikBudzet.tsx              trzy karty nad siatką + wiersze układu
                                    "Wg budżetu". ⚠️ NIE rysuje nagłówka dni —
                                    ten zostaje w GrafikTydzien i jest wspólny
                                    dla wszystkich trzech układów
      GrafikBudzetKonfiguracja.tsx  cel finansowy na dzień tygodnia i wyjątki
                                    na konkretne daty
      GrafikDoWyslaniaModal.tsx     podgląd wszystkiego, co czeka w wersji
                                    roboczej — NIE publikuje, publikacja
                                    zostaje przy "Wyślij grafik"
      PulpitHome.tsx, RejestrGodzin.tsx, ZatwierdzanieZmian.tsx,
      Aktywni.tsx, Zgloszenia.tsx, Pracownicy.tsx, RaportyIKoszty.tsx,
      Przewodnik.tsx, MojaPraca.tsx
                                    — po jednej zakładce Panelu Kierownika
                                    każdy, patrz "Panel kierownika" niżej
```

`tsconfig.json` ma `"skipLibCheck": true` (potrzebne, inaczej crash na
`@types/react` + starym `typescript` w `package.json` — nie usuwaj tego
ustawienia). Plik był wcześniej uszkodzony (dwa sklejone obiekty JSON,
nieprawidłowy JSON) — naprawione.

## Role użytkowników i widoki

| Rola | Ekran po zalogowaniu | Opis |
|---|---|---|
| `admin` | manager_dashboard | pełny dostęp do wszystkich lokali |
| `manager_lokalu` | manager_dashboard | dostęp tylko do przypisanych lokali (`allowed_lokale`) |
| `kiosk` | open_dashboard ("Tablet Służbowy", renderowany przez `KioskDashboard.tsx`) | wspólne urządzenie w lokalu — pracownik wybiera siebie RAZ z listy (nie przy każdej akcji, patrz niżej) |
| `closed` | closed_dashboard (renderowany przez `PersonalDashboard.tsx`) | osobisty telefon pracownika, zalogowany jako on sam |
| `open` | open_dashboard na Tablecie Służbowym, a od 0.26.0 także closed_dashboard na PRYWATNYM telefonie | pracownik kiosku; na własnym telefonie tylko gdy ma `kiosk_pin` **i** `email` — patrz "Prywatny telefon pracownika" niżej |

⚠️ W bazie istnieje też rola `manager` (obok `manager_lokalu`) — trafia do
manager_dashboard tak samo, ale nie jest nigdzie indziej opisana. Nie
zakładaj, że role to zamknięty zbiór z tej tabeli; sprawdź `select distinct
role from users`, jeśli coś na tym zależy.

Login: `Email konta` + `PIN` (6 cyfr). **Wyjątek: rola `open` loguje się
e-mailem i swoim 4-cyfrowym `kiosk_pin`**, nie kolumną `pin` (której to
konto w ogóle nie używa) — patrz `LoginScreen.tsx`. E-mail porównywany jest
bez rozróżniania wielkości liter i bez spacji po obu stronach; pusty e-mail
albo pusty PIN są odrzucane PRZED wyszukiwaniem (inaczej pusty e-mail
zrównałby się z pustymi e-mailami kont otwartych sprzed 0.26.2).

Kioski mają zapisane dane logowania w przeglądarce telefonu służbowego
(autouzupełnianie) + skrót na ekranie głównym — pracownik nic nie wpisuje
ręcznie.

### Prywatny telefon pracownika — od 0.26.0

Te same ekrany co Tablet Służbowy, bez wyboru osoby (konto to już jedna
konkretna osoba). Dwie rzeczy decydują o tym, co pracownik widzi:

1. **Czy w ogóle ma dostęp** — tylko gdy kierownik nada mu `kiosk_pin` ORAZ
   `email` (oba w karcie pracownika). Brak któregokolwiek = brak dostępu i
   nic się dla tej osoby nie zmienia.
2. **Które bloki widzi** — `lokale.dostepne_bloki`, ustawiane RAZ NA LOKAL
   (Pracownicy → Lokale), nie per pracownik (świadoma decyzja właściciela).
   Klucze: `WPISY`, `RAPORT`, `GRAFIK`, `ZADANIA`, `WIADOMOSCI`,
   `ZGLOS_PROBLEM`, `WOLNE`. "Popraw zmianę" NIE ma własnego klucza — chodzi
   z `RAPORT`, bo bez listy swoich zmian nie ma czego poprawiać.

Wyłączony blok znika w całości, nie tylko jako zakładka: bez `WPISY` nie ma
ani zakładki Zmiana, ani przycisku "Rozpocznij zmianę", ani **kończenia
zmiany** (pracownik kończy ją wtedy na tablecie); bez `GRAFIK` Pulpit nie
pokazuje najbliższej zmiany ani licznika do końca zmiany.

⚠️ `dostepne_bloki = NULL` znaczy "wszystko dostępne" (tak wyglądają lokale
sprzed tej funkcji), a `''` znaczy "nic" — to NIE to samo, patrz
`blokiLokalu` w `utils/grafik.ts`.

**Tablet Służbowy zawsze dostaje pełny zestaw** (`BLOKI_WSZYSTKIE`) — stoi w
lokalu pod fizyczną kontrolą i to jest jego zabezpieczenie.

### Zakładki na osobistym koncie i kiosku — `employeeSessionShared.tsx` (redesign 2026-08-31)

Zaprojektowane iteracyjnie przez cały wątek sesji jako klikalny prototyp
HTML, potem przeniesione 1:1 w logice na prawdziwe komponenty (wizualnie
zaadaptowane do Tailwind — wireframe'owy język: grube 2/2.5px obramowania,
pogrubione nagłówki `font-['Archivo']`, czerwony akcent `#DE3A22`, różowe/
szare odznaki statusu). Ten sam "mini-konto" z 5 zakładkami (**Pulpit**,
**Zmiana**, **Raport**, **Zadania**, **Więcej**) obsługuje DWA różne
dashboardy przez wspólny komponent `EmployeeSessionScreens` w
`employeeSessionShared.tsx`:

- **`KioskDashboard.tsx`** (Tablet Służbowy, rola `kiosk`, `open_dashboard`)
  — wspólne urządzenie. Pracownik wybiera siebie RAZ z listy (`activeUsers`:
  `active && !archived && role === "open"` w przypisanym lokalu), potem
  `EmployeeSessionScreens` z `onBack` ustawionym na powrót do tej listy —
  stąd w nagłówku każdego ekranu przycisk "< Zmień" (bez stosu "wstecz",
  zawsze prosto do listy — świadoma decyzja z sesji projektowej), a w
  "Więcej" wiersz "Wróć do listy osób" i notatka "Uwaga" o tym, że
  urządzenie zostaje zalogowane na stałe.
- **`PersonalDashboard.tsx`** (osobisty telefon, role `closed`/`open`,
  `closed_dashboard`) — `currentUser` to już konkretna osoba, więc od razu
  `EmployeeSessionScreens` BEZ `onBack` — nagłówki bez "< Zmień", "Więcej"
  bez "Wróć do listy osób" i bez notatki o urządzeniu. Blokada PIN-em na
  kiosku (`kiosk_pin`) się tu nie stosuje — to koncepcja czysto kioskowa,
  konto osobiste jest już chronione własnym Email+PIN przy logowaniu.

Obie stare wersje (`OpenDeviceDashboard.tsx`, `ClosedEmployeeDashboard.tsx`
— flat, 4-zakładkowy układ z `TimeEntryForm`/`HoursReport`/`IssueForm`/
`NotificationsPanel`) zostały w repo jako rollback, ale App.tsx już ich
nie renderuje.

**Zmiana** (obie wersje): formularz startu z dwiema metodami — "tylko
start" / cała zmiana naraz, dokładnie logika
`TimeEntryForm.handleCreateShift`/`handleCloseShift` przepisana na nowy UI
w `EmployeeSessionScreens` — NIE reużywa samego komponentu `TimeEntryForm`,
bo ten renderuje własny picker pracownika, którego tu nie chcemy.
**Zadania**: placeholder "w budowie" — moduł Zadania z Roadmapy punkt 2
jeszcze nie istnieje, świadomie NIE ma fałszywego, nieinteraktywnego
checklisty. **Więcej**: Grafik-placeholder, Zgłoś, Wiadomości, mały
podkreślony link "Wyloguj" (nie duży przycisk — na kiosku wylogowanie
wymaga ponownego Email+PIN, na koncie osobistym to zwykłe wylogowanie).

Reużywa bez zmian: `findOverlappingShift`, `getTodaysShiftsForUser`,
`sendToGoogleSheets`, formattery z `utils/format.ts`, oraz ten sam wzorzec
oznaczania powiadomień jako przeczytane co stare dashboardy — z tą różnicą,
że KAŻDY z dwóch konsumentów sam filtruje `myNotifications`/`unreadCount`
przed przekazaniem do `EmployeeSessionScreens` (kiosk: wszyscy `activeUsers`
na urządzeniu, `showEmployeeNameInMessages=true`; konto osobiste: tylko
`currentUser.name`, `showEmployeeNameInMessages=false`) — **nie przenoś
tego filtrowania do środka komponentu współdzielonego**, to jedyna
świadoma różnica logiki między dwoma konsumentami.

**Nowa osoba na próbę** — przycisk pod listą osób (ekran "NOWY" w
`KioskDashboard.tsx`) zakłada konto komuś, kto przyszedł na dzień próbny, i od
razu wpuszcza go do jego sesji. Pełny opis: "Pracownik na próbę" niżej.

**Blokada PIN-em na kiosku** — zaimplementowana (patrz niżej, Schemat
Supabase i sekcja "Panel kierownika"), TYLKO w `KioskDashboard.tsx`.
Pracownik z ustawionym `kiosk_pin` dostaje ekran z klawiaturą numeryczną
(10 cyfr + backspace) zamiast od razu wejść do mini-konta po kliknięciu na
liście.

### Panel kierownika (`ManagerDashboard` + `components/manager/`) — redesign 2026-09-02

Przebudowany od zera pod ten sam wireframe'owy język co
`employeeSessionShared.tsx` (patrz wyżej), makieta po makiecie w kolejności
w jakiej właściciel je przysyłał w sesji projektowej. `ManagerDashboard.tsx`
sam jest teraz tylko hostem: trzyma wspólny stan i handlery, renderuje
`<ManagerShell>` (`manager/ManagerShell.tsx`) i wewnątrz niego routuje
`tab` → właściwy komponent z `manager/`. Stare, sprzed-redesignu wersje
poszczególnych zakładek WCIĄŻ są w tym pliku, każda za literalnym
`{false && tab === "..." && (...)}` — celowo nieusunięte (żywa referencja
do starej logiki, na wypadek gdyby coś trzeba było odtworzyć), NIE dopisuj
tam nic i NIE usuwaj bez wyraźnej potrzeby.

**`ManagerShell.tsx`** — cała rama: na desktopie stały sidebar (lista
zakładek z `NAV_ITEMS`, licznik nieprzeczytanych z `badges`, "Wersja
{APP_VERSION}" na dole) + górny pasek (taby lokali — "Cała sieć"/"Wszystkie
moje" + po jednym per dostępny lokal, zegar, placeholder pogody, ikona
"Moja Praca", dzwonek powiadomień). Na mobile sidebar znika, zamiast niego
dolny stały pasek z 4 najczęstszymi zakładkami (`MOBILE_PRIMARY_KEYS`:
Pulpit/Zatwierdzanie zmian/Aktywni/Zadania) + "Więcej" z resztą jako
pełnoekranowa lista — świadomie NIE poziomy scroll po wszystkich 11
pozycjach (to był pierwszy feedback po wdrożeniu). Layout to
`h-screen overflow-hidden` na korzeniu + `min-h-0` w dół całego łańcucha
flex (te same klasy w `employeeSessionShared.tsx` Shell) — bez `min-h-0`
na każdym poziomie `flex-1`/`overflow-y-auto` przestaje faktycznie się
stosować (domyślne `min-height: auto` na elementach flex) i strona
przestaje się scrollować w ogóle zamiast scrollować tylko `<main>`.

⚠️ Kolejność zakładek (`NAV_ITEMS` w `ManagerShell.tsx`) i pierwsza piątka w
dolnym pasku mobile (`MOBILE_PRIMARY_KEYS`) są ustaleniem właściciela z
0.32.0, ułożonym wg tego, jak często się tam wchodzi: Pulpit, Zatwierdzanie
zmian, Grafik, Zadania, Puls, a dalej reszta. Nie przestawiaj ich "logicznie"
przy okazji innych zmian. Sidebar jest od 0.32.0 JASNY (`#E4E4DE`,
`shellSidebarCls`) — o ton ciemniejszy od tła strony, nie czarny.

**Zakładki** (kolejność z `NAV_ITEMS`): **Pulpit** (`PulpitHome.tsx`, "Dziś
w liczbach" — godziny dziś/tydzień z porównaniem do poprzedniego tygodnia,
koszt miesiąca z `users.stawka`, podgląd "Wymaga Twojej decyzji"/"Teraz na
zmianie"/"Terminy i dokumenty"), **Zatwierdzanie zmian**
(`ZatwierdzanieZmian.tsx`, patrz niżej), **Rejestr Godzin**
(`RejestrGodzin.tsx` — grupowanie po stanowisku, jeden pasek wyszukiwania,
"+ Dodaj wpis", CSV, "Historia" per wiersz), **Aktywni** (`Aktywni.tsx` —
żywy licznik czasu trwania zmiany, "Zakończ zmianę"), **Zadania**
(`ZadaniaISprzatanie.tsx` + `ZadaniaKonfiguracja.tsx` — checklisty w blokach,
patrz niżej), **Grafik**, **Zgłoszenia**
(`Zgloszenia.tsx`, tylko `type !== "correction"`), **Powiadomienia** (patrz
niżej, bez zmian w logice), **Pracownicy** (`Pracownicy.tsx`, patrz niżej),
**Raporty i koszty** (`RaportyIKoszty.tsx`, patrz niżej), **Przewodnik**
(`Przewodnik.tsx` — statyczna mini-instrukcja + "Historia wersji"),
**Moja Praca** (`MojaPraca.tsx` — kierownik jest też pracownikiem;
dostępna też z ikony przy dzwonku w każdej zakładce, nie tylko z sidebaru).

Klik na imię pracownika w Rejestr Godzin i Aktywni woła
`goToEmployeeReport(userId)` z `ManagerDashboard.tsx` — ustawia
`reportUserId` i przełącza `tab` na `"raporty"`, gdzie `RaportyIKoszty.tsx`
od razu pokazuje kartę tej osoby.

**Zatwierdzanie zmian** (`ZatwierdzanieZmian.tsx` + `utils/corrections.ts`)
— kolejka decyzji dla `issues.type === "correction"` (patrz "Zgłoszenia i
powiadomienia" niżej — ta funkcja jest już w pełni zaimplementowana i
przetestowana end-to-end). Dla każdego zgłoszenia: **Zatwierdź** (przyjmuje
`proposed_*` bez zmian), **Popraw** (kierownik wpisuje własne wartości +
`reason`, widoczny dla pracownika), **Zapytaj** (gdy `proposed_end_time`
puste — wysyła pytanie, nie rozwiązuje zgłoszenia). Zatwierdzone/poprawione
dane trafiają do `shifts` (patch istniejącej albo `post` nowej, gdy
`shift_id` był `null` — "Zapomniałem/łam odbić"), zapisują wiersz w nowej
tabeli **`shift_edits`** (audit trail — patrz Schemat Supabase niżej) i
wysyłają `createEmployeeNotification` z imieniem konkretnego kierownika
(nie generycznie "Kierownik"). `resolveCorrection()` w `corrections.ts` to
JEDYNE miejsce, które to robi — wywołuje go i `ZatwierdzanieZmian.tsx`, i
przyszłe inline akcje gdziekolwiek indziej; nie duplikuj tej logiki.
`shift_edits` jest ładowane osobno w `App.tsx` (nie w głównym
`Promise.all`, ten sam powód co `notifications` — błąd nie może blokować
reszty), bez pollingu (rośnie tylko przez akcję kierownika w tej samej
sesji, więc lokalny dopisek po zatwierdzeniu wystarczy).

W zakładce **Pracownicy** (`Pracownicy.tsx`, layout lista+karta zamiast
modala) formularz edycji pracownika (dla wszystkich ról oprócz `kiosk` —
czyli też dla `admin`/`manager_lokalu`) ma: imię, typ konta, email+PIN
(wymagane, gdy `role !== "open"`) albo `kiosk_pin` (opcjonalny, tylko dla
`role === "open"`), lokal+stanowisko (**wymagane** od 2026-09-02 — realny
`required` na `<select>`, nie tylko konwencja), stawka/etat/notatki
(wszystkie opcjonalne), dwa nieobowiązkowe pola daty — "Termin książeczki
sanepid" (`sanepid_expiry`) i "Termin umowy" (`umowa_expiry`). Puste pole
terminu podświetlone na czerwono (tylko przy edycji istniejącego, nie przy
tworzeniu — patrz błąd #9 niżej), na karcie na liście żółty badge "Brak
terminu ...". To świadomie zamknięty zestaw dwóch terminów — nie dodawaj
trzeciego bez wyraźnej prośby. Trwałe usunięcie (`handlePermanentDelete`,
już generyczne dla dowolnej tabeli) dostępne TYLKO z widoku Archiwum —
najpierw archiwizacja, potem usunięcie, nigdy bezpośrednio z listy
aktywnych. Lokale/Stanowiska (słownik nazw, admin-only) to dwa dodatkowe
`view` w tym samym komponencie, przeniesione z dawnego `Przewodnik`
(`przewodnikTab` w `ManagerDashboard.tsx`) — logika bez zmian, tylko nowy
wygląd.

**Blokada PIN-em na kiosku** — zaimplementowana 2026-08-31 (konsument:
`KioskDashboard.tsx`, patrz "Tablet Służbowy" wyżej). Trzeci, niezależny
mechanizm bezpieczeństwa — **nie myl z rolami logowania `closed`/`open`**,
to zupełnie inna warstwa. Na Tablet Służbowy każdy pracownik jest domyślnie
"otwarty": dotyka swojego imienia na liście wyboru i od razu wchodzi do
swojego mini-konta. Jeśli pracownik ma ustawioną kolumnę `users.kiosk_pin`
(text, nullable, 4 cyfry — NIE mylić z kolumną `pin`, 6-cyfrowym PIN-em
logowania Email+PIN), kiosk najpierw pyta o ten PIN na osobnym ekranie z
klawiaturą numeryczną, zanim pokaże jego dane. Puste `kiosk_pin` = bez
zmian, jak dziś (kiosk nie pyta o nic). **UI kierownika do ustawiania tego
PIN-u już istnieje** (od 2026-09-02, `Pracownicy.tsx` — pole widoczne
tylko dla `role === "open"`) — wcześniejsza notatka o ręcznym wpisywaniu w
Supabase Table Editor jest nieaktualna.

Zakładka **Powiadomienia** (`ManagerDashboard`, tab `"powiadomienia"`,
NIE ma jeszcze własnego komponentu w `manager/` — nadal renderowana wprost
w `ManagerDashboard.tsx`, reużywa `NotificationsPanel`) — analogiczna do
`NotificationsPanel` u pracownika. Pokazuje wiersze z tabeli `notifications`
gdzie `audience === "manager"`, przefiltrowane przez `hasAccessToLokal(n.lokal)`
— `manager_lokalu` widzi tylko swoje `allowed_lokale`, `admin` widzi
wszystko. Znaczek z liczbą nieprzeczytanych jak w wersji dla pracowników;
oznaczanie jako przeczytane też działa tak samo (patch przy wejściu na
zakładkę). Tworzenie takich powiadomień idzie przez ogólną funkcję
`createManagerNotification(lokal, message, type)` w
[`api/notifications.ts`](src/api/notifications.ts) — analogiczna
`createEmployeeNotification(userName, message, type)` robi to samo dla
zakładki Wiadomości pracownika. Nie twórz nowych funkcji ad-hoc do
wysyłania powiadomień, wywołuj te dwie. ⚠️ Ta zakładka była chwilowo
faktycznie zepsuta (2026-09-02, między redesignem shellu a jego naprawą)
— stara treść trafiła za `{false && ...}` razem z resztą starych zakładek
i nikt nie podpiął jej z powrotem od razu. Jeśli widzisz podobny wzorzec
(`tab` bez odpowiadającego mu żywego bloku) w innej zakładce — to ten sam
błąd, podłącz z powrotem tak jak tu.

**Codzienna weryfikacja terminów** — `api/cron/check-document-terms.js`
(Vercel Cron, patrz sekcja "Cron" wyżej). Dla każdego aktywnego
(`active && !archived`) pracownika i każdego z dwóch terminów: jeśli data
jest ustawiona i dzisiejsza różnica dni trafia w okno (dokładnie 30 dni,
dokładnie 14 dni, 0–7 dni, lub ujemna = przeterminowane), wysyła
powiadomienie do kierowników lokalu (`createManagerNotification`) i do
samego pracownika (`createEmployeeNotification`), po czym zapisuje
`sanepid_last_notified`/`umowa_last_notified = dzisiaj` — to pole służy
tylko do ochrony przed podwójnym powiadomieniem tego samego dnia; zatrzymanie
powiadomień po aktualizacji terminu działa samoistnie (nowa data wypada poza
okna, więc przestaje być "due"), nie przez reset tego pola. Jeśli
pojedynczy `createManagerNotification`/`createEmployeeNotification`/`patchUser`
rzuci błąd, ten jeden `(pracownik, termin)` trafia do `failures` w
odpowiedzi zamiast wywalać cały request — i celowo NIE ustawia
`*_last_notified`, więc spróbuje ponownie następnego dnia.

Treść powiadomienia dla kierownika (`buildManagerMessage`) jest świadomie
rozbudowana — zawiera imię, stanowisko (`default_stanowisko`), lokal, datę
w formacie DD.MM.RRRR i liczbę dni, żeby kierownik miał kontekst bez
wchodzenia do apki, np.:
`"Dla pracownika Wojtek (Kierowca) z lokalu Bułka i Jacek, umowa dobiega
końca w dniu 01.09.2026, do zakończenia pozostało 4 dni."` (albo
`"... umowa upłynęła w dniu DD.MM.RRRR — termin przekroczony o N dni."`
po terminie). Powiadomienie dla pracownika (`buildEmployeeMessage`) ma tę
samą strukturę daty/dni, zaczyna się od `"Twój termin: ..."`. Na kiosku
(`KioskDashboard`, `showEmployeeName={true}`) `formatNotificationText`
dokleja z przodu `user_name` (`"Wojtek: Twój termin: ..."`) — bez tego,
przy kilku pracownikach `open` na jednym urządzeniu nie było wiadomo, do
kogo należy powiadomienie.

## Błędy aplikacji — dodane 2026-09-20 (0.41.0)

[`api/errors.ts`](src/api/errors.ts) + [`components/ErrorBoundary.tsx`](src/components/ErrorBoundary.tsx)
+ tabela `app_errors` (migracja `0024`) + `docs/sql/tools/ostatnie-bledy.sql`.

Do 0.41.0 błąd w przeglądarce nie zostawiał żadnego śladu, a wyjątek przy
renderowaniu gasił CAŁĄ stronę na biało. Na tablecie w kuchni biała strona jest
nie do odróżnienia od zepsutego internetu, więc zgłoszeniem był telefon „nie
działa" — zwykle następnego dnia, bez wersji, bez ekranu, bez treści błędu.

- **`ErrorBoundary` stoi w `index.tsx`, nad `<App/>`.** Świadomie BEZ przycisku
  „spróbuj ponownie": render, który się wywalił, wywali się drugi raz na tych
  samych danych, a przycisk, który nic nie zmienia, uczy ludzi, że klikanie nie
  pomaga. Jest za to „Odśwież stronę" i zdanie o tym, że **zapisane godziny są
  bezpieczne** — to pierwsze, o co pyta pracownik.
- ⚠️ **Musi być komponentem KLASOWYM** — `componentDidCatch` nie ma
  odpowiednika w hookach.
- **Nasłuchy globalne** (`wlaczGlobalneNasluchy` w `index.tsx`, przed pierwszym
  renderem) łapią to, czego boundary nie łapie: błędy w handlerach, w
  `setTimeout` i odrzucone obietnice, czyli m.in. każde nieobsłużone `api.get`.
- ⚠️ **`zapiszBlad` NIE MOŻE rzucić.** Woła się ją tam, gdzie już coś poszło
  nie tak; wyjątek w obsłudze wyjątku zamienia jeden zepsuty ekran w zepsutą
  całą aplikację. Stąd try/catch dookoła wszystkiego, `catch(() => {})` na
  fetchu i świadome ominięcie `api.post` (tamto rzuca przy `!res.ok`).
- ⚠️ **Limit pięciu zapisów na sesję i odsiewanie powtórzeń** (`LIMIT_NA_SESJE`,
  `juzWidziane`). Jeden błąd w pętli renderowania potrafi wywołać się tysiące
  razy w minutę — czyli akurat wtedy, gdy baza jest najbardziej potrzebna do
  pracy. Licznik jest per-sesja przeglądarki; odświeżenie zaczyna od nowa i tak
  ma być, bo odświeżenie po awarii to nowy przypadek.
- **`ustawKontekstBledow` woła App.tsx** przy zmianie użytkownika i widoku —
  bez tego wiersz mówi „coś się wywaliło" i nic poza tym.
- ⚠️ **Nie zapisujemy niczego, czego nie ma już w bazie**: imię zalogowanej
  osoby i lokal owszem, ale żadnych treści formularzy ani wpisów.
- **Właściwe pytanie do tej tabeli brzmi „co się POWTARZA", nie „co było
  ostatnie"** — drugie zapytanie w `ostatnie-bledy.sql`. Błąd, który zdarzył
  się raz, zwykle był jednorazowy.

## Pogoda — zaimplementowane 2026-09-03

Mały wskaźnik pogody (ikona + temperatura) w pasku górnym Panelu
Kierownika (`ManagerShell.tsx`, obok zegara), na ekranie Pulpit
pracownika (`employeeSessionShared.tsx`) i na ekranie wyboru pracownika na
Tablecie Służbowym (`KioskDashboard.tsx`, ekran "LIST" — zastąpiło tam
stary, hardkodowany placeholder "21°, słonecznie" z pierwszej wersji
makiety, dla lokalu z `lokaleAllowed[0]`, czyli pierwszego przypisanego do
danego kiosku) — patrz
[`components/WeatherBadge.tsx`](src/components/WeatherBadge.tsx) i
[`utils/weather.ts`](src/utils/weather.ts). Bez klucza API — źródło to
**Open-Meteo** (darmowe, publiczne, nie wymaga rejestracji): najpierw
geokodowanie nazwy miasta (`geocoding-api.open-meteo.com`) na
szerokość/długość, potem aktualna pogoda dla tych współrzędnych
(`api.open-meteo.com`). Oba wyniki cache'owane w pamięci modułu (per
miasto, 20 min TTL dla pogody) — nie odpytujemy API przy każdym
re-renderze.

Miasto NIE jest wpisane na sztywno w kodzie — kierownik wpisuje je ręcznie
per lokal w Pracownicy → Lokale (`lokale.miasto`, patrz Schemat Supabase
niżej), bo lokale sieci są w różnych miastach (stan na 2026-09-03: Bułka i
Jacek/Marynata i Chińczyk/Ceglana → Koszalin, Sunset → Sarbinowo,
woj. zachodniopomorskie). W pasku kierownika pogoda dotyczy wybranego w
górnym pasku lokalu (`selectedLokal`) — przy "Cała sieć"/"Wszystkie moje"
spada na pierwszy dostępny lokal (`weatherLokalName` w
`ManagerDashboard.tsx`), bo nie ma miejsca na kilka miast naraz. Na
Pulpicie pracownika pogoda dotyczy jego `effectiveAssignment.lokal`
(patrz `getEffectiveAssignmentForDate` w sekcji "Zadania — bloki i pomiary"
niżej — ten sam mechanizm "otwarta/najnowsza zmiana dziś nad statycznym
default_lokal"). Brak `miasto` dla lokalu albo błąd sieci = cichy fallback
na "--°C" (`WeatherBadge`) — to dekoracja paska, nie coś krytycznego, więc
nigdy nie pokazujemy błędu użytkownikowi.

## Karta dnia / Dziennik ("Puls") — dodane 2026-09-07

Zakładka **Puls** w Panelu Kierownika (klucz `tab === "puls"`) — host
[`manager/Puls.tsx`](src/components/manager/Puls.tsx) i cztery widoki:
`PulsDni.tsx` (lista ostatnich dni), `KartaDnia.tsx` (jeden dzień),
`PulsTydzien.tsx` (raport tygodnia), `PulsSzablony.tsx` (konfiguracja wpisów).
Cała arytmetyka w [`utils/dziennik.ts`](src/utils/dziennik.ts) — komponenty
tylko rysują, nie licz nic w JSX.

**Puls.tsx jest właścicielem danych dziennika** i jedynym miejscem, które je
odświeża (`odswiez`). Widoki dostają gotowe listy i settery lokalne przez
`wspolne`. `przesun()` żyje w `utils/dziennik.ts`, nie w komponencie — inaczej
`Puls` i `KartaDnia` importowałyby się nawzajem.

**Raport tygodnia nie jest przechowywany.** Liczy się z tych samych wierszy
(`wierszDnia`) co lista dni, więc nie może powiedzieć czegoś innego niż dni, z
których powstał; zapisana kopia rozjechałaby się przy pierwszej korekcie
utargu. "Historia raportów" to cofanie się o tydzień. Gdy dojdzie wysyłka
mailem, zapisywać będziemy WYSYŁKI, nie treść.

`prognozaUtargu()` to średnia z tego samego dnia tygodnia z ostatnich czterech
takich dni — świadomie NIE model. Ma dać punkt odniesienia ("sobota wyszła
wyżej niż zwykle"), a prawdziwe prognozowanie to Etap E.

Kontrola obsady została z karty dnia **usunięta**: dla dnia, który już był, nie
zmienia niczyjej decyzji. Jej miejsce zajął udział kosztu pracy w utargu. Na Pulpicie ([`PulpitHome.tsx`](src/components/manager/PulpitHome.tsx))
stoi pasek "wczoraj — dzień niezamknięty" (`stanKartDnia`), który przez
`goToPuls` w ManagerDashboard otwiera od razu właściwy lokal i dzień
(`initialLokal`/`initialDate`). Pulpit jest ekranem, na który kierownik i tak
wchodzi codziennie — bez tego paska zamykanie dnia zależałoby od tego, czy
ktoś sobie o zakładce przypomni.

**Zasada, z której wynika reszta: karta musi się zamykać w 60–90 sekund.**
Jeśli wypełnianie zacznie zajmować dłużej, ludzie zaczną klikać karty wstecz
i zmyślać, a wtedy analityka z Etapu E stoi na wymyślonych danych. Dlatego
trzy warstwy: (1) policzone automatycznie i tylko pokazane — godziny fakt vs
plan, koszt pracy, dziury/nadmiary obsady, % zadań, faktyczne otwarcie i
zamknięcie z odbić, pogoda; (2) ręczne minimum — utarg, paragony,
temperatury, dostawa, notatka dla następnej zmiany, tagi; (3) opis zdarzenia
tylko gdy coś się wydarzyło.

Warstwa (1) NIE jest przechowywana w bazie — liczy się w locie z `shifts`,
`grafik_shifts`, `tasks`, `staffing_rules`. Dzięki temu karta sprzed pół roku
pokazuje te same liczby co dziś, nawet jeśli nikt jej nie zamknął.

Trzy odstępstwa od konwencji projektu, każde świadome:
- **`day_logs` ma wymuszoną unikalność `(lokal, date)`** — reszta tabel jej
  nie ma. Dwie karty na jeden dzień to dwa utargi i fałszywy labour cost.
- **`jsonb`** w `day_log_entries.payload` i `day_log_templates.pola` — sushi
  mierzy co innego niż kawiarnia, a w modelu silo każda nowa kolumna to
  migracja we wszystkich bazach klientów. Nowy typ wpisu ma być konfiguracją.
- **Poprawka wpisu to NOWY wiersz** z `corrected_from`, nigdy update na
  miejscu (`poprawWpis`). Zapis HACCP, który da się cicho przepisać dzień
  później, nie jest dowodem niczego. `wpisyDlaDnia` pokazuje tylko wersje,
  do których nikt się nie odwołał jako do poprzedniej.

Przypomnienia o wpisach liczy `isTaskDueOn`/`parseDaysOfWeek` z
`utils/tasks.ts` — `day_log_templates.pora` i `days_of_week` mają ten sam
słownik co `tasks`. **Nie pisz drugiego planisty.** ⚠️ `parseDaysOfWeek`
zwraca `null`, a nie pustą tablicę, gdy dni nie ustawiono — i to znaczy
"codziennie", nie "nigdy" (na tym wywrócił się pierwszy szkic
`szablonyNaDzien`).

⚠️ **Zakładka Puls czyta i zapisuje własne dane** (`odswiez` w `Puls.tsx`).
Propsy `dayLogs`/`dayLogEntries`/`dayLogTemplates` z `App.tsx` są tylko
pierwszym stanem, żeby ekran nie mrugał w oczekiwaniu na fetch; po każdym
zapisie źródłem prawdy jest baza, a stan rodzica aktualizujemy best-effort
(`sync()`), gdy setter faktycznie dojechał. To zostaje mimo naprawy opisanej
niżej: ekran, który po zapisie czyta z bazy, jest odporny na całą tę klasę
błędów, a kosztuje jeden fetch.

**Konfiguracja wpisów** — [`manager/PulsSzablony.tsx`](src/components/manager/PulsSzablony.tsx),
osobny widok wewnątrz zakładki Puls (przycisk "Konfiguracja", ten sam układ co
Konfiguracja w Grafiku). `SZABLONY_STARTOWE` w `utils/dziennik.ts` to zestaw
sześciu typowych wpisów HACCP z gotowymi normami — nowy lokal ma być gotowy na
dwa kliknięcia, bo w gastronomii mierzy się wszędzie to samo, a kwadrans
wpisywania per lokal to dokładnie ta praca, która rozciąga wdrożenie u klienta.
Klucz pola powstaje z etykiety (`slugKlucza`), kierownik go nie widzi. Typy pól:
liczba, tekst, tak/nie — normy (`min`/`max`) dotyczą tylko liczb. Szablon się
**archiwizuje, nie kasuje**: wpisy z poprzednich miesięcy odwołują się do niego
przez `template_key` i muszą mieć skąd wziąć nazwę i normy.

**Kontekst kalendarzowy** — [`utils/kalendarz.ts`](src/utils/kalendarz.ts).
Święta liczymy, nie pobieramy: stałe daty plus pochodne od Wielkanocy
(algorytm Meeus/Jones/Butcher), więc działa dla dowolnego roku bez API i bez
tabeli, którą ktoś musiałby uzupełniać co grudzień. Osobno `dniHandloweRoku`
— Walentynki, tłusty czwartek, Wigilia, Sylwester: nie są wolne, ale w
gastronomii zmieniają salę bardziej niż niejedno święto. Dzień wypłaty siedzi
w `lokale.dzien_wyplaty` (puste = 10). Lokalne wydarzenia to osobny moduł
(Roadmap p.3), jeszcze go nie ma.

**Zdarzenia** ([`manager/ZdarzenieModal.tsx`](src/components/manager/ZdarzenieModal.tsx))
— pełny formularz zamiast jednego pola „co się wydarzyło”, którego nie
wypełniał nikt. Wymagane są tylko kategoria i opis: formularz, którego nie da
się zamknąć bez kompletu, kończy tak samo jak poprzedni, czyli pusty. ⚠️ Pole
gościa jest świadomie bez danych osobowych — „gość przy stoliku 4” wystarcza
do wyjaśnienia sprawy, a nazwisko byłoby przetwarzaniem bez podstawy.

**Zamkniętego dnia NIE edytujemy w miejscu.** `poprawZamknietyDzien()`
zapisuje najpierw ślad (`day_log_entries`, `typ='korekta'`, payload ze starą
i nową wartością oraz powodem), dopiero potem zmienia `day_logs`. Kolejność
jest celowa: gdyby ślad padł po zmianie liczby, zostałaby po cichu podmieniona
wartość bez wyjaśnienia — dokładnie to, przed czym ta funkcja chroni.

**Kierownik zmiany** — [`manager/PulsZmiany.tsx`](src/components/manager/PulsZmiany.tsx),
wpięte w `employeeSessionShared.tsx` jako ekran `PULS` (wiersz w "Więcej").
Zamiast nowej roli — **prawo na czas**: `users.puls_do` to ostatni dzień, w
którym ta osoba może zamknąć Puls swojego lokalu z Tabletu Służbowego
(`mozeZamykacPuls`). Wygasa samo; uprawnień, które trzeba pamiętać odebrać,
nikt nie odbiera. Ekran świadomie NIE pokazuje warstwy automatycznej, historii,
innych lokali ani **kosztów pracy i stawek** — to nie jest informacja dla tej
roli. Zamknięcie idzie do kierownika lokalu przez `createManagerNotification`,
a `api/cron/check-puls.js` przypomina rano o dniu, którego nikt nie zamknął.
Ekran pobiera własne dane, nie bierze ich propsami (patrz błąd #16).
Prawo nadaje się w DWÓCH miejscach — w karcie pracownika (`Pracownicy.tsx`) i
w `Puls → Konfiguracja` (`PulsSzablony.tsx`, sekcja "Kto może zamykać dzień").
To ta sama kolumna `users.puls_do`; drugie wejście istnieje, bo nadawanie na
dziś to decyzja podejmowana co rano, a karta pracownika jest miejscem na rzeczy
rzadkie — chodzenie tam po każdą zmianę było na tyle niewygodne, że prawa po
prostu by nie nadawano.
Przypomnienie stoi w dwóch miejscach — przy nazwisku na liście osób
(`KioskDashboard.tsx`) i paskiem na Pulpicie
([`PulsPrzypomnienie.tsx`](src/components/manager/PulsPrzypomnienie.tsx), który
sam pobiera swój jeden wiersz i znika po zamknięciu dnia). Przypomnienie o
zrobionej rzeczy uczy ludzi ignorować przypomnienia.

⚠️ **Zamkniętego dnia nie da się otworzyć.** Nie ma i nie ma być przycisku
"otwórz ponownie": otwarcie pozwoliłoby zmienić liczby tak, jakby nigdy nie
były inne, czyli skasowałoby sens zamknięcia. Jedyna droga to
`poprawZamknietyDzien()`, która zostawia ślad.

### Sprawdziany bez Node — `harness-*.html`

W tym środowisku nie ma Node ani npm, więc `npm run build` i testy jednostkowe
odpadają. Zamiast tego dwa pliki w katalogu głównym, uruchamiane przez
`python3 -m http.server` i otwierane w przeglądarce:
- `harness-dziennik.html` — ładuje `utils/dziennik.ts` (razem z całym
  łańcuchem `grafik.ts`/`tasks.ts`/`api/*`) przez Babel standalone i sprawdza
  arytmetyka na ręcznie policzonych przykładach;
- `harness-karta.html` — renderuje `KartaDnia.tsx` i `PulpitHome.tsx` w Reakcie
  z CDN, z zaślepkami na `react` i `lucide-react`. ⚠️ Używa PRAWDZIWEGO klucza
  Supabase: renderowanie nic nie zapisuje, ale kliknięcie czegoś, co woła
  `api.post`, zapisze wiersz do produkcyjnej bazy;
- `harness-app.html` — montuje PRAWDZIWY `App.tsx` z podstawioną sesją i atrapą
  Supabase, w której dane już są, i sprawdza, czy propsy z App docierają do
  zakładek. Jedyny sprawdzian, który łapie props wstawiony do złego elementu
  (patrz błąd #16);
- `harness-kiosk.html` — montuje `KioskDashboard` (Tablet Służbowy): ekran
  wyboru osoby, blokada PIN-em, mini-konto po wybraniu. To jedyny ekran w
  aplikacji, którego nie da się obejrzeć przy biurku — stoi na sali i nikt na
  niego nie patrzy, dopóki nie przestanie działać;
- `harness-login.html` — montuje sam `LoginScreen`. Ten ekran był wcześniej
  niesprawdzalny inaczej niż przez wylogowanie się w produkcji, a od 0.33.0
  pokazuje nazwę produktu, nazwę najemcy i znak — czyli dokładnie to, co
  najłatwiej po cichu zepsuć zmianą w `config.ts`;
- `harness-raport.html` — montuje `PersonalDashboard` (osobisty telefon) z
  atrapą Supabase i przełącznikiem czterech osób: pełny etat, pół etatu,
  zlecenie, konto bez żadnych danych o umowie. Powstał dla normy w Raporcie —
  każda liczba w tym bloku ma przypadek, w którym jej NIE MA, i wtedy blok ma
  zniknąć, a nie pokazać "null h";
- `harness-zadania.html` — sprawdza arytmetykę bloków zadań (dni tygodnia, cykl
  bloku i cykl zadania osobno, widoczność po stanowiskach, pola pomiaru i klucz
  wpisu, który nie pozwala powstać duplikatowi w Pulsie) ORAZ giełdy zmian (kto
  widzi ofertę skierowaną, kto jest kandydatem przy oddaniu, a kto przy
  zamianie, i jak liczą się godziny po obu stronach). To on pilnuje, że `null`
  w dniach tygodnia dalej znaczy „codziennie";
- `harness-budzet.html` — sprawdza arytmetykę budżetu Grafiku: koszt godziny dla
  czterech typów umowy (w tym pół etatu i konto bez żadnych danych), pierwszeństwo
  „wyjątek dnia → zestaw → nic", zapas i minimalny utarg, oraz grupowanie tysięcy.
  To on pilnuje, że `null` w celu dalej znaczy „nie wpisano", a nie „zero";
- `harness-porzucone.html` — sprawdza progi zmian bez odbitego końca (grafik
  kontra limit, zmiana dzielona, przez północ, start po planowanym końcu) oraz
  pracownika na próbę. To on pilnuje, że `end_time = NULL` dalej znaczy zero
  godzin, a nie "policz jakoś";
- `harness-panel.html` — montuje CAŁY `ManagerDashboard` z propsami takimi,
  jakie podaje `App.tsx`, z PODMIENIONYM `api/supabase` (nic nie leci do sieci,
  można klikać wszystko). To jedyny sprawdzian, który łapie propsy gubione
  między poziomami — dwa pozostałe renderują komponenty w izolacji i taki błąd
  przepuszczą. Lista ikon lucide jest w nim wygenerowana ze wszystkich importów
  w `src/`, więc obejmuje każdy komponent panelu;
- `harness-auth.html` — logowanie: rotacja refresh tokenów przy równoległych
  żądaniach, zachowanie przy braku sieci i przy odmowie serwera. `fetch` jest
  podmieniony, więc nie trzeba znać niczyjego hasła;
- `harness-bledy.html` — dziennik błędów: limit zapisów na sesję, odsiewanie
  powtórzeń, komplet pól wiersza i to, czy `ErrorBoundary` pokazuje ekran
  zamiast białej strony. `fetch` jest podmieniony, nic nie leci do sieci.

⚠️ **Od 0.41.0 harnessy chodzą też w CI** (`.github/workflows/ci.yml` →
`scripts/harness-ci.cjs`, Playwright na każdym PR-ze). Dokładając NOWY
harness, trzymaj kontrakt, po którym CI poznaje wynik: koniec przebiegu to
zmiana tekstu `#status` (ekrany) albo linia `ZDANYCH n, OBLANYCH m` w `#out`
(arytmetyka), a awaria to klasa `zle` na elemencie albo słowo `BŁĄD` w
treści. Harness bez tego CI uzna za wiszący i PR stanie na czerwono.
`harness-karta.html` jest z CI wyłączony — jako jedyny rozmawia z prawdziwą
bazą i testy nie mają chodzić po danych klienta.

To jedyna działająca tu forma weryfikacji i to ona wyłapała błąd
`parseDaysOfWeek` opisany wyżej. Pliki są poza `src/` i `public/`, więc build
CRA ich nie widzi. Jeśli dokładasz logikę do dziennika, dopisz do nich
przypadek zamiast zgadywać.

### Archiwum prognoz — dodane 2026-09-07

`weather_forecasts` (migracja `0013`) trzyma, co prognoza mówiła o danym dniu
N dni wcześniej. Jeden wiersz = (miasto, target_date, horizon_days), gdzie
`horizon_days = 0` to STAN FAKTYCZNY — dzięki temu trafność liczy się przez
porównanie wierszy w obrębie jednego dnia, bez osobnej tabeli na wyniki.
Klucz to miasto, nie lokal (trzy lokale dzielą Koszalin).

Po co: kierownik planuje obsadę z wyprzedzeniem i musi wiedzieć, na ile dni
naprzód prognoza jest jeszcze warta zaufania. Pierwszy pomiar (Koszalin,
30 dni, wrzesień 2026): błąd temperatury rośnie z 0,4 °C przy 1 dniu do
2,0 °C przy 7; trafność deszczu trzyma się ~75% do szóstego dnia i spada do
60% na siódmym, przy 23% fałszywych alarmów.

⚠️ **Horyzont 8–14 dni powstaje WYŁĄCZNIE z codziennego crona**
`api/cron/capture-weather.js`. Open-Meteo pozwala sięgnąć po dawne przebiegi
modelu najwyżej 7 dni wstecz (previous-runs API), więc każdy dzień, w którym
cron nie zadziała, jest dla dłuższych horyzontów stracony bezpowrotnie — nie
da się tego nadrobić później. `scripts/backfill-pogoda.py` uzupełnia tylko
horyzonty 1–7 i pisze z `ignore-duplicates`, żeby nie nadpisywać tego, co
zebrał cron.

## Zadania — bloki i pomiary (Roadmap p.2) — przebudowane 2026-09-14 (0.37.0)

Trzy rundy w 2026-09-02..04 zbudowały płaską listę zadań; 0.37.0 podniosła ją o
poziom wyżej, do BLOKÓW. Powód: rozkład i adresat siedziały na KAŻDYM zadaniu
osobno, więc „poranne otwarcie dla kucharza" było ośmioma zadaniami z ręcznie
powtórzonymi dniami tygodnia — osiem miejsc, w których można się pomylić, i
żadnego miejsca, w którym widać proces.

```
blok    = KIEDY (pora + dni tygodnia, ewentualnie cykl) i DLA KOGO (stanowiska)
zadanie = jeden wiersz checklisty: tytuł, opcjonalny opis/procedura,
          opcjonalne POLA do wpisania, opcjonalny WŁASNY cykl
          i opcjonalne WŁASNE DNI (które z dni bloku)
```

Cała logika żyje w [`utils/tasks.ts`](src/utils/tasks.ts) — wołają ją
[`manager/ZadaniaISprzatanie.tsx`](src/components/manager/ZadaniaISprzatanie.tsx)
(widok dnia), [`manager/ZadaniaKonfiguracja.tsx`](src/components/manager/ZadaniaKonfiguracja.tsx)
(ustawienia) i [`employeeSessionShared.tsx`](src/components/employeeSessionShared.tsx)
(Tablet Służbowy, tablet z PIN-em, prywatny telefon — jeden kod, trzy
powierzchnie). Nie duplikuj tego w komponentach.

⚠️ **Pora i adresat mieszkają TYLKO na bloku.** Kolumny `tasks.schedule_type` /
`stanowisko` / `for_manager` / `day_of_week` zostały w bazie z danymi (migracja
`0019` przepisała je na bloki), ale kod ich NIE czyta — dwa źródła odpowiedzi na
to samo pytanie to gwarantowany rozjazd. Na zadaniu żyją tylko dwa ZAWĘŻENIA
wewnątrz bloku: `cycle_days` (co ile dni) i `days_of_week` (które z dni bloku).
Bloki są kategoriami, zadania podzadaniami — lokal ustawia je raz pod swój
proces i zmienia wyjątkowo.

⚠️ **BLOK JEST WAŻNIEJSZY** (ustalenie właściciela). Dni zadania mogą zbiór dni
bloku tylko ZAWĘZIĆ, nigdy rozszerzyć: zadanie z sobotą w bloku pon–pt nie
pokaże się w sobotę. Inaczej „kiedy ten blok jest" przestałoby mieć odpowiedź,
bo każde zadanie mogłoby ją unieważnić. W formularzu dni spoza bloku są
WYŁĄCZONE (nie ukryte) — hierarchia ma być widoczna, a konfiguracji, która
nigdy nie zadziała, nie da się zapisać (`dniSkuteczne()` liczy przecięcie i
blokuje zapis przy pustym). Po co to w ogóle: jeden blok „Mycie i dezynfekcja"
stoi cały tydzień, ale w poniedziałek myje się okap, a w środę lodówkę —
wcześniej wymagało to dwóch bloków o tej samej nazwie, czyli dokładnie tego
rozdrabniania, przed którym bloki miały chronić.

⚠️ **`tasks.days_of_week` zmieniło znaczenie w migracji `0020`.** Do 0019
trzymało rozkład zadania (przeniesiony potem na blok i zostawiony jako martwa
kopia), od 0020 znaczy „które dni z dni bloku", a puste = wszystkie dni bloku.
Migracja czyści stare kopie — bez tego kierownik przestawiłby dni bloku na
weekend, a zadania po cichu by zniknęły, bo wciąż miałyby w sobie „pon–pt".

⚠️ **Nazwa „blok" jest w tym repo zajęta dwa razy.** `lokale.dostepne_bloki` to
BLOKI INTERFEJSU widoczne na prywatnym telefonie (`WPISY`, `RAPORT`, `ZADANIA`…)
— zupełnie inna rzecz niż `task_blocks`. Nie myl ich przy czytaniu kodu.

⚠️ **Wykonanie jest ZAWSZE wspólne, jeden wiersz na (zadanie, dzień)** —
`findSharedCompletion`, bez wyjątków (decyzja z 2026-09-04, pierwsza wersja
miała osobne wykonanie per pracownik i było mylące). Stanowiska bloku decydują o
WIDOCZNOŚCI, nie o liczbie wykonań. Kto ma je wykonać, wynika z grafiku:
panel pokazuje przy bloku „Dziś wg grafiku: Ala, Marek" (`publishedShiftsOnDay`
+ stanowiska bloku). Blok, którego nikt dziś nie obsadza, dostaje podpis, ale
NADAL liczy się do procentu dnia — drugie reguła liczenia byłaby gorsza niż
jeden mylący wiersz.

### Pomiar — zadanie, które prosi o wartość

`tasks.pola` (jsonb, ten sam kształt co `day_log_templates.pola`) zamienia
checkbox w pomiar: temperatura, kwota, tak/nie, z normą `min`/`max`. Wartość
**nie jest przechowywana przy zadaniu** — leci do `day_log_entries`, czyli tam,
gdzie i tak mieszka cały dziennik HACCP, a `task_completions.entry_id` tylko na
nią wskazuje. Dzięki temu za darmo działają: kontrola normy (`pozaNormaPola`),
poprawka przez NOWY wiersz (`corrected_from`) i widok na karcie dnia.

Podział ról: **Zadania = zbieranie w ciągu zmiany. Puls = zapis dnia.**

- `tasks.template_key` podpina zadanie pod pozycję z konfiguracji Pulsu. Wtedy
  definicja pól pochodzi z SZABLONU (jedno źródło), a wpis dostaje jego
  `template_key` — karta dnia widzi pozycję jako wypełnioną i nie prosi o nią
  drugi raz. To jest ten konektor, przez który nie powstają duplikaty.
- Pomiar własny zadania zapisuje się z kluczem `zad:<id>` i ląduje na karcie dnia
  w sekcji **„Z checklisty"**. ⚠️ Klucz MUSI być — wpisy bez `template_key` karta
  dnia pokazuje w sekcji „Zdarzenia", gdzie pomiar wyszedłby jako „(bez opisu)".
- ⚠️ **Zapis idzie w kolejności: najpierw wpis, potem wykonanie.** Odwrotnie
  zostawiłby „zrobione" bez pomiaru, czyli dokładnie to, przed czym ten moduł
  chroni.
- ⚠️ **Wykonania z pomiarem NIE da się odznaczyć** (`toggleTaskCompletion` rzuca
  błąd). Jedyna droga to „Popraw", która pisze nowy wiersz z `corrected_from` i
  powodem, i przestawia `entry_id`. Ta sama zasada co
  `poprawZamknietyDzien()` w Pulsie.
- ⚠️ **Poprawka MUSI być widoczna, nie tylko zapisana.** `wpisyDlaDnia` pokazuje
  wyłącznie wersję aktualną, więc poprawiona wartość wygląda dokładnie jak
  wpisana za pierwszym razem — ślad leży w bazie, ale dla celu, dla którego
  powstał (dowód HACCP), nie istnieje. Robi to `opisPoprawki()` w
  `utils/dziennik.ts` + komponent
  [`manager/SladPoprawki.tsx`](src/components/manager/SladPoprawki.tsx),
  wpięty w CZTERECH miejscach pokazujących wartość pomiaru: karta dnia (pozycje
  dziennika i „Z checklisty"), ekran kierownika zmiany, panel zadań i
  checklista pracownika. Dokładając piąte miejsce z wartością wpisu, dołóż tam
  i ten podpis. ⚠️ `opisPoprawki` dostaje PEŁNĄ listę wpisów, nie wynik
  `wpisyDlaDnia()` — ta odfiltrowuje właśnie poprzednie wersje.

### Panel kierownika

**Widok dnia** (`ZadaniaISprzatanie.tsx`) — kafelki (wykonane / bloki / po
terminie / pomiary poza normą), pigułki pory + przełącznik „Zadania kierownika",
a pod nimi karty bloków: nazwa, pora, dni, lokal, stanowiska, obsada z grafiku,
pasek postępu i pozycje z wartościami pomiaru oraz „Popraw".

**Konfiguracja** (`ZadaniaKonfiguracja.tsx`, przycisk „Konfiguracja" — ten sam
układ co Konfiguracja w Grafiku i w Pulsie) — bloki z zadaniami, kolejność
strzałkami (w projekcie nie ma biblioteki drag-and-drop i nie dokładaj jej),
archiwizacja zamiast kasowania. Formularz zadania: tytuł, opis/procedura,
priorytet, termin, własny cykl, dni tygodnia (z wyłączonymi dniami spoza bloku)
i „Co zapisujemy przy wykonaniu" (bez pomiaru / pozycja z Pulsu / własne pola).

**`BLOKI_STARTOWE`** w `utils/tasks.ts` — sześć gotowych bloków (Otwarcie,
HACCP, Mycie i dezynfekcja, Zamknięcie, Sala i goście, Kontrola kierownika) z
zadaniami i normami. Ten sam powód co `SZABLONY_STARTOWE` w Pulsie: w
gastronomii proces jest wszędzie podobny, a kwadrans wpisywania per lokal to
dokładnie ta praca, która rozciąga wdrożenie u klienta.

### Pracownik (Tablet Służbowy, tablet z PIN-em, konto prywatne)

Jeden kod w `employeeSessionShared.tsx`, trzy powierzchnie — różnic w logice nie
ma. `renderBlockCards(grupy, { zwiniete })` rysuje karty bloków,
`renderTaskChecklist(items)` pozycje w środku.

- ⚠️ **Zadania widzi tylko ten, kto dziś pracuje** (`pracujeTegoDnia` +
  `buildEmployeeBlocks(..., { pracuje })`, od 0.38.0): stoi w OPUBLIKOWANYM
  grafiku albo faktycznie odbił zmianę. Wcześniej checklistę dostawał każdy, kto
  ma dany lokal w karcie, więc w dniu wolnym wyglądała jak zaległość. **Odbicie
  liczy się na równi z grafikiem** — w gastronomii ktoś wchodzi na zastępstwo
  bez wpisu, a osoba stojąca na sali przy pustej checkliście uzna system za
  zepsuty. Pusty ekran mówi wprost, czemu jest pusty.
  ⚠️ To dotyczy WYŁĄCZNIE widoku pracownika. Panel kierownika i pierścień na
  Pulpicie liczą zadania lokalu niezależnie od obsady (`blokiNaDzien` bez tego
  filtra) — inaczej blok znikałby kierownikowi z dnia tylko dlatego, że nikt go
  jeszcze nie obsadził (ta sama zasada co przy naprawie z 2026-09-04).
- **Pulpit** — same nagłówki bloków z licznikiem („Otwarcie lokalu · 0/2").
  Kliknięcie przenosi do zakładki **Zadania** i otwiera TEN blok (`openBlockId`).
  Pełna lista zadań stała wcześniej wprost na Pulpicie i zasłaniała zmianę oraz
  grafik.
- **Zmiana** (zmiana w toku) — te same karty, rozwijane na miejscu, plus
  dotychczasowy niewymuszający banner „Zostały N zadań…".
- **Zadania** — karty + przełącznik „Twoje stanowisko / Wszystkie" (na kiosku
  jedyna droga do cudzej checklisty) + mini-raport `weeklyChecklistStats`.
- Bez wyboru rozwinięty jest pierwszy blok, w którym coś zostało — ekran, na
  którym trzeba najpierw kliknąć, żeby cokolwiek zobaczyć, wygląda jak pusty.
- Pomiar otwiera **ten sam `ModalWpisu`**, co karta dnia i ekran kierownika
  zmiany. To ta sama czynność i ma wyglądać tak samo wszędzie.

### Siatka bezpieczeństwa i pułapki

- **Zadanie bez `block_id` nie znika** — dostaje blok wirtualny „Bez bloku"
  (codziennie, adresat ze starych kolumn zadania), a konfiguracja pokazuje to
  wprost. Po migracji `0019` ma tam być pusto.
- ⚠️ `parseDaysOfWeek` zwraca `null`, gdy dni nie ustawiono, i to znaczy
  **CODZIENNIE**, nie „nigdy". Przy wczytywaniu bloku do formularza `null` musi
  wrócić jako PEŁNY tydzień — inaczej wejście w edycję po cichu odznaczy
  wszystkie dni. Ta sama pułapka co w `GrafikWymagania.tsx`.
- **Cykl bloku liczy się od ostatniego dnia, w którym wykonano cokolwiek z tego
  bloku**; cykl zadania — od ostatniego wykonania tego zadania. Oba od
  FAKTYCZNEGO wykonania, nie od kotwicy w kalendarzu, więc pominięty cykl
  zostaje zaległy zamiast po cichu przeskoczyć.
- ⚠️ Dni zadania wczytywane do formularza mają tę samą pułapkę co dni bloku:
  `null` znaczy „wszystkie dni bloku" i musi wrócić jako PEŁNY tydzień, inaczej
  wejście w edycję po cichu odznaczy wszystko, a zapis zawęzi zadanie do
  niczego. Zapis robi drogę powrotną: 7/7 zapisuje jako `null`, żeby zadanie
  dalej szło za blokiem, gdy ktoś zmieni dni bloku.
- `utils/pola.ts` trzyma definicję pól wspólną dla dziennika i dla zadań —
  osobny plik, bo `utils/dziennik.ts` importuje z `utils/tasks.ts` i sięgnięcie w
  drugą stronę zrobiłoby cykl importów.
- `harness-zadania.html` sprawdza całą arytmetykę bloków na ręcznie policzonych
  przykładach (47 przypadków, w tym dziewięć na dni zadania wewnątrz bloku). Dokładając logikę, dopisz przypadek zamiast
  zgadywać.
- **Sprzątanie jako osobny, rozbudowany proces HACCP** (sprzęt jako encja, logi
  temperatur per urządzenie, oceny jakości) **wciąż jest świadomie ODŁOŻONE** —
  bloki z pomiarami pokrywają dużą część tej potrzeby, ale nie projektuj tabeli
  `equipment`/`cleaning_logs` z własnej inicjatywy.

## Zgłoszenia i powiadomienia — pełna mapa (ustalone 2026-08-31)

Zebrane w jednym miejscu, bo kanałów zrobiło się kilka i łatwo pomylić,
który mechanizm czego dotyczy. Kolumna "Tabela" odsyła do "Schemat
Supabase" niżej.

| # | Co | Kto wysyła → kto dostaje | Tabela | Status |
|---|---|---|---|---|
| 1 | Kierownik ręcznie edytował/usunął czyjąś zmianę | `ManagerDashboard` → pracownik | `notifications`, `audience='employee'`, stare pola (`action`/`old_start`/...) | ZROBIONE |
| 2 | Zbliża się/minął termin sanepid albo umowy | cron `check-document-terms.js` → kierownik LOKALU i sam pracownik | `notifications`, `audience='manager'` i `audience='employee'` (`message`/`type`) | ZROBIONE |
| 3 | Ogólne info dla kierowników lokalu (przyszłe moduły) | dowolna funkcja przez `createManagerNotification` → kierownik | `notifications`, `audience='manager'` | infrastruktura gotowa, czeka na kolejnych konsumentów (Zadania itd.) |
| 4 | **Zgłoś → "Popraw zmianę"**: pracownik proponuje inne dane konkretnej zmiany (data/lokal/stanowisko/godziny) albo zgłasza całkiem brakującą zmianę | pracownik → kierownik | `issues`, `type='correction'` + `proposed_date`/`proposed_lokal`/`proposed_stanowisko`/`proposed_start_time`/`proposed_end_time` (patrz niżej) | **ZROBIONE** (2026-09-02) |
| 5 | **Zgłoś → "Zgłoś problem"**: dowolna uwaga, opcjonalnie anonimowo | pracownik → kierownik | `issues`, `type='problem'` (to jest dotychczasowe "Zgłoś", tylko nazwane) | ZROBIONE |
| 6 | Odpowiedź kierownika na zgłoszenie typu "Popraw zmianę" (Zatwierdź/Popraw/Zapytaj) | kierownik → pracownik | `createEmployeeNotification` z `utils/corrections.ts` (`resolveCorrection`/`askAboutCorrection`), imię konkretnego kierownika w treści | **ZROBIONE** (2026-09-02) |
| 7 | Kolejka korekt w panelu kierownika, zakładka **Zatwierdzanie zmian** (`manager/ZatwierdzanieZmian.tsx`) | — | `issues` (`type='correction'`) | **ZROBIONE** — osobna zakładka, nie miesza się z p. 5 (Zgłoszenia pokazuje tylko `type !== "correction"`) |
| 8 | Zmiana zaczęta i niezakończona (bez odbitego końca) | cron `check-porzucone.js` → pracownik i kierownik LOKALU; decyzja kierownika → pracownik | `notifications`, `type='porzucona'` | **ZROBIONE** (0.40.0) — patrz "Zmiany bez zakończenia" |
| 9 | Ktoś dodał na Tablecie osobę na próbę | `dodajProbnego` → kierownik LOKALU | `notifications`, `audience='manager'`, `type='probny'` | **ZROBIONE** (0.40.0) — patrz "Pracownik na próbę" |

**Rozdzielenie "Zgłoś" na dwa typy** (ustalone 2026-08-31, patrz makiet
"Zgłoś — Dwa Typy" z sesji projektowej) — dwa różne procesy po stronie
kierownika, dlatego dwa typy w jednej tabeli `issues`, nie osobne
funkcje: **typ `correction`** ("Popraw zmianę") to prośba o zmianę
konkretnych danych zmiany — pracownik wybiera zmianę z listy ("Która
zmiana"), widzi jej obecne dane (data/lokal/stanowisko/godziny) jako
punkt odniesienia, i wpisuje poprawione wartości dla WSZYSTKICH tych pól
(nie tylko godzin — data/lokal/stanowisko też edytowalne, to była
świadoma zmiana względem pierwszej wersji makietu, gdzie dało się
poprawić tylko godziny). `shift_id` NADAL opcjonalny (mimo że to typ
`correction`) — lista "Która zmiana" ma dodatkową opcję "Zapomniałem/łam
odbić", która chowa pole "Obecnie zapisane" (nie ma z czym porównywać) i
zamienia formularz w zgłoszenie zupełnie nowej, brakującej zmiany; wtedy
`shift_id` jest `null`. ZAWSZE z imieniem (`is_anonymous` zawsze
`false`), bo inaczej nie da się ani zweryfikować, ani zastosować. Wymaga
nowych, nullable kolumn `proposed_date`/`proposed_lokal`/
`proposed_stanowisko`/`proposed_start_time`/`proposed_end_time` na
`issues` (rozszerzone względem pierwszej wersji planu, patrz niżej —
data/lokal/stanowisko doszły później). **Typ `problem`** ("Zgłoś
problem") to dotychczasowe zachowanie — wolny tekst, opcjonalna
anonimowość, `shift_id` opcjonalny, bez pól `proposed_*`.

Zaimplementowane 2026-09-02: formularz "Zgłoś" w `employeeSessionShared.tsx`
(stan `zgType`/`zgCorrectionShiftId`/`zgProp*` — osobny od `zgAnon`/`zgShiftId`/
`zgText` używanych przez typ `problem`) i UI kierownika do
zatwierdzania/poprawiania w `manager/ZatwierdzanieZmian.tsx` + wspólna
logika zapisu w `utils/corrections.ts`. Biржа zmian z Grafiku (drugi,
odłożony typ decyzji z pierwotnego planu tej zakładki) świadomie POZA
zakresem — wymaga Grafiku, którego nie ma.

## Schemat Supabase (tabele używane obecnie)

- **users** — `id, name, email, pin, role, default_lokal, allowed_lokale[],
  active, archived, stanowisko, sanepid_expiry, sanepid_last_notified,
  umowa_expiry, umowa_last_notified, kiosk_pin`. `sanepid_expiry`/
  `umowa_expiry`: `date`, nullable — terminy dokumentów pracownika, patrz
  "Panel kierownika" wyżej. `kiosk_pin` (text, nullable, 4 LUB 6 cyfr — docelowo 6, patrz "Logowanie i
  dostęp do danych"; klawiatura tabletu obsługuje obie długości, dodana
  2026-08-31) — blokada PIN-em na kiosku, patrz "Panel kierownika" i
  "Tablet Służbowy" wyżej; NIE mylić z kolumną `pin` (6-cyfrowy PIN
  logowania Email+PIN). Od migracji `0027` towarzyszy jej `ma_kiosk_pin`
  (boolean, GENERATED — `kiosk_pin is not null and <> ''`): tablet rysuje po
  niej kłódkę, nie znając samego PIN-u, i to ona pozwoli w 3c-3 odebrać
  uprawnienie do kolumny `kiosk_pin`. Kolumna wyliczana jest tylko do odczytu —
  nie próbuj jej zapisywać. Formularz kierownika do jej ustawiania istnieje
  od 2026-09-02 (`Pracownicy.tsx`). Od 2026-09-02 dodatkowo: `stawka`
  (numeric, nullable, zł/h — puste = brak, NIE `0`; liczone w Pulpit/
  Raporty i koszty/karcie pracownika, z jawnym "brak stawki"/"dane
  niepełne" zamiast cichego liczenia jako 0), `etat` (text, nullable,
  wolna wartość z zamkniętej listy w formularzu — nie osobny słownik),
  `notatki` (text, nullable), `notatki_updated_by`/`notatki_updated_at`
  (text/timestamptz, nullable — ustawiane w `handleSaveUser` TYLKO gdy
  `notatki` faktycznie się zmieniło względem tego, co jest w bazie, nie
  przy każdym zapisie karty). Od 2026-09-08: `puls_do` (date, nullable —
  ostatni dzień, w którym ta osoba może zamknąć Puls, patrz "Kierownik
  zmiany"), `umowa_bezterminowa` (bool, default false — wyklucza się z
  `umowa_expiry`; `handleSaveUser` czyści termin przy zaznaczeniu),
  `ostatni_dzien` (date, nullable — po tej dacie Grafik nie pozwoli wpisać
  zmiany, `poOstatnimDniu()`). Migracje `0015`, `0016`. Od 2026-09-09
  (migracja `0018`): `telefon`, `data_urodzenia`, `data_zatrudnienia`,
  `typ_umowy` (text: `umowa_o_prace`|`zlecenie`|`b2b`|`inna`), `wymiar_etatu`
  (numeric — 1 / 0,75 / 0,5…, skaluje normę), `wynagrodzenie_mies` (numeric —
  kwota z umowy ZA TEN wymiar, NIE do mnożenia przez `wymiar_etatu`).
  Od 2026-09-19 (migracja `0023`): `probny_status` (text: `oczekuje` |
  `zatwierdzony` | `odrzucony`, nullable — puste znaczy zwykły pracownik),
  `probny_od` (date), `probny_przez` (text, które konto tabletu go dodało) —
  patrz "Pracownik na próbę" wyżej.
  ⚠️ `etat` (text) jest od tej migracji NIEUŻYWANY — trzymał naraz wymiar i
  rodzaj umowy. Kolumna zostaje z danymi, a `typUmowy()` w `utils/umowy.ts`
  czyta ją jako fallback dla kont, których jeszcze nie zapisano po migracji.
- **lokale** — `id, name, archived, miasto, dzien_wyplaty (int, nullable,
  puste = 10 — dzień wypłaty pokazywany w kontekście dnia w Pulsie),
  okres_rozliczeniowy (int, nullable, puste = 1), narzut_umowa/narzut_zlecenie
  (numeric, nullable, procent ponad wynagrodzenie, puste = 0),
  tolerancja_po_grafiku_h/max_dlugosc_zmiany_h (numeric, nullable, puste = 4 i
  17 — progi zmian bez odbitego końca, migracja 0023)`. Trzy z nich
  z migracji `0018` — ustawienia płacowe siedzą na LOKALU, nie na pracowniku:
  to decyzje organizacyjne, jednakowe dla całej załogi, a skopiowane do
  kilkudziesięciu kart rozjadą się przy pierwszej pomyłce. `miasto` (text, nullable,
  ustawiane ręcznie w Pracownicy → Lokale) — miasto używane do pogody w
  pasku górnym Panelu Kierownika i na Pulpicie pracownika, patrz sekcja
  "Pogoda" niżej. Dodane 2026-09-03, wymaga ręcznej migracji w Supabase
  SQL Editor (zweryfikuj przez `information_schema.columns` po zapisaniu):
  ```sql
  alter table lokale add column miasto text;
  ```
  `dostepne_bloki` (text, nullable, lista kluczy po przecinku — NIE tablica
  Postgresa) — które bloki widzi pracownik tego lokalu na PRYWATNYM
  telefonie, patrz "Prywatny telefon pracownika" wyżej. Dodane 0.26.0,
  migracja: [`docs/sql/migrations/0009_grafik_dostep_pracownika.sql`](docs/sql/migrations/0009_grafik_dostep_pracownika.sql).
- **stanowiska** — `id, name, lokal_name, archived, skrot, kolor`. `skrot`
  (text, nullable, ustawiany ręcznie w Pracownicy → Stanowiska) — zastępuje
  auto-generowany `getShort(name)` tam, gdzie jest ustawiony
  (`utils/stanowiska.ts` → `stanowiskoShort`); brak wartości = spada z
  powrotem na `getShort`. `kolor` (text, nullable, hex np. `#DE3A22`,
  wybierany `<input type="color">`) — dziś renderowany tylko jako jasny
  odcień (`stanowiskoBadgeStyle` w `utils/stanowiska.ts`, tło 85% w stronę
  bieli + tekst 35% w stronę czerni) na plakietkach w koncie pracownika
  (Raport), Rejestrze Godzin (kropka przy nagłówku grupy) i Mojej Pracy
  kierownika; pełny nasycony kolor zarezerwowany na przyszły Grafik
  (`kolory ról/stanowisk` w sekcji "Konwencje designu" — ta sekcja opisuje
  starą hash-ową koncepcję, która nigdy nie została zaimplementowana;
  `kolor` na `stanowiska` ją zastępuje). Dodane 2026-09-03, wymaga ręcznej
  migracji w Supabase SQL Editor (patrz błędy #12/#13 wyżej — zweryfikuj
  przez `information_schema.columns` po zapisaniu):
  ```sql
  alter table stanowiska add column skrot text;
  alter table stanowiska add column kolor text;
  ```
- **shifts** — `id, user_name, user_id?, lokal, stanowisko, start_time
  (timestamptz), end_time (timestamptz | null), godzin, is_urlop, absence_id`.
  `id` to **uuid** (zweryfikowane bezpośrednio w Supabase 2026-09-02 —
  wcześniejsze wzmianki o `bigint` w tym pliku były błędne; nie ufaj typom
  kolumn opisanym tu bez świeżej weryfikacji przez
  `information_schema.columns`, jeśli coś na tym zależy).
  Od 2026-09-19 (migracja `0023`): `rozliczenie` (text: `zapisano` |
  `odrzucono`), `rozliczenie_przez`, `rozliczenie_at` — decyzja kierownika o
  zmianie bez odbitego końca (te same nazwy co w `grafik_shifts`), oraz
  `porzucona_powiadomiono_at` (timestamptz), która służy WYŁĄCZNIE temu, żeby
  codzienny cron nie wysłał tej samej wiadomości drugi raz. ⚠️ `end_time`
  zostaje wtedy `NULL` i to jest cały mechanizm "godziny się nie liczą" —
  patrz "Zmiany bez zakończenia" wyżej. `is_urlop`
  (boolean, default `false`) i `absence_id` (text, nullable, luźne
  odwołanie do `absences.id`, bez FK — ten sam wzorzec co
  `shift_edits.shift_id`) dodane 2026-09-03, patrz "Urlopy i
  niedostępność" niżej — wpisy urlopu to zwykłe wiersze `shifts` (8h,
  `stanowisko = "Urlop"`) oznaczone tą flagą, żeby liczyły się automatycznie
  we wszystkich istniejących sumach godzin/kosztów bez duplikowania logiki
  agregującej w każdym raporcie z osobna.
- **issues** — zgłoszenia od pracowników, dwa typy w jednej tabeli (patrz
  "Zgłoszenia i powiadomienia" wyżej). Podstawowe:
  `id, user_id, user_name, issue_text, status, is_anonymous, shift_id`
  (uuid, nullable, references `shifts(id)` **ON DELETE SET NULL** od migracji
  `0017` — jedyny prawdziwy FK w projekcie, patrz błąd #17 niżej). Od 2026-09-02 też `type`
  (text, default `'problem'` — stare wiersze bez wartości traktuj jak
  `'problem'`) i, tylko dla `type='correction'`: `proposed_date` (date),
  `proposed_lokal`/`proposed_stanowisko` (text), `proposed_start_time`/
  `proposed_end_time` (text, format `"HH:MM"`, NIE `time` — budowane przez
  `buildLocalDate()` w `utils/corrections.ts`). Gdy `is_anonymous`,
  `user_id`/`user_name` są `null` (tylko dla `type='problem'` — korekty
  są zawsze z imieniem).
- **shift_edits** — NOWA tabela (2026-09-02), audit trail korekt zmian:
  `id (bigint identity), shift_id (text), issue_id (text), editor_name,
  reason, old_date/old_lokal/old_stanowisko/old_start_time/old_end_time,
  new_date/new_lokal/new_stanowisko/new_start_time/new_end_time, source
  ('correction_approved' | 'correction_adjusted'), created_at`. `shift_id`/
  `issue_id` świadomie `text`, NIE `uuid` z FK — pierwsza próba z prawdziwym
  FK (`references shifts(id)`) padła na niezgodność typów w Supabase SQL
  Editor (`bigint` vs `uuid`, patrz błąd #12 niżej); zamiast zgadywać
  poprawny typ drugi raz, zostawione jako luźne, niewymuszone odwołanie —
  ten sam wzorzec co reszta tabel w tym projekcie. ⚠️ Z jednym wyjątkiem:
  `issues.shift_id` MA prawdziwy FK do `shifts(id)` (patrz `issues` wyżej i
  błąd #17 niżej) — to jedyny w całym projekcie. RLS: otwarta polityka jak reszta. Czytane przez "Historia" w Rejestr
  Godzin i licznik "Korekty" w Raporty i koszty; zapisywane WYŁĄCZNIE przez
  `resolveCorrection()` w `utils/corrections.ts` — nie pisz do tej tabeli
  z innego miejsca.
- **notifications** — dwa "typy" wierszy we wspólnej tabeli, odróżnione
  polem `audience`:
  - `audience = 'employee'` (domyślne, dla starych wierszy sprzed tej
    kolumny — traktuj `NULL` jak `'employee'`): dwa warianty. (a) stare,
    specyficzne dla edycji/usunięcia zmiany: `user_name, lokal, actor_name,
    action ('edit' | 'delete'), shift_date, old_start, old_end, new_start,
    new_end, is_read, created_at`. (b) ogólne, tworzone przez
    `createEmployeeNotification(userName, message, type)` — `user_name,
    message, type, is_read, created_at` (pierwszy konsument: powiadomienia
    o zbliżającym się terminie sanepid/umowy).
  - `audience = 'manager'`: ogólne powiadomienie dla kierowników danego
    `lokal` (tworzone przez `createManagerNotification`). Pola: `lokal,
    message, type, is_read, created_at`.
  - Warianty (a) i (b) rozróżnia `formatNotificationText` po obecności
    pola `message` — jeśli jest, zwraca je (z doklejonym `user_name` z
    przodu, gdy `showEmployeeName=true` — patrz niżej), inaczej składa
    tekst ze starych pól `action`/`old_start`/itd.
  - RLS: polityka otwarta (`for all using (true) with check (true)`) —
    jeśli dodajesz nowe tabele, rób tak samo albo świadomie zawężaj.
  - Kolumny `audience`, `message`, `type` dodane ręcznie w Supabase (Claude
    Code nie ma tam bezpośredniego dostępu — każda taka zmiana schematu w
    tym repo idzie przez właściciela wklejającego SQL do Supabase SQL
    Editor, patrz błędy #12/#13 niżej po pułapki tego trybu pracy).
  - `user_name` i `action` były pierwotnie `NOT NULL` (z czasów, gdy
    tabela obsługiwała tylko powiadomienia o edycji zmiany) — ograniczenie
    zdjęte (`alter column ... drop not null`), inaczej
    `createManagerNotification`/`createEmployeeNotification` dostają 400 z
    Postgresa. Potwierdzone działające — obie funkcje są już głównym,
    wielokrotnie używanym kanałem powiadomień (patrz "Zgłoszenia i
    powiadomienia" wyżej).
- **task_blocks** — bloki zadań (checklisty), patrz "Zadania — bloki i pomiary"
  wyżej. `id (uuid), lokal, nazwa, opis, stanowiska (text, lista nazw po
  przecinku — konwencja allowed_lokale, puste = wszyscy), schedule_type
  ('poranne'|'obiadowe'|'wieczorne'|'ogolne'|'cykliczne'), cycle_days (int),
  days_of_week (text, "1,2,3,4,5" — null = CODZIENNIE), deadline_time (time),
  for_manager (bool), kolejnosc (int), active, archived, created_at`.
  Migracja `0019`. RLS: otwarta polityka jak reszta.
- **tasks** — definicje zadań, patrz "Zadania — bloki i pomiary" wyżej.
  `id (uuid), lokal (text), title (text), description (text, null),
  schedule_type (text: 'poranne'|'obiadowe'|'wieczorne'|'ogolne'|
  'cykliczne'), cycle_days (int, null — od 0.37.0 WŁASNY cykl zadania
  wewnątrz bloku, jedyna pozostałość rozkładu na zadaniu), day_of_week
  (int, null — MARTWE), days_of_week (text, null — od migracji 0020 KTÓRE DNI Z DNI BLOKU,
  puste = wszystkie; NIE mylić ze starym znaczeniem sprzed 0019),
  scope (text: 'lokal'|'pracownik', default 'lokal' — NIEUŻYWANE w
  logice od 2026-09-04, zostaje w bazie z automatycznym defaultem, nie
  czytaj/nie pisz go, patrz "Zadania — bloki i pomiary" wyżej), stanowisko
  (text, null — decyduje widoczność: null="wszyscy"/cały lokal, inaczej
  konkretne stanowisko; wykonanie zawsze wspólne bez względu na tę
  wartość), owner_label (text, null — pole z pierwszej wersji formularza,
  USUNIĘTE z UI 2026-09-04, kolumna zostaje nieużywana), deadline_time
  (time, null), priority (text: 'niski'|'sredni'|'wysoki',
  default 'sredni', dodane 2026-09-03), for_manager (boolean, default
  false), source_issue_id (text, null — luźne odwołanie do issues.id gdy
  zadanie powstało z przycisku "Utwórz zadanie" w Zgłoszeniach, dodane
  2026-09-03), active (boolean, default true), archived (boolean, default
  false), created_at (timestamptz)`. Od 0.37.0 (migracja `0019`):
  `block_id (text — luźne odwołanie do task_blocks.id), kolejnosc (int),
  pola (jsonb, default '[]' — definicja pól pomiaru, ten sam kształt co
  day_log_templates.pola; pusta tablica = zwykły checkbox), typ (text —
  słownik day_log_entries.typ, tylko gdy są pola), template_key (text —
  gdy ustawione, zadanie zbiera pozycję z konfiguracji Pulsu o tym kluczu:
  pola biorą się z szablonu, a wpis dostaje ten sam template_key, więc
  karta dnia nie prosi o nią drugi raz)`.
  ⚠️ `schedule_type`, `day_of_week`, `stanowisko`, `for_manager`, `scope`,
  `owner_label` — kolumny z danymi, których kod NIE czyta. RLS: otwarta polityka, jak reszta.
- **task_completions** — log wykonań zadań, patrz "Zadania — bloki i pomiary"
  wyżej. `id (bigint identity), task_id (text — luźne odwołanie do
  tasks.id, bez FK, ten sam wzorzec co shift_edits), date (date), user_id
  (text, null), user_name (text, null), completed_at (timestamptz),
  shift_id (text, null)`. Brak wiersza dla danego (task_id, date[,
  user_id]) = niezrobione; brak też jakiejkolwiek unikalności wymuszonej w
  SQL (świadomie, jak reszta tego projektu — ochrona przed podwójnym
  zapisem jest tylko po stronie aplikacji w `utils/tasks.ts`). RLS:
  otwarta polityka.
- **absences** — wnioski o wolne/urlop, patrz "Urlopy i niedostępność"
  niżej. `id (uuid), user_id, user_name, lokal, start_date (date),
  end_date (date), type (text: 'urlop'|'niedostepnosc'), status (text:
  'pending'|'approved'|'rejected', default 'pending'), note (text, null),
  requested_by (text: 'employee'|'manager'), decided_by (text, null),
  decided_at (timestamptz, null), created_at (timestamptz)`. Dodane
  2026-09-03. RLS: otwarta polityka, jak reszta. Wymaga ręcznej migracji w
  Supabase SQL Editor (zweryfikuj przez `information_schema.columns` po
  zapisaniu, patrz błędy #12/#13 niżej):
  ```sql
  create table absences (
    id uuid primary key default gen_random_uuid(),
    user_id uuid,
    user_name text,
    lokal text,
    start_date date not null,
    end_date date not null,
    type text not null default 'urlop',
    status text not null default 'pending',
    note text,
    requested_by text,
    decided_by text,
    decided_at timestamptz,
    created_at timestamptz not null default now()
  );
  alter table absences enable row level security;
  create policy "open" on absences for all using (true) with check (true);
  alter table shifts add column is_urlop boolean not null default false;
  alter table shifts add column absence_id text;
  ```

- **day_logs** — karta dnia ("Puls"), patrz sekcja wyżej. `id (uuid), lokal,
  date (date), obrot (numeric), liczba_paragonow (int), obrot_powod (text:
  'pogoda'|'wydarzenie'|'akcja'|'personel'|'inne'), obrot_komentarz (text),
  cos_nadzwyczajnego (bool), notatka, handover, tagi (lista po przecinku),
  pogoda_temp (numeric), pogoda_kod (int), status ('otwarty'|'zamkniety'),
  closed_by, closed_at, created_at`. ⚠️ **Jedyna w projekcie wymuszona
  unikalność**: `(lokal, date)` — dwie karty na jeden dzień to dwa utargi i
  fałszywy labour cost. Migracje `0010`, `0014`.
- **day_log_entries** — wpisy dnia: `id (uuid), lokal, date, day_log_id (text,
  luźne odwołanie), typ ('temperatura'|'dostawa'|'sprzatanie'|'incydent'|
  'inne'|'korekta'), template_key (text), payload (jsonb), recorded_by,
  recorded_at, corrected_from (uuid), corrected_reason, created_at`. ⚠️ Pierwszy
  `jsonb` w projekcie — świadomie: co mierzy lokal, zależy od typu lokalu, a w
  modelu silo każda nowa kolumna to migracja w bazach wszystkich klientów.
  `typ='korekta'` to ślad poprawki zamkniętego dnia (payload: `pole`, `label`,
  `stare`, `nowe`, `powod`), NIE zwykły wpis — `wpisyDlaDnia` go pomija.
- **day_log_templates** — co trzeba wpisywać w tym lokalu: `id (uuid), lokal,
  klucz (stabilny, z etykiety przez slugKlucza), nazwa, typ, pora
  ('poranne'|'obiadowe'|'wieczorne'|'ogolne'), days_of_week (jak w tasks),
  wymagany (bool), pola (jsonb: [{klucz,label,typ:'number'|'text'|'bool',
  jednostka,min,max}]), kolejnosc (int), archived (bool), created_at`.
  Szablon się ARCHIWIZUJE, nie kasuje — wpisy sprzed miesięcy odwołują się do
  niego przez `template_key` i muszą mieć skąd wziąć nazwę i normy.
- **app_errors** — dziennik błędów aplikacji (migracja `0024`), patrz "Błędy
  aplikacji" niżej. `id (uuid), created_at, app_version, tenant, typ
  ('render'|'window'|'promise'), komunikat, stos, ekran, user_name, rola,
  lokal, url, user_agent`. Pisze tu WYŁĄCZNIE `zapiszBlad` z
  [`api/errors.ts`](src/api/errors.ts) — nie zapisuj tu nic z innego miejsca.
  RLS: otwarta polityka, jak reszta. ⚠️ Nie jest archiwum: czyść starsze niż
  90 dni (`docs/sql/tools/ostatnie-bledy.sql`, ostatnie zapytanie).
- **weather_forecasts** — archiwum prognoz, patrz "Archiwum prognoz" wyżej.
  `id (uuid), miasto, target_date (date), horizon_days (int, 0 = FAKT),
  temp_max, temp_min, opady_mm (numeric), opady_prawdopodobienstwo (int),
  kod (int), zrodlo ('forecast'|'previous_runs'), created_at`. Unikalność
  `(miasto, target_date, horizon_days)` — duplikat zafałszowałby średni błąd,
  a w nim leży cała wartość tej tabeli. Migracja `0013`.
- **grafik_budzet_cele** — cel finansowy na dzień tygodnia, patrz "Budżet
  Grafiku" wyżej. `id (uuid), lokal, obowiazuje_od (date, zawsze 1. dzień
  miesiąca), day_of_week (int, 0=niedziela), oczekiwany_utarg (numeric, null =
  nie wpisano — NIE zero), cel_koszt_pct (numeric, null jw.), created_by,
  created_at`. Unikalność `(lokal, obowiazuje_od, day_of_week)` — dwa wiersze na
  ten sam wtorek to dwie różne odpowiedzi na "ile wolno wydać" i cicho wygrywałby
  ten, który pierwszy wróci z REST-a. Zestaw = para `(lokal, obowiazuje_od)`; nie
  ma osobnej tabeli nagłówków, bo zestaw zawsze powstaje kompletny, z siedmioma
  dniami. Migracja `0022`. RLS: otwarta polityka, jak reszta.
- **grafik_budzet_dni** — wyjątek budżetu na konkretną datę. `id (uuid), lokal,
  date (date), oczekiwany_utarg (numeric, null = zostaje wartość z zestawu),
  cel_koszt_pct (numeric, null jw.), autor, created_at`. Unikalność
  `(lokal, date)`. Piszą tu OBA wejścia — ołówek w siatce "Wg budżetu" i
  formularz w Konfiguracji — bo to jedna rzecz, nie dwie. Migracja `0022`.

## Urlopy i niedostępność — zaimplementowane 2026-09-03

Pracownik może wysłać wniosek o wolne z zakładki **Zgłoś** (trzeci typ,
obok "Popraw zmianę"/"Zgłoś problem" — świadomie tu, nie osobny ekran, bo
to ten sam wzorzec "wyślij prośbę, kierownik decyduje" co reszta tej
zakładki; docelowo, po zbudowaniu Grafiku, ten wniosek powinien przenieść
się tam, gdzie zablokuje termin bezpośrednio na siatce planowania —
świadomie odłożone, właściciel o tym wie). Dwa typy: **`urlop`** (płatny,
generuje godziny — patrz niżej) i **`niedostepnosc`** (tylko informacja
"nie mogę wtedy pracować", bez żadnych godzin/kosztów — myślana jako
przyszła blokada terminu w module Grafik, patrz Roadmap punkt 5). Wniosek
trafia do `absences` ze `status='pending'` i budzi kierownika przez
`createManagerNotification`.

Kierownik decyduje w **Zatwierdzanie zmian** (`ZatwierdzanieZmian.tsx`,
sekcja "Wnioski o wolne" nad kolejką korekt godzin — jedna zakładka na
wszystkie decyzje kierownika, ten sam powód co połączenie korekt i
urlopów w jednym miejscu). Każda karta pokazuje liczbę dni ROBOCZYCH
wniosku (`countWorkdays()` — NIE dni kalendarzowych; poprawione
2026-09-03 po feedbacku testowym, pierwsza wersja liczyła kalendarzowo i
mieszała weekend do bilansu urlopu, np. "05.09–09.09 · 5 dni" mimo że
05.09/06.09 to sobota/niedziela i realnie to tylko 3 dni robocze/24h —
kierownik sprawdzający dostępny bilans dni urlopowych musi widzieć tu
wyłącznie dni robocze) i, tylko dla `type='urlop'`, ile to będzie godzin
(`countWorkdays() * URLOP_HOURS_PER_DAY` — ta sama funkcja co
`buildUrlopShiftDrafts()`, wszystkie w `utils/absences.ts`, nie licz tego
ręcznie w komponencie) — Zatwierdź/Odrzuć, `resolveAbsenceRequest()` w
[`utils/absences.ts`](src/utils/absences.ts). **JEDYNE** miejsce, które
zmienia `absences.status` i materializuje godziny — nie duplikuj tej
logiki. Kierownik może też wpisać urlop bezpośrednio w karcie pracownika
(**Pracownicy**, sekcja "Urlop" pod terminami sanepid/umowy) — od razu
zatwierdzony (`requested_by='manager'`), przez `addUrlopDirectly()` w tym
samym pliku, ten sam mechanizm materializacji co przy zatwierdzaniu
wniosku. Usunięcie wpisu (przycisk kosza przy liście urlopów w karcie
pracownika) kasuje `absences` i wszystkie powiązane `shifts` na raz
(`deleteAbsence()`, dopasowanie po `absence_id` — ta funkcja NIE wysyła
powiadomienia, bo to zwykle poprawka pomyłki, nie coś co pracownik musi
wiedzieć od razu).

**Powiadomienia pracownika** — `createEmployeeNotification` (patrz
"Zgłoszenia i powiadomienia" wyżej) wywoływane w dwóch miejscach: (1)
`resolveAbsenceRequest()` po Zatwierdź/Odrzuć w kolejce — treść mówi kto
zatwierdził/odrzucił i jaki to był zakres dat, niezależnie od `type`; (2)
`addUrlopDirectly()` po bezpośrednim wpisie urlopu przez kierownika w
karcie pracownika — pracownik dostaje wiadomość, że kierownik zapisał mu
urlop na dany zakres dat (inaczej godziny pojawiłyby się w jego Raporcie
bez wyjaśnienia). Dodane 2026-09-03 po prośbie właściciela.

**Materializacja godzin (tylko `type='urlop'`, zatwierdzony)** —
`buildUrlopShiftDrafts()`: jeden wiersz `shifts` na każdy dzień roboczy
(pon–pt, standardowa formuła "8 godzin za dzień roboczy" ustalona z
właścicielem — sobota/niedziela pomijane, bez wyjątków na święta) w
zakresie `[start_date, end_date]`, `stanowisko="Urlop"`,
`start_time`/`end_time` ustawione na stałe 09:00–17:00 lokalnie (dowolna
stała godzina — liczy się tylko różnica 8h), `is_urlop=true`,
`absence_id` wskazujący wniosek. Świadoma decyzja: te wiersze to zwykłe
`shifts`, więc **automatycznie** wliczają się we wszystkie istniejące sumy
godzin i kosztów (Rejestr Godzin, Raporty i koszty, Pulpit kierownika,
Moja Praca, Raport pracownika) bez dopisywania osobnej logiki agregującej
w każdym z tych miejsc — dokładnie to, o co prosił właściciel ("dodają się
do wszystkich list i podliczeń"). Miejsca renderujące pojedynczy wiersz
zmiany rozpoznają `s.is_urlop` i pokazują słowo "Urlop" zamiast zakresu
godzin (`RejestrGodzin.tsx`, `MojaPraca.tsx`,
`employeeSessionShared.tsx` Raport). **Pulpit kierownika** ("Wymaga
Twojej decyzji", `PulpitHome.tsx`) od 2026-09-03 łączy korekty godzin i
oczekujące wnioski o wolne w jedną, wspólną listę `decisionItems`
(posortowaną po `created_at`, najstarsze pierwsze) — wnioski oznaczone
ikoną `Palmtree`, treść podsumowania to typ (Urlop/Niedostępność) i
liczba dni roboczych (`countWorkdays`, ten sam licznik co w
ZatwierdzanieZmian.tsx opisanym wyżej). Kafelek "Do decyzji" i licznik na
karcie liczą razem korekty + wnioski.

`type='niedostepnosc'` NIE tworzy żadnych `shifts` — zostaje tylko
zatwierdzonym/odrzuconym wierszem w `absences`, czekającym na przyszły
Grafik (który go odczyta, żeby zablokować przypisanie pracownika w te
dni). Skutek uboczny materializacji urlopu: `findOverlappingShift`
(patrz `utils/shifts.ts`) traktuje dzień urlopu jak zwykłą zmianę, więc
próba odbicia prawdziwej zmiany w ten dzień zostanie odrzucona jako
nakładająca się — to zamierzone (chroni przed przypadkowym
zarejestrowaniem godzin w trakcie urlopu), nie naprawiaj tego jako "bug".

`App.tsx` ładuje `absences` jako osobny, nieblokujący fetch (ten sam
wzorzec co `shift_edits`/`tasks`) — błąd tu nie blokuje reszty apki.

## Umowa, norma i koszt — dodane 2026-09-09

[`utils/umowy.ts`](src/utils/umowy.ts) + `wymiarCzasuPracy()` w
[`utils/kalendarz.ts`](src/utils/kalendarz.ts). Migracja `0018`.
⚠️ Od 0.39.0 `stawkaEfektywna()` z tego pliku jest podstawą kosztu w Grafiku i
w Pulsie — patrz "Budżet Grafiku" (5f) niżej, zwłaszcza akapit o świadomym
odstępstwie od zasady z 5c.

Jedno rozróżnienie, z którego wynika cała reszta:

| | Zlecenie | Umowa o pracę |
|---|---|---|
| Co lokal płaci | godziny × stawka | kwotę z umowy, niezależnie od godzin |
| Godziny mówią o | koszcie | tym, czy lokal ten koszt WYKORZYSTAŁ |
| Kolejna godzina w normie | kosztuje stawkę | nie kosztuje nic |

Dlatego `kosztMiesiaca()` (ile lokal wydał) i `bilansOkresu()` (ile z tego
wydatku zamieniło się w godziny) to dwie różne funkcje. Zlepienie ich daje
albo zawyżony labour cost, albo złudzenie, że etatowiec w chudym tygodniu
jest darmowy. Właściciel sformułował to wprost: **interesuje nas, ile lokal
wydaje, nie ile pracownik zarabia.**

**Normę liczymy z kalendarza (art. 130 KP), nie z tabeli.** Dni pon–pt × 8
minus 8 za każde święto poza niedzielą; `swietaRoku()` już było. Suma 2026
wychodzi 2016 h — to liczba z publikowanych tabel wymiaru i harness ją
sprawdza. Święta odejmujemy MIMO że gastronomia w święta pracuje (art. 151-10
KP na to pozwala): normę i tak trzeba odebrać w innym dniu, a bez odejmowania
wrzesień i grudzień miałyby tę samą normę — czyli zniknąłby cały powód, dla
którego to liczymy.

⚠️ **Kwota z umowy jest PODŁOGĄ kosztu, nie całością** (0.40.0). Poniżej normy
koszt się nie zmniejsza (przestój, art. 81 KP), ale godziny PONAD normę lokal
dopłaca — po stawce wynikającej z tej samej umowy, czyli `kwota / norma`
(`stawkaEfektywna`). Liczy to `kosztMiesiaca`, a `nadwyzkaPonadNorme()` zwraca
samą nadwyżkę do podpisów w UI. Bez tego koszt kłamał tym bardziej, im więcej
ktoś nadrabiał. Godziny urlopu wchodzą do porównania z normą i tak ma być:
`(fakt + urlop) − norma` daje dokładnie to samo co `fakt − (norma − urlop)`.

⚠️ **Dopłat za nadgodziny i pracę w święta (50/100%) świadomie NIE MA.**
Ustalenie właściciela: w gastronomii praca w święta jest normą, a dopłaty
ponad ustawowe minimum to decyzja restauracji, nie reguła prawa. Godzina ponad
normę liczy się więc po ZWYKŁEJ stawce z umowy — to nie to samo co dodatek.
Miejsce na przyszły słownik wyjątków ("ten dzień ×1,5") jest, ale puste — nie
dopisuj go z własnej inicjatywy.

⚠️ **Ujemny bilans NIE jest długiem pracownika.** Jeśli lokal nie dał pracy w
okresie rozliczeniowym, wynagrodzenie i tak się należy (przestój, art. 81 KP)
— godziny nie przechodzą dalej. To miara niewykorzystanego zasobu po stronie
kierownika, i dlatego opis brzmi "do wypracowania brakuje X h", nigdy
"zaległe". Bilans zeruje się z końcem okresu.

Szczegóły, które łatwo zepsuć:
- **Liczymy tylko miesiące ZAMKNIĘTE.** Porównanie 40 przepracowanych godzin
  do pełnej normy 176 h w połowie miesiąca pokazywałoby "brakuje 136 h" i
  znaczyłoby tylko tyle, że jest połowa miesiąca — ta sama zasada co w
  raporcie tygodnia w Pulsie.
- **Miesiąc z zerem godzin jest POMIJANY**, nie liczony jako pełny niedobór.
  Etatowiec, który przez cały miesiąc nie przepracował ani godziny, praktycznie
  nie istnieje — to prawie zawsze brak danych (system wdrożono później, umowę
  uzupełniono wstecz). Pierwszy alarm o niczym uczy kierownika ignorować
  wszystkie następne. Pominięte miesiące wracają w `bilans.pominiete` i karta
  o nich mówi.
- **Okres kotwiczymy w początku roku kalendarzowego** (`okresDla`): przy 3
  miesiącach wychodzą kwartały. Kotwica ruchoma, od daty zatrudnienia, dałaby
  każdemu inny okres i porównanie dwóch osób przestałoby cokolwiek znaczyć.
- **`wymiar_etatu` skaluje NORMĘ, nie wynagrodzenie.** W umowie stoi kwota za
  ten właśnie wymiar, a nie kwota pełnoetatowa do przeliczenia.
- **`narzut_*` domyślnie 0.** Dopóki właściciel nie wpisze procentu, koszt to
  sama wypłata i nic nie jest zmyślane.

**Pracownik widzi swoją normę w STOPCE Raportu** (`employeeSessionShared.tsx`,
ekran `RAPORT`) — nie w osobnej ramce nad tabelą: pod sumą godzin drobne
"z 176 h", pod imieniem i miesiącem jedno zdanie o różnicy. Dwa miejsca
mówiące o tym samym miesiącu zawsze wyglądają, jakby się nie zgadzały.

To zdanie (`normaOpis`) mówi co innego zależnie od tego, czy miesiąc się
skończył:
- **miesiąc zamknięty** — fakty: "o 32 h ponad normę" / "do normy zabrakło X h";
- **miesiąc trwający** — to, co wyjdzie Z GRAFIKIEM: "z grafikiem wyjdzie 40 h
  — zabraknie 136 h". W połowie miesiąca "do normy brakuje 152 h" znaczyłoby
  tylko tyle, że jest połowa miesiąca;
- **brak zmian w grafiku do końca miesiąca** — mówimy wprost, że ich nie ma,
  zamiast pokazywać niedobór, którego pracownik nie ma jak nadrobić.

Prognoza to fakt + to, co JUŻ STOI w wysłanym grafiku (`publishedShiftsFor`)
— świadomie nie średnia i nie ekstrapolacja: pracownik ma zobaczyć dokładnie
to, co mu wpisano, i zdążyć zareagować PRZED końcem miesiąca. Bez czerwieni i
bez słowa "zaległe" — powód wyżej. Przy zleceniu blok w ogóle się nie pokazuje.

⚠️ **Zamknięty miesiąc bez ANI JEDNEJ zmiany nie dostaje normy w ogóle** — ani
"z 176 h", ani zdania o różnicy. Ta sama zasada co pomijanie pustych miesięcy
w `bilansOkresu`: za miesiąc, w którym system jeszcze nie działał, "do normy
zabrakło 176 h" to alarm o niczym.

**Karta pracownika** ([`Pracownicy.tsx`](src/components/manager/Pracownicy.tsx))
jest od tej wersji rozbita na bloki w kolejności ustalonej z właścicielem:
dane podstawowe → kontakt i logowanie → miejsce pracy → umowa i wynagrodzenie
→ ten miesiąc → dokumenty i uprawnienia → urlop → koniec współpracy → notatki
→ konto aktywne i akcje. Pola umowy rozgałęziają się po `typ_umowy`, ale
**termin umowy i "bezterminowa" zostają wspólne dla obu rodzajów** — umowa o
pracę też bywa na czas określony.

## Odpoczynek i Kodeks pracy — dodane 2026-09-09

[`utils/kodeks.ts`](src/utils/kodeks.ts), pokazywane w modalu przypisania
zmiany (`GrafikZmianaModal.tsx`) i jako bursztynowy trójkąt przy nazwisku w
siatce (`GrafikTydzien.tsx`).

**Zakres zależy od rodzaju umowy** (ustalenie właściciela):

| | Umowa o pracę | Pozostałe |
|---|---|---|
| 11 h odpoczynku dobowego (art. 132) | tak | — |
| 35 h odpoczynku tygodniowego (art. 133) | tak | — |
| ponad 40 h bez dnia wolnego | — | tak |

Serii NIE liczymy etatowcom celowo: przekroczona seria prawie zawsze łamie też
odpoczynek tygodniowy, a dwa komunikaty o jednym problemie uczą ignorować oba.

⚠️ **To sygnał, nie blokada.** Przycisk zapisu zostaje aktywny — ta sama
zasada co przy dziurach w obsadzie. Kierownik zna sytuacje, których system nie
zna, a grafik, którego nie da się zapisać, powstanie obok systemu, w zeszycie.

⚠️ **Odpoczynek liczy się przez WSZYSTKIE lokale.** Osoba kończąca o 23:00 w
jednym i zaczynająca o 6:00 w drugim ma siedem godzin przerwy niezależnie od
tego, na którą siatkę patrzymy — a to przy wypożyczaniu ludzi najłatwiej
przeoczyć. Dlatego `ostrzezeniaKodeksu` dostaje pełne `planShifts`, nie zmiany
jednego lokalu.

⚠️ **Odpoczynek dobowy liczymy PO DOBACH, nie po parach kolejnych zmian.**
Pierwsza wersja porównywała każdą parę i krzyczała "1 h odpoczynku" na zmianie
dzielonej (12:00–20:00 i 21:00–23:30 tego samego dnia), która w gastronomii
jest normą i jest dozwolona. Doba (od początku pierwszej zmiany dnia,
art. 128 § 3 pkt 1) pokazuje to, o co chodzi: czy w ciągu 24 h znalazło się
11 h ciągiem. Ta sama metoda nadal łapie prawdziwy przypadek — 08:00–16:00
plus 22:00–06:00 daje 6 h i jest naruszeniem.

⚠️ **Tygodnia widzianego tylko z jednej strony nie oceniamy.** Jeśli pierwsza
znana zmiana zaczyna się po początku tygodnia (albo ostatnia kończy przed jego
końcem), nie wiemy, jak długie było wolne przy krawędzi zakresu. Pomyłka idzie
tu świadomie w stronę milczenia, nie fałszywego alarmu.

⚠️ **Czego NIE ma i nie dodawaj bez prośby:** kontroli 8 h dobowych. W
gastronomii standardem jest system równoważny (art. 135) z dobowym wymiarem do
12 h — ostrzeżenie przy każdej dwunastce byłoby alarmem o normalnej zmianie.

## Zmiany z grafiku bez odbicia — dodane 2026-09-08

[`utils/odbicia.ts`](src/utils/odbicia.ts) + sekcja w `ZatwierdzanieZmian.tsx`
+ `api/cron/check-odbicia.js`.

Najczęstsza przyczyna braku odbicia to zapomniany tablet, nie nieobecność —
człowiek przyszedł, przepracował swoje i wyszedł. Zostawione tak, dzień pokazuje
minus kilka godzin, plan/fakt kłamie, a pracownik nie dostaje za tę zmianę
pieniędzy. Stąd kolejka decyzji: dopisz jak w grafiku, popraw godziny, odrzuć.

⚠️ **Nie zgadujemy i nie dopisujemy nic automatycznie** — to podpis kierownika
pod czyjąś wypłatą. Cron tylko powiadamia (pracownika i kierownika), decyzję
podejmuje człowiek.

Szczegóły, które łatwo zepsuć:
- Odbicie w INNYM lokalu zamyka sprawę. Człowiek gdzieś był, tylko nie tam,
  gdzie planowano — to inna rzecz i nie należy do tej kolejki.
- `is_urlop` nie liczy się jako odbicie (to zmaterializowany urlop, nie praca).
- Rozliczona pozycja dostaje `grafik_shifts.rozliczenie` ('zapisano'/'odrzucono')
  i nie wraca. Kolejka, która pokazuje w kółko to samo, przestaje być czytana.
- Cron patrzy WYŁĄCZNIE na wczoraj — dzięki temu każda zmiana jest sprawdzana
  dokładnie raz i nie trzeba niczego oznaczać przeciw dublowaniu powiadomień.
- Okno kolejki to 14 dni (`OKNO_DNI`). Dalej nikt nie pamięta, czy tamtego
  wtorku przyszedł, a zgadywanie jest gorsze niż brak.

## Zmiany bez zakończenia — dodane 2026-09-19 (0.40.0)

[`utils/porzucone.ts`](src/utils/porzucone.ts) + sekcja w `ZatwierdzanieZmian.tsx`
+ druga lista w `Aktywni.tsx` + `api/cron/check-porzucone.js`. Migracja `0023`.

Rodzeństwo poprzedniej sekcji: tam ktoś nie odbił NICZEGO, tutaj odbił start i
nie odbił końca. Zostawiona tak, zmiana wisiała otwarta w nieskończoność —
ekran "Kto jest teraz w pracy" pokazywał ludzi, których dawno nie było, a
pracownikowi BLOKOWAŁA kolejne odbicie (formularz przechodzi wtedy w tryb
"zakończ trwającą zmianę" i innej drogi nie ma).

⚠️ **"Zamknięcie" NIE oznacza wpisania końca.** `end_time` zostaje `NULL`, bo
nikt nie wie, o której ta osoba wyszła. To jest jednocześnie cały mechanizm
"godziny się nie liczą": **w tej apce nic nie czyta kolumny `godzin`** — każde
podsumowanie liczy `end_time - start_time` i pomija wiersze bez końca. Wiersz
bez końca daje więc zero godzin wszędzie sam z siebie, bez dokładania wyjątku w
dziesięciu miejscach. Zmienia się tylko jedno: zmiana przestaje być uznawana za
TRWAJĄCĄ (`zmianaTrwa`).

⚠️ **Wiersza nie kasujemy.** "O 8:02 ta osoba odbiła start" to jedyny twardy
ślad, z którego wynika, że w ogóle przyszła.

Dwa progi, celowo bez mieszania ich ze sobą:
- stała tego dnia w OPUBLIKOWANYM grafiku → planowany koniec + tolerancja
  (`lokale.tolerancja_po_grafiku_h`, puste = 4 h);
- nie stała → start + maksymalna długość zmiany (`lokale.max_dlugosc_zmiany_h`,
  puste = 17 h).

Szczegóły, które łatwo zepsuć:
- **Bierzemy NAJPÓŹNIEJSZY planowany koniec dnia**, nie pierwszy: przy zmianie
  dzielonej (12:00–16:00 i 18:00–22:00) pierwszy zrzynałby zmianę o 20:00, w
  środku drugiej części.
- **Grafik liczy się tylko wtedy, gdy planowany koniec wypada PO starcie.** Kto
  odbił się o 18:00, mając w grafiku 08:00–16:00, pracuje faktycznie poza planem
  — plan użyty dosłownie zrzynałby zmianę dwie godziny po jej rozpoczęciu.
- **Kolejka jest LICZONA, nie przechowywana** (tak samo jak `zmianyBezOdbicia`).
  Cron nie jest jej źródłem i niczego nie zamyka — wysyła tylko powiadomienia,
  raz dziennie rano, a `shifts.porzucona_powiadomiono_at` pilnuje, żeby ta sama
  zmiana nie wracała codziennie.
- **Bez okna czasowego**, inaczej niż przy zmianach bez odbicia (`OKNO_DNI`).
  Tam pytanie brzmi "czy on tamtego wtorku przyszedł" i po dwóch tygodniach nikt
  tego nie wie. Tutaj wiadomo NA PEWNO, że przyszedł, więc pozycja jest
  niezapłaconą pracą — a ta się nie przedawnia.
- **Profilaktyka stoi przed kolejką.** Zmiana z poprzedniego dnia wyglądała na
  tablecie dokładnie jak dzisiejsza (widać samą godzinę startu), więc człowiek
  dowiadywał się o wszystkim od kierownika, kilka dni później. Dziś dostaje
  czerwony pasek "Ta zmiana trwa od …" na swoim ekranie i podpis przy nazwisku
  na liście osób — większość przypadków zamyka człowiek, nie system.
- **`Aktywni` ma DWIE listy.** "Kto jest teraz w pracy" i osobno "Bez
  zakończenia". Jedna lista z czerwonym licznikiem po ośmiu godzinach sprawiała,
  że ekran kłamał o tym, ile osób jest w lokalu.
- ⚠️ Próg zależy od lokalu, więc `czyPorzucona`/`zmianaTrwa` potrzebują wierszy
  `lokale`. Dokładając kolejne miejsce, które pyta "czy ta zmiana trwa",
  przekaż je — inaczej wszędzie wyjdą wartości domyślne i dwa ekrany powiedzą
  co innego.
- `harness-porzucone.html` sprawdza całą arytmetykę progów na ręcznie
  policzonych przykładach (39 przypadków, razem z pracownikiem na próbę).

## Pracownik na próbę — dodane 2026-09-19 (0.40.0)

[`utils/probni.ts`](src/utils/probni.ts) + ekran "NOWY" w `KioskDashboard.tsx`
+ sekcja w `ZatwierdzanieZmian.tsx`. Migracja `0023`.

Dzień próbny bywa płatny, a przychodzi się na niego rano, kiedy kierownika w
lokalu nie ma. Bez tej ścieżki godziny takiej osoby lądowały na kartce albo
nigdzie — czyli dokładnie tak, jak wyglądało wszystko przed tą aplikacją.

⚠️ **To ZWYKŁY wiersz w `users`, nie osobna tabela.** Godziny odwołują się do
`user_id`, a Raport, Aktywni i Rejestr Godzin czytają `users` — osobna tabela
kazałaby zdublować każde z tych miejsc. Różnicę robi jedna kolumna:
`users.probny_status` (`'oczekuje'` → `'zatwierdzony'`/`'odrzucony'`).

⚠️ **Konto powstaje BEZ e-maila i BEZ PIN-u.** Nie da się nim zalogować nigdzie
— istnieje tylko na tym jednym tablecie, w lokalu, pod fizyczną kontrolą. To
jest całe zabezpieczenie przed tym, żeby ktoś z sali nie naprodukował kont;
świadomie nie ma tu żadnej dodatkowej blokady, bo ta osoba przychodzi właśnie
wtedy, gdy nie ma kogo zapytać o zgodę.

- **Na tablecie: trzy pola** (imię i nazwisko, lokal, stanowisko) i od razu jego
  sesja — po to ta osoba stoi przy tablecie, żeby odbić zmianę, a nie żeby
  zobaczyć, że konto powstało. Wybór lokalu pokazuje się tylko wtedy, gdy tablet
  obsługuje więcej niż jeden.
- **Widzi Zmianę, Raport i Zadania** (`bloki` w `EmployeeSessionScreens`).
  Grafik jest dla niej pusty z definicji, Wiadomości też, a Giełda wymaga zmian
  w grafiku — pusta zakładka wygląda jak zepsuta.
- ⚠️ **Nie pokazuje się w Grafiku.** Filtr stoi w JEDNYM miejscu —
  `usersDoGrafiku` w `ManagerDashboard.tsx`, tam gdzie `<Grafik>` dostaje
  `users` — zamiast w siatce tygodnia, siatce miesiąca, modalu przypisania i
  doborze kandydatów osobno, gdzie prędzej czy później któreś zostałoby
  pominięte.
- **Decyzja żyje w Zatwierdzaniu zmian**, razem z liczbą już odbitych godzin —
  od niej zależy, czy odrzucenie kogokolwiek cokolwiek kosztuje.
  **Zatwierdź** zdejmuje tylko to jedno ograniczenie (dane umowy uzupełnia się
  w karcie, stąd przycisk "Otwórz kartę"). **Odrzuć** archiwizuje konto, a
  `shifts` zostają nietknięte: kto przepracował dzień próbny, ma za niego
  zapłatę niezależnie od tego, czy został przyjęty. Trwałe usunięcie zostaje
  tam, gdzie było zawsze — w widoku Archiwum.
- ⚠️ **`users` są teraz w pollu co 45 s** (`App.tsx`, razem z `shifts`,
  `issues` i `notifications`). Bez tego osoba dodana z drugiego urządzenia nie
  pojawiłaby się na liście, a odrzucona nadal by na niej stała i dalej odbijała
  godziny — tablet stoi zalogowany tygodniami.

## Raporty i koszty — przebudowa 2026-09-20 (0.40.0)

⚠️ **Koszt liczy `kosztMiesiaca()` z `utils/umowy.ts`, NIE `godziny × users.stawka`.**
Do 0.40.0 stała tam goła `users.stawka`, więc KAŻDY pracownik na umowie o pracę
miał koszt `null`, wypadał z kafelka „Koszt" i cały miesiąc świecił „dane
niepełne". To ta sama pomyłka, którą w 0.39.0 naprawiono w Pulsie
(`autoPodsumowanie`) — jeśli znajdziesz trzecie miejsce liczące koszt ze
stawki godzinowej, to jest ten sam błąd.

- **Cała arytmetyka miesiąca siedzi w jednej funkcji `agreguj(rok, miesIdx)`**,
  bo liczy się ją dwa razy: dla oglądanego miesiąca i dla poprzedniego (pasek
  porównania). Skopiowana reguła rozjechałaby się przy pierwszej poprawce —
  zwłaszcza reguła o dwóch zakresach, opisana niżej.
- **Zakładka startuje na miesiącu POPRZEDNIM.** Wchodzi się tu raz na miesiąc i
  po to, żeby przejrzeć miesiąc zamknięty; otwarta na bieżącym pokazywała połowę
  danych i wyglądała na niekompletną. ⚠️ Dlatego `goToEmployeeReport` przekazuje
  DATĘ klikniętej zmiany (`skok`) — bez tego klik w imię osoby stojącej właśnie
  na zmianie otwierał jej pustą kartę w poprzednim miesiącu.
- **Koszt per lokal to ALOKACJA proporcją godzin**, oznaczona `~`. Wynagrodzenie
  etatowca jest miesięczne i nie da się go rozciąć po miejscach inaczej; dzielimy
  właśnie tak, żeby rozbicie sumowało się DOKŁADNIE do kafelka wyżej. Znak `~`
  stoi tylko tam, gdzie naprawdę było co dzielić (etat w kilku lokalach).
- ⚠️ **W raporcie są WYŁĄCZNIE osoby z zarejestrowanymi godzinami w tym
  miesiącu.** Nikogo nie dopisujemy z listy pracowników. Pierwsza wersja
  0.40.0 dopisywała etatowców bez ani jednej odbitej godziny (pensja należy
  się niezależnie od godzin) i to WYMYŚLAŁO ludzi: osoba zatrudniona we
  wrześniu pokazywała się z pełną kwotą w każdym wcześniejszym miesiącu.
  `data_zatrudnienia`/`ostatni_dzien` są w kartach zwykle puste, więc nie ma na
  czym oprzeć takiego dopisywania — jedynym twardym śladem obecności w
  miesiącu jest odbita zmiana. Świadoma konsekwencja: nieobecność etatowca
  (choroba, urlop bezpłatny) nie pokaże się tu jako wydatek; to pytanie zadaje
  bilans okresu w karcie pracownika.
- **Zero godzin przy istniejącej zmianie znaczy jedno**: nikt nie odbił jej
  końca (`bezKonca > 0` → „zmiana bez zakończenia", patrz sekcja wyżej).
  Człowiek był, godziny czekają na decyzję.
- **Porównanie z poprzednim miesiącem jest BEZ zieleni i czerwieni.** Wyższy
  koszt przy wyższym utargu nie jest porażką, a więcej godzin nie jest ani dobre,
  ani złe samo z siebie. Koszt porównujemy tylko wtedy, gdy OBA miesiące są
  policzone do końca — inaczej spadek znaczyłby tylko tyle, że komuś nie wpisano
  wynagrodzenia.
- **Kwoty formatuje `zl()` z `utils/budzet.ts`**, to samo co w Grafiku i Pulsie:
  własny `toFixed(0) + " zł"` nie grupował tysięcy.
- **CSV eksportuje podsumowanie OSÓB, nie listę zmian** — tamtą eksportuje
  Rejestr Godzin. Brak wynagrodzenia wychodzi jako pusta komórka, nie zero.
- **Trzy przekroje pod jednym przełącznikiem** (`widok`: lokale / stanowiska /
  pracownicy). Kafelki i pasek porównania zostają NAD przełącznikiem — to rama,
  w której czyta się każdy z przekrojów; zmienia się tylko oś (gdzie wydaliśmy,
  na co, komu). Trzy sekcje jedna pod drugą robiły z tej strony stos.
  ⚠️ Etykiety pigułek są KRÓTKIE („Lokale"), bo pełną nazwę niesie nagłówek
  karty pod spodem — to samo zdanie w obu miejscach czytało się jak błąd.
- **Dwa rozbicia tych samych pieniędzy, jednym komponentem `Rozbicie`**:
  „Według lokalu" (gdzie wydaliśmy) i „Według stanowiska" (na co). Ten sam
  podział proporcją godzin liczy JEDNA pętla w `agreguj` — dwie rozjechałyby
  się przy pierwszej poprawce reguły.
- **Każda pozycja rozwija się strzałką, domyślnie ZWINIĘTA.** Skład zbiera
  `dodaj()` przy okazji liczenia (`osoby`), więc rozwinięcie niczego nie
  przelicza. Rozwinięte z góry, rozbicie zjadałoby ekran i zasłaniało sumę
  miesiąca, po którą się tu wchodzi. Kliknięcie nazwiska w środku woła
  `pokazOsobe` — przełącza na przekrój „pracownicy" i otwiera kartę; bez tego
  rozbicie kończy się na liczbie i tę samą osobę trzeba szukać ręcznie.
- ⚠️ **Wiersz z zerem godzin i zerem kosztu nie powstaje.** Osoba, której cała
  zmiana wisi bez zakończenia, dorzucała pustą pozycję „—" i znak „+?" przy
  stanowisku, w którym nic się nie wydarzyło. Wiersz bez godzin zostaje TYLKO
  dla kosztu, który trzeba gdzieś położyć (etatowiec bez odbitych godzin).

⚠️ **Raporty i koszty mają DWA zakresy i nie wolno ich zlepić w jeden.**
`periodShifts` (górny pasek, `matchesLokalFilter`) decyduje tylko o tym, KOGO
widać na liście — to nawigacja. Wszystkie liczby idą z `zakresOsob`: pełne
godziny tych osób ze wszystkich lokali, do których kierownik ma dostęp
(`hasAccessToLokal`). Powód: godziny i koszt jednej osoby to fakt płacowy, nie
fakt lokalu — liczone per zakładka, pracownik wypożyczony między lokalami
pokazywał się dwa razy, w każdej z częścią godzin, i żadna nie mówiła, ile mu
się w sumie należy. Kafelki, "Według lokalu" i wiersze osób liczą się z tego
samego `zakresOsob`, więc suma u góry zgadza się z rozbiciem pod spodem; w
wierszu dochodzi podpis "w tym X h w tym lokalu", gdy część godzin jest gdzie
indziej.

⚠️ **Formularz "Popraw zmianę" używa PEŁNYCH słowników** (`lokaleWszystkie`/
`stanowiskaWszystkie`), nie tych zawężonych do urządzenia — opisuje przeszłą
zmianę, która mogła się odbyć w innym lokalu. Dawny fallback „gdy żadne
stanowisko nie pasuje do lokalu, pokaż wszystkie” został USUNIĘTY: pozwalał
zapisać zmianie w lokalu B stanowisko z lokalu A, a w rejestrze powstawała
godzina pod stanowiskiem, którego tamten lokal nie ma. Pusta lista jest
uczciwsza niż zła podpowiedź.

⚠️ **Wartość każdego `<select>` musi istnieć wśród jego `<option>`.** Tablet
Służbowy podaje w `lokaleOptions`/`stanowiskaOptions` TYLKO swoje lokale, a
osoba wypożyczona ma `default_lokal` macierzystego — formularz startu zmiany
ustawiał wtedy wartość spoza listy, select pokazywał się pusty, efekt korekty
czyścił stanowisko i zapis padał na "Wypełnij wymagane pola!" mimo że wszystko
wyglądało na wypełnione (0.30.0 → 0.30.1). `domyslnyLokal()` w
`employeeSessionShared.tsx` wybiera teraz: lokal z dzisiejszego grafiku →
własny, jeśli dostępny → pierwszy dostępny; korekta stanowiska pyta grafiku,
zanim spadnie na pierwsze z brzegu. Formularz "Popraw zmianę" dokłada do listy
lokal poprawianej zmiany (`lokaleDoKorekty`) — tam opisujemy przeszłość, więc
lokal spoza urządzenia jest w porządku.

**Tablet a grafik:** `KioskDashboard` pokazuje przypisanych do lokalu PLUS tych,
których opublikowany grafik stawia dziś tutaj. **Dodajemy, nie przenosimy** —
plany się zmieniają, a osoba zdjęta z listy macierzystego lokalu nie odbiłaby
zmiany wcale, gdyby jednak tam przyszła. Kto jest w grafiku w dwóch lokalach,
pokaże się na obu tabletach.

**Odejście pracownika:** `przepiszZmiany()` w `utils/grafik.ts` przenosi przyszłe
zmiany na następcę. NIE dotyka `published_at`, więc wiersz liczy się jako
niewysłany i przy najbliższej publikacji nowa osoba dowie się o swoich zmianach.
Dni z wolnym, kolizją albo po `ostatni_dzien` są pomijane i zdejmowane — zmiana
wpisana komuś niedostępnemu jest gorsza niż brak obsady, bo wygląda na pokrytą.

## Duplikaty godzin i świeżość danych — 0.36.2

Dwa telefony służbowe w jednym lokalu, ten sam profil, strona na drugim
załadowana przed wpisem z pierwszego — i te same godziny wpisane dwa razy
(13.09.2026, Natalia i Katia). Przyczyna: `shifts` pobierane raz przy
montowaniu, a tablet stoi zalogowany tygodniami.

Naprawione dwiema warstwami: `shifts` w pollu co 45 s (okno 21 dni) i
`znajdzKolizjeWBazie` pytające BAZY tuż przed zapisem.
⚠️ Te 45 s to NIE okno, w którym duplikat przejdzie — kontrola przy zapisie
działa niezależnie od pollu. Zostaje tylko wyścig dwóch zapisów w tej samej
chwili.

Pełny opis, dane i propozycje (unikalny indeks `(user_id, start_time)`,
`created_by` + osobna tożsamość urządzeń):
[`docs/DUPLIKATY-I-SWIEZOSC-DANYCH.md`](docs/DUPLIKATY-I-SWIEZOSC-DANYCH.md).

⚠️ **Ta sama klasa błędu wróciła 08.09.2026 z PANELU, nie z tabletu** (naprawione
w 0.40.0). Jedno kliknięcie „Dopisz godziny" w kolejce „Był w grafiku, nie odbił"
dało dwa wiersze w `shifts` oddalone o **3,7 ms**, a `grafik_shifts.rozliczenie`
ustawiło się raz — więc kolejka wyglądała na rozliczoną i nikt tego nie zauważył,
dopóki Dawidowi nie wyszło 20 h zamiast 10.

Powód: jedynym zamkiem był `useState` („busy id"), a **stan Reacta aktualizuje
się asynchronicznie** — dwa wywołania w tym samym takcie widzą to samo `null` i
oba przechodzą dalej. Odtąd:
- zamek stoi na `useRef` (`zajmij`/`zwolnij` w `ZatwierdzanieZmian.tsx`) i
  obejmuje WSZYSTKIE decyzje tego ekranu, bo każda miała tę samą wadę;
- `rozliczBrakOdbicia` i `resolveCorrection` pytają BAZY (`znajdzKolizjeWBazie`)
  tuż przed dopisaniem godzin — gdy wiersz już jest, biorą istniejący zamiast
  tworzyć drugi, ale i tak kończą resztę (oznaczenie grafiku, rozwiązanie
  zgłoszenia), inaczej pozycja wróciłaby do kolejki jutro.

⚠️ **Każde nowe miejsce, które TWORZY wiersz w `shifts`, musi zadać to pytanie
bazie.** Zamek w komponencie chroni przed podwójnym wywołaniem, ale nie przed
nieaktualnym stanem ani przed drugą sesją.

## Znane błędy — JUŻ NAPRAWIONE, nie wprowadzaj ponownie

1. **Supabase domyślnie zwraca max 1000 wierszy na request.** `api.get()`
   w App.tsx paginuje przez `Range` header w pętli, aż strona zwróci mniej
   niż `pageSize`. Nie zamieniaj tego z powrotem na pojedynczy fetch.
2. **Rozjazd strefy czasowej (+1/+2h) w dwóch miejscach:**
   - W `sendToGoogleSheets()` — data budowana teraz przez `toLocalYMD()`
     (lokalne gettery Date), NIE przez `.toISOString().split("T")[0]`
     (to dawało datę UTC niespójną z czasem lokalnym z
     `toLocaleTimeString()`).
   - W Apps Script `syncFormEntriesToSupabase()` — czas budowany przez
     `toIsoWithOffset()` z jawnym offsetem Warszawy (`+01:00`/`+02:00`
     zależnie od DST), NIE przez doklejanie literalnego `"Z"` do
     lokalnego czasu (to fałszywie oznaczało czas lokalny jako UTC).
3. **`sheet.appendRow()` w Apps Script** potrafił pisać nowy wiersz daleko
   pod widoczną tabelą, jeśli w innych kolumnach arkusza były jakiekolwiek
   dane niżej (np. formuły). Zamienione na `getNextDataRow()`, które szuka
   ostatniego zajętego wiersza po konkretnej kolumnie ("Imię"), nie po
   całym arkuszu.
4. Node/TypeScript: `tsconfig.json` wymaga `"skipLibCheck": true` (konflikt
   wersji `typescript` z `@types/react`), a każdy plik frontendowy (dawniej
   tylko `App.tsx`, dziś każdy plik w `components/`, `api/`, `utils/`, a od
   0.33.0 także `config.ts`) ma `// @ts-nocheck` (kod pisany bez pełnego typowania — nie usuwaj tej linii,
   chyba że robisz świadomą migrację do prawdziwych typów).
5. `// @ts-nocheck` w `App.tsx` był kiedyś przypadkowo usunięty jednym z
   commitów, mimo `strict: true` w `tsconfig.json` — build z tym combo by
   się wysypał (implicit-any wszędzie). Przywrócone; jeśli edytujesz plik
   frontendowy i widzisz, że brakuje tej linii, dodaj ją z powrotem zamiast
   naprawiać setki typów naraz.
6. `tsconfig.json` był kiedyś dwoma sklejonymi obiektami JSON (przypadkowy
   duplikat przy wklejaniu) — nieprawidłowy JSON. Naprawione do jednego
   obiektu ze `strict: true` i `skipLibCheck: true`.
7. Pierwsza wersja `api/cron/check-document-terms` była napisana jako `.ts`
   i budowała się "pomyślnie" na Vercelu, ale funkcja crashowała w runtime
   (`FUNCTION_INVOCATION_FAILED` / `SyntaxError: Cannot use import
   statement outside a module`) — legacy `tsc`-pipeline Vercela dla funkcji
   w `api/` nie radzi sobie ze starą `typescript@4.4.4` z `package.json`
   (błąd `TS6046` w logach builda, niewidoczny bez sprawdzenia runtime
   logów/wywołania endpointu). Naprawione przez przepisanie na zwykły
   CommonJS `.js` — patrz ostrzeżenie w sekcji "Cron" wyżej, dotyczy
   każdej przyszłej funkcji w root-level `api/`.
8. Pierwsza wersja `createManagerNotification`/`createEmployeeNotification`
   w `api/cron/check-document-terms.js` nie sprawdzała statusu odpowiedzi
   z Supabase po `POST` — insert padał 400 (patrz błąd `user_name`/`action`
   NOT NULL wyżej), ale kod tego nie zauważał i szedł dalej do
   `patchUser(..., last_notified: dzisiaj)`, więc pracownik wyglądał na
   "obsłużonego dzisiaj" mimo że nikt nie dostał powiadomienia — cichy
   fałszywy sukces. Naprawione: obie funkcje rzucają błąd przy `!res.ok`,
   a pętla w cronie łapie błąd per (pracownik, termin) osobno i NIE
   ustawia `last_notified` przy niepowodzeniu (więc spróbuje ponownie
   następnego dnia) zamiast łapać wszystko jednym try/catch na cały batch.
   Każda przyszła funkcja pisząca do Supabase z `api/` musi tak samo
   sprawdzać `res.ok`, nie tylko `await fetch(...)`.
9. Zapisywanie pracownika z pustymi polami `sanepid_expiry`/`umowa_expiry`
   dawało `Błąd zapisu pracownika!` bez dalszego wyjaśnienia (wypełnienie
   losowej daty działało). Przyczyna: `<input type="date">` przy pustej
   wartości daje `""`, a Postgres odrzuca `""` jako nieprawidłową datę dla
   kolumny `date` (akceptuje `null`). Naprawione w `handleSaveUser` —
   `""` → `null` przed wysyłką. Każde przyszłe pole typu `date` na
   formularzu musi przejść przez tę samą konwersję.
10. Pierwsza wersja `KioskDashboard.tsx` (dziś: `Shell` w
    `employeeSessionShared.tsx`) definiowała współdzielony komponent
    `Shell` (nagłówek + tabbar sesji) WEWNĄTRZ komponentu nadrzędnego. Ten
    komponent ma żywy zegar (`setInterval` co 1s, licznik trwającej
    zmiany) — każdy tick re-renderował rodzica, co tworzyło `Shell` jako
    NOWĄ referencję funkcji przy każdym renderze. React traktuje to jako
    nowy typ komponentu i odmontowuje/montuje całe poddrzewo od nowa —
    pola formularza (np. textarea w "Zgłoś") traciłyby focus co sekundę,
    scroll by się resetował. Naprawione przeniesieniem `Shell` na poziom
    modułu (poza komponentem), z `screen`/`setScreen`/`onBack`/
    `unreadCount` przekazywanymi jako propsy. Ogólna zasada: **nigdy nie
    definiuj komponentu wewnątrz komponentu, który ma stan zmieniający
    się w pętli/interwale** — nawet pozornie niewinny żywy zegar w
    rodzicu psuje całe poddrzewo.
11. Pierwsza wersja `KioskDashboard.tsx` miała cztery komentarze
    `// eslint-disable-next-line react-hooks/exhaustive-deps` — build na
    Vercelu (`npm run build`, `CI=true`) padał z `Definition for rule
    'react-hooks/exhaustive-deps' was not found`, bo w konfiguracji ESLint
    tego repo (sam CRA, bez własnego `eslintConfig` w `package.json`) to
    prawidło nie jest załadowane — referencja do niego w komentarzu
    disable jest sama w sobie błędem lintu przy CI. W tym repo NIGDZIE
    indziej nie ma komentarzy `eslint-disable` (np. `TimeEntryForm.tsx` ma
    podobne "niepełne" tablice zależności `useEffect` bez żadnego
    komentarza) — nie dodawaj takich komentarzy, po prostu zostaw
    zależności tak jak reszta kodu w tym repo.
12. Migracja SQL wklejona jako jeden wieloliniowy skrypt w Supabase SQL
    Editor wykonuje się jako JEDNA transakcja — błąd w którymkolwiek
    poleceniu (np. `create table ... references shifts(id)` z niezgodnym
    typem, patrz `shift_edits` w Schemacie Supabase wyżej) cofa też
    WSZYSTKIE wcześniejsze polecenia z tego samego wklejenia, nawet jeśli
    wyglądały na wykonane. W tej sesji poprawki `alter table issues`/
    `alter table users` z pierwszej (nieudanej) próby zniknęły razem z
    błędnym `create table` i zostały odkryte dopiero jako "Could not find
    the 'proposed_date' column ... in the schema cache" kilka kroków
    później — nie od razu jako oczywisty błąd migracji. Po KAŻDEJ
    wieloliniowej migracji, zwłaszcza po jakiejkolwiek wcześniejszej
    porażce, zweryfikuj realny stan przez
    `select column_name, data_type from information_schema.columns
    where table_name = '...'` zamiast ufać, że "sukces" na kolejnej,
    poprawionej migracji oznacza że wcześniejsze też się zapisały.
13. Podobny błąd typu jak w #12: pierwsza próba `shift_edits.shift_id`
    jako `bigint references shifts(id)` padła, bo `shifts.id` jest `uuid`
    — nie `bigint`, wbrew temu co ten plik (błędnie) sugerował wcześniej.
    Sprawdzone bezpośrednio 2026-09-02: **wszystkie** id w tym projekcie
    (`shifts`, `issues`, `users`) to `uuid`. Nie zakładaj typu kolumny na
    podstawie tego co jest napisane w CLAUDE.md ani na podstawie tego, jak
    kod jednego miejsca traktuje daną wartość (np. stary
    `Number(zgShiftId)` w `employeeSessionShared.tsx` zakładał liczbę i był
    cichym błędem — poprawione na zwykły string) — sprawdź
    `information_schema.columns`, jeśli cokolwiek na tym zależy.

14. `handleSaveUser` czyścił `email` i `pin` dla KAŻDEGO konta roli `open`
    (`dataToSave.email = ""`) — reguła z czasów, gdy takie konto w ogóle nie
    logowało się do apki. Po dodaniu dostępu z prywatnego telefonu (0.26.0)
    oznaczało to, że e-mail znikał przy każdym zapisie karty, dostępu nie
    dawało się nadać, a logowanie mówiło "nie ma takiego użytkownika".
    Naprawione w 0.26.2: czyścimy tylko `pin` (konto otwarte loguje się
    `kiosk_pin`), e-mail zostaje i jest normalizowany do małych liter bez
    spacji. ⚠️ Przy okazji: porównywanie znormalizowanych e-maili wymaga
    odrzucenia PUSTEGO e-maila PRZED wyszukiwaniem — wszystkie konta otwarte
    mają w bazie `email = ''` po starym zapisie, więc pusty input pasowałby
    do nich wszystkich.
15. Publikacja grafiku była zawężona do lokali WIDOCZNYCH w siatce
    (`lokaleNames`), a zmianę można wpisać z siatki jednego lokalu do
    drugiego (kafelek "stanowisko · lokal"). Taka zmiana nigdy nie dawała
    się wysłać: zostawała wersją roboczą — niewidoczną dla pracownika i, bo
    nic jej nie oznaczało, także dla kierownika. Naprawione: publikacja
    obejmuje wszystkie lokale kierownika od dziś w przód, a niewysłane
    wiersze mają kropkę w komórce i licznik przy nazwie lokalu. Jeśli
    dokładasz kolejny widok grafiku, licz niewysłane po `allLokaleNames`, a
    nie po tym, co akurat widać.

16. **W `App.tsx` kilka dashboardów ma niemal identyczne listy propsów** —
    `<PersonalDashboard>`, `<KioskDashboard>` i `<ManagerDashboard>` przekazują
    te same nazwy w tej samej kolejności (`tasks`, `taskCompletions`,
    `setTaskCompletions`, `absences`, `planShifts`…). Wstawianie nowych propsów
    przez wyszukanie takiego fragmentu trafia w PIERWSZE wystąpienie, czyli w
    dashboard pracownika, a nie w ten, o który chodziło. Tak właśnie cała grupa
    propsów dziennika (`dayLogs`, `dayLogEntries`, `dayLogTemplates` i ich
    settery) wylądowała w `<PersonalDashboard>`, który ich nie przyjmuje.
    Objawy były mylące i wyglądały na trzy różne błędy: pusty ekran
    konfiguracji po odświeżeniu, zapis, po którym nic się nie pokazuje, i
    zminifikowane `i is not a function` przy zapisie (bo brakowało też
    settera). **Dodając props do dashboardu, sprawdź numer linii elementu**
    (`grep -n "<ManagerDashboard" src/App.tsx`), nie samo sąsiedztwo nazw.
    Wykrył to dopiero `harness-app.html`, który montuje App i porównuje, co z
    niego wychodzi z tym, co dociera do zakładki.

17. **Usunięcie zmiany, do której odnosi się zgłoszenie, padało z 409.**
    `issues.shift_id` to jedyny prawdziwy klucz obcy w projekcie i był bez
    klauzuli `ON DELETE`, więc Postgres blokował `delete` na `shifts`
    (`violates foreign key constraint "issues_shift_id_fkey"`). Trafiało to
    dokładnie w te zmiany, do których pracownik wysłał "Popraw zmianę" — czyli
    w te, które kierownik najczęściej chce potem skasować. Migracja `0017`
    zmienia FK na `ON DELETE SET NULL`: zgłoszenie zostaje (to zapis, o co
    pracownik prosił i jak to rozstrzygnięto), traci tylko wskaźnik na
    nieistniejący wiersz. ⚠️ Przy okazji: `api.delete` pokazywało samo
    "Błąd usuwania" bez statusu i treści z Postgresa, więc przez dłuższą chwilę
    nie dało się odróżnić FK od braku uprawnień, sieci i wiersza bez id — dziś
    komunikat niesie przyczynę, a pusty `id` jest odrzucany przed wysłaniem
    zapytania. **Każdy nowy komunikat błędu przy zapisie/usuwaniu ma podawać
    przyczynę**, nie samo "coś poszło nie tak".

18. **"Dzień wypłaty" w ustawieniach lokalu nie zapisywał się.** Pole było w
    formularzu (`Pracownicy.tsx`, widok Lokale), ale `handleSaveDict` budował
    payload z trzech kolumn — `name`, `miasto`, `dostepne_bloki` — więc
    wartość przepadała bez śladu i bez błędu. Klasa błędu do zapamiętania:
    **payload zapisu jest tu budowany z jawnej listy pól, nie ze `{...stanu}`**
    (inaczej niż `handleSaveUser`), więc każde nowe pole w formularzu słownika
    trzeba dopisać w DWÓCH miejscach. Dodając kolumnę do Lokali/Stanowisk,
    sprawdź payload, a nie tylko formularz.

## Google Apps Script (`Odbior_Danych.gs`)

Funkcje: `doGet` (health-check, zwraca `SCRIPT_VERSION` — podbijaj tę
stałą przy każdym deployu, żeby dało się zweryfikować w przeglądarce czy
nowa wersja faktycznie jest live), `doPost` (ADD/EDIT/DELETE_SHIFT z
aplikacji → zapis do arkusza per-lokal), `syncFormEntriesToSupabase`
(historyczne dane z Google Forms → Supabase, pomija już zsynchronizowane
wg kolumny `Supabase_Shift_ID`), `resetSyncStatus` (czyści
`Supabase_Shift_ID` + `Status_Sync`, do pełnej resynchronizacji od zera po
`truncate table shifts`).

Po KAŻDEJ zmianie w skrypcie: Deploy → Manage deployments → edytuj →
"New version" → Deploy (sam zapis w edytorze NIE aktualizuje żywego Web
App). Zweryfikuj przez `doGet` w przeglądarce.

## Wersjonowanie i CHANGELOG

Aplikacja ma numer wersji (`APP_VERSION` w `src/config.ts`), widoczny na
ekranie logowania. Historia zmian jest w [`CHANGELOG.md`](CHANGELOG.md)
w katalogu głównym repo.

⚠️ **Do 0.41.2 każdy bump `APP_VERSION` wylogowywał wszystkich** — sesja
leżała w `localStorage` otagowana wersją i przy niezgodności była kasowana.
Był to jedyny sposób na "wyloguj wszystkich", bo nie istniała tabela sesji.
**Od 0.42.0 to nieprawda**: sesję trzyma Supabase Auth, przeżywa aktualizacje,
a unieważnić ją da się po stronie serwera. Podbicie wersji jest znowu
zwykłym podbiciem wersji i nie kosztuje nikogo ponownego logowania.

⚠️ Zostaje za to drugi, niezmieniony fakt: **podbicie `APP_VERSION` nie
wymusza samo z siebie odświeżenia otwartej karty**. Tablet, którego nikt nie
przeładuje, dalej chodzi na starym bundlu — od tego jest `UpdateBanner`
(pasek "dostępna nowa wersja", czyta `public/version.json` co 5 minut).

⚠️ Od 2026-09-02 (redesign Panelu Kierownika) doszły dwa kolejne miejsca,
które trzeba aktualizować razem z `APP_VERSION`, inaczej cicho wyjdą z
synchronizacji:
- **`public/version.json`** (`{ "version": "X.Y.Z" }`) — `UpdateBanner.tsx`
  (zamontowany w `App.tsx`, widoczny dla wszystkich ról) odpytuje ten plik
  co 5 minut i porównuje z `APP_VERSION` wbudowanym w już załadowany
  bundle; różnica pokazuje pasek "Dostępna nowa wersja — odśwież stronę".
  Zapomniany bump tego pliku = pasek nigdy się nie pokaże (albo pokaże się
  od razu po kolejnym deployu, jeśli zapomniano przy poprzednim).
- **`CHANGELOG` (tablica) w `src/components/manager/Przewodnik.tsx`** —
  skrócona wersja `CHANGELOG.md` pokazywana w apce (zakładka Przewodnik →
  "Historia wersji"). `CHANGELOG.md` w repo zostaje pełnym źródłem prawdy;
  ta tablica to tylko ostatnie kilka wpisów, ręcznie duplikowane w
  skróconej formie (bez pogrubień/formatowania markdown).

**Rób to samodzielnie, bez pytania właściciela** — za każdym razem, gdy
kończysz zmianę widoczną dla użytkownika (nowa funkcja, poprawka
zachowania, zauważalna poprawa UX/wydajności):
1. Podbij `APP_VERSION` w `src/config.ts`:
   - PATCH (`0.4.0` → `0.4.1`) — poprawka błędu, drobne dopracowanie.
   - MINOR (`0.4.1` → `0.5.0`) — nowa funkcja albo ukończony punkt
     Roadmapy.
   - MAJOR — zarezerwowane na przyszły "prawdziwy" launch 1.0, nie używaj
     bez wyraźnej prośby właściciela.
2. Dodaj wpis na górze `CHANGELOG.md` (nowa wersja = nowa sekcja, data w
   formacie RRRR-MM-DD) — krótko, po polsku, z perspektywy użytkownika
   ("co się zmieniło dla mnie", nie szczegóły implementacji techniczne;
   te są w komunikacie commita/PR).
3. Zaktualizuj `public/version.json` na tę samą wartość.
4. Dodaj skrócony odpowiednik wpisu do tablicy `CHANGELOG` w
   `Przewodnik.tsx` (kilka punktów, nie całość).

**Czego NIE wpisywać**: refaktoryzacja bez zmiany zachowania, zmiany
tylko w dokumentacji (CLAUDE.md, komentarze), poprawki, które nigdy nie
trafiły na produkcję (np. bug znaleziony i naprawiony w tej samej sesji
zanim ktokolwiek zdążył go zobaczyć) — patrz przykład w historii: refaktor
`App.tsx` (0.2.0) dostał wpis mimo braku zmiany zachowania, bo był na tyle
duży, że warto było zaznaczyć moment w historii; kolejne drobne refaktory
raczej nie potrzebują własnego wpisu.

## Konwencje designu

- Język UI: polski (pracownicy w Polsce/Ukraińcy pracujący po polsku).
- Kolory ról/stanowisk: kodowane hash-em nazwy stanowiska na paletę
  Tailwind (`getColorForStanowisko`), spójne między Grafikiem a Pulpitem.
- Mobile-first — duża część użytkowników wchodzi z telefonu/tabletu w
  kuchni, nie z laptopa. Duże przyciski, duży tekst na formularzach czasu.
- Ikony z `lucide-react`, nie SVG inline.
- **Jeden wireframe'owy język wizualny w całej aplikacji**, nie tylko u
  pracownika: `#DE3A22` akcent, `font-['Archivo']` na nagłówkach, grube
  2/2.5px obramowania. Źródło prawdy dla stałych — `employeeSessionShared.tsx`
  (mobilne ekrany pracownika: `fieldLabelCls`, `ctaPrimaryCls`, `selectElCls`
  itd.) i `components/manager/designTokens.ts` (desktopowy Panel Kierownika:
  `statTileCls`, `sectionCardCls`, `btnPrimaryCls` itd.) — importuj stamtąd
  zamiast wpisywać hexy/klasy ręcznie w nowym komponencie, żeby nie
  rozjeżdżały się dwa niby-te-same odcienie czerwieni w różnych miejscach.

---

## Roadmap — kolejność wdrażania (ustalona z właścicielem)

Priorytet: najpierw UX/design istniejącego MVP, żeby zespół przyzwyczaił
się i polubił system. Grafik (planowanie zmian) to najbardziej wartościowy,
ale i najbardziej ryzykowny moduł — celowo na końcu, gdy reszta jest
stabilna i ludzie już ufają systemowi.

### 0. Fundament: refaktoryzacja + powiadomienia dla kierowników — **ZROBIONE**
Rozbić `App.tsx` na komponenty/pliki (`components/`, `api/`, `utils/`) —
mniejszy blast radius przy każdej kolejnej zmianie. Dodać kierownikom
własną zakładkę powiadomień — patrz "Panel kierownika" i "Struktura
plików" wyżej, oraz `createManagerNotification` w `api/notifications.ts`.
To wspólna infrastruktura dla punktów 1 i 2 niżej — nowe funkcje mają
wywoływać tę funkcję, nie tworzyć własnego mechanizmu powiadomień.
⚠️ Wymaga ręcznego dodania kolumn `audience`/`message`/`type` do tabeli
`notifications` w Supabase (patrz Schemat Supabase wyżej) — sprawdź, że
zostało zastosowane, zanim zaczniesz punkt 1 lub 2.

### 1. Sanepid / terminy dokumentów — **ZROBIONE** (zamknięte na 2 terminach)
Pola w karcie pracownika: data ważności książeczki sanepid + data umowy.
Świadomie **nie** "inne pola wg potrzeby" — właściciel zdecydował zamknąć
zestaw na tych dwóch terminach, bez mechanizmu dodawania kolejnych bez
zmiany kodu (patrz "Panel kierownika" wyżej). Codzienna weryfikacja
(Vercel Cron, `api/cron/check-document-terms.js`) i powiadomienie
kierownika ORAZ pracownika: miesiąc przed, 2 tygodnie przed, codziennie w
ostatnim tygodniu, i codziennie po przekroczeniu terminu aż do poprawy.

### 2. Zadania + Sprzątanie — **ZADANIA ZROBIONE (przebudowane na bloki w 0.37.0), Sprzątanie jako osobny proces ODŁOŻONE**
⚠️ Zaimplementowana część NIE odpowiada już dokładnie opisowi niżej —
patrz sekcja "Zadania — bloki i pomiary" wyżej po pełny, aktualny opis. Skrót:

- **Zadania** — ZROBIONE (2026-09-02/03). Zadania tworzone przez
  kierownika (poranne/obiadowe/wieczorne/ogólne/cykliczne, priorytet,
  dowolny wybór dni tygodnia, wspólne dla lokalu albo osobne per
  stanowisko), checklisty widoczne pracownikowi na Pulpit/Zmiana/Zadania,
  panel kierownika z podglądem postępu, drill-down zaległości, pełną
  listą i archiwizacją.
- **Sprzątanie jako OSOBNY, rozbudowany proces** (elektroniczny dziennik
  HACCP: obladnannia/sprzęt jako osobna encja, logi temperatur chłodni/
  zamrażarek, ocena jakości, harmonogram per sprzęt z wyborem konkretnych
  dni tygodnia) — **świadomie ODŁOŻONE** na prośbę właściciela
  (2026-09-03). To, co dziś nazywa się "cykliczne" w module Zadania,
  obsługuje tylko prosty przypadek "co N dni", NIE jest tym samym co ten
  punkt. Nie projektuj `equipment`/`cleaning_logs` z własnej inicjatywy —
  czekaj na osobną sesję planistyczną z właścicielem.

Oba typy mają "beneficjenta" w postaci stanowiska (kto jest
odpowiedzialny). Zależało od fundamentu z punktu 0 (powiadomienia
kierownika) — już gotowe.

### 3. Wydarzenia
Kierownik tworzy zdarzenie (zebranie, grupa o określonej godzinie itp.)
widoczne dla pracowników. Najprostszy moduł z całej listy — dobry "quick
win" do budowania zaufania do systemu.

### 4. Wnioski o urlop/wolne — CZĘŚCIOWO ZROBIONE (2026-09-03)
⚠️ Podstawowy flow wniosek → zatwierdzenie DZIAŁA — patrz "Urlopy i
niedostępność" wyżej po pełny, aktualny opis. Zrobione: pracownik wysyła
wniosek (urlop albo niedostępność) z zakładki Zgłoś, kierownik
zatwierdza/odrzuca w Zatwierdzanie zmian albo wpisuje urlop bezpośrednio
w karcie pracownika, zatwierdzony urlop materializuje się jako godziny
(8h/dzień roboczy) widoczne we wszystkich raportach. NIE zrobione jeszcze
z tego punktu: wysyłanie wniosku z dużym wyprzedzeniem na przyszłe lata
działa (to zwykłe pola `date`, bez ograniczenia), ale nie ma osobnego
widoku/"tablo" z wnioskami na nadchodzący miesiąc — dziś widać je tylko w
kolejce "Zatwierdzanie zmian" (tylko oczekujące) i w karcie pracownika
(historia per osoba). Twarda walidacja "zatwierdzonego urlopu nie da się
nadpisać zmianą" wciąż czeka na Grafik, jak opisano niżej — dziś
`findOverlappingShift` i tak odrzuca nakładającą się zmianę jako efekt
uboczny materializacji (patrz wyżej), ale to nie jest świadoma,
dedykowana walidacja.

### 5. Grafik — **ZROBIONE** (0.23.0, 2026-09-04)
⚠️ Pełna, aktualna specyfikacja modułu żyje w [`docs/GRAFIK.md`](docs/GRAFIK.md)
— tam są wszystkie decyzje właściciela z sesji projektowej wraz z
uzasadnieniami. Poniżej tylko to, o co najłatwiej się potknąć:

- **`grafik_shifts.rozliczenie`** ('zapisano'|'odrzucono', + `rozliczenie_przez`,
  `rozliczenie_at`) — co kierownik zrobił ze zmianą, której nikt nie odbił.
  Patrz "Zmiany z grafiku bez odbicia" niżej. Migracja `0016`.
- **Plan i fakt to dwie różne tabele.** `grafik_shifts` = plan (kto ma
  pracować), `shifts` = fakt (odbicia). Grafik NIGDY nie pisze do `shifts`
  poza materializacją urlopu.
- **Blokujemy wyłącznie nachodzące godziny.** Druga zmiana tego samego dnia
  i praca w dwóch lokalach jednego dnia są dozwolone — to normalna praktyka
  u właściciela, nie błąd.
- **Wymagania obsady sumują się.** "2 osoby 09:00–21:00" + "1 osoba
  14:00–19:00" = 3 osoby między 14:00 a 19:00. Kontrola liczy obsadę minuta
  po minucie i raportuje DŁUGOŚĆ dziury, nie sam fakt niedoboru.
- **Kto może wejść na zmianę, decyduje STANOWISKO, nie lokal.**
  `users.allowed_stanowiska` trzyma nazwy stanowisk (tekst po przecinku, jak
  `allowed_lokale` — NIE tablica Postgresa). Ta sama nazwa w innym lokalu to
  to samo uprawnienie — na tym opiera się wypożyczanie ludzi między lokalami.
- **Pracownik widzi tylko grafik wysłany.** Filtr żyje w
  `publishedShiftsFor` (utils/grafik.ts), nie w dashboardach — inaczej łatwo
  o wyciek wersji roboczej.
- **Jedno kliknięcie "Wyślij" publikuje wszystko od dziś w przód, ze
  wszystkich lokali kierownika.** Wysyłka per oglądany tydzień była zbyt
  łatwa do zgubienia (zmiana wpisana do innego lokalu zostawała wersją
  roboczą i nikt tego nie widział).
- **Usunięcie wysłanej zmiany to zarejestrowana zmiana** — `deleted_at`,
  wiersz znika z widoku, ale kasuje się dopiero przy publikacji, która
  informuje o tym pracownika.
- Import z arkusza Google: [`scripts/import-grafik.py`](scripts/import-grafik.py)
  (domyślnie suchy przebieg). URP z zerem godzin w dzień roboczy to NIE
  urlop, tylko niedostępność bez godzin — ustalenie właściciela.

### 5a. Grafik — co doszło po pierwszym wydaniu (0.24.0–0.26.3)

- **Widok "Dzień"** obok "Tydzień" (`trybDnia` w `GrafikTydzien.tsx`) — ta
  sama siatka z jedną kolumną, do poprawek z telefonu. `Tydzień`/`Dzień`
  stoją parą, `Miesiąc`/`Konfiguracja` osobno.
- **Publikacja wysyła WSZYSTKO od dziś w przód, ze wszystkich lokali
  kierownika** (`publishGrafik`, wcześniej `publishWeek`). Wysyłka per
  oglądany tydzień była nie do utrzymania: zmiana wpisana z siatki jednego
  lokalu do drugiego nie dawała się wysłać i po cichu zostawała wersją
  roboczą. Niewysłane wiersze mają kropkę w siatce i licznik przy lokalu.
- **Usunięcie wysłanej zmiany to `deleted_at`**, nie DELETE — znika z
  widoków od razu, liczy się jako niewysłana i kasuje dopiero przy
  publikacji, która informuje o tym pracownika. Zmiana nigdy niewysłana
  kasuje się od razu. Migracja:
  [`docs/sql/migrations/0008_grafik_usuwanie.sql`](docs/sql/migrations/0008_grafik_usuwanie.sql).
- **Wolne/urlop wprost z grafiku** — link w modalu zmiany, gdy pracownika
  długo nie ma i nie zgłosi tego sam (`addNiedostepnoscDirectly` obok
  istniejącego `addUrlopDirectly` w `utils/absences.ts`).
- **Zmiany osoby z wyłączonym kontem NIE liczą się jako obsada**
  (`__nieaktywny`, ustawiane raz w `Grafik.tsx`). Taka osoba zostaje
  widoczna w siatce z podpisem "KONTO WYŁĄCZONE" i przekreślonymi zmianami
  — inaczej po jej odejściu zmiany znikały z widoku, ale nadal wypełniały
  obsadę i dzień kłamał, że jest pokryty. Archiwizacja pracownika pyta o
  jego przyszłe zmiany i zdejmuje je (`futureShiftsOfUser`).
- **Tablet Służbowy zna grafik**: zielone "o HH:MM" przy osobie oczekiwanej
  dziś, licznik "na zmianie / wg grafiku jeszcze nie odbiło / zakończyło",
  lista posortowana wg grafiku, koperta przy nieprzeczytanej wiadomości.
  Powiadomienia są per WYBRANY pracownik — wcześniej urządzenie pokazywało
  worek wiadomości wszystkich i pierwsza osoba oznaczała cudze jako
  przeczytane.

- **Ostrzeżenia o obsadzie stoją WPROST w siatce** (0.28.0), nie w dymku —
  `problemyObsady()` skleja dziury i nadmiary w jedną listę posortowaną po
  godzinie, `ProblemyObsady` w `GrafikTydzien.tsx` rysuje je pod nagłówkiem
  dnia i powtarza w stopce. Czerwone = brakuje, żółte = wpisano za dużo.
  `coverageSegments()` (dawne `coverageGaps`) zwraca teraz `{ gaps,
  nadmiary }`, a `checkDayCoverage` dokłada `nadmiary`/`hasNadmiar`/
  `nadmiarMinutes`.
  - **Nadmiar liczymy tylko dla stanowisk, które mają tego dnia jakiekolwiek
    wymaganie.** Bez tego lokal z niewypełnioną konfiguracją świeciłby na
    żółto od pierwszej wpisanej zmiany — "nie wiem, ilu ludzi trzeba" to nie
    to samo co "jest ich za dużo".
  - **`required === 0` dostaje znak `?`**, nie zwykłe "+N". To prawie zawsze
    znaczy "wymagania na tę porę w ogóle nie wpisano", a nie nadmiar ludzi —
    tak wychodzi np. w Bułce w soboty, gdzie reguła bazowa ma dni
    `1,2,3,4,5,0` (bez soboty), więc dodatkowa sobotnia reguła "+1 os.
    14:00–19:00" nie ma się do czego dodać.
- **Druga zmiana w innym lokalu jest widoczna zawsze** (0.28.0). Wcześniej
  wiersz "— w {lokal} HH:MM–HH:MM" pokazywał się TYLKO wtedy, gdy w oglądanym
  lokalu osoba nie miała nic, i tylko dla pierwszej takiej zmiany
  (`planWeek.find`). Osoba wypożyczona po południu gdzie indziej wyglądała
  więc na wolną cały dzień. Dziś `gdzieIndziej` to `filter` po wszystkich
  zmianach dnia poza tym lokalem, renderowany w każdej gałęzi komórki.

### 5f. Budżet Grafiku — dodane 2026-09-17 (0.39.0)

Grafik wiedział, ILU ludzi ma stać na zmianie, ale nie wiedział, ILE to ma
kosztować. Kierownik układał tydzień, a o koszcie dowiadywał się dopiero w
Pulsie — czyli po fakcie, kiedy jedyne, co da się zrobić, to opisać w
komentarzu, dlaczego wyszło drożej. Cała arytmetyka w
[`utils/budzet.ts`](src/utils/budzet.ts), migracja `0022`.

**Ile lokal WYDAJE, nie ile pracownik zarobi** (ustalenie właściciela z tej
sesji). Koszt godziny to `stawkaEfektywna` z `utils/umowy.ts` PLUS narzut
pracodawcy z konfiguracji lokalu (`narzut_umowa`/`narzut_zlecenie`):

| Typ umowy | Koszt godziny |
|---|---|
| Zlecenie / B2B | `stawka` × (1 + narzut) |
| Umowa o pracę | `wynagrodzenie_mies / norma miesiąca` × (1 + narzut) |
| Brak obu | `null` — osoba trafia na listę `bezDanych`, NIE liczy się jako 0 |

⚠️ **To świadome odstępstwo od zasady z 5c** („godziny × stawka przy umowie o
pracę byłoby mylące”) i dotyczy WYŁĄCZNIE warstwy budżetu. Tam pytanie brzmi
inaczej: nie „ile kosztuje kolejna godzina” (przy etacie: nic), tylko „jaką
część stałego kosztu zjadł ten dzień”. Dlatego przy etatach w karcie tygodnia
stoi znak `~` — to ALOKACJA, nie wydatek dodatkowy. W wierszu pracownika dalej
stoi norma, bo tam decyzją jest „czy wystarczy godzin”.

⚠️ **Puls liczy tym samym kodem od 0.39.0.** `autoPodsumowanie` w
`utils/dziennik.ts` używało gołej `users.stawka`, więc etatowiec bez stawki
godzinowej wchodził do kosztu dnia jako ZERO i lokal z samymi etatami miał
idealny labour cost. Liczby w kartach dni sprzed tej wersji były przez to
zaniżone. `autoPodsumowanie`/`wierszDnia` przyjmują teraz `lokalRow` (narzut).

**Dwa poziomy celu, i tylko dwa:**
- `grafik_budzet_cele` — reguła na dzień tygodnia, wersjonowana miesięcznie
  dokładnie jak `staffing_rule_sets` (zestaw = para `lokal` + `obowiazuje_od`,
  zawsze siedem wierszy; obowiązuje od swojego miesiąca aż do nowszego).
- `grafik_budzet_dni` — wyjątek na JEDNĄ datę, nadpisujący POLE PO POLU (można
  zmienić sam utarg i zostawić procent z zestawu).

⚠️ **Cele NIE wiszą na `staffing_rule_sets`**, mimo że wersjonują się tak samo:
utworzenie zestawu celów na październik utworzyłoby wtedy także PUSTY zestaw
wymagań obsady, a `findRuleSetForDate` bierze najnowszy zestaw ≤ data — kontrola
dziur zamilkłaby na cały miesiąc i nikt by tego nie zauważył, bo brak ostrzeżeń
wygląda dokładnie jak brak problemów.

⚠️ **Wyjątki budżetu NIE są w `grafik_wyjatki`** — tamto ma zakres dat, własne
wymagania obsady i godziny otwarcia. Olówek w siatce ma zmienić jedną liczbę na
jeden dzień, a nie po cichu ruszyć godziny otwarcia. Dlatego zakres dodany w
Konfiguracji rozpisuje się na pojedyncze dni: „który dzień jest zmieniony” ma
wtedy jedną, trywialną odpowiedź.

**Trzeci układ siatki: `uklad === "budzet"`** (obok `osoby` i `stanowiska`).
⚠️ **Nagłówek dni jest WSPÓLNY** — zostaje w `LokalSection` w
`GrafikTydzien.tsx`, a `GrafikBudzet.tsx` dostarcza tylko `<tbody>`. Ustalenie
właściciela: szapka ma wyglądać identycznie we wszystkich trzech układach, a
druga kopia tego nagłówka rozjechałaby się przy pierwszej poprawce pogody albo
godzin. Stopka z sumami godzin w tym układzie się nie powtarza.

Szczegóły, które łatwo zepsuć:
- **`cel === null` znaczy „nie skonfigurowano”, nie „zero”** — cała warstwa
  wtedy milczy. Zapas „0 zł” wygląda jak liczba, którą ktoś policzył.
- **Minimalny utarg tygodnia to SUMA dziennych**, nie „koszt tygodnia przez
  średni procent”. Cel bywa inny w sobotę niż we wtorek, więc te dwa rachunki
  dają różne liczby, a tylko pierwszy zgadza się z kolumnami pod spodem.
- **Do średniej „min. utarg na dzień” wchodzą tylko dni z obsadą.** Dzień bez
  zmian ma minimalny utarg zero i wliczony zaniżałby średnią tak, że tydzień z
  trzema obsadzonymi dniami wyglądałby na dwa razy łatwiejszy.
- **Wartość równa tej z zestawu NIE jest nadpisaniem** — inaczej dzień dostawał
  czerwony podpis „zmienione na ten dzień” mimo że nic się nie zmieniło.
- **„Cofnij” kasuje tylko swoje pole**, nie cały wyjątek dnia.
- **Koszt bierzemy po `date`**, nie po odcinkach przez północ — tak samo jak
  godziny w nagłówku dnia. Dwie liczby o tym samym dniu, które się nie zgadzają,
  kosztują więcej zaufania, niż warta jest ta precyzja.
- **`zl()` grupuje tysiące SAMO**, bo `toLocaleString("pl-PL")` nie grupuje
  liczb czterocyfrowych i w jednej kolumnie stało „1260 zł” obok „13 000 zł”.
- **Prognozowany utarg nigdy nie podstawia się sam** (ustalenie właściciela).
  `sredniUtargDnia` siedzi pod przyciskiem „z historii”. Liczba, która wpisała
  się sama, po tygodniu wygląda dokładnie jak liczba wpisana świadomie.
- **Edycja komórek tylko w trybie Edycja**, jak reszta Grafiku.
- **Udział kosztu w utargu tygodnia liczymy z SUM**, nie jako średnią dziennych
  procentów, a cel do porównania ważymy prognozą. Średnia arytmetyczna kłamałaby
  tym mocniej, im bardziej sobota różni się utargiem od wtorku. Różnica dwóch
  procentów to PUNKTY PROCENTOWE — "o 30,2% poniżej celu 33%" znaczy co innego
  niż to, o co chodzi.
- **Plakietka normy przy nazwisku** (`plakietkaNormy` w `GrafikTydzien.tsx`)
  dotyczy WYŁĄCZNIE umowy o pracę i niedobór jest w niej szary, nie czerwony —
  ta sama zasada co przy bilansie okresu: to miara niewykorzystanego zasobu po
  stronie kierownika, nie dług pracownika.
- **Kasowanie zestawu konfiguracji** (wymagań w `GrafikWymagania.tsx`, celów w
  `GrafikBudzetKonfiguracja.tsx`) ⚠️ zmienia to, co widać w siatce, od razu:
  dni spadają na zestaw wcześniejszy albo zostają bez reguły. Potwierdzenie musi
  powiedzieć KTÓRY, inaczej kontrola dziur w obsadzie milknie i nikt tego nie
  zauważy, bo brak ostrzeżeń wygląda jak brak problemów.
- **"Zobacz, co czeka na wysłanie"** (`GrafikDoWyslaniaModal.tsx`) niczego nie
  zmienia — publikacja zostaje w jednym miejscu, przy przycisku "Wyślij grafik".
  Lista grupuje po DNIU, nie po lokalu: pracownik dostanie powiadomienie o
  swoich dniach, a kierownik przegląda to jak kalendarz.
- **Pasek nagłówka lokalu i karty budżetu są CIAŚNIEJSZE niż karty w innych
  zakładkach** (`btnSecondarySmallCls`/`btnDangerSmallCls` w designTokens,
  `kartaCls` w GrafikBudzet): stoją nad siatką i konkurują z nią o wysokość
  ekranu, gdzie każde zaoszczędzone 8 px to jeden więcej widoczny wiersz
  pracownika. Zaokrąglenie zostaje takie samo jak w reszcie panelu
  (`rounded-xl`) — kanciaste zostaje tylko znak Shiftro.
- **Cel dnia jest jeden i wpisuje się go z DWÓCH miejsc**: Grafik →
  Konfiguracja → Budżet (reguła na dzień tygodnia) i karta dnia w Pulsie, sekcja
  "Utarg i notatki" (nadpisanie na ten jeden dzień). Oba piszą przez
  `zapiszNadpisanieDnia` do `grafik_budzet_dni`, więc wpisane w jednym miejscu
  widać w drugim od razu. Drugie wejście istnieje, bo o utargu myśli się przy
  zamykaniu dnia, a nie przy planowaniu obsady.
  - ⚠️ W Pulsie te dwa pola zapisują się OD RAZU, a nie przyciskiem "Zapisz"
    karty — idą do innej tabeli niż `day_logs`. Dlatego stoją we własnej ramce z
    podpisem "zapisuje się od razu": różne zachowanie ma być widoczne, zanim
    ktoś kliknie.
  - ⚠️ W karcie dnia są teraz DWIE liczby o utargu i nie wolno ich zlepić.
    `prognozaUtargu` ("zwykle X zł") to średnia z czterech ostatnich takich dni
    tygodnia — obserwacja. `celDnia().utarg` ("plan X zł") to liczba wpisana
    przez kierownika — decyzja. Dzień, w którym się rozjeżdżają, jest właśnie
    tym, o którym warto porozmawiać.
  - ⚠️ **Zamknięty dzień ma plan tylko do odczytu.** Zmiana celu po zamknięciu
    przepisywałaby, czego oczekiwano — ta sama zasada co przy `poprawZamknietyDzien`.
  - Kafelek "Koszt pracy / utarg" bierze próg z celu tego lokalu i dnia tygodnia;
    sztywne "zdrowy zakres 25–35%" zostaje tylko wtedy, gdy celu nie wpisano.
- **Budżetu nie widzi pracownik** — ani na tablecie, ani na prywatnym telefonie.
  Ta sama zasada co przy `PulsZmiany`: koszty i stawki nie są informacją dla tej
  roli.
- `harness-budzet.html` sprawdza całą arytmetykę na ręcznie policzonych
  przykładach (54 przypadki). Dokładając logikę, dopisz przypadek.

### 5e. Giełda zmian — trzy tryby (0.38.0)

Ten sam przycisk „na giełdę", a za nim trzy drogi. Cała logika w
[`utils/swaps.ts`](src/utils/swaps.ts) — jedyne miejsce piszące do
`shift_swaps` i przepisujące zmianę na innego pracownika.

| Tryb | Kto widzi ofertę | Co się przepisuje |
|---|---|---|
| `gielda` | wszyscy uprawnieni i wolni | jedna zmiana → chętny |
| `oddanie` | **jedna wskazana osoba** | jedna zmiana → adresat |
| `zamiana` | jedna wskazana osoba | **dwie zmiany**, w obie strony |

⚠️ **Tryb zmienia tylko to, KTO widzi ofertę i CO się przepisuje.** Stan
(`na_gieldzie` → `przyjeta` → `zatwierdzona`/`odrzucona`/`wycofana`) i to, że
ostatnie słowo ma kierownik, są wspólne — osobna maszyna stanów na tryb to
trzy miejsca, w których można zapomnieć o kierowniku.

- ⚠️ **`target_*` (komu zaproponowano) to NIE `taker_*` (kto wziął).** Zlanie
  ich w jedno dałoby ofertę wyglądającą na przyjętą, zanim ktokolwiek ją
  zobaczył. `offersForUser` pokazuje ofertę skierowaną wyłącznie adresatowi, a
  `acceptSwap` sprawdza to drugi raz — filtr w UI to za mało, bo od tego zależy,
  czy „oddałem Marcie" cokolwiek znaczy.
- **Kto może wziąć zmianę, liczy JEDEN predykat** (`mozeWziac`) — ten sam dla
  listy ofert, listy kandydatów przy oddaniu i przy zamianie. Inaczej ktoś
  widoczny w jednym miejscu znikałby w drugim bez wyjaśnienia.
- **Przy `zamiana` kandydatem jest też ktoś, kto pracuje tego samego dnia** —
  bo oddaje wtedy własną zmianę (`pomijajZmianeId`). Przy `oddanie` taka osoba
  kandydatem nie jest.
- **Obie strony zamiany sprawdzamy przy PRZYJĘCIU, nie u kierownika.**
  Propozycja, której z góry nie da się zrealizować, zajmuje miejsce w kolejce i
  kończy się odmową bez powodu.
- **Godziny liczymy po obu stronach** (`pendingSwapDelta`): zamiana 8 h za 8 h
  to zero różnicy, a nie +8 h dla przejmującego. Przy etatowcu ta różnica
  decyduje o tym, czy kierownik się zgodzi.
- **Zatwierdzenie zamiany to DWA przepisania `grafik_shifts`.** Jedno bez
  drugiego zostawia dzień z dwiema osobami i dzień bez nikogo — dlatego gdy
  druga zmiana zniknęła z grafiku, przycisk „Zatwierdź" jest wyłączony.
- Ekrany pracownika potrzebują listy współpracowników, więc `users` idzie teraz
  także do `PersonalDashboard` (kiosk miał je wcześniej). Nazwiska i tak widać
  w grafiku („Z tobą: …"), więc nic nowego się nie odsłania.
- ⚠️ **Oferta PRZEŻYWA usunięcie zmiany z grafiku** — `shift_swaps` wiąże się ze
  zmianą luźnym `grafik_shift_id` bez klucza obcego, więc nic jej nie sprząta
  samo. Naprawione w 0.42.2 z dwóch stron i obie są potrzebne:
  - **przy zapisie** — `wycofajOfertyDlaZmian()` w `utils/swaps.ts` wołane z
    KAŻDEJ ścieżki zdejmowania zmiany (pojedyncze usunięcie i czyszczenie
    zakresu w `GrafikTydzien.tsx`, `zdejmijZmiany` i przepisanie na następcę w
    `ManagerDashboard.tsx`). ⚠️ Nie da się tego zawołać z `utils/grafik.ts` —
    `swaps.ts` importuje stamtąd, więc zależność w drugą stronę zrobiłaby cykl;
    dlatego wołają komponenty. Funkcja NIE rzuca: zmiana jest już usunięta,
    więc wyjątek pokazałby „Błąd usuwania" po operacji, która się udała —
    zwraca listę niepowodzeń do pokazania.
  - **przy odczycie** — `offersForUser`, `claimedByUser` i `ofertyWystawione`
    sprawdzają, czy zmiana istnieje i nie ma `deleted_at`. To jest siatka
    bezpieczeństwa dla wierszy osieroconych wcześniej i dla ścieżki usuwania, o
    której ktoś zapomni. **Dokładając miejsce czytające `shift_swaps`, zadaj to
    samo pytanie** — filtr po samym `status` wystarczał do 0.42.1 i dlatego
    Tablet Służbowy pisał Olenie „Giełda: na giełdzie" przy zmianie, której nie
    było (22.09.2026).
  - ⚠️ `deleted_at` liczy się jak brak zmiany. Wysłana zmiana po usunięciu
    czeka na publikację z ustawioną datą skasowania — do 0.42.1 w tym czasie
    dalej stała na giełdzie i dało się WZIĄĆ pracę, której już nie ma.
  - Wiersze osierocone wcześniej sprząta migracja `0028` (status `wycofana`, nie
    kasowanie — giełda jest zapisem tego, co się działo).
- Migracja `0021`. Sprawdziany: `harness-zadania.html` (21 przypadków na samą
  giełdę — kto widzi ofertę, kto jest kandydatem, jak liczą się godziny).

### 5b. Plan vs fakt — od 0.25.0

`grafik_shifts` (plan) kontra `shifts` (fakt). Całość w `utils/grafik.ts`
(`buildPlanFactMap`, `sumujPlanFakt`, `PLAN_FAKT_PROG_H`), pokazywana na
Pulpicie (kafelek "Wczoraj"), w Rejestrze Godzin (kafelek za okres, znacznik
przy dniu, filtr "Tylko różnice") i w Raportach i kosztach (miesiąc,
procent, per pracownik i per dzień).

Trzy decyzje, których nie zmieniaj bez rozmowy z właścicielem:
- **Porównujemy sumy w obrębie (osoba, dzień)**, NIE parujemy zmiana do
  zmiany. Ludzie wymieniają się między sobą bez systemu — parowanie
  pojedynczych wpisów daje wtedy bzdury, suma dnia jest odporna.
- **Tylko dni zamknięte** (do wczoraj włącznie). Plan na cały miesiąc
  kontra fakt za pięć dni pokazywał "−82%" i nie znaczył nic.
- **To sygnał, nie zarzut.** Świadomie NIE wykrywamy "nie stawił się" ani
  "pracował poza grafikiem" — rozbieżności są normalne i tak ma zostać.

### 5c. Siatka i wpisywanie na kilka dni — od 0.32.0

- **Kolumny mają stałe szerokości** (`table-fixed` + `<colgroup>`,
  `KOL_PRACOWNIK`/`KOL_DZIEN` w `GrafikTydzien.tsx`). Wcześniej dni
  "oddychały": tydzień z jedną gęstą środą rozpychał właśnie ją, więc siatka
  wyglądała inaczej w każdym tygodniu. W widoku "Dzień" jedyna kolumna dnia
  zostaje elastyczna.
- **Wiersz pracownika ma dwie linijki, nie pięć**: imię, a pod nim
  "stanowisko · godziny". Liczba zmian, koszt i różnica z giełdy przeniosły
  się do podpowiedzi (`opisOsoby`) — nie zniknęły, przestały zabierać
  wysokość. Głównym powodem była prośba właściciela o więcej osób na ekranie.
- **W wierszu stoi liczba, która wynika z UMOWY tej osoby**: przy umowie o
  pracę godziny wobec normy miesiąca (`128/176 h`, przekroczenie na
  bursztynowo — tym samym kolorem co nadmiar obsady), przy zleceniu godziny i
  koszt. Świadomie nie odwrotnie: przy umowie o pracę kolejna godzina w
  ramach normy nie kosztuje nic dodatkowego, więc "godziny × stawka" byłoby
  tam liczbą myląco wyglądającą na koszt decyzji.
- **"Powtórz w dniach"** w modalu przypisania (`GrafikZmianaModal.tsx`) —
  wybór dni bieżącego tygodnia, jak przy zadaniach. ⚠️ To **zwielokrotnione
  tworzenie, NIE reguła powtarzania**: powstaje N niezależnych wierszy, bez
  żadnego powiązania między nimi. Gdyby powiązanie istniało, każda późniejsza
  edycja jednej zmiany rodziłaby pytanie "czy zmieniam wszystkie?", na które
  nie ma dobrej odpowiedzi. Blok pokazuje się TYLKO przy tworzeniu — przy
  edycji poprawiamy jeden wiersz.
- **Dni z przeszkodą są pomijane, nie blokują reszty.** `przeszkodaDnia()`
  (wydzielone z `handleSave`) sprawdza każdy dzień osobno: po `ostatni_dzien`,
  urlop/niedostępność, kolizja godzin. Przy JEDNYM dniu zachowanie jest
  dotychczasowe — modal blokady z pełnym wyjaśnieniem. Przy kilku dniach
  pojedyncza przeszkoda nie może przerwać całej operacji, więc dzień odpada, a
  komunikat po zapisie mówi które i dlaczego ("Dodano 2 zmiany. Pominięto:
  WT (kolizja godzin), CZW (urlop)."). Gdy odpadną wszystkie — komunikat
  błędu, nigdy cichy sukces.
- **Siatka ma DWA układy** (`uklad` w `Grafik.tsx`, przekazywane do
  `GrafikTydzien`): `osoby` — wiersz na pracownika, `stanowiska` — wiersz na
  stanowisko, a w kratce ludzie, którzy je tego dnia obsadzają. Drugi układ
  jest bliższy temu, jak grafik POWSTAJE ("bar musi być obsadzony, kto go
  obsadzi?"), pierwszy — temu, jak się go potem SPRAWDZA ("ile Ala ma
  godzin?").
  - Dziury obsady tego stanowiska stoją wprost w kratce (`−2 09:00–17:00`) —
    w tym układzie to jest główna informacja, a nie przypis pod nagłówkiem.
  - "+ dodaj" otwiera modal z **ustawionym stanowiskiem i dniem**
    (`ctx.stanowisko`), więc wybór osoby go nie nadpisuje
    (`stanowiskoRuszone` startuje wtedy jako `true`). Druga osoba na tym samym
    stanowisku i dniu jest normalna, nie błędem.
  - Lista wierszy bierze też stanowiska, których nie ma już w słowniku, ale
    wiszą w zmianach — inaczej zmiana na zarchiwizowanym stanowisku znikałaby
    z widoku, zostając w bazie i w kontroli obsady.
  - Sortowanie (Stanowisko/Godziny/Nazwisko) dotyczy tylko układu `osoby`.
- **"Dodaj pracownika" nad siatką ZAKŁADA PRACOWNIKA** (`goToNewEmployee` w
  `ManagerDashboard.tsx`), a nie otwiera modalu zmiany dla kogoś spoza siatki.
  Przycisk mówił "pracownika", a dawał zmianę — to było mylące. Zmianę komuś
  spoza siatki wpisuje się dalej przez kratkę i "Pokaż wszystkich".
- ⚠️ **Widok "Dzień" liczył zakres z `weekDays[6]`**, a w tym trybie
  `weekDays` ma jeden element — `s.date <= undefined` jest zawsze fałszem, więc
  siatka renderowała się poprawnie z PUSTYMI kratkami. Wyglądało to na brak
  grafiku, nie na błąd, i dlatego przeżyło kilka wydań. Ostatni dzień bierzemy
  teraz z długości tablicy. **Każde nowe miejsce liczące zakres tygodnia ma
  używać `weekDays[weekDays.length - 1]`**, nigdy stałego indeksu.
- **Godziny z wymagań stoją jako przyciski przy polach Od/Do** w modalu zmiany
  (`godzinyZWymagan` w `utils/grafik.ts`). `defaultHoursForStanowisko` wybiera
  JEDNO, najdłuższe wymaganie do podstawienia w pola; to jest lista wszystkich
  godzin tego stanowiska i dnia, do kliknięcia. Początki i końce są osobno i
  celowo się nie parują: przy wymaganiach 08:30–21:00 i 14:00–19:00 sensowna
  bywa zmiana 14:00–21:00.
  - ⚠️ Napis "Brak wymagań obsady" musi zależeć od tego, czy wymagania
    ISTNIEJĄ, a nie od `zrodloGodzin` — ta zmienna zeruje się przy każdej
    ręcznej zmianie godziny, w tym przy kliknięciu podpowiedzi, więc napis
    twierdził, że wymagań nie ma, tuż pod przyciskami z nich zrobionymi.
- **Wymagania obsady można EDYTOWAĆ** (`GrafikWymagania.tsx`). Wcześniej były
  tylko "dodaj" i "kasuj", więc podniesienie liczby osób z 2 na 3 wymagało
  skasowania reguły i wpisania jej od nowa — razem z dniami tygodnia, które
  przy okazji łatwo było zgubić. `submitRule` robi `patch`, gdy `form.id` jest
  ustawione, i `post`, gdy nie.
  - **Który wiersz jest edytowany, czyta się z formularza** (`ruleForm.id` /
    `wyjatekRuleForm.id`), NIE z osobnego stanu. Formularze są dwa — zestawu i
    wyjątku — a jeden wspólny stan podświetlałby przy przeskoku między nimi
    inny wiersz niż ten faktycznie otwarty.
  - ⚠️ **`parseDays` zwraca `null` przy pustej wartości, a `null` znaczy
    "codziennie"** (tak czyta to `daysLabel` i cała kontrola obsady). Przy
    wczytywaniu do formularza null musi wrócić jako PEŁNY tydzień (`parseDni`)
    — inaczej wejście w edycję po cichu odznaczałoby wszystkie dni, a zapis
    zawężałby regułę do niczego. Ta sama pułapka co `parseDaysOfWeek` w
    `utils/tasks.ts`.
  - Zmiana zestawu w trakcie edycji przerywa ją: payload niesie `set_id`
    aktywnego zestawu, więc zapis po cichu przeniósłby regułę gdzie indziej.
    Skasowanie edytowanej reguły też czyści formularz — inaczej zapisałby ją
    z powrotem pod nieistniejącym już id.
- **Widok Miesiąc ma DWA układy** (`GrafikMiesiac.tsx`, stan `uklad`):
  `kalendarz` (siedem kolumn, kartka na ścianę) i `osoby` (wiersz na osobę,
  kolumna na dzień, w kratce początek/koniec/skrót stanowiska jeden pod
  drugim). To dwa różne pytania — "kto jest w sobotę?" kontra "kiedy
  pracuję?" — i dlatego dwa układy, a nie jeden kompromis.
  - ⚠️ **Zawsze 31 kolumn** (`DNI_W_SIATCE`), także w lutym. Dni, których w
    miesiącu nie ma, zostają puste i BEZ etykiety. Powód jest praktyczny:
    identyczna szerokość kolumn w każdym miesiącu, więc wydruki da się
    położyć obok siebie bez szukania, gdzie co stoi. Ustalenie właściciela.
  - **Rozmiary czcionek w druku są ZMIERZONE, nie wyczute.** A4 poziomo to
    283 mm użytecznej szerokości; nazwisko bierze 9%, więc na kolumnę dnia
    zostaje ~8,3 mm (≈31 px). Przy 6,2 pt "08:30" zajmuje 24 px, czterolitrowy
    skrót stanowiska 26 px — mieści się z zapasem na obramowania. **Dlatego
    liczba kolumn nie może urosnąć** i dlatego nie podnosimy tych rozmiarów
    "na oko".
  - Minimalna wysokość wiersza siedzi na komórce z nazwiskiem (`.go-min`) —
    wiersz rośnie do najwyższej komórki, więc osoba bez ani jednej zmiany
    dostaje taki sam pasek co reszta. Bez tego wydruk miał raz linijkę, raz
    trzy.
  - `overflow-x-auto` z widoku ekranowego MUSI być wyłączone w druku
    (`.go-scroll`), inaczej kolumny od dwudziestej wzwyż nie wychodzą na
    papier.
  - ⚠️ **Zakres wiersza zależy od tego, CZYJ to lokal macierzysty** — i jest
    inny niż w układzie kalendarza oraz w nagłówku nad tabelą. Osoba, dla
    której to jest `default_lokal`, dostaje WSZYSTKIE swoje zmiany miesiąca,
    także te w innych lokalach (szara, pochylona kratka ze skrótem tamtego
    lokalu, `lokalSkrot`). Osoba wypożyczona tutaj — tylko zmiany u nas.
    Powód: kierownik lokalu macierzystego rozlicza CAŁY miesiąc tej osoby,
    więc dzień pracy gdzie indziej musi widzieć, inaczej wygląda na wolny i
    dostanie kolejną zmianę. Lokal, do którego ktoś przychodzi wyjątkowo, nie
    ma powodu znać reszty cudzego grafiku (ustalenie właściciela).
  - Suma przy nazwisku (`podsumowanieOsoby`) liczy się z **tego samego
    zakresu, który widać w wierszu** — inaczej nie zgadzałaby się z tym, co da
    się policzyć okiem. Dopisek o zmianach w innym lokalu siedzi w `title`, a
    nie w druku: zawijał kolumnę nazwisk na trzy linijki i rozpychał wiersz.
  - `lokalSkrot` NIE jest `getShort` z `utils/format` — tamto bierze pierwsze
    litery słów, więc jednowyrazowa "Ceglana" schodzi do "C" i myli się z
    każdym innym lokalem na tę samą literę.
  - `isSameUser` i `absenceOn` przeniesione z `GrafikTydzien.tsx` do
    `utils/grafik.ts` — używają ich teraz oba widoki.

### 5d. Grafik — świadomie NIE zrobione
- Potwierdzenia odczytu grafiku przez pracownika ("przeczytało 12 z 14").
- Etat jako reguła (dziś pokazujemy tylko różnicę godzin przy zamianie,
  żeby kierownik sam ocenił).

### 6. Automatyczne wylogowanie po nieaktywności — ODŁOŻONE
Świadomie odłożone (2026-08-28) — obecni główni użytkownicy to kiosk i
konto właściciela, więc ryzyko niewielkie. **Zrobić przed podłączeniem
drugiego lokalu do systemu** — wtedy więcej osobistych kont, ryzyko
rośnie.

Zakres: 60 minut nieaktywności → automatyczne wylogowanie, **tylko** dla
`closed`/`manager_lokalu`/`admin`. Rola `kiosk` świadomie WYŁĄCZONA —
to wspólne urządzenie z zapisanymi danymi logowania (autouzupełnianie),
ma zostać zalogowane stale; tam ochroną jest fizyczna kontrola nad
urządzeniem, nie sesja. Szkic mechanizmu: `lastActivityAt` timestamp w
tej samej strukturze co sesja w `localStorage` (patrz `App.tsx`),
nasłuch click/keydown/touchstart (z throttle) do odświeżania go,
okresowe sprawdzanie (np. co 60s) i wylogowanie po przekroczeniu progu.

### 7. Zatwierdzanie zmian przez kierownika — CZĘŚCIOWO ZROBIONE, inaczej niż tu opisano
⚠️ To, co poniżej opisuje ten punkt (`shifts.confirmed`, WSZYSTKIE zmiany
niewidoczne dopóki kierownik ich nie zatwierdzi), NIE zostało zbudowane i
nadal jest tylko planem. Zamiast tego 2026-09-02 powstał węższy, inny
mechanizm: kierownik zatwierdza tylko te zmiany, które pracownik SAM
oznaczył jako wymagające poprawki (zakładka Zatwierdzanie zmian, patrz
"Panel kierownika" wyżej) — reszta zmian jest widoczna od razu, bez
żadnego zatwierdzania. To NIE spełnia opisu niżej (nie ma globalnego
`shifts.confirmed`, nie da się włączyć "wszystko ręcznie") — jeśli
właściciel poprosi o pełną wersję z tego punktu, projektuj ją od zera wg
poniższego planu, nie zakładaj że już istnieje.

Nowa kolumna `shifts.confirmed` (boolean, domyślnie `true` — nic się nie
zmienia dla nikogo, dopóki funkcja nie zostanie świadomie włączona).
Niepotwierdzona zmiana (`confirmed = false`) ma być **niewidoczna
wszędzie** — Pulpit godzin, Rejestr Godzin, raport pracownika — poza
osobną listą "Do zatwierdzenia" u kierownika.

Docelowo (przyszłe ustawienia, do wyboru przez kierownika/właściciela —
nie hardkodować jednej opcji):
- **Wszystko ręcznie** — każda zmiana wymaga zatwierdzenia kierownika.
- **Zgodnie z grafikiem auto, reszta do zatwierdzenia** — wymaga
  najpierw Grafiku (punkt 5 wyżej), więc ta opcja gotowa później niż
  pozostałe dwie.
- **Druga zmiana tego samego dnia → do zatwierdzenia** — pierwsza zmiana
  dnia automatycznie zatwierdzona, kolejne tego samego dnia trafiają do
  kierownika. Można zbudować niezależnie od Grafiku — `utils/shifts.ts`
  ma już `getTodaysShiftsForUser(shifts, userId)` (dodane dla
  przypomnienia "Dziś już zarejestrowano..." w `TimeEntryForm`), więc
  wykrycie "to już druga dzisiaj" to gotowy budulec.

Domyślna wartość ("prawda") pozostaje: wszystko automatycznie
zatwierdzone, dopóki właściciel świadomie nie wybierze innej opcji w
przyszłych ustawieniach.
