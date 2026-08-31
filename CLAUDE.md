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

Produkt nie ma jeszcze nazwy. Cel na tym etapie: dopracować UX i design
istniejącego MVP, żeby zespół polubił system, zanim dodamy duże nowe moduły
(patrz Roadmap niżej).

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
vercel.json                  — harmonogram crona
CHANGELOG.md                 — historia wersji, patrz "Wersjonowanie i CHANGELOG" niżej
src/
  index.tsx                  — punkt wejścia (bez zmian)
  App.tsx                    — globalny stan, fetch danych z Supabase, routing widoków
  config.ts                  — SUPABASE_URL/KEY, GOOGLE_SCRIPT_URL, isConfigured, APP_VERSION
  types.ts                   — (jeszcze nie istnieje — miejsce na wspólne typy przy przyszłej migracji)
  api/
    supabase.ts               — obiekt `api` (get z paginacją/post/patch/delete/patchByFilter)
    googleSheets.ts            — sendToGoogleSheets, toLocalYMD
    notifications.ts           — createManagerNotification(lokal, message, type),
                                  createEmployeeNotification(userName, message, type)
  utils/
    format.ts                 — getShort, getDayOfWeek, getMonthName, getAvailableYears, formatNotificationText
    shifts.ts                  — findOverlappingShift, getTodaysShiftsForUser
  components/
    LoginScreen.tsx
    TimeEntryForm.tsx          — wspólny formularz start/koniec zmiany (kiosk i self-tracking)
    HoursReport.tsx            — raport miesięczny (zakładka "Raport")
    IssueForm.tsx               — zakładka "Zgłoś"
    NotificationsPanel.tsx      — zakładka "Wiadomości"/"Powiadomienia" (wspólna dla closed, open i managera)
    ClosedEmployeeDashboard.tsx — dashboard na osobisty telefon pracownika
    KioskDashboard.tsx          — dashboard "Tablet Służbowy" (kiosk),
                                  redesign z 2026-08-31 — patrz niżej
    OpenDeviceDashboard.tsx     — POPRZEDNIA wersja dashboardu kiosku,
                                  zastąpiona przez KioskDashboard.tsx w
                                  App.tsx (już nierenderowana). Zostawiona
                                  w repo świadomie jako łatwy rollback —
                                  usuń dopiero po tym, jak nowy design
                                  postoi w produkcji jakiś czas bez
                                  problemów, nie od razu.
    ManagerDashboard.tsx        — panel kierownika, w całości w jednym pliku
                                  (~1850 linii — wewnętrznie spójny, dalszy
                                  podział na zakładki to osobne, świadome
                                  zadanie, nie blokuje Roadmapy)
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
| `closed` | closed_dashboard | osobisty telefon pracownika, zalogowany jako on sam |
| `open` | closed_dashboard | wariant "otwartego konta" (mniej używany) |

Login: `Email konta` + `PIN` (6 cyfr). Kioski mają zapisane dane logowania
w przeglądarce telefonu służbowego (autouzupełnianie) + skrót na ekranie
głównym — pracownik nic nie wpisuje ręcznie.

### Zakładki na osobistym koncie (`ClosedEmployeeDashboard`, role `closed`/`open`)

Ten flat, 4-zakładkowy układ dotyczy TYLKO osobistego telefonu pracownika
(`ClosedEmployeeDashboard.tsx`). Kiosk ma od 2026-08-31 zupełnie inną,
5-zakładkową strukturę — patrz "Tablet Służbowy — `KioskDashboard`" niżej.

- **Wpisz / Zmiana** — `TimeEntryForm`: rozpoczęcie zmiany (można zapisać
  sam start — "Tylko start" — albo od razu start+koniec jednym wpisem,
  zaznaczając checkbox "Znam" przy polu Zakończenie), oraz zakończenie
  trwającej zmiany. Widać żółte przypomnienie o już zapisanych dziś
  zmianach tego pracownika (`getTodaysShiftsForUser`) — pracownicy mają
  różne nawyki, czasem trzeba wpisać drugą zmianę tego samego dnia, więc
  to celowo widoczne z góry, nie dopiero przy próbie zapisu. Nowa zmiana,
  która nakłada się czasowo na już zapisaną (ta sama osoba), jest **twardo
  blokowana** (`findOverlappingShift` w `utils/shifts.ts`) — pracownik
  nie może sam tego obejść, w razie pomyłki zgłasza przez "Zgłoś".
  Kierownik przy edycji zmiany (`ManagerDashboard`) dostaje tę samą
  weryfikację, ale jako miękkie potwierdzenie (`window.confirm`), nie
  blokadę — czasem musi poprawiać już niespójne dane.
