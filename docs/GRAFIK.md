# Grafik — specyfikacja robocza

> Dokument roboczy, budowany iteracyjnie w sesjach projektowych z właścicielem
> (start: 2026-09-03). Źródło prawdy dla modułu Grafik do czasu implementacji;
> po wdrożeniu skrót trafi do CLAUDE.md. Każda sesja = nowa sekcja "Runda N".
> **Nic z tego pliku nie jest jeszcze zaimplementowane**, chyba że wprost
> napisano inaczej.

## Runda 1 (2026-09-03) — widok tygodniowy, ekran startowy

### Układ ekranu

Kolejność pasków od góry (poprawka względem makiety — obecnie odwrotnie):

1. **Wybór lokalu** (taby: Wszystkie lokale / Ceglana / Bułka i Jacek /
   Marynata i Chińczyk / Sunset)
2. **Wybór okresu** — strzałki `<` `>`, zakres "31 sierpnia – 6 września",
   przycisk "Dziś". Klik w sam zakres → picker konkretnego tygodnia.
3. Po prawej: **Podgląd / Edycja** (tryb), **Miesiąc** (przełącznik widoku —
   makieta miesięczna w kolejnej rundzie), **Wyślij grafik pracownikom**.

- "Wyślij grafik pracownikom" pojawia się **tylko w trybie Edycja i tylko gdy
  są niezapisane/nieopublikowane zmiany**.
- Pasek "SORTUJ": Stanowisko / Godziny / Nazwisko + legenda skrótów stanowisk
  (kolory z `stanowiska.kolor`, skróty z `stanowiska.skrot` — już w bazie).
- Przy "Wszystkie lokale": każdy lokal ma osobną tabelę z własną obsadą i
  sumą godzin (`Kopiuj z poprzedniego tygodnia`, `Eksport lokalu` per lokal).

### Nagłówek kolumny dnia

Dzień tygodnia, data, pogoda, liczba pracowników + suma godzin — **wyrównane
w kolumnie** (jedna siatka, nie luźny tekst). Pogoda z istniejącego
`utils/weather.ts` (per miasto lokalu).

### Kolumna pracownika (lewa)

- Imię
- Stanowisko(-a) i lokal(-e); czerwony pasek przy nazwisku = pracuje w kilku
  lokalach lub na kilku stanowiskach
- **Suma godzin w miesiącu**
- **Liczba zmian w miesiącu**
- **Suma kosztów w miesiącu** — tylko gdy `users.stawka` ustawiona
  (brak stawki = brak liczby, nigdy `0` — ta sama zasada co w Raportach)

### Typy komórek

| Komórka | Znaczenie | Źródło |
|---|---|---|
| Kolorowa plakietka + godziny | zaplanowana zmiana | plan grafiku |
| `URP` "urlop" | zatwierdzony urlop | `absences` (`type='urlop'`, `approved`) |
| `NIE` "brak dostępności" | zatwierdzona niedostępność — **blokuje dodanie pracownika w trybie Edycja** | `absences` (`type='niedostepnosc'`, `approved`) |
| szare "w Sunset" / "w Ceglana" | tego dnia osoba ma zmianę w innym lokalu (read-only) | plan innego lokalu |

### Liczenie godzin i zmian

- **Urlop**: nie zwiększa liczby zmian, ale dodaje **8 h za każdy dzień
  roboczy** (pon–pt) — zgodne z istniejącym `buildUrlopShiftDrafts()`.
  ⚠️ Trzeba sprawdzić, czy dzisiejsze liczniki "liczba zmian" gdziekolwiek
  nie wliczają wierszy `shifts.is_urlop = true` — jeśli tak, poprawić.

### Wymagania obsady (staffing rules) — nowa koncepcja

Cel: automatyczna kontrola "czy grafik pokrywa minimum obsady", widoczna jako
`2 dni pod minimum (6 osób)` w nagłówku lokalu.

