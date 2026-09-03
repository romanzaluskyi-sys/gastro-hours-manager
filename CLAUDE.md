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
public/
  version.json                — { "version": "X.Y.Z" }, czytany przez
                                 UpdateBanner.tsx — patrz "Wersjonowanie i
                                 CHANGELOG" niżej
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
    corrections.ts              resolveCorrection/askAboutCorrection —
                                  wspólna logika zatwierdzania korekt godzin
                                  (Zatwierdzanie zmian + inline w Rejestr
                                  Godzin), patrz "Panel kierownika" niżej
    tasks.ts                    isTaskDueOn/toggleTaskCompletion/
                                  buildEmployeeChecklist/
                                  getEffectiveAssignmentForDate/
                                  weeklyChecklistStats/PRIORITY_META —
                                  cała logika modułu Zadania i sprzątanie,
                                  patrz sekcja "Zadania i sprzątanie" niżej.
                                  NIE duplikuj tej logiki w
                                  ZadaniaISprzatanie.tsx ani w
                                  employeeSessionShared.tsx.
  components/
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
      ZadaniaISprzatanie.tsx        zakładka "Zadania i sprzątanie" —
                                    "Kontrola wykonania po osobach", patrz
                                    sekcja "Zadania i sprzątanie" niżej
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
| `open` | closed_dashboard (renderowany przez `PersonalDashboard.tsx`) | wariant "otwartego konta" (mniej używany) |

Login: `Email konta` + `PIN` (6 cyfr). Kioski mają zapisane dane logowania
w przeglądarce telefonu służbowego (autouzupełnianie) + skrót na ekranie
głównym — pracownik nic nie wpisuje ręcznie.

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

