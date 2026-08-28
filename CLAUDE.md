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

## Struktura plików

Frontend jest rozbity na moduły wg odpowiedzialności (refaktoryzacja z
jednego pliku `App.tsx` — patrz Roadmap punkt 0, część "rozbicie na pliki"
zrobiona; zakładka powiadomień dla kierowników z tego punktu — jeszcze nie).
Każdy plik komponentu/modułu ma `// @ts-nocheck` na górze, tak jak miał
oryginalny `App.tsx` — kod nie jest w pełni otypowany, nie usuwaj tej linii
przy edycji istniejących plików (chyba że robisz świadomą migrację do
prawdziwych typów).

```
src/
  index.tsx                  — punkt wejścia (bez zmian)
  App.tsx                    — globalny stan, fetch danych z Supabase, routing widoków
  config.ts                  — SUPABASE_URL/KEY, GOOGLE_SCRIPT_URL, isConfigured
  types.ts                   — (jeszcze nie istnieje — miejsce na wspólne typy przy przyszłej migracji)
  api/
    supabase.ts               — obiekt `api` (get z paginacją/post/patch/delete/patchByFilter)
    googleSheets.ts            — sendToGoogleSheets, toLocalYMD
    notifications.ts           — createManagerNotification(lokal, message, type)
  utils/
    format.ts                 — getShort, getDayOfWeek, getMonthName, getAvailableYears, formatNotificationText
  components/
    LoginScreen.tsx
    TimeEntryForm.tsx          — wspólny formularz start/koniec zmiany (kiosk i self-tracking)
    HoursReport.tsx            — raport miesięczny (zakładka "Raport")
    IssueForm.tsx               — zakładka "Zgłoś"
    NotificationsPanel.tsx      — zakładka "Wiadomości"/"Powiadomienia" (wspólna dla closed, open i managera)
    ClosedEmployeeDashboard.tsx — dashboard na osobisty telefon pracownika
    OpenDeviceDashboard.tsx     — dashboard "Tablet Służbowy" (kiosk)
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
| `kiosk` | open_dashboard ("Tablet Służbowy") | wspólne urządzenie w lokalu, pracownik wybiera siebie z listy przy każdej akcji |
| `closed` | closed_dashboard | osobisty telefon pracownika, zalogowany jako on sam |
| `open` | closed_dashboard | wariant "otwartego konta" (mniej używany) |

Login: `Email konta` + `PIN` (6 cyfr). Kioski mają zapisane dane logowania
w przeglądarce telefonu służbowego (autouzupełnianie) + skrót na ekranie
głównym — pracownik nic nie wpisuje ręcznie.

### Zakładki (dolna nawigacja u pracownika/kiosku)

- **Wpisz / Zmiana** — `TimeEntryForm`: rozpoczęcie zmiany (można zapisać
  sam start — "Tylko start" — albo od razu start+koniec jednym wpisem,
  zaznaczając checkbox "Znam" przy polu Zakończenie), oraz zakończenie
  trwającej zmiany.
- **Raport** — `HoursReport` / `MonthlyReport`: przegląd własnych
  przepracowanych godzin wg miesiąca/roku.
- **Zgłoś** — `IssueForm`: zgłoszenie problemu z zapisanymi godzinami do
  kierownika (pracownik NIE może sam edytować zapisanych zmian).
- **Wiadomości** — `NotificationsPanel`: powiadomienia gdy kierownik
  edytował/usunął czyjąś zmianę (kto, kiedy, stare/nowe godziny). Na kiosku
  pokazuje powiadomienia dla WSZYSTKICH pracowników przypisanych do lokalu
  (`showEmployeeName={true}`), na osobistym koncie tylko własne.

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
[`api/notifications.ts`](src/api/notifications.ts) — nie twórz nowej
funkcji ad-hoc, wywołuj tę, będzie reużywana w modułach Sanepid i
Zadania/Sprzątanie (Roadmap punkty 1 i 2).

## Schemat Supabase (tabele używane obecnie)

- **users** — `id, name, email, pin, role, default_lokal, allowed_lokale[],
  active, archived, stanowisko`
- **lokale** — `id, name, archived`
- **stanowiska** — `id, name, lokal_name, archived`
- **shifts** — `id, user_name, user_id?, lokal, stanowisko, start_time
  (timestamptz), end_time (timestamptz | null), godzin`
- **issues** — zgłoszenia problemów od pracowników
- **notifications** — dwa "typy" wierszy we wspólnej tabeli, odróżnione
  polem `audience`:
  - `audience = 'employee'` (domyślne, dla starych wierszy sprzed tej
    kolumny — traktuj `NULL` jak `'employee'`): powiadomienie dla
    pracownika o edycji/usunięciu jego zmiany. Pola: `user_name, lokal,
    actor_name, action ('edit' | 'delete'), shift_date, old_start,
    old_end, new_start, new_end, is_read, created_at`.
  - `audience = 'manager'`: ogólne powiadomienie dla kierowników danego
    `lokal` (tworzone przez `createManagerNotification`). Pola: `lokal,
    message, type, is_read, created_at` (`user_name`, `actor_name`, `action`
    i pola `*_start`/`*_end` są wtedy puste — `formatNotificationText`
    rozpoznaje ten wariant po obecności `message` i zwraca je wprost).
  - RLS: polityka otwarta (`for all using (true) with check (true)`) —
    jeśli dodajesz nowe tabele, rób tak samo albo świadomie zawężaj.
  - ⚠️ Kolumny `audience`, `message`, `type` trzeba dodać ręcznie w
    Supabase (Claude Code nie ma tam bezpośredniego dostępu) — patrz SQL
    w historii tej sesji/PR, jeśli jeszcze nie zastosowany.

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

### 1. Sanepid / terminy dokumentów
Dodatkowe pola w karcie pracownika (data ważności książeczki sanepid, data
"umowy", inne pola wg potrzeby). Codzienna weryfikacja (cron) i
powiadomienie kierownika: miesiąc przed, 2 tygodnie przed, codziennie w
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