Wymaganie definiowane **per lokal + stanowisko** i składa się z wierszy:
`dni tygodnia` × `od godziny` × `do godziny` × `liczba osób`.

**Wiersze sumują się (addytywnie)** — dokładnie tak, jak opisał właściciel:
- BŁ: pn–nd, od otwarcia do zamknięcia, **2 osoby**
- BŁ: sobota, 14:00–19:00, **+1 osoba**
→ efektywnie w sobotę: 2 osoby do 14:00, 3 osoby 14:00–19:00, 2 osoby po 19:00.

Kontrola **nie sprawdza, kto konkretnie** pokrywa wymaganie — liczy tylko
liczbę osób na danym stanowisku w każdej minucie dnia. Jedna osoba do 14:00 +
dwie od 14:00 spełnia wymaganie tak samo jak dwie osoby na całą zmianę.

Stanowisko nieobecne w danym dniu (np. brak w niedzielę) = po prostu brak
wiersza na ten dzień.

**Wymagania zmieniają się z miesiąca na miesiąc** — wersjonowane, z
możliwością skopiowania z poprzedniego miesiąca i edycji.

### Decyzje (2026-09-03)

| # | Pytanie | Decyzja |
|---|---|---|
| 1 | Plan vs fakt | **Osobna tabela na plan.** `shifts` zostaje wyłącznie faktem (odbicia). Grafik dodatkowo *informuje* o rozjeździe: "+0,5 h ponad plan", "zmiana poza planem" (ktoś przyszedł, bo wzrósł ruch) — to komunikat, nie korekta. |
| 2 | Godziny otwarcia | **Tak, w edycji lokalu** (Pracownicy → Lokale). Rzadko się zmieniają, ale **nie wszystkie dni są takie same** → godzina otwarcia/zamknięcia per dzień tygodnia. Wyjątki: święta (grafik zmieniony na dzień-dwa) i niedziela handlowa (mogą być inne wymagania godzinowe) → potrzebny mechanizm **wyjątku na konkretną datę**, nadpisującego regułę tygodniową. |
| 3 | Wersjonowanie wymagań | **Tak** — zestaw obowiązujący od danego miesiąca + "Kopiuj z poprzedniego miesiąca"; obowiązuje do czasu pojawienia się nowszego. |
| 4 | Niedobór obsady | **Tylko ostrzeżenie.** Nigdy blokada wysyłki. |
| 5 | Edytor wymagań | Wewnątrz Grafiku (osobny widok "Wymagania obsady"). W Pracownicy → Stanowiska zostaje tylko nazwa/skrót/kolor. |
| 6 | "Przeczytało 12 z 14 osób" | **Odłożone** — nieobowiązkowe, wracamy później. |

### Doprecyzowanie: "2 osoby od początku do końca"

Nie chodzi o "dwie osoby przypisane do dnia", tylko o **dwie pełne zmiany
pokrywające bez przerwy cały czas otwarcia**. Może je realizować 3 i więcej
osób. Kontrola liczy obsadę minuta po minucie i raportuje **długość dziury**:

> Przykład: A pracuje od otwarcia do zamknięcia, B do 14:00, C od 15:00.
> Między 14:00 a 15:00 jest tylko 1 osoba przy wymaganych 2 →
> ostrzeżenie "niedobór 1 h".

Czyli algorytm = suma wymagań (addytywnie, patrz Runda 1) vs faktyczna liczba
zaplanowanych osób na stanowisku w każdym przedziale; wynik to lista dziur z
godzinami i brakującą liczbą osób.

## Runda 2 (2026-09-03) — tryb Edycja + Giełda zmian

### Tryb Edycja (drugi zrzut)

- Każda pusta komórka dostaje placeholder **`+ dodaj`** (przerywana ramka).
- Komórki `NIE` (brak dostępności) i `URP` (urlop) **nie** dostają `+ dodaj` —
  nie da się tam nic wpisać.