**Zakładki** (kolejność z `NAV_ITEMS`): **Pulpit** (`PulpitHome.tsx`, "Dziś
w liczbach" — godziny dziś/tydzień z porównaniem do poprzedniego tygodnia,
koszt miesiąca z `users.stawka`, podgląd "Wymaga Twojej decyzji"/"Teraz na
zmianie"/"Terminy i dokumenty"), **Zatwierdzanie zmian**
(`ZatwierdzanieZmian.tsx`, patrz niżej), **Rejestr Godzin**
(`RejestrGodzin.tsx` — grupowanie po stanowisku, jeden pasek wyszukiwania,
"+ Dodaj wpis", CSV, "Historia" per wiersz), **Aktywni** (`Aktywni.tsx` —
żywy licznik czasu trwania zmiany, "Zakończ zmianę"), **Zadania i
Grafik** (świadomie nadal placeholder — patrz Roadmap), **Zgłoszenia**
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

## Zadania i sprzątanie (Roadmap p.2) — zaimplementowane 2026-09-02..04

Zbudowane w trzech rundach: pierwsza wersja (schemat + panel kierownika +
checklisty pracownika) 2026-09-02, druga (priorytet, dowolne dni tygodnia,
typ "Ogólne", drill-down "Niewykonane dzisiaj", pełna lista z filtrami,
kafelek na Pulpicie, "Zgłoszenie → zadanie") 2026-09-03, trzecia
(2026-09-04, po kolejnej rundzie testowania) — **uproszczenie modelu
danych: usunięcie rozróżnienia `scope='lokal'` vs `scope='pracownik'`,
patrz niżej**, plus reorganizacja formularza i odłączenie postępu na
Pulpicie od tego, czy ktoś odbił zmianę. **Moduł Sprzątanie jako osobny,
rozbudowany proces (HACCP: obladnannia/sprzęt, logi temperatur, oceny
jakości) jest świadomie odłożony** — to, co jest zbudowane teraz,
obsługuje tylko "zwykłe" zadania (w tym cykliczne), nie elektroniczny
dziennik HACCP. Właściciel zdecyduje o zakresie tego drugiego etapu
osobno; do tego czasu NIE projektuj tabeli `equipment`/`cleaning_logs` z
własnej inicjatywy.

Cała logika "czy zadanie jest dziś do zrobienia" i zapis/kasowanie
wykonań żyje w [`utils/tasks.ts`](src/utils/tasks.ts) — jedyne miejsce,
wywoływane i z [`ZadaniaISprzatanie.tsx`](src/components/manager/ZadaniaISprzatanie.tsx)
(panel kierownika), i z
[`employeeSessionShared.tsx`](src/components/employeeSessionShared.tsx)
(Pulpit/Zmiana/Zadania pracownika, kiosk i konto osobiste). Nie duplikuj
tej logiki w żadnym z tych dwóch miejsc.

**Model danych** — dwie tabele (schemat pełny w sekcji "Schemat Supabase"
niżej): `tasks` (definicje, tworzone przez kierownika) i
`task_completions` (log wykonań — brak wiersza = niezrobione, jeden
checkbox = jeden insert/delete, bez wstępnego materializowania "przypisane
ale niezrobione"). ⚠️ **Wykonanie jest ZAWSZE wspólne, jeden wiersz na
(zadanie, dzień)** — `findSharedCompletion()`, bez wyjątków. `tasks.scope`
(`'lokal'`/`'pracownik'`) to relikt pierwszej wersji: kolumna wciąż
istnieje w bazie (default `'lokal'`, ustawiany automatycznie przez
Postgres — kod aplikacji już go nigdzie nie czyta ani nie zapisuje), ale
**nie ma żadnego znaczenia w logice** — nie odtwarzaj rozróżnienia
"osobne wykonanie per pracownik". Pierwsza wersja (2026-09-02/03) miała
dla zadań przypisanych do stanowiska (`scope='pracownik'`) osobne
wykonanie na każdego pracownika — okazało się to mylące w praktyce: dwie
osoby na tym samym stanowisku widziały niezależne stany tego samego
zadania, mimo że w rzeczywistości to jedna czynność do zrobienia przez
kogokolwiek na zmianie. Jedyna zmienna, która realnie różnicuje zadania,
to `stanowisko` (`null` = cały lokal/"wszyscy", inaczej konkretne
stanowisko) — decyduje WIDOCZNOŚĆ (kto widzi zadanie na swojej liście),
nie liczbę wymaganych wykonań. Na kiosku, jeśli dana osoba nie pracuje
danego dnia, nikt i tak nie wchodzi na jej stronę, więc brak odznaczenia
nie generuje fałszywego alarmu.

**`schedule_type`**: `ogolne` (dowolna pora dnia — **domyślny typ** w
formularzu tworzenia, dodane 2026-09-03 bo pierwsza wersja nie miała
kategorii "po prostu zrobić w ciągu dnia" innej niż cykliczne) /
`poranne`/`obiadowe`/`wieczorne` / `cykliczne` (co N dni, `cycle_days`,
liczone od **ostatniego faktycznego wykonania**, nie od stałej kotwicy w
kalendarzu — pominięty cykl zostaje zaległy zamiast po cichu przeskoczyć
dalej, patrz `isCyclicalDueOn` w `utils/tasks.ts`).

**Dni tygodnia**: `days_of_week` (text, lista indeksów po przecinku, np.
`"1,2,3,4,5"` — `0=niedziela..6=sobota`, zwykłe JS `Date.getDay()`, bez
własnego mapowania) pozwala wybrać DOWOLNY podzbiór dni zamiast jednego —
dodane 2026-09-03 na prośbę właściciela ("codziennie oprócz niedzieli"
wymagało wcześniej 6 osobnych zadań z pojedynczym `day_of_week`).
Formularz (`ZadaniaISprzatanie.tsx`, sekcja "Powtarzalność") domyślnie
zaznacza wszystkie 7 dni (przycisk "Cały tydzień" też ustawia/czyści
wszystkie naraz) — kierownik odznacza tylko wyjątki, nie zaznacza od
zera. 7/7 zaznaczonych dni jest równoważne "codziennie" (`daysOfWeekLabel`
pokazuje podpowiedź "tylko ..." wyłącznie gdy zaznaczono 1-6 dni, nie 7).
Stary `day_of_week` (int, pojedynczy dzień) zostaje w schemacie tylko dla
wstecznej zgodności z zadaniami utworzonymi przed tą zmianą — `isTaskDueOn`
honoruje `days_of_week`, jeśli jest ustawione, inaczej spada na
`day_of_week`.

**Priorytet** (`priority`: `niski`/`sredni`/`wysoki`, default `sredni`,
dodane 2026-09-03) — czysto informacyjny, nie zmienia logiki "co jest do
zrobienia". `wysoki` dostaje czerwony tag "Ważne" przy niedokończonym
zadaniu (Pulpit, Zmiana, zakładka Zadania) i sortuje się na górę
checklisty (`buildEmployeeChecklist`).

**Formularz "Nowe zadanie"** (`ZadaniaISprzatanie.tsx`, reorganizowany
2026-09-04): Tytuł, Opis, potem **Lokal i "Dla kogo" (stanowisko albo
"Wszyscy") obok siebie** — jedno pole wyboru odbiorcy zamiast dawnego
`scope` + osobnego selecta stanowiska. Sekcja "Powtarzalność" grupuje
WSZYSTKO co dotyczy częstotliwości w jednym bloku: przycisk "Cały
tydzień" + 7 przełączników dni + pole "Termin" (godzina, opcjonalna) —
świadomie przeniesione tu z osobnych miejsc formularza, żeby cała
konfiguracja "kiedy" żyła w jednym miejscu. Pole `owner_label` ("Kto ma
zrobić", wolny tekst) zostało **usunięte z formularza** (kolumna w bazie
zostaje, nieużywana) — było zbędne po tym, jak odbiorcą zadania stało się
wprost stanowisko zamiast luźnej podpowiedzi tekstowej.

**Panel kierownika** (`ZadaniaISprzatanie.tsx`) — pigułki filtrów
Poranne/Obiadowe/Wieczorne/Ogólne/Cykliczne + osobny przełącznik "Zadania
kierownika" (`for_manager=true`, ortogonalna flaga — zadanie może być
jednocześnie np. wieczorne I dla kierownika). Nawigacja dat z przyciskiem
"Dziś" (szybki skok). ⚠️ Od 2026-09-04 **jedna, spójna lista** "Zadania na
dziś" (filtrowana pigułkami + opcjonalnie stanowiskiem) zamiast
poprzedniego podziału na dwa panele ("Wspólne dla całego lokalu" /
"Postęp po osobach") — ten podział miał sens tylko przy modelu z osobnym
wykonaniem per pracownik, którego już nie ma. Sekcja "Niewykonane
dzisiaj" (zwijana) to płaska lista zaległych zadań (tytuł, priorytet,
stanowisko/lokal) — **bez** rozbicia po pracownikach/godzinach zmian (to
też było zależne od starego modelu). Sekcja "Wszystkie zadania w tym
lokalu" (zwijana) to pełny katalog zadań (niezależnie od tego, czy są
dziś "due"), z filtrem po lokalu i stanowisku oraz przyciskiem
"Archiwizuj" (`tasks.archived=true` — **jedyna** dostępna dziś operacja
edycji istniejącego zadania; nie ma UI do zmiany tytułu/harmonogramu już
utworzonego zadania — trzeba zarchiwizować i stworzyć nowe).

