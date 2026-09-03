# Changelog

Historia widocznych zmian w aplikacji. Numer wersji wyświetla się na
ekranie logowania (`Godziny Gastro Emka v{APP_VERSION}` — stała w
`src/config.ts`). Zasady wersjonowania i kto aktualizuje ten plik: patrz
CLAUDE.md, sekcja "Wersjonowanie i CHANGELOG".

## 0.14.0 — 2026-09-03

- **Wnioski o urlop i niedostępność.** W zakładce Zgłoś można teraz
  wysłać wniosek o urlop albo dni niedostępności — kierownik zatwierdza
  albo odrzuca w Zatwierdzanie zmian. Zatwierdzony urlop od razu wpisuje
  się jako godziny (8h za dzień roboczy) we wszystkich raportach. Kierownik
  może też wpisać urlop bezpośrednio w karcie pracownika.

## 0.11.1 — 2026-09-04

- Poprawka nawigacji dat w Zadaniach i sprzątaniu: strzałki dnia
  poprzedniego/następnego zostają teraz zawsze w tym samym miejscu —
  środkowa pigułka z datą zajmuje na "dziś" szerokość dwóch przycisków, a
  po zmianie dnia dzieli się na datę i osobny przycisk „Dziś”, oba w tym
  samym miejscu co wcześniej. Kliknięcie samej daty otwiera też wybór
  konkretnego dnia.

## 0.11.0 — 2026-09-04

- **Zadania przypisane do stanowiska są teraz naprawdę wspólne.** Jeśli
  dwie osoby mają to samo stanowisko, odhaczenie zadania przez jedną
  liczy się dla obu — koniec z osobnym, mylącym stanem tego samego
  zadania dla każdej osoby.
- **Nowy formularz zadania**: Lokal i "Dla kogo" (wszyscy albo konkretne
  stanowisko) razem, cała konfiguracja terminu w jednym miejscu
  ("Powtarzalność": Cały tydzień / wybrane dni + godzina). Typ "Ogólne"
  jest teraz domyślny.
- **Panel kierownika**: jedna spójna lista "Zadania na dziś" z filtrem po
  stanowisku (zamiast dwóch osobnych paneli).
- **Kafelek "Zadania dziś" na Pulpicie kierownika już nie zależy od tego,
  czy ktoś odbił zmianę** — liczy się wprost z zadań na dany dzień.
- Wykonane zadanie jest teraz wyraźnie przekreślone i przygaszone, z
  podpisem kto i kiedy je wykonał.

## 0.10.0 — 2026-09-03

- **Zadania: priorytet i dowolne dni tygodnia.** Zadanie ma teraz priorytet
  (niski/średni/wysoki — ważne widocznie oznaczone) i można wybrać dowolny
  zestaw dni tygodnia zamiast jednego (np. "codziennie oprócz niedzieli"
  bez tworzenia sześciu osobnych zadań). Doszedł też typ "Ogólne" —
  zadanie na dowolną porę dnia, nie tylko poranne/obiadowe/wieczorne.
  Wynikowe zadanie z checkboxami widać teraz też na Pulpicie przed
  rozpoczęciem zmiany, nie tylko w trakcie.
- **Panel kierownika: pełny przegląd.** Nowa sekcja "Niewykonane dzisiaj"
  (kto ma zaległości i w jakich godzinach dziś pracował), pełna lista
  wszystkich zadań lokalu z filtrem po lokalu/stanowisku i możliwością
  archiwizacji, oraz kafelek "Zadania dziś" na Pulpicie kierownika z
  wskaźnikiem wykonania per lokal.
- **Zgłoszenie → zadanie.** W zakładce Zgłoszenia można od razu utworzyć z
  niego zadanie dla kierownika.

## 0.9.0 — 2026-09-02

