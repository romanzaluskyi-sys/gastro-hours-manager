# Changelog

Historia widocznych zmian w aplikacji. Numer wersji wyświetla się na
ekranie logowania (`Godziny Gastro Emka v{APP_VERSION}` — stała w
`src/config.ts`). Zasady wersjonowania i kto aktualizuje ten plik: patrz
CLAUDE.md, sekcja "Wersjonowanie i CHANGELOG".

## 0.23.0 — 2026-09-04

Pierwsze wydanie **Grafiku** — wszystko poniżej (0.15.0–0.22.0) trafia na
produkcję razem.

- **Urlop nie udaje pracy w lokalu.** W Rejestrze Godzin, Raportach i
  kosztach oraz w Raporcie pracownika dzień urlopu jest podpisany "Urlop"
  zamiast nazwą lokalu, a w podsumowaniach doszła druga liczba: ile z sumy
  godzin to urlop i **ile bez urlopu**. Same sumy i koszty liczą się jak
  dotąd — urlop nadal jest płatny.
- W zestawieniu "Według lokalu" urlop ma własny wiersz i nie zawyża obsady
  żadnego lokalu.
- Grafik z arkusza Google (styczeń–wrzesień 2026) został zaimportowany:
  1247 zmian, 4 urlopy i 1 dzień niedostępności.

## 0.22.0 — 2026-09-03

- **Giełda zmian.** Pracownik może wystawić swoją przyszłą zmianę na giełdę
  (najpóźniej 12 godzin przed jej rozpoczęciem), a ktoś, kto ma wtedy wolne,
  może ją wziąć. Zamianę zatwierdza kierownik — w zakładce Zatwierdzanie
  zmian albo od razu w siatce grafiku (✓ / ✗ przy zmianie, w trybie Edycja).
  Po zatwierdzeniu zmiana przechodzi na nową osobę i obie strony dostają
  powiadomienie; po odmowie zostaje u autora.
- Przy przejmowaniu zmiany sprawdzamy to samo co przy ręcznym wpisywaniu:
  zatwierdzone wolne i kolizję godzin.
- Zmiana wystawiona na giełdę jest **podświetlona w siatce**: na żółto, gdy
  czeka na chętnego, na zielono, gdy ktoś już się zgłosił i czeka na Twoją
  decyzję. Po otwarciu takiej zmiany okno też o tym mówi.
- U pracownika "na giełdę" to mały przycisk po prawej stronie wiersza z
  godzinami — dopiero po kliknięciu pojawia się duży przycisk potwierdzenia.
  Zmiana wystawiona na giełdę jest u pracownika podświetlona całym blokiem,
  tymi samymi kolorami co u kierownika.