**Kafelek "Zadania dziś" na Pulpicie** ([`PulpitHome.tsx`](src/components/manager/PulpitHome.tsx),
4. kolumna) — pierścień postępu (`ProgressRing`, SVG) per lokal. ⚠️ Od
2026-09-04 liczony **wyłącznie z `tasks`/`task_completions`**, NIE z
`shifts` — pierwsza wersja pokazywała postęp tylko dla pracowników, którzy
danego dnia odbili zmianę, co dawało mylące "0 zadań" na starcie dnia,
zanim ktokolwiek się zalogował (zespół jeszcze nie ma nawyku odbijania
zmiany od razu po przyjściu). Lista lokali do pokazania = lokale mające
choć jedno nieaktywne-nie-archiwalne zadanie zdefiniowane, niezależnie od
obsady.

**Zgłoszenie → zadanie** (`Zgloszenia.tsx`, dodane 2026-09-03) — przycisk
"Utwórz zadanie" przy zgłoszeniu typu `problem` tworzy `tasks` wiersz z
`for_manager=true`, `schedule_type='ogolne'`, `source_issue_id=issue.id`
(text, luźne odwołanie bez FK — ten sam wzorzec co
`shift_edits.shift_id`/`issue_id`, patrz błędy #12/#13 niżej). Tytuł jest
edytowalny inline przed zapisem (podpowiedź = pierwsze 80 znaków treści
zgłoszenia). Po utworzeniu przycisk zamienia się w odznakę "Zadanie
utworzone" (sprawdzane przez `tasks.some(t => t.source_issue_id ===
iss.id)`, przeżywa odświeżenie strony).

**Pracownik** (`employeeSessionShared.tsx`) — `buildEmployeeChecklist`
liczy checklistę widoczną dla pracownika na dany dzień (filtr: lokal +
stanowisko dopasowane albo "wszyscy"), preferując lokal/stanowisko z
otwartej albo najnowszej zmiany danego dnia nad statycznym
`default_lokal`/`default_stanowisko` (`getEffectiveAssignmentForDate`) —
to dotyczy tylko tego, co pracownik WIDZI, nie wykonania (które jest
wspólne, patrz "Model danych" wyżej). Wspólny renderer
`renderTaskChecklist()` (jedna funkcja, trzy miejsca użycia — nie
duplikuj, od 2026-09-04 używana też przez zakładkę Zadania zamiast
własnej kopii JSX) rysuje checklistę z klikalnym checkboxem: gdy zadanie
wykonane, wiersz jest wizualnie "lżejszy" (`opacity-60`) z przekreślonym
tytułem (`line-through`) i podpisem kto/kiedy wykonał — działa tak samo
(1) na Pulpit **przed** rozpoczęciem zmiany (pełna klikalna lista, nie
tylko link — dodane 2026-09-03/04 po feedbacku testowym), (2) na
Pulpit/Zmiana **w trakcie** zmiany (sekcja "Zadania na zmianę" +
niewymuszający banner "Zostały N zadań..." — zamknięcie zmiany działa
bez ograniczeń niezależnie od stanu zadań), (3) w zakładce Zadania (z
przełącznikiem "Twoje stanowisko"/"Wszystkie" — "Wszystkie" przydatne
głównie na kiosku, gdzie kilka ról dzieli jeden tablet; odhaczenie
zadania spoza własnego stanowiska w tym trybie jest dozwolone i zapisuje
się pod tożsamością klikającej osoby, świadoma decyzja). Zakładka Zadania
ma też banner "Masz N niewykonanych zadań" i mini-raport
`weeklyChecklistStats()` — "Ostatnie 7 dni: X z Y zadań", liczony TYLKO z
dni, w które pracownik faktycznie miał jakąś zmianę (przybliżenie, nie
audyt — patrz komentarz w `utils/tasks.ts`; ten wskaźnik dotyczy widoku
JEDNEGO pracownika, więc zależność od jego własnych zmian ma sens —
inaczej niż kafelek kierownika na Pulpicie opisany wyżej). Odznaka z
liczbą niewykonanych zadań na ikonie zakładki "Zadania" w `Shell`
(`taskBadgeCount`, ten sam wzorzec co `unreadCount` na "Więcej" —
przekazywany przez WSZYSTKIE 7 wywołań `<Shell>` w tym pliku).

`App.tsx` ładuje `tasks`/`task_completions` jako dwa osobne, nieblokujące
fetche (ten sam wzorzec co `shift_edits`) — błąd tu nie blokuje reszty
apki.

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
  "Panel kierownika" wyżej. `kiosk_pin` (text, nullable, 4 cyfry, dodana
  2026-08-31) — blokada PIN-em na kiosku, patrz "Panel kierownika" i
  "Tablet Służbowy" wyżej; NIE mylić z kolumną `pin` (6-cyfrowy PIN
  logowania Email+PIN). Formularz kierownika do jej ustawiania istnieje
  od 2026-09-02 (`Pracownicy.tsx`). Od 2026-09-02 dodatkowo: `stawka`
  (numeric, nullable, zł/h — puste = brak, NIE `0`; liczone w Pulpit/
  Raporty i koszty/karcie pracownika, z jawnym "brak stawki"/"dane
  niepełne" zamiast cichego liczenia jako 0), `etat` (text, nullable,
  wolna wartość z zamkniętej listy w formularzu — nie osobny słownik),
  `notatki` (text, nullable), `notatki_updated_by`/`notatki_updated_at`
  (text/timestamptz, nullable — ustawiane w `handleSaveUser` TYLKO gdy
  `notatki` faktycznie się zmieniło względem tego, co jest w bazie, nie
  przy każdym zapisie karty).
- **lokale** — `id, name, archived`
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
  (timestamptz), end_time (timestamptz | null), godzin`. `id` to **uuid**
  (zweryfikowane bezpośrednio w Supabase 2026-09-02 — wcześniejsze wzmianki
  o `bigint` w tym pliku były błędne; nie ufaj typom kolumn opisanym tu bez
  świeżej weryfikacji przez `information_schema.columns`, jeśli coś na tym
  zależy).