- Komórki "w innym lokalu" (szare) też bez `+ dodaj` — to podgląd cudzego planu.
- "Wyślij grafik pracownikom" staje się aktywny (czerwony).
- Stopka zmienia treść na: *"Tryb edycji — zmiany nie są jeszcze wysłane
  pracownikom"* (w podglądzie: *"grafik wysłany 1.09 o 18.20"*).
- Zapis do bazy + publikacja dopiero po "Wyślij" — do tego czasu plan jest
  wersją roboczą, niewidoczną dla pracowników.

### Giełda zmian (nowy moduł, nie ma go na makiecie)

Trzeci kanał próśb pracownika — obok "wniosku o wolne" i "urlopu"
(patrz CLAUDE.md → "Urlopy i niedostępność").

Przepływ:
1. Pracownik wystawia **konkretną zmianę ze swojego grafiku** na giełdę
   (zmieniły mu się plany).
2. Pracownicy, którzy tego dnia **mają wolne**, widzą ofertę i mogą ją
   **przyjąć**.
3. Zamiana idzie do **zatwierdzenia przez kierownika**.

Widoczność u kierownika — **dwa miejsca, świadomie zduplikowane**:
- kolejka decyzji (Zatwierdzanie zmian / Pulpit),
- **bezpośrednio w komórce grafiku**: oznaczenie "jest prośba o zamianę" +
  **✓ / ✗** przy komórce. Ostrzeżenie widać zawsze (też w Podglądzie), ale
  **zatwierdzić można wyłącznie w trybie Edycja**.

### Decyzje giełdy i wyjątków (2026-09-03)

| # | Pytanie | Decyzja |
|---|---|---|
| 1 | Kto może przyjąć zmianę z giełdy | **Pokazujemy wszystkich wolnych z jego lokalu**, a jeśli to nie jego stanowisko — **ostrzeżenie, nie blokada**. Ostateczną decyzję podejmuje kierownik. Docelowo cała ta reguła ma być **konfigurowalna** przez kierownika/admina w przyszłych Ustawieniach — nie hardkodować jednej polityki. |
| 2 | Odmowa kierownika | Zmiana **wraca do autora**, obaj dostają powiadomienie. |
| 3 | Oferta bez chętnego | Tak — trzy stany komórki: `na giełdzie` → `przyjęta, czeka na kierownika` (✓/✗) → `zamieniona`. |
| 4 | Rozjazd plan/fakt | **W obu miejscach** — w komórce grafiku (dni minione) i w Rejestrze Godzin. |
| 5 | Wyjątki dat | Nadpisują **i godziny otwarcia, i wymagania obsady**. Wzorzec: panel restauracji Uber Eats — wyjątek na konkretną datę **albo okres**, z własnym grafikiem otwarcia i od razu własnymi wymaganiami. |

## Runda 3 (2026-09-03) — modale wpisywania zmiany

### Modal "Przypisz zmianę" (klik w komórkę / `+ dodaj`)

Nagłówek: `PRZYPISZ ZMIANĘ` + `CZW 3 wrz · Tomek`.

Sekcje:
1. **PRACOWNIK** — chipy z osobami **wolnymi tego dnia** (można podmienić osobę
   bez zamykania modala).
2. **STANOWISKO NA TĘ ZMIANĘ** — chipy wszystkich stanowisk z kolorem i
   skrótem (`stanowiska.kolor`/`.skrot`), zaznaczone na czarno = wybrane.
3. **OD / DO / LOKAL** — pola edytowalne.
4. Podpowiedź: *"Godziny podstawiono ze standardu stanowiska Kucharz
   (09:00–20:00). Możesz je nadpisać."*
5. Akcje: **Przypisz zmianę** (czerwony primary), **Przypisz i dodaj następną**
   (szybkie wprowadzanie seriami), **Usuń zmianę** (ten sam modal służy do
   edycji istniejącej zmiany).