- **Raport** — `HoursReport` / `MonthlyReport`: przegląd własnych
  przepracowanych godzin wg miesiąca/roku.
- **Zgłoś** — `IssueForm`: zgłoszenie problemu z zapisanymi godzinami do
  kierownika (pracownik NIE może sam edytować zapisanych zmian).
- **Wiadomości** — `NotificationsPanel`: powiadomienia gdy kierownik
  edytował/usunął czyjąś zmianę (kto, kiedy, stare/nowe godziny), tylko
  własne.

### Tablet Służbowy — `KioskDashboard.tsx` (redesign 2026-08-31)

Zaprojektowane iteracyjnie przez cały wątek sesji jako klikalny prototyp
HTML, potem przeniesione 1:1 w logice na prawdziwe komponenty (wizualnie
zaadaptowane do Tailwind — wireframe'owy język: grube 2/2.5px obramowania,
pogrubione nagłówki `font-['Archivo']`, czerwony akcent `#DE3A22`, różowe/
szare odznaki statusu). Zastępuje stary, płaski 4-zakładkowy `TimeEntryForm`
+ wewnętrzny `<select>` pracownika (patrz `OpenDeviceDashboard.tsx` —
zachowane w repo jako rollback, ale już nieużywane).

Nowy flow: pracownik wybiera siebie RAZ z listy (`activeUsers`, ci sami co
wcześniej: `active && !archived && role === "open"` w przypisanym lokalu)
— stąd "mini-konto" na czas sesji z 5 zakładkami: **Pulpit** (powitanie /
żywy licznik trwającej zmiany), **Zmiana** (formularz startu z dwiema
metodami — "tylko start" / cała zmiana naraz, dokładnie logika
`TimeEntryForm.handleCreateShift`/`handleCloseShift` przepisana na nowy
UI — NIE reużywa samego komponentu `TimeEntryForm`, bo ten renderuje
własny picker pracownika, którego tu nie chcemy), **Raport**, **Zadania**
(placeholder "w budowie" — moduł Zadania z Roadmapy punkt 2 jeszcze nie
istnieje, świadomie NIE ma fałszywego, nieinteraktywnego checklisty),
**Więcej** (Grafik-placeholder, Zgłoś, Wiadomości, powrót do listy,
przycisk "Wyloguj to urządzenie" — mały, podkreślony link, nie duży
przycisk, bo wylogowanie kiosku wymaga ponownego Email+PIN). Przycisk
"< Zmień" w nagłówku KAŻDEGO ekranu wraca prosto do listy pracowników
(bez stosu "wstecz" — świadoma decyzja z sesji projektowej).

Reużywa bez zmian: `findOverlappingShift`, `getTodaysShiftsForUser`,
`sendToGoogleSheets`, formattery z `utils/format.ts`, oraz dokładnie ten
sam wzorzec oznaczania powiadomień jako przeczytane co stary
`OpenDeviceDashboard.tsx`.

**Blokada PIN-em na kiosku** — zaimplementowana (patrz niżej, Schemat
Supabase i sekcja "Panel kierownika"). Pracownik z ustawionym
`kiosk_pin` dostaje ekran z klawiaturą numeryczną (10 cyfr + backspace)
zamiast od razu wejść do mini-konta po kliknięciu na liście.

### Panel kierownika (`ManagerDashboard`)

