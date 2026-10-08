# Wydarzenia — specyfikacja (Roadmap p.3, plan z 2026-10-08)

Stan: **W1 i W2 zrobione** — baza i logika (`0043`, `src/utils/wydarzenia.ts`)
oraz Grafik kierownika: chip w nagłówku dnia, „+ wydarzenie” w Edycji, pasek
nad siatką, panel (`WydarzeniePanel.tsx`), lista „Wydarzenia”
(`GrafikWydarzenia.tsx`), miesiąc z drukiem, telefon, wiadomości i e-mail. Decyzje właściciela z 2026-10-08 są oznaczone
„(właściciel)”. Makiety powstają w design systemie „Shiftro”
(artefakt `TKUadpBcvVrENEiBrDZNfY`), nazwy ekranów niżej.

## Czym jest wydarzenie

Wpis na konkretny dzień w konkretnym lokalu, który ma zobaczyć określona grupa
ludzi: zebranie, szkolenie, grupa / rezerwacja, inwentaryzacja, kontrola,
wydarzenie w okolicy (mecz, koncert — wpływa na ruch), inne.

**Niezależne od grafiku** (właściciel): zapisuje się i powiadamia OD RAZU, bez
publikacji grafiku. Mieszka w zakładce Grafik, bo tam kierownik planuje dzień.

**Opcja „Płatny czas pracy”** (właściciel): np. zebranie 15:00–16:00, za które
się płaci. Wtedy wydarzenie wchodzi uczestnikom do grafiku jako czas pracy, a
po wydarzeniu kierownik rozlicza obecność i godziny trafiają do Rejestru.

Tworzy, zmienia i odwołuje **tylko kierownik** (właściciel): `admin`,
`manager`, `manager_lokalu` w swoich lokalach.

## Pola

| Pole | Uwagi |
|---|---|
| Tytuł | wymagany |
| Typ | Zebranie/szkolenie · Grupa/rezerwacja · Inwentaryzacja · Kontrola · W okolicy · Inne (ikona i kolor) |
| Data | wymagana |
| Godziny od–do | albo „cały dzień”; przy „Płatny czas pracy” wymagane |
| Lokal | jeden; **„Cała sieć” jako ostatnia pozycja listy** (właściciel) — tylko dla kierownika z kompletem lokali |
| Dla kogo | „Wszystkie stanowiska” albo wybrane (kilka) |
| Kogo powiadomić | „Wszystkich z tymi stanowiskami w lokalu” (zebranie — przychodzi się też w wolny dzień) albo „Tylko tych, którzy tego dnia są w grafiku” (grupa) |
| Uczestnicy | lista osób wyliczona z dwóch pól wyżej, z zaznaczeniem — kierownik może kogoś odznaczyć albo dodać. **Zapisywana** (kto dostał wiadomość = kto jest uczestnikiem) |
| Opis | opcjonalny |
| Liczba gości | tylko typ „Grupa” — potem kontekst w Pulsie |
| Płatny czas pracy | przełącznik; pokazuje koszt ≈ i uwagi (kolizja ze zmianą, urlop, niedostępność, odpoczynek z `utils/kodeks.ts`) |

## Co się dzieje

1. **Zapis** → wiersz `wydarzenia` + uczestnicy → każdy uczestnik dostaje
   wiadomość „Nowe wydarzenie: …” (`createEmployeeNotification`, typ
   `wydarzenie`), a z adresem w karcie — kopię e-mailem (istniejący
   `wyslij-maile`).
2. **Zmiana daty, godzin, lokalu albo uczestników** → „Zmiana w wydarzeniu: …”
   do uczestników (nowi dostają „Nowe”, odznaczeni „Odwołane dla Ciebie”).
   Poprawka samego opisu — wiadomość tylko z zaznaczonym „Powiadom o zmianie”.
3. **Odwołanie** → `odwolane_at` (wiersz zostaje — historia, Puls) +
   „Wydarzenie odwołane: …”. Potwierdzenie w ekranie, nie `window.confirm`.