**Prefill**: domyślny lokal + domyślne stanowisko pracownika + godziny ze
standardu stanowiska. Wszystko nadpisywalne — są lokale, gdzie ludzie się
wymieniają.

⚠️ **Skąd "standard godzin stanowiska"** — propozycja: **z wymagań obsady**
(Runda 1) dla tego stanowiska i tego dnia tygodnia, a nie z osobnego pola na
`stanowiska`. Jeden zestaw danych, zero rozjazdu. Gdy dla danego dnia jest
kilka przedziałów, prefill = najdłuższy/bazowy.

### Modal "Nie można wpisać zmiany" (blokada)

Dwa warianty tej samej blokady, ta sama ramka:
- **Konflikt lokali**: *"Maryna ma tego dnia zmianę w lokalu Ceglana
  (09:00–21:00). Usuń ją tam, aby wpisać zmianę w Bułka i Jacek."*
- **Brak dostępności**: *"Dostępność zgłasza pracownik w swojej aplikacji. Aby
  to obejść, poproś o wycofanie zgłoszenia."*

Akcje: **Napisz do pracownika** (reuse `createEmployeeNotification` z
`api/notifications.ts` — nie twórz nowego kanału), **Anuluj**, **Zamknij**.

Zasada: jedna osoba = maksymalnie jedna zmiana dziennie w całej sieci.

### Korekta zasady blokowania (2026-09-03) — WAŻNE

Wcześniejszy zapis "jedna osoba = maksymalnie jedna zmiana dziennie w całej
sieci" jest **BŁĘDNY**. Obowiązuje:

> **Blokujemy wyłącznie nakładające się godziny.**

Pracownik może pracować 09:00–12:00 w jednym lokalu / na jednym stanowisku i
12:00–zamknięcie w innym. To normalna sytuacja, nie błąd. Uzasadnienie
właściciela: gdyby zabronić dzielenia zmian, kontrola obsady pokazywałaby
niedobór na stanowisku, które realnie jest obsadzone.

Wniosek dla modala "Nie można wpisać zmiany": treść musi mówić o **kolizji
godzin**, nie o "ma już zmianę tego dnia".
Istniejący `findOverlappingShift` w `utils/shifts.ts` działa dokładnie tak —
reużyć, nie pisać drugiej implementacji.

### Wiele stanowisk na pracownika — ZATWIERDZONE

`users.allowed_stanowiska` (lista, wzorem `allowed_lokale`):
- `default_stanowisko` → prefill w modalu,
- `allowed_stanowiska` → co pracownik **umie** robić (bez ostrzeżenia),
- poza listą → wolno, ale z żółtym ostrzeżeniem "to nie jego stanowisko".

## Runda 4 (2026-09-03) — widok miesiąca

Nagłówek: `Wrzesień 2026 · Ceglana` + `1 842 h zaplanowane · 14 osób ·
3 dni bez pełnej obsady`. Nawigacja: `← Sierpień`, `Październik →`,
`Wróć do tygodnia`. Stopka: *"Liczba to obsada dnia; czerwona — poniżej
minimum dla lokalu (8 osób)"*, `Ostatnia zmiana: 3.09.2026, 09:14 · Roman`.

### Do rozbudowy względem makiety

Makieta pokazuje tylko `12 osób / 96 h` w kafelku dnia. **Docelowo kafelek ma
pokazywać skład dnia**: kto pracuje, na jakim stanowisku, od której do której
— wszystko w mini-wersji (skrót stanowiska z koloru + godziny + imię).

### Widok miesiąca jest ZAWSZE per lokal

Nie ma wariantu "cała sieć" w miesiącu — rozbicie wyłącznie na lokale.