- **issues** — zgłoszenia od pracowników, dwa typy w jednej tabeli (patrz
  "Zgłoszenia i powiadomienia" wyżej). Podstawowe:
  `id, user_id, user_name, issue_text, status, is_anonymous, shift_id`
  (uuid, nullable, references `shifts(id)`). Od 2026-09-02 też `type`
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
  ten sam wzorzec co reszta tabel w tym projekcie (żadna nie ma prawdziwych
  FK). RLS: otwarta polityka jak reszta. Czytane przez "Historia" w Rejestr
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
- **tasks** — definicje zadań, patrz "Zadania i sprzątanie" wyżej.
  `id (uuid), lokal (text), title (text), description (text, null),
  schedule_type (text: 'poranne'|'obiadowe'|'wieczorne'|'ogolne'|
  'cykliczne'), cycle_days (int, null — tylko cykliczne), day_of_week
  (int, null, 0-6 — STARE, zastąpione przez days_of_week, zostaje tylko
  dla wstecznej zgodności), days_of_week (text, null — lista indeksów po
  przecinku np. "1,2,3,4,5", 0=niedziela..6=sobota, dodane 2026-09-03),
  scope (text: 'lokal'|'pracownik', default 'lokal' — NIEUŻYWANE w
  logice od 2026-09-04, zostaje w bazie z automatycznym defaultem, nie
  czytaj/nie pisz go, patrz "Zadania i sprzątanie" wyżej), stanowisko
  (text, null — decyduje widoczność: null="wszyscy"/cały lokal, inaczej
  konkretne stanowisko; wykonanie zawsze wspólne bez względu na tę
  wartość), owner_label (text, null — pole z pierwszej wersji formularza,
  USUNIĘTE z UI 2026-09-04, kolumna zostaje nieużywana), deadline_time
  (time, null), priority (text: 'niski'|'sredni'|'wysoki',
  default 'sredni', dodane 2026-09-03), for_manager (boolean, default
  false), source_issue_id (text, null — luźne odwołanie do issues.id gdy
  zadanie powstało z przycisku "Utwórz zadanie" w Zgłoszeniach, dodane
  2026-09-03), active (boolean, default true), archived (boolean, default
  false), created_at (timestamptz)`. RLS: otwarta polityka, jak reszta.
- **task_completions** — log wykonań zadań, patrz "Zadania i sprzątanie"
  wyżej. `id (bigint identity), task_id (text — luźne odwołanie do
  tasks.id, bez FK, ten sam wzorzec co shift_edits), date (date), user_id
  (text, null), user_name (text, null), completed_at (timestamptz),
  shift_id (text, null)`. Brak wiersza dla danego (task_id, date[,
  user_id]) = niezrobione; brak też jakiejkolwiek unikalności wymuszonej w
  SQL (świadomie, jak reszta tego projektu — ochrona przed podwójnym
  zapisem jest tylko po stronie aplikacji w `utils/tasks.ts`). RLS:
  otwarta polityka.

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

### 2. Zadania + Sprzątanie — **ZADANIA ZROBIONE, Sprzątanie jako osobny proces ODŁOŻONE**
⚠️ Zaimplementowana część NIE odpowiada już dokładnie opisowi niżej —
patrz sekcja "Zadania i sprzątanie" wyżej po pełny, aktualny opis. Skrót:

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