4. **Grafik kierownika** — chip w nagłówku dnia (we wszystkich trzech
   układach tygodnia, w dniu, miesiącu i w druku A4); „+ wydarzenie” w
   nagłówku dnia w trybie Edycja; widok listy „Wydarzenia” (nadchodzące /
   minione). Przy „Płatny czas pracy” blok wydarzenia stoi też w wierszach
   uczestników (inny styl niż zmiana).
5. **Pracownik — Grafik** — karta wydarzenia w jego dniu (także w dniu bez
   zmiany). W „Cały lokal” widać wszystkie wydarzenia lokalu, także te nie do
   niego — bez wiadomości (rekomendacja przyjęta przez właściciela).
6. **Pracownik — Pulpit** — przypomnienie od dnia przed: „Jutro: zebranie
   15:00”, „Dziś: …”.
7. **Tablet Służbowy — lista osób** — pasek „Dziś w lokalu: grupa 40 os. o
   13:00” (widzą wszyscy na zmianie).
8. **Kierownik — Pulpit** — panel „Najbliższe wydarzenia” (7 dni).
9. **Puls** — karta dnia i Analityka pokazują wydarzenia dnia jako kontekst
   utargu („Tego dnia: grupa 40 os.”). To jest „lokalne wydarzenia” z
   `utils/kalendarz.ts`.
10. **Płatne — rozliczenie obecności.** Po zakończeniu wydarzenia w „Do
    decyzji” (Zatwierdzanie zmian, Pulpit „Wymaga decyzji”, znaczek menu —
    trzy miejsca, patrz CLAUDE.md) pojawia się „Wydarzenie do rozliczenia”:
    lista uczestników z zaznaczeniem (domyślnie wszyscy) → „Zapisz godziny
    (N)” → wiersze `shifts` z `wydarzenie_id`. Nic nie dopisuje się samo —
    ta sama zasada co przy zmianach bez odbicia (podpis kierownika pod
    wypłatą).

## Decyzje techniczne

- **Tabela `wydarzenia`** (migracja `0043`): `id uuid, lokal text (NULL = cała
  sieć), data date, od time, do time (NULL = cały dzień), typ, tytul, opis,
  stanowiska text (lista po przecinku, NULL = wszystkie — konwencja
  `allowed_lokale`), zakres ('wszyscy'|'grafik'), liczba_gosci int, platne
  bool, utworzyl, created_at, updated_at, odwolane_at, rozliczone_at,
  rozliczone_przez`.
- **Tabela `wydarzenia_uczestnicy`**: `id, wydarzenie_id uuid FK on delete
  cascade, user_id uuid, user_name, powiadomiono_at, obecny bool, shift_id
  uuid`. Osobna tabela, nie jsonb — RLS „moje wydarzenia” i odczyt z tabletu.
- **RLS**: odczyt — lokal z `moje_lokale()` / `pracuje_w_lokalu()` albo lokal
  NULL; zapis — `jest_kierownikiem()` i swój lokal (NULL tylko
  `widzi_wszystko()`). Kształt predykatów jak w `0040`: podzapytanie skalarne
  z rzutowaniem, bez funkcji z argumentem z wiersza.
- **Płatne wydarzenie NIE jest wierszem `grafik_shifts`.** Gdyby było,
  musiałoby być wyłączone z kontroli obsady, giełdy, „bez odbicia”,
  porzuconych, Aktywnych i publikacji — kilkanaście miejsc, z których któreś
  zostałoby pominięte. Zamiast tego `utils/wydarzenia.ts` daje godziny i koszt
  płatnych wydarzeń osoby, a doliczają je świadomie: wiersz osoby w siatce
  (godziny / norma), budżet tygodnia, Raport pracownika („z grafikiem
  wyjdzie”) i ostrzeżenia kodeksu w panelu przypisania.
- **Fakt** — `shifts.wydarzenie_id` (text, luźne odwołanie). Rejestr, Raport i
  Moja praca pokazują przy takim wierszu nazwę wydarzenia zamiast samego
  stanowiska (jak „Urlop” przy `is_urlop`). Stanowisko = domyślne stanowisko
  osoby (koszt trafia tam, gdzie zwykle).