- **Nowa zakładka "Zadania i sprzątanie".** Kierownik tworzy zadania na
  zmianę (poranne/obiadowe/wieczorne) i zadania cykliczne ("co N dni"),
  wspólne dla lokalu albo osobne dla każdego pracownika (dla wszystkich
  albo tylko wybranego stanowiska), i widzi na bieżąco kto co odhaczył —
  panel "Kontrola wykonania po osobach".
- Pracownik widzi swoje zadania na dziś w zakładce "Zadania" (z
  przełącznikiem "Twoje stanowisko"/"Wszystkie" — przydatne na wspólnym
  tablecie), a w trakcie zmiany pasek postępu "Zadania na zmianę" z
  delikatnym przypomnieniem, jeśli coś zostało — zakończenie zmiany dalej
  działa bez ograniczeń.
- Podsumowanie dnia po zamknięciu zmiany pokazuje też "Zadania: X z Y
  wykonanych".

## 0.8.0 — 2026-09-02

- **Nowy Panel Kierownika.** Cały wygląd przebudowany pod ten sam, czytelny
  styl co reszta aplikacji — Pulpit ("Dziś w liczbach"), Zatwierdzanie
  zmian, Rejestr Godzin, Aktywni, Zgłoszenia, Pracownicy i Raporty i
  koszty. Na telefonie dolny pasek z najczęstszymi zakładkami zamiast
  przewijania w bok.
- **Poprawka godzin od pracownika trafia teraz do prawdziwej kolejki
  decyzji kierownika.** W zakładce "Zgłoś" pracownik wybiera "Popraw
  zmianę" (albo "Zapomniałem/łam odbić"), wpisuje poprawne dane — kierownik
  w nowej zakładce Zatwierdzanie zmian zatwierdza, poprawia (z podaniem
  powodu, który widzi pracownik) albo dopytuje.
- Karta pracownika: nowe pola — stawka godzinowa, etat, notatki
  kierownika, oraz formularz do ustawienia PIN-u blokady na kiosku
  (wcześniej trzeba było wpisywać go ręcznie w bazie).
- Raport godzin i kosztów per pracownik, z podglądem historii poprawek
  danej zmiany (kto, kiedy, dlaczego).
- Nowy ekran logowania, w tym samym stylu.
- Pasek "dostępna nowa wersja — odśwież stronę" pokazuje się teraz
  automatycznie wszystkim, gdy wdrożymy aktualizację, zamiast czekać na
  przypadkowe odświeżenie.

## 0.7.0 — 2026-08-31

- **Ten sam nowy wygląd, teraz też na osobistym telefonie.** Jeśli
  logujesz się na swoje własne konto (nie na wspólny tablet), masz teraz
  ten sam czytelny pulpit z zakładkami Pulpit / Zmiana / Raport / Zadania
  / Więcej co na Tablet Służbowy — bez ekranu wyboru pracownika, bo to
  już Twoje konto.
- Małe podkreślone "Wyloguj" w zakładce Więcej.

## 0.6.0 — 2026-08-31

- **Nowy wygląd Tabletu Służbowego.** Po zalogowaniu na wspólnym urządzeniu
  najpierw wybierasz siebie z listy (widać od razu, kto jest na zmianie),
  a potem masz własny pulpit z zakładkami Pulpit / Zmiana / Raport /
  Zadania / Więcej — zamiast jednego wspólnego formularza dla wszystkich.
- **Można zablokować swój profil na kiosku 4-cyfrowym PIN-em** (kierownik
  ustawia go w karcie pracownika) — przydaje się, gdy nie chcesz, żeby
  ktoś inny mógł odbić Twoją zmianę na wspólnym tablecie.
- **"Zgłoś" można teraz wysłać anonimowo** i od razu przypisać do
  konkretnej zmiany (np. klikając chorągiewkę przy wierszu w Raporcie).
- Po każdej aktualizacji aplikacji urządzenie samo wraca do ekranu
  logowania po odświeżeniu strony — nie trzeba już ręcznie wylogowywać
  każdego tabletu/telefonu po zmianach.

## 0.5.0 — 2026-08-28