Zakładki: Rejestr Godzin (edycja zmian), **Pulpit godzin** (dashboard godzin
— filtr tydzień/miesiąc, tylko role `closed`/`open`/`manager_lokalu`, klik
na komórkę godzin → edycja zmiany), Grafik (obecnie tylko placeholder "w
budowie" — NIE ruszać, patrz Roadmap), Aktywni, **Powiadomienia**,
Zgłoszenia, Pracownicy, Przewodnik.

Zakładka **Powiadomienia** (`ManagerDashboard`, tab `"powiadomienia"`) —
własna dla kierowników (`admin` i `manager_lokalu`), analogiczna do
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
wysyłania powiadomień, wywołuj te dwie — pierwszy konsument to codzienna
weryfikacja terminów sanepid/umowy (patrz niżej), drugi będzie moduł
Zadania/Sprzątanie (Roadmap punkt 2).

W zakładce **Pracownicy** formularz edycji pracownika (dla wszystkich ról
oprócz `kiosk` — czyli też dla `admin`/`manager_lokalu`, bo oni też
odbijają godziny i mają własne terminy) ma dwa nieobowiązkowe pola daty:
"Termin książeczki sanepid" (`sanepid_expiry`) i "Termin umowy"
(`umowa_expiry`). Puste pole jest podświetlone na czerwono w formularzu, a
na karcie aktywnego pracownika na liście pokazuje się żółty badge "Brak
terminu ...". To świadomie zamknięty zestaw dwóch terminów — nie dodawaj
trzeciego bez wyraźnej prośby, to nie jest zaprojektowane jako otwarty
system dowolnych typów terminów.

**Blokada PIN-em na kiosku** — zaimplementowana 2026-08-31 (konsument:
`KioskDashboard.tsx`, patrz "Tablet Służbowy" wyżej). Trzeci, niezależny
mechanizm bezpieczeństwa — **nie myl z rolami logowania `closed`/`open`**,
to zupełnie inna warstwa. Na Tablet Służbowy każdy pracownik jest domyślnie
"otwarty": dotyka swojego imienia na liście wyboru i od razu wchodzi do
swojego mini-konta. Jeśli pracownik ma ustawioną kolumnę `users.kiosk_pin`
(text, nullable, 4 cyfry — NIE mylić z kolumną `pin`, 6-cyfrowym PIN-em
logowania Email+PIN), kiosk najpierw pyta o ten PIN na osobnym ekranie z
klawiaturą numeryczną, zanim pokaże jego dane. Puste `kiosk_pin` = bez
zmian, jak dziś (kiosk nie pyta o nic).

⚠️ **UI kierownika do USTAWIANIA `kiosk_pin` jeszcze NIE istnieje** —
świadomie odłożone przy pierwszym wdrożeniu (poza zakresem redesignu
kiosku). Formularz edycji pracownika w zakładce Pracownicy (`ManagerDashboard`)
NIE ma jeszcze przełącznika "Zablokuj PIN-em na kiosku" ani okna do wpisania
PIN-u — żeby przetestować blokadę, trzeba na razie wpisać `kiosk_pin`
bezpośrednio w Supabase Table Editor. Gdy przyjdzie kolej na tę funkcję:
przełącznik w formularzu edycji pracownika, włączenie otwiera osobne okno
do wpisania 4-cyfrowego PIN-u — analogicznie do istniejącego okna
Email+PIN przy koncie `closed`, nie wpisuj PIN-u bezpośrednio w głównym
formularzu.

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

## Schemat Supabase (tabele używane obecnie)

- **users** — `id, name, email, pin, role, default_lokal, allowed_lokale[],
  active, archived, stanowisko, sanepid_expiry, sanepid_last_notified,
  umowa_expiry, umowa_last_notified, kiosk_pin`. Ostatnie 4 kolumny przed
  `kiosk_pin`: `date`, nullable — terminy dokumentów pracownika, patrz
  "Panel kierownika" wyżej. `kiosk_pin` (text, nullable, 4 cyfry, dodana
  2026-08-31) — blokada PIN-em na kiosku, patrz "Panel kierownika" i
  "Tablet Służbowy" wyżej; NIE mylić z kolumną `pin` (6-cyfrowy PIN
  logowania Email+PIN). Na razie ustawiana ręcznie w Supabase (brak UI
  kierownika, patrz "Panel kierownika" wyżej).
- **lokale** — `id, name, archived`
- **stanowiska** — `id, name, lokal_name, archived`
- **shifts** — `id, user_name, user_id?, lokal, stanowisko, start_time
  (timestamptz), end_time (timestamptz | null), godzin`
- **issues** — zgłoszenia problemów od pracowników. Podstawowe:
  `id, user_id, user_name, issue_text, status`. Od 2026-08-31 też
  `is_anonymous` (bool, default `false`) i `shift_id` (bigint, references
  `shifts(id)`, nullable) — dodane dla nowego "Zgłoś" w `KioskDashboard.tsx`
  (anonimowe zgłoszenie i/albo przypięte do konkretnej zmiany, np. przez
  chorągiewkę przy wierszu w Raporcie). Gdy `is_anonymous`, `user_id`/
  `user_name` są `null`.
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
  - ⚠️ Kolumny `audience`, `message`, `type` trzeba dodać ręcznie w
    Supabase (Claude Code nie ma tam bezpośredniego dostępu) — patrz SQL
    w historii tej sesji/PR, jeśli jeszcze nie zastosowany.
  - ⚠️ `user_name` i `action` były pierwotnie `NOT NULL` (z czasów, gdy
    tabela obsługiwała tylko powiadomienia o edycji zmiany) — trzeba było
    ręcznie zdjąć te ograniczenia (`alter column ... drop not null`),
    inaczej `createManagerNotification`/`createEmployeeNotification`
    dostają 400 z Postgresa. Sprawdź, że zostało zastosowane, zanim
    zaczniesz kolejny moduł korzystający z tych funkcji (Zadania/Sprzątanie).

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
   tylko `App.tsx`, dziś każdy plik w `components/`, `api/`, `utils/`) ma
   `// @ts-nocheck` (kod pisany bez pełnego typowania — nie usuwaj tej linii,
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
10. Pierwsza wersja `KioskDashboard.tsx` definiowała współdzielony
    komponent `Shell` (nagłówek + tabbar sesji) WEWNĄTRZ komponentu
    nadrzędnego. Ten komponent ma żywy zegar (`setInterval` co 1s, licznik
    trwającej zmiany) — każdy tick re-renderował rodzica, co tworzyło
    `Shell` jako NOWĄ referencję funkcji przy każdym renderze. React
    traktuje to jako nowy typ komponentu i odmontowuje/montuje całe
    poddrzewo od nowa — pola formularza (np. textarea w "Zgłoś") traciłyby
    focus co sekundę, scroll by się resetował. Naprawione przeniesieniem
    `Shell` na poziom modułu (poza komponentem), z `screen`/`setScreen`/
    `goList`/`unreadCount` przekazywanymi jako propsy. Ogólna zasada:
    **nigdy nie definiuj komponentu wewnątrz komponentu, który ma stan
    zmieniający się w pętli/interwale** — nawet pozornie niewinny żywy
    zegar w rodzicu psuje całe poddrzewo.
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

⚠️ Od 2026-08-31 `APP_VERSION` ma dodatkowy efekt: sesja w `localStorage`
(`App.tsx`, `SESSION_KEY = "gastro_session"`) jest otagowana wersją, z
którą powstała, i przy ładowaniu apki `loadSession()` porównuje ją z
aktualnym `APP_VERSION` — przy niezgodności czyści sesję i wraca do ekranu
logowania. Innymi słowy: **każdy bump `APP_VERSION` wylogowuje wszystkich
użytkowników przy ich najbliższym odświeżeniu strony** (nie ma tabeli
sesji w bazie, więc "wyloguj wszystkich" nie da się zrobić zapytaniem SQL
— to jedyny mechanizm). To NIE wymusza samo z siebie odświeżenia już
otwartej karty przeglądarki (np. na kiosku) — dopiero po ręcznym
odświeżeniu/restarcie urządzenie dostanie i nowy bundle JS, i czysty ekran
logowania zamiast wznowienia starej sesji.

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

### 2. Zadania + Sprzątanie
Dwie osobne funkcje:
- **Zadania** — obowiązkowe checklisty przy otwarciu/zamknięciu zmiany
  (opcjonalnie zależne od dnia tygodnia).
- **Sprzątanie** — zadania cykliczne (co N dni / konkretny dzień tygodnia),
  z powiadomieniem właściciela jeśli nie zostały odznaczone jako zrobione,
  wraz z informacją kto był na zmianie.

Oba typy mają "beneficjenta" w postaci stanowiska (kto jest
odpowiedzialny). Zależy od fundamentu z punktu 0 (powiadomienia
kierownika).

### 3. Wydarzenia
Kierownik tworzy zdarzenie (zebranie, grupa o określonej godzinie itp.)
widoczne dla pracowników. Najprostszy moduł z całej listy — dobry "quick
win" do budowania zaufania do systemu.

### 4. Wnioski o urlop/wolne
Pracownik składa wniosek (nawet z dużym wyprzedzeniem, np. na 2030 rok).
Kierownik zatwierdza; osobny widok/"tablo" ostrzega go o wnioskach na
nadchodzący miesiąc. Można zbudować w pełni NIEZALEŻNIE od Grafiku (sam
flow wniosek → zatwierdzenie). Dopiero gdy powstanie Grafik, dodać
twardą walidację: zatwierdzonego urlopu nie da się nadpisać zmianą, chyba
że pracownik najpierw sam zdejmie wniosek.

### 5. Grafik
Ostatni etap. Nie opisany szczegółowo celowo — wracamy do tego, gdy reszta
jest stabilna i przetestowana w realnym użyciu.

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

### 7. Zatwierdzanie zmian przez kierownika — ODŁOŻONE
Świadomie odłożone (2026-08-28) na potem, ale z ustalonym już kształtem
docelowym, żeby nie projektować tego od zera przy starcie:

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