- **Jedna logika w `utils/wydarzenia.ts`**: uczestnicy z pól, wydarzenia na
  dzień / dla osoby, godziny i koszt płatnych, opis do wiadomości. Komponenty
  tylko rysują. Zapis i wiadomości wyłącznie stamtąd.
- **Wiadomości**: typ `wydarzenie`, `dane` dla maila (data, godziny, lokal,
  opis). Dopisać przypadek w `opisWiadomosci` (`employeeSessionShared.tsx`) i
  w `api/_lib/wiadomosci.js` — inaczej spadnie na „Wiadomość”. Link
  `?otworz=grafik&dzien=…`.
- **Demo**: zebranie za 3 dni (płatne, cały zespół Bistro), grupa jutro w
  Pizzerii, mecz w okolicy w sobotę, jedno płatne wczoraj do rozliczenia.
- **Sprawdziany**: `harness-wydarzenia.html` (arytmetyka: uczestnicy, „cała
  sieć”, godziny i koszt płatnych, przez północ), przypadki w
  `harness-panel.html` (panel, lista, rozliczenie, znaczek „Do decyzji”) i
  `harness-kiosk.html` (karta w grafiku, Pulpit, pasek na tablecie).

## Kolejność wdrożenia

| Etap | Co | Wersja |
|---|---|---|
| W1 ✓ | migracja `0043`, `utils/wydarzenia.ts`, harness | — |
| W2 ✓ | Grafik: panel, chip w dniu, lista; wiadomości + e-mail | 0.74.0 |
| W3 | pracownik: Grafik, Pulpit, Wiadomości; tablet; Pulpit kierownika; Puls | 0.74.0 |
| W4 | płatny czas pracy: godziny w siatce/budżecie/Raporcie, rozliczenie w „Do decyzji”, `shifts.wydarzenie_id` | 0.75.0 |
| W5 | demo, CLAUDE.md, Przewodnik | z W3 i W4 |

## Rzeczy, których nie widać (W2)

- **Panel liczy uczestników z pól, ale pamięta ręczne decyzje**: lista =
  kandydaci MINUS odznaczeni PLUS dopisani. Przy edycji punkt wyjścia to
  zapisani uczestnicy (kogo nie było — odznaczony, kogo dopisano — dopisany).
- **Wiadomości przy edycji**: nowi → „Nowe wydarzenie”, odznaczeni →
  „Wydarzenie odwołane”, ci sami → „Zmiana w wydarzeniu” tylko z zaznaczonym
  „Powiadom o zmianie” (domyślnie tak). Błąd wysłania NIE cofa zapisu —
  ekran mówi, ile wiadomości nie wyszło.
- **Polityka odczytu `wydarzenia` stoi na kolumnach wiersza**, nie na funkcji
  z listą id — inaczej INSERT … RETURNING od kierownika lokalu odbijał się od
  RLS (funkcja `stable` nie widzi wiersza wstawianego w tym samym poleceniu).
- **Minione i odwołane otwierają się tylko do odczytu.** Odwołane znika z
  siatki i z miesiąca, zostaje na liście (przekreślone).
- **Wydarzenia w miesiącu**: czarna linijka nad zmianami (na papierze ramka,
  bo tło nie zawsze się drukuje); w układzie „osoby × dni” romb pozycjonowany
  absolutnie — nie rusza zmierzonych szerokości kolumn A4.
- **Do 0.75.0 (W4) płatne wydarzenie nie dopisuje godzin** — po wdrożeniu W4
  minione płatne pojawią się w „Do decyzji” same (`doRozliczenia` bierze
  wszystkie nierozliczone).

## Świadomie NIE w pierwszej wersji

Potwierdzenie obecności „Będę / Nie mogę”, wydarzenia cykliczne, automatyczne
podnoszenie obsady albo budżetu pod grupę (od tego są Wyjątki w Konfiguracji
grafiku — później przycisk „Dodaj wyjątek obsady”), zdjęcia i załączniki.