⚠️ Zasada widoczności międzylokalowej (odwrotnie niż w widoku tygodnia!):
w widoku miesiąca lokalu 2 pracownik przypisany na stałe do lokalu 1 **jest
widoczny tylko tą jedną zmianą, którą wyjątkowo robi w lokalu 2**. Jego
pozostałe zmiany z lokalu 1 **nie są tu w ogóle pokazywane** — żadnych szarych
"w Ceglana". Widok miesiąca = wyłącznie zmiany należące do tego lokalu.

### Druk / eksport

Widok miesiąca musi dać się **wyeksportować do druku na jednej kartce A4**.
To twarde wymaganie, nie "nice to have" — grafik wisi w lokalu na ścianie.

### Decyzje domykające panel kierownika (2026-09-03)

| # | Pytanie | Decyzja |
|---|---|---|
| 1 | "Minimum dla lokalu (8 osób)" | **Nie ma osobnego ustawienia.** Dzień jest "pod minimum", jeśli którekolwiek stanowisko ma dziurę względem wymagań obsady. Jedno źródło prawdy — usunąć płaską liczbę osób z makiety. |
| 2 | "Eksport lokalu" (tydzień) | **CSV.** Technicznie bez żadnych dodatkowych zależności — ten sam wzorzec co `RejestrGodzin.tsx:148` (Blob + BOM + `URL.createObjectURL`). Reużyć, nie dokładać biblioteki. |
| 3 | Dwa warianty druku miesiąca | Docelowo do wyboru (siatka kalendarza / tabela pracownicy × dni). **Odłożone na potem** — nie w pierwszej wersji. |

### Stan makiet

**Panel kierownika — komplet.** Właściciel nie projektował jeszcze widoku dla
pracownika; tam głównym (i praktycznie jedynym) urządzeniem jest **telefon**,
więc grafik dla pracownika trzeba zaprojektować mobile-first od zera.

## Proponowany model danych (do zatwierdzenia — NIE zaimplementowane)

Konwencje repo: brak prawdziwych FK (luźne odwołania jako `text`), otwarta
polityka RLS, `days_of_week` jako lista indeksów po przecinku (jak w `tasks`).

| Tabela | Rola | Kluczowe kolumny |
|---|---|---|
| `grafik_shifts` | **plan** (osobno od `shifts` = fakt) | `lokal, user_id, user_name, stanowisko, date, start_time, end_time, published_at, updated_at, created_by` |
| `staffing_rule_sets` | wersja wymagań obsady na miesiąc | `lokal, obowiazuje_od (1. dzień miesiąca), created_by` |
| `staffing_rules` | wiersze wymagań (**addytywne**) | `set_id, wyjatek_id, stanowisko, days_of_week, start_time, end_time, required_count` |
| `lokale_godziny` | godziny otwarcia per dzień tygodnia | `lokal, day_of_week, open_time, close_time, zamkniete` |
| `grafik_wyjatki` | święta / niedziela handlowa | `lokal, date_from, date_to, zamkniete, open_time, close_time, note` |
| `shift_swaps` | giełda zmian | `grafik_shift_id, author_*, taker_*, status, decided_by, decided_at` |
| `users` (rozszerzenie) | wiele stanowisk | `allowed_stanowiska[]` (wzorem `allowed_lokale`) |

**Draft vs opublikowany**: zmiana jest "niewysłana", gdy
`published_at IS NULL OR updated_at > published_at`. Nie potrzeba osobnej
tabeli publikacji — nagłówek liczy takie wiersze i na tej podstawie aktywuje
"Wyślij grafik pracownikom".

**Wyjątki nadpisują i godziny, i wymagania** — dlatego `staffing_rules` ma
alternatywnie `set_id` (reguła miesięczna) albo `wyjatek_id` (reguła wyjątku).

⚠️ Migracja: **rozbić na 2–3 osobne wklejenia** w Supabase SQL Editor i po
każdym zweryfikować `information_schema.columns` — patrz błąd #12 w CLAUDE.md
(całe wklejenie to jedna transakcja, jeden błąd cofa wszystko).