- **Nie da się już zapisać dwóch nakładających się zmian.** Jeśli nowy
  wpis pokrywa się czasowo z już zapisaną zmianą tej samej osoby, zapis
  jest odrzucany z komunikatem (pracownik zgłasza pomyłkę przez "Zgłoś").
  Kierownik przy edycji zmiany dostaje zamiast tego pytanie
  potwierdzające — czasem trzeba poprawić już niespójne dane.
- **Przypomnienie o dzisiejszych zmianach.** Po wybraniu pracownika w
  zakładce Wpisz widać, jakie zmiany już zarejestrowano dziś — przydatne,
  gdy w ciągu dnia trzeba dopisać kolejną (grafik w gastro potrafi się
  zmienić).
- Naprawiono błąd przy dodawaniu nowego pracownika z pustymi terminami
  sanepid/umowy (zapis się nie udawał). Czerwone podświetlenie pustego
  terminu pokazuje się teraz tylko przy edycji istniejącego pracownika,
  nie przy tworzeniu nowego.

## 0.4.0 — 2026-08-28

- **Zapisywanie zmiany jest teraz natychmiastowe.** Wcześniej formularz
  czekał na odpowiedź od Google Sheets (bywało to nawet do pół minuty,
  najbardziej dotkliwe pod koniec zmiany, gdy kilka osób zapisuje się pod
  rząd na jednym tablecie) zanim pokazał "Zapisano". Supabase (prawdziwe
  źródło danych) zapisuje się od razu, a synchronizacja z Google Sheets
  leci teraz w tle.
- **Zalogowanie przetrwa odświeżenie strony.** Wcześniej każde odświeżenie
  (albo nowy deploy aplikacji) wylogowywało i trzeba było logować się od
  nowa. Teraz sesja zostaje zapamiętana w przeglądarce do czasu ręcznego
  wylogowania.

## 0.3.4 — 2026-08-28

- Na kiosku (Tablet Służbowy) powiadomienie o zbliżającym się terminie
  sanepid/umowy teraz pokazuje, którego pracownika dotyczy — wcześniej przy
  kilku osobach na jednym urządzeniu nie było wiadomo, do kogo należy.

## 0.3.3 — 2026-08-28

- Powiadomienie dla kierownika o zbliżającym się/przeterminowanym terminie
  sanepid/umowy zawiera teraz imię pracownika, stanowisko, lokal, dokładną
  datę i liczbę dni — nie trzeba wchodzić do aplikacji, żeby wiedzieć, o co
  chodzi.

## 0.3.2 — 2026-08-28

- Naprawiono ciche gubienie powiadomień o terminach sanepid/umowy (baza
  odrzucała zapis, a system mimo to oznaczał sprawę jako "obsłużoną").

## 0.3.1 — 2026-08-28

- Naprawiono awarię codziennej weryfikacji terminów sanepid/umowy tuż po
  wdrożeniu (błąd techniczny w funkcji, zero wpływu na resztę aplikacji).

## 0.3.0 — 2026-08-28

- **Terminy dokumentów pracownika.** Karta pracownika ma teraz dwa pola:
  termin książeczki sanepid i termin umowy. Puste pole jest podświetlone,
  żeby zwrócić uwagę kierownika. Codziennie automatycznie sprawdzane —
  powiadomienie do kierownika lokalu i do samego pracownika miesiąc przed,
  2 tygodnie przed, codziennie w ostatnim tygodniu i codziennie po
  przeterminowaniu, aż termin zostanie zaktualizowany.

## 0.2.0 — 2026-08-28

- Kierownicy dostali własną zakładkę **Powiadomienia** (wcześniej
  powiadomienia widzieli tylko pracownicy).
- Wewnętrzna reorganizacja kodu (bez zmian w działaniu aplikacji) — mniejsze
  ryzyko przy każdej kolejnej zmianie.

## 0.1.2 i wcześniej

Historia sprzed wprowadzenia tego pliku nie została spisana wstecznie.