- Na Tablecie Służbowym giełda jest widoczna już na liście wyboru osoby.
  Podświetlany jest ten, kto może zmianę **wziąć** ("Giełda: propozycja
  ND 6 wrz · 11:00 – 21:00") — autor oferty ma sam napis, bo on i tak wie,
  że ją wystawił.
- Kolory u pracownika mówią teraz jedno na jeden stan: żółty — Twoja zmiana
  czeka na chętnego, **zielony — cudza propozycja, którą możesz wziąć**,
  niebieski — decyzja jest po stronie kierownika. Wcześniej propozycja
  zlewała się z własną zmianą.
- Zmiana, po którą się zgłosiłeś, jest widoczna w Twoim grafiku (na
  niebiesko, z adnotacją, że czeka na zgodę kierownika) — wcześniej znikała
  do czasu decyzji.
- Zmiana w **innym lokalu** jest wyraźnie oznaczona w grafiku pracownika.
- Zakładka Grafik ma odznakę z liczbą: nowy wysłany grafik plus propozycje
  z giełdy, które możesz wziąć.
- **Propozycja z giełdy trafia tylko do osób, które mają dane stanowisko w
  swojej karcie.** Na giełdę idzie konkretna praca, nie same godziny — więc
  nie ma sensu zaczepiać nią wszystkich.
- Na Tablecie Służbowym podświetlamy (na żółto, jako "zwróć uwagę") tylko
  tych, którzy mogą zmianę wziąć, i pokazujemy przy nich dzień i godziny.
  Doszła też **koperta "Czeka wiadomość"** przy osobie z nieprzeczytanym
  powiadomieniem — na wspólnym urządzeniu nikt nie zagląda na cudzą stronę.
- Po wybraniu osoby na tablecie jej imię jest stale widoczne w nagłówku,
  obok przycisku "Zmień".
- **Jedno kliknięcie "Wyślij grafik pracownikom" wysyła wszystko.** Nie tylko
  oglądany tydzień i nie tylko widoczny lokal — wszystkie niewysłane zmiany
  od dziś w przód, ze wszystkich Twoich lokali. Wcześniej wysyłka była
  przypisana do oglądanego tygodnia, więc przy planowaniu na kilka tygodni
  naprzód łatwo było zostawić zmiany jako wersję roboczą — a takiej zmiany
  pracownik po prostu nie widzi. Niewysłane są dodatkowo oznaczone kropką w
  siatce i licznikiem "N niewysłanych" przy nazwie lokalu. Każdy pracownik
  dostaje jedno powiadomienie, z zakresem SWOICH dni.
- Przycisk wysyłki jest widoczny także w trybie Podgląd — wysyłka dotyczy
  całego grafiku, nie tego, co akurat edytujesz.
- **Kierownik może wpisać wolne albo urlop wprost z grafiku** — w oknie
  zmiany doszedł link "Zamiast zmiany wpisz wolne / urlop" z wyborem
  rodzaju, zakresem dat i notatką. Potrzebne, gdy pracownika długo nie ma i
  nie ma jak czekać, aż sam to zgłosi z Tabletu Służbowego. Urlop od razu
  zapisuje godziny, niedostępność tylko blokuje te dni.
- **Usunięcie wysłanej już zmiany jest teraz zarejestrowaną zmianą grafiku.**
  Znika ona z widoku od razu, ale liczy się do "niewysłanych" i dopiero
  wysyłka informuje pracownika, że jego zmiana została usunięta. Zmiana,
  która nigdy nie została wysłana, kasuje się po cichu — nikt jej nie
  widział.
- **Powiadomienia na Tablecie Służbowym są teraz per pracownik.** Wcześniej
  urządzenie pokazywało wiadomości wszystkich osób z lokalu, więc pierwsza
  osoba, która weszła w zakładkę, oznaczała jako przeczytane także cudze i
  nikt inny już ich nie widział.
- W komórce "w innym lokalu" można teraz kliknąć zmianę (żeby ją edytować)
  i dopisać kolejną — praca w dwóch lokalach jednego dnia jest dozwolona,
  a komórka była martwa.
- Pracownikowi wpisanemu do lokalu, w którym nie ma żadnego ze swoich
  stanowisk, można już dopisać kolejną zmianę — wcześniej znikał z listy
  wyboru i nie było jak.
- W siatce kierownika zamiana jest teraz widoczna po OBU stronach: u osoby,
  która oddaje zmianę, i — na szaro, przerywaną ramką — u tej, która ma ją
  przejąć. Przy nazwisku obu osób widać, ile godzin w miesiącu im przybędzie
  (zielone) albo ubędzie (czerwone) po zatwierdzeniu.
- Zamiany z giełdy trafiły też na Pulpit, do kafelka "Do decyzji" i listy
  "Wymaga Twojej decyzji".
- W Zatwierdzaniu zmian przy każdej zamianie widać różnicę godzin obu osób
  ("168 h → 176 h (+8 h)") — bez tego nie da się odpowiedzialnie zdecydować,
  gdy ktoś pracuje na etat.
- **Wniosek o wolne prosto z zakładki Grafik** — bez szukania go w "Zgłoś".
- **Niedostępność na jeden dzień.** Zamiast wpisywać tę samą datę dwa razy,
  można podać sam dzień; pola "od-do" i "jeden dzień" wykluczają się
  nawzajem. Urlop bez zmian.

## 0.21.0 — 2026-09-03

- **Grafik u pracownika.** Nowa, stała zakładka Grafik na telefonie i na
  Tablecie Służbowym — lista dni, a nie siatka, bo na telefonie siatka jest
  nieczytelna. Przy każdym dniu godziny, stanowisko, lokal i kto jeszcze jest
  z tobą na zmianie. Urlop i zgłoszona niedostępność widoczne jako URP / NIE.
- Przełącznik **Ten tydzień / Następny / Miesiąc** (miesiąc to lista własnych
  zmian z podsumowaniem godzin) oraz "Pokaż wszystkich w lokalu".
- Na **Pulpicie** widać teraz "Twoja zmiana dziś", a gdy dziś wolne — kafelek
  "Następna zmiana" z datą i godzinami. Zniknął napis o nieistniejącym module.
- Pracownik widzi **wyłącznie wysłany grafik** — wersja robocza kierownika
  nigdy się tu nie pokazuje.
- Podczas trwającej zmiany, obok licznika "pracujesz już X", widać też
  **ile zostało do końca** według grafiku — a po przekroczeniu planowanej
  godziny licznik zmienia się na czerwony "Po planowanym końcu".

## 0.20.0 — 2026-09-03

- **Oddanie pracownika do innego lokalu bez opuszczania jego grafiku.**
  W oknie zmiany wybiera się teraz jednym kafelkiem *stanowisko razem z
  lokalem* — np. "Kelner" (u siebie) albo "Kelner · Sunset". Wpisana w ten
  sposób zmiana pojawia się w grafiku Sunset jako zwykła zmiana, a w grafiku
  macierzystego lokalu jako "w Sunset".
- **Lista pracowników pokazuje tylko tych, którzy mogą tu pracować** — czyli
  mają w karcie stanowisko istniejące w tym lokalu. Długa lista wyszarzonych
  nazwisk, z których większość i tak nie wchodziła w grę, zniknęła; w razie
  potrzeby jest link "Pokaż wszystkich".
- **Pokazujemy tylko stanowiska z karty pracownika.** Reszta jest schowana
  pod "Pozostałe stanowiska" — po rozwinięciu nadal można ich użyć razem z
  przyciskiem "Dopisz do umiejętności".
- Osobne pole wyboru lokalu zniknęło — lokal wynika z wybranego kafelka, a
  gdy jest inny niż oglądany, okno wyraźnie o tym mówi przed zapisem.

## 0.19.0 — 2026-09-03

- **Dobieranie ludzi między lokalami prosto z grafiku.** W oknie przypisania
  zmiany widać teraz wszystkich pracowników sieci — swoi z danego lokalu są
  pierwsi, a przy pozostałych widać, skąd są. Osoby, które nie mają
  zaznaczonego wybranego stanowiska, są przygaszone, ale nadal można je wpisać.
- **"Dopisz stanowisko do umiejętności"** — jeśli wpisujesz komuś zmianę na
  stanowisko, którego nie ma na swojej liście, możesz je dopisać jednym
  kliknięciem, bez wchodzenia do karty pracownika. Następnym razem ostrzeżenia
  już nie będzie.
- Wybrane stanowisko nie jest już kasowane przy zmianie osoby — można najpierw
  wskazać stanowisko, a potem szukać, kto może na nie wejść.

## 0.18.0 — 2026-09-03

- **Grafik — widok miesiąca.** Kalendarz całego miesiąca dla jednego lokalu.
  W każdej kratce widać nie tylko liczby, ale i skład dnia: skrót stanowiska,
  godziny i imię. Numer dnia czerwienieje, gdy obsada nie pokrywa wymagań.
- **Druk na jednej kartce A4** (poziomo) — przycisk "Drukuj" przygotowuje
  sam kalendarz, bez menu i pasków aplikacji.
- Nawigacja po miesiącach i powrót do widoku tygodnia. W stopce data
  ostatniej zmiany w grafiku.

## 0.17.0 — 2026-09-03

- **Grafik — tryb Edycja.** Przełącznik Podgląd / Edycja nad siatką. W trybie
  Edycja puste komórki mają "+ dodaj", a klik w istniejącą zmianę ją otwiera.
  W oknie zmiany wybierasz pracownika, stanowisko, godziny i lokal — godziny
  podpowiadają się z wymagań obsady. "Przypisz i dodaj następną" przyspiesza
  wpisywanie seriami.
- **Blokada tylko przy nachodzących godzinach.** Zmiana dzielona (do 14:00 w
  jednym lokalu, od 14:00 w drugim) jest dozwolona. Blokujemy zatwierdzony
  urlop, zgłoszony brak dostępności i kolidujące godziny — z okienkiem, które
  mówi dokładnie co koliduje, i przyciskiem "Napisz do pracownika".
- Wpisanie zmiany na stanowisko spoza listy "umie pracować" pokazuje
  ostrzeżenie, ale nie blokuje — decyduje kierownik.
- **"Kopiuj z poprzedniego tygodnia"** dla każdego lokalu, z pominięciem osób,
  które mają w nowym terminie wolne albo kolizję godzin.
- **"Dodaj pracownika"** w rogu tabeli lokalu — pozwala dobrać do grafiku
  osobę spoza stałej obsady lokalu (przy nazwisku widać, skąd jest), wybrać
  dzień z tygodnia i od razu wpisać jej zmianę.
- **"Wyślij grafik pracownikom"** — do tego momentu grafik jest wersją
  roboczą, niewidoczną dla zespołu. Po wysłaniu każda osoba ze zmianami w tym
  tygodniu dostaje jedno powiadomienie.
- Pogoda w nagłówku dnia sięga tyle, ile daje prognoza (16 dni w przód) —
  dalsze tygodnie mają puste miejsce zamiast mylącego znaku.

## 0.16.0 — 2026-09-03

- **Grafik — widok tygodnia.** Zakładka Grafik pokazuje siatkę: pracownicy w
  wierszach, siedem dni w kolumnach, osobna tabela na każdy lokal. W nagłówku
  dnia data, pogoda oraz liczba osób i godzin; przy pracowniku godziny, zmiany
  i koszt w miesiącu. Widać zatwierdzone urlopy (URP), zgłoszony brak
  dostępności (NIE) i dni, w które ktoś pracuje w innym lokalu.
- Dni, w których obsada nie pokrywa wymagań, są oznaczone na czerwono —
  najechanie na liczbę pokazuje, na jakim stanowisku i w jakich godzinach
  brakuje ludzi.
- Sortowanie listy pracowników (stanowisko / godziny / nazwisko), legenda
  skrótów stanowisk i eksport tygodnia do CSV dla każdego lokalu.
- Wpisywanie zmian w siatce dochodzi w kolejnej wersji — na razie grafik jest
  tylko do oglądania.

## 0.15.0 — 2026-09-03

- **Grafik — konfiguracja.** Nowa zakładka Grafik z sekcją Konfiguracja:
  godziny otwarcia lokalu (osobno na każdy dzień tygodnia), wymagania
  obsady na stanowisko (w które dni, od której do której i ile osób) oraz
  wyjątki na konkretne daty — święta i niedziele handlowe z własnymi
  godzinami i własnymi wymaganiami. Wymagania obowiązują od wybranego
  miesiąca i można je skopiować na kolejny.
- W karcie pracownika doszło pole **"Inne stanowiska, na których umie
  pracować"** — grafik ostrzeże, gdy zmiana trafi na stanowisko spoza tej
  listy, ale nadal pozwoli ją wpisać.
- Sama siatka grafiku (tydzień, miesiąc, wpisywanie zmian) jest w budowie —
  konfiguracja jest pierwszym krokiem, bez niej nie ma jak sprawdzać obsady.

## 0.14.0 — 2026-09-03

- **Wnioski o urlop i niedostępność.** W zakładce Zgłoś można teraz
  wysłać wniosek o urlop albo dni niedostępności — kierownik zatwierdza
  albo odrzuca w Zatwierdzanie zmian. Zatwierdzony urlop od razu wpisuje
  się jako godziny (8h za dzień roboczy) we wszystkich raportach. Kierownik
  może też wpisać urlop bezpośrednio w karcie pracownika.

## 0.13.0 — 2026-09-03

- Pogoda w pasku kierownika i na Pulpicie pracownika — aktualna temperatura
  dla miasta lokalu (ustawianego w Pracownicy → Lokale).

## 0.12.0 — 2026-09-03

- Stanowiska mają teraz własny skrót (ustawiany ręcznie w Pracownicy →
  Stanowiska, zamiast automatycznie skracanej nazwy) i kolor — widoczny
  jako plakietka przy godzinach w koncie pracownika, Rejestrze Godzin i
  Mojej Pracy kierownika.

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