### Uwaga do modelu: `allowed_stanowiska` to TEXT, nie tablica

`allowed_lokale` mimo zapisu `allowed_lokale[]` w CLAUDE.md jest w praktyce
**tekstem rozdzielonym przecinkami** (`ManagerDashboard.tsx:463` robi
`.join(",")`, `KioskDashboard.tsx:52` robi `.split(",")`). `allowed_stanowiska`
idzie tym samym wzorcem — inaczej trzeba by przepisać całą obsługę list.

### Uwaga do modelu: zmiany przez północ

`grafik_shifts.start_time`/`end_time` to `time`. Konwencja: **`end_time <
start_time` oznacza zakończenie następnego dnia**. Dotyczy też kontroli obsady
(przedział trzeba wtedy rozbić na dwa dni) — pamiętać przy pisaniu
`utils/grafik.ts`.

## Runda 5 (2026-09-03) — grafik dla pracownika (propozycja, mobile-first)

Kontekst: jedyne realne urządzenie to telefon. Siatka 7 kolumn × N osób jest
na telefonie nieczytelna — **nie przenosimy widoku kierownika**. Pracownika
interesuje przede wszystkim jedno pytanie: *"kiedy następnym razem pracuję"*.

### Miejsce w nawigacji

Dziś Grafik jest placeholderem w zakładce **Więcej**. Propozycja:
**awansować go do własnej zakładki** w `Shell` (`employeeSessionShared.tsx`) —
to rzecz oglądana codziennie, a "Więcej" to szuflada na rzeczy rzadkie.
Odznaka na ikonie przy nowo opublikowanym grafiku (ten sam wzorzec co
`taskBadgeCount`/`unreadCount`).

### Ekran 1 — "Mój tydzień" (domyślny)

Pionowa lista 7 dni, nie siatka. Jeden dzień = jedna karta:

```
PON 8 wrz                         DZIŚ
┌────────────────────────────────────┐
│ [KCH] 09:00 – 20:00 · Ceglana      │
│ Z tobą: Iga (KuM), Adam (DZ)       │
│ [ Wystaw na giełdę ]               │
└────────────────────────────────────┘

WT 9 wrz          Wolne

ŚR 10 wrz         [URP] Urlop

CZW 11 wrz        [NIE] Zgłoszona niedostępność
```

Przełącznik u góry: `Ten tydzień` / `Następny` / `Miesiąc`.
Widok miesiąca u pracownika = **lista wyłącznie własnych zmian** (nie siatka),
plus podsumowanie na górze: `Wrzesień: 21 zmian · 168 h`.

### Ekran 2 — szczegóły zmiany (klik w kartę)

Data, godziny, lokal, stanowisko, pełny skład zmiany, a pod tym akcje:
- **Wystaw na giełdę** (jeśli zmiana jest w przyszłości)
- **Zgłoś poprawkę** — reuse istniejącego `type='correction'`
- pasek plan/fakt dla dni minionych: *"Plan 09:00–20:00 · Odbito 09:05–20:30"*

### Ekran 3 — Giełda zmian

Dwie sekcje na jednym ekranie:
- **Moje oferty** — co wystawiłem i w jakim stanie (`na giełdzie` / `czeka na
  kierownika` / `zamienione` / `odrzucone`)
- **Wolne zmiany** — oferty innych, które mogę wziąć. Filtr: tylko dni, w
  które jestem wolny. Przy niezgodnym stanowisku żółte ostrzeżenie
  *"to nie twoje stanowisko"* — ale przycisk **działa** (decyduje kierownik).

### Powiązania z tym, co już istnieje

- Publikacja grafiku → `createEmployeeNotification` do każdego pracownika,
  którego zmiany są w wysyłanym tygodniu ("Grafik na 8–14 września jest
  gotowy"). Nie tworzyć nowego kanału powiadomień.
- Karta **Pulpit** dostaje kafelek *"Następna zmiana: jutro 09:00–20:00 ·
  Kucharz"* — to najczęściej zadawane pytanie, nie powinno wymagać klikania.
- `URP` / `NIE` w kartach dnia biorą się z istniejącej tabeli `absences`.

### Decyzje o widoku pracownika (2026-09-03)

| # | Pytanie | Decyzja |
|---|---|---|
| 1 | Zakres widoczności | **Domyślnie tylko swoje zmiany**, z przełącznikiem na "wszyscy" (cały lokal). |
| 2 | Miejsce w nawigacji | **Własna, stała zakładka** w tabbarze — nie "Więcej". |
| 3 | Limit czasowy giełdy | **12 godzin** przed rozpoczęciem zmiany. Później nie da się wystawić. |

### Migracje wykonane i zweryfikowane (2026-09-03)

Wszystkie trzy migracje z `docs/sql/` zastosowane przez właściciela.
Weryfikacja przez REST (nie tylko "SQL Editor powiedział sukces"):

- `lokale_godziny`, `grafik_wyjatki`, `staffing_rule_sets`, `staffing_rules`,
  `grafik_shifts`, `shift_swaps` → `200`, polityki RLS działają na odczyt
- `users.allowed_stanowiska` → istnieje, `null` dla istniejących wierszy
- test zapisu na `grafik_shifts`: `POST` → `201`, `DELETE` → `204`,
  tabela z powrotem pusta (RLS `with check` działa)

⚠️ PostgREST zwraca `time` w formacie **`"09:00:00"`**, nie `"09:00"` —
przy porównaniach i renderowaniu trzeba obcinać sekundy.

## Plan wdrożenia (kolejność)

Branch: `feature/grafik`. Każdy etap osobno testowalny na Vercel Preview.

| Etap | Zakres | Widoczne dla użytkownika |
|---|---|---|
| 1 | `utils/grafik.ts` — kontrola obsady (addytywne wymagania, dziury w godzinach, zmiany przez północ), porównanie plan/fakt; ładowanie nowych tabel w `App.tsx` jako osobne nieblokujące fetche (wzorzec `shift_edits`/`tasks`/`absences`) | nie |
| 2 | Edytor **Wymagań obsady** + **godzin otwarcia lokalu** + `allowed_stanowiska` w karcie pracownika | tak |
| 3 | ✅ **ZROBIONE** (0.16.0) — widok tygodnia w trybie Podgląd: `GrafikTydzien.tsx`, siatka per lokal, typy komórek (zmiana / URP / NIE / "w innym lokalu"), sumy dzienne i tygodniowe, sumy miesięczne przy pracowniku (godziny + zmiany + koszt), ostrzeżenia o niedoborze z rozpisaniem godzin, sortowanie, legenda, eksport CSV, prognoza pogody per dzień (`fetchDailyForecast`) | tak |
| 4 | ✅ **ZROBIONE** (0.17.0) — `GrafikZmianaModal.tsx` (przypisanie/edycja + modal blokady), przełącznik Podgląd/Edycja, "+ dodaj" i "+ druga zmiana" w komórkach, "Kopiuj z poprzedniego tygodnia", publikacja przez `publishWeek()` z jednym powiadomieniem na osobę. Blokada WYŁĄCZNIE na: zatwierdzone wolne + nachodzące godziny (`findOverlappingPlanShift`, testowane też dla zmian przez północ) | tak |
| 5 | **Widok miesiąca** + eksport CSV | tak |
| 6 | **Grafik u pracownika** (własna zakładka, mobile) | tak |
| 7 | **Giełda zmian** — obie strony + limit 12 h | tak |

## Do ustalenia (pytania otwarte)

- Wyjątki dat (święta / niedziela handlowa) — UI dopiero po etapie 2.
- Ustawienia konfigurowalne przez kierownika/admina (polityka giełdy itd.).
- Dwa warianty druku miesiąca — odłożone.
