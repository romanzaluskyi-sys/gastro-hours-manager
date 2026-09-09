# Changelog

Historia widocznych zmian w aplikacji. Numer wersji wyświetla się na
ekranie logowania (`Godziny Gastro Emka v{APP_VERSION}` — stała w
`src/config.ts`). Zasady wersjonowania i kto aktualizuje ten plik: patrz
CLAUDE.md, sekcja "Wersjonowanie i CHANGELOG".

## 0.32.0 — 2026-09-09

- **Siatka Grafiku jest gęstsza.** Kolumny dni mają stałą szerokość, więc
  tydzień wygląda tak samo niezależnie od tego, w którym dniu jest tłok.
  Wiersz pracownika zajmuje dwie linijki zamiast pięciu — na ekran wchodzi
  prawie dwa razy więcej osób.
- **W wierszu widać wykorzystanie umowy**: przy umowie o pracę „128/176 h”
  (godziny wobec normy miesiąca, przekroczenie na bursztynowo), przy zleceniu
  godziny i koszt. Liczba zmian i pozostałe szczegóły są pod kursorem.
- **Wymagania obsady można poprawiać** (Grafik → Konfiguracja). Do tej pory
  dawało się je tylko dodać albo skasować, więc zmiana „2 osoby” na „3 osoby”
  oznaczała skasowanie wymagania i wpisanie go od nowa. Przycisk „Edytuj”
  wczytuje wymaganie do formularza pod spodem; działa tak samo w zwykłych
  wymaganiach i w wymaganiach wyjątku.
- **Jedną zmianę można wpisać od razu na kilka dni** — w oknie przypisywania
  doszedł wybór „Powtórz w dniach”, jak przy zadaniach. Powstają zwykłe,
  niezależne zmiany. Dni z urlopem, kolizją godzin albo po ostatnim dniu pracy
  są pomijane, a po zapisie aplikacja mówi, które i dlaczego.
- **Drugi układ wydruku miesiąca: „Osoby × dni”** (Grafik → Miesiąc). Wiersz
  na osobę, kolumna na dzień; w kratce początek, koniec i skrót stanowiska,
  jedno pod drugim. Siatka ma zawsze 31 kolumn, więc luty drukuje się w tej
  samej szerokości co marzec i wydruki da się położyć obok siebie. Mieści się
  na A4 poziomo; przełącznik „Kalendarz / Osoby × dni” jest przy przyciskach
  miesiąca.
- Poprawka: w liście wymagań obsady było „2 osób” zamiast „2 osoby”.

## 0.31.0 — 2026-09-09

- **Karta pracownika przebudowana na bloki** — dane podstawowe, kontakt i
  logowanie, miejsce pracy, umowa, dokumenty, urlop, koniec współpracy,
  notatki. Doszły pola: telefon, data urodzenia, początek pracy. Wszystko poza
  imieniem, typem konta, lokalem i stanowiskiem pozostaje opcjonalne, tak jak
  było.
- **Typ umowy zamiast pola „Etat”.** Przy zleceniu wpisujesz stawkę godzinową,
  przy umowie o pracę — wymiar etatu i kwotę z umowy. Dawne wartości z pola
  „Etat” przeniosły się same.
- **Miesięczna norma godzin liczy się z kalendarza** (Kodeks pracy, art. 130),
  więc zmienia się z miesiąca na miesiąc — nie wpisujesz jej ręcznie. Karta
  pokazuje też, ile w tym miesiącu wychodzi za godzinę.
- **„Ten miesiąc” pokazuje koszt lokalu, nie wypłatę pracownika.** Przy umowie
  o pracę to kwota z umowy niezależnie od przepracowanych godzin — bo tyle
  lokal wydaje. Pod spodem bilans okresu rozliczeniowego: ile godzin z normy
  zostało do wypracowania albo ile wyszło ponad. Miesiące bez żadnych
  zapisanych godzin są pomijane, żeby nie robić alarmu z braku danych.
- **Pracownik widzi swoją normę w Raporcie**, na dole przy sumie godzin: pod
  liczbą godzin drobne „z 176 h”, a pod imieniem i miesiącem — „o 32 h ponad
  normę”. W trwającym miesiącu zdanie mówi, co wyjdzie z grafikiem do końca
  miesiąca, więc jest czas zareagować. Przy zleceniu nic się nie pokazuje —
  normy tam nie ma.
- **Nowe ustawienia lokalu** (Pracownicy → Lokale): okres rozliczeniowy oraz
  narzut pracodawcy (ZUS itd.) osobno dla umowy o pracę i zlecenia. Puste
  narzuty = 0, czyli dopóki ich nie wpiszesz, nic się nie zmienia.
- **Poprawka: „Dzień wypłaty” w ustawieniach lokalu nie zapisywał się.** Pole
  dało się wypełnić, ale wartość przepadała przy zapisie.
- Wymaga migracji `0018`.

## 0.30.3 — 2026-09-09

- **Raporty i koszty: wybór lokalu u góry znów działa** — decyduje, kogo widzisz
  na liście. Ale godziny i koszt osoby są zawsze pełne, ze wszystkich Twoich
  lokali, a pod nazwiskiem widać, ile z tego przypada na oglądany lokal.
  Kafelki u góry i „Według lokalu” pokazują teraz to samo, więc liczby się
  zgadzają.
- **Poprawka: nie dało się usunąć zmiany, do której pracownik wysłał „Popraw
  zmianę”.** Baza blokowała usunięcie, a komunikat mówił tylko „Błąd usuwania”.
  Zgłoszenie zostaje w historii — traci tylko odwołanie do skasowanej zmiany.
  (Wymaga migracji `0017`.)
- Komunikaty przy usuwaniu podają teraz przyczynę zamiast samego „Błąd
  usuwania”.

## 0.30.2 — 2026-09-09

- **Raporty i koszty pokazują jedną kartę na osobę**, niezależnie od tego, w ilu
  lokalach pracowała. Wcześniej pracownik wypożyczony między lokalami pojawiał
  się dwa razy — w każdej zakładce lokalu z częścią swoich godzin — i żadna nie
  mówiła, ile mu się w sumie należy. Podział na lokale został tam, gdzie ma
  sens: w sekcji „Według lokalu”.
- **Poprawka: „Popraw zmianę” podpowiadała stanowiska z niewłaściwego lokalu.**
  Na tablecie jednego lokalu dało się wskazać drugi lokal, ale stanowiska
  zostawały z pierwszego — w rejestrze powstawała godzina pod stanowiskiem,
  którego tamten lokal w ogóle nie ma. Lista lokali i stanowisk jest teraz pełna
  i stanowiska idą za wybranym lokalem.

## 0.30.1 — 2026-09-09

- **Poprawka:** osoba wypożyczona do innego lokalu nie mogła zapisać godzin —
  tablet mówił „Wypełnij wymagane pola!”, choć formularz wyglądał na
  kompletny. Lokal i stanowisko podpowiadają się teraz **z grafiku tego dnia**,
  a nie z macierzystego lokalu tej osoby.
- To samo dotyczyło „Popraw zmianę” dla zmiany odbytej w innym lokalu — jej
  lokal jest teraz na liście do wyboru.

## 0.30.0 — 2026-09-08

- **„Był w grafiku, nie odbił”** — nowa sekcja w Zatwierdzaniu zmian. Zwykle to
  zapomniany tablet, nie nieobecność, a bez decyzji te godziny nie trafiają ani
  do raportu, ani na wypłatę. Kierownik dopisuje je jednym kliknięciem, poprawia
  godziny albo odrzuca. Rano pracownik i kierownik dostają o tym powiadomienie.
  Pozycje widać też na Pulpicie, w „Wymaga Twojej decyzji” razem z korektami,
  zamianami i wnioskami o wolne.
- **Tablet pokazuje ludzi tam, gdzie stawia ich grafik.** Osoba wypożyczona do
  innego lokalu znajdzie się na jego tablecie i odbije zmianę bez chodzenia i
  telefonów. Zostaje też na liście swojego lokalu — plany się zmieniają.
- **Odejście pracownika: zmiany można przepisać na następcę** zamiast
  przepisywać kilkanaście pozycji ręcznie. Dni, w których nowa osoba ma wolne,
  kończy pracę albo ma już zmianę, zostaną pominięte i wymienione.
- **Prawo do zamykania dnia nadajesz też w Puls → Konfiguracja** — lista zespołu
  lokalu z przyciskami „Na dziś”, „Na tydzień”, „Odbierz”. To samo pole co w
  karcie pracownika, tylko pod ręką: karta jest miejscem na rzeczy rzadkie,
  a to decyzja podejmowana co rano.
- **Umowa bezterminowa** — osobne pole zamiast pustego terminu i żółtego
  ostrzeżenia „brak terminu”.
- **Ostatni dzień pracy** — po tej dacie Grafik nie pozwoli wpisać zmiany, a
  przypomnienia o umowie milkną.

## 0.29.0 — 2026-09-07

- **Nowa zakładka "Puls"** w Panelu Kierownika, w czterech widokach: lista
  ostatnich dni, karta jednego dnia, raport tygodnia i konfiguracja wpisów.
- **Karta dnia** zamyka się w minutę: godziny, koszt pracy, zadania i pogoda są
  policzone z góry, ręcznie wpisuje się tylko utarg, temperatury, dostawę i
  notatkę dla następnej zmiany. Utarg i wpisy stoją obok siebie, każdy blok ma
  własny przycisk **Zapisz, który NIE zamyka dnia** — można wpisać rano i
  wrócić wieczorem. Zamknięty dzień da się **otworzyć ponownie**.
- Górny pasek karty pokazuje teraz **różnice**: godziny i koszt pracy wobec
  grafiku, a w miejscu kontroli obsady — duży **udział kosztu pracy w utargu**.
- **Lista dni** pokazuje każdy dzień jednym rzutem oka: utarg wobec tego, co
  zwykle wychodzi w ten dzień tygodnia, koszt pracy wobec planu, wykonanie
  zadań i wpisów oraz pogodę wobec tego, co zapowiadano tydzień wcześniej.
- **Raport tygodnia** sumuje siedem dni, wskazuje najmocniejszy i najsłabszy
  dzień i pozwala cofnąć się do wcześniejszych tygodni.
- **Na Pulpicie widać, że wczorajszy dzień nie został zamknięty** — pasek z
  nazwami lokali i przyciskiem, który otwiera od razu właściwą kartę.
- Karta liczy **średni paragon** i **udział kosztu pracy w utargu** — liczbę,
  po której widać, czy dzień się opłacił.
- **Temperatura poza normą świeci na czerwono** zamiast leżeć w tabeli jako
  zwykła liczba. Poprawka wpisu nie kasuje poprzedniej wersji, tylko dopisuje
  nową — tego wymaga dokumentacja HACCP.
- **Aplikacja zapamiętuje, co prognoza mówiła 3, 7 i 14 dni wcześniej**, i
  pokazuje, o ile się pomyliła. Po kilku tygodniach widać wprost, na ile dni
  naprzód warto układać obsadę pod pogodę.
- **Sam ustawiasz, co trzeba wpisywać w danym lokalu** (Puls → Konfiguracja):
  nazwa, rodzaj, pora dnia, dni tygodnia i pola do wypełnienia. Sześć typowych
  wpisów — lodówka, zamrażarka, przyjęcie dostawy, temperatura wydania, olej,
  sprzątanie końcowe — dodaje się jednym kliknięciem, z gotowymi normami.
- **Pustego wpisu nie da się zapisać** — temperatura, której nikt nie zmierzył,
  liczyłaby się jako wykonana i zafałszowała cały dziennik. Pola tak/nie są
  wyjątkiem: niezaznaczone znaczy „nie” i to też jest odpowiedź.
- **Karta dnia zna kalendarz**: święta, dni przed świętami, Walentynki, tłusty
  czwartek, Sylwester i dzień wypłaty podpisują się same przy dacie — bo to one
  najczęściej tłumaczą nietypowy utarg. Dzień wypłaty ustawiasz per lokal.
- **Do utargu dochodzi powód i komentarz** (pogoda / wydarzenie / akcja /
  personel / inne), żeby po miesiącu dało się odróżnić słabą sobotę od soboty
  z awarią pieca.
- **Pogoda zmieściła się w jeden kafelek**, z odchyleniem prognozy sprzed 3 i 7
  dni. Czternastu dni już nie pokazujemy — przy tej trafności to szum.
- **Zgłoszenie zdarzenia ma teraz formularz**: kategoria, godzina i miejsce,
  uczestnicy, opis, co zrobiono, skutek finansowy, status i znacznik „wymaga
  dalszego prowadzenia”. Danych osobowych gościa świadomie nie zapisujemy.
- **Zamkniętego dnia nie da się po cichu zmienić.** Poprawka to osobny wpis:
  stara wartość, nowa i powód, widoczne w karcie na zawsze.
- W konfiguracji wpisów doszedł **przycisk kopiowania** — przy pięciu lodówkach
  o tych samych normach to różnica między minutą a kwadransem.
- **Dzień może zamknąć kierownik zmiany**, gdy kierownika lokalu nie ma na
  miejscu. W karcie pracownika nadajesz mu prawo **do konkretnego dnia** — samo
  wygasa. Na Tablecie Służbowym dostaje wtedy ekran „Zamknięcie dnia”: utarg,
  notatki, wpisy i zdarzenia. Bez historii, bez innych lokali i bez kosztów
  pracy. Po zamknięciu kierownik lokalu dostaje powiadomienie, a rano —
  przypomnienie o dniu, którego nikt nie zamknął.
- Kierownik zmiany **widzi na tablecie, że to dziś on zamyka dzień** — przy
  swoim nazwisku na liście osób i osobnym paskiem na Pulpicie, który znika po
  zamknięciu. Prawo jest jednodniowe, więc bez przypomnienia łatwo je przegapić,
  a przegapiony dzień wpisuje się nazajutrz z pamięci.
- **Zamkniętego dnia nie da się już otworzyć** — jedyna droga to poprawka ze
  śladem. Otwarcie kasowałoby sens zamknięcia.
- Anonimowe zgłoszenie znów da się wysłać — wcześniej znikało bez śladu.

## 0.28.0 — 2026-09-05

- **Ostrzeżenia o obsadzie widać wprost w siatce Grafiku**, bez najeżdżania
  kursorem na dymek. Pod każdym dniem stoi lista konkretów: czego brakuje,
  na jakim stanowisku i w jakich godzinach.
- **Nowe ostrzeżenie: za dużo osób.** Czerwone, gdy kogoś brakuje, żółte, gdy
  wpisano więcej ludzi, niż wynika z wymagań obsady. W nagłówku lokalu i w
  kalendarzu miesiąca doszedł licznik dni z nadmiarem.
- Znak zapytania przy żółtym ostrzeżeniu znaczy, że na tę porę nie ma w ogóle
  wpisanego wymagania — to najczęściej luka w konfiguracji, nie nadmiar ludzi.
- **Druga zmiana pracownika jest wreszcie widoczna.** Jeśli ktoś ma tego dnia
  zmianę też w innym lokalu, jego wiersz pokazuje ją zawsze — wcześniej
  znikała, gdy w oglądanym lokalu miał już wpisaną własną zmianę, i dzień
  wyglądał na wolny, mimo że był zajęty.

## 0.27.0 — 2026-09-05

- **"Wyczyść tydzień" w Grafiku** — obok "Kopiuj z poprzedniego tygodnia",
  widoczne tylko w trybie Edycja. Czyści grafik **jednego lokalu**, tego, w
  którego nagłówku stoi przycisk; przy "Cała sieć" każdy lokal ma własny i
  żaden nie rusza sąsiada.
- Przed usunięciem pytamy o potwierdzenie z konkretami: nazwa lokalu, zakres
  dat, ile zmian zniknie i ile z nich było już wysłanych. Wysłane zostają
  zdjęte tą samą zasadą co pojedyncze usunięcie — pracownicy dowiedzą się
  przy najbliższej wysyłce grafiku.
- W widoku dnia przycisk nazywa się "Wyczyść dzień" i czyści tylko ten dzień.

## 0.26.3 — 2026-09-05

- **Wyłączone "Wpisy" zabierają też kończenie zmiany.** Ukryty był tylko
  przycisk rozpoczęcia, więc osoba z trwającą zmianą mogła ją mimo wszystko
  zamknąć z telefonu. Teraz w tym miejscu jest zdanie: zmianę kończysz na
  Tablecie Służbowym.
- Przy zmianie, której nie da się już wystawić na giełdę (mniej niż 12 h do
  startu), widać **"za późno na giełdę"** zamiast pustego miejsca po
  przycisku. Sam brak przycisku wyglądał jak awaria.

## 0.26.2 — 2026-09-05

- **E-mail konta otwartego już się nie kasuje przy zapisie.** Zapis czyścił
  to pole dla wszystkich kont kiosku — reguła z czasów, gdy takie konto nie
  logowało się w ogóle — więc dostępu z prywatnego telefonu nie dało się
  nadać i logowanie mówiło "nie ma takiego użytkownika".
- E-mail jest przy zapisie sprowadzany do małych liter i bez spacji, a
  logowanie porównuje go tak samo. Klawiatura telefonu sama podnosi pierwszą
  literę i to wystarczało, żeby logowanie nie działało bez widocznego powodu.

## 0.26.1 — 2026-09-05

- W Raportach i kosztach oraz w Rejestrze Godzin **liczba godzin stoi w
  stałej kolumnie**, a różnica plan/fakt jest na lewo od niej. Wcześniej
  odznaka różnicy wchodziła za godziny i wiersze przestawały się zgadzać w
  pionie.
- W karcie pracownika z kontem otwartym (kiosk) doszło **pole e-mail** obok
  PIN-u blokady — bez niego nie dało się nadać dostępu z prywatnego
  telefonu. Pod spodem widać wprost, czy dana osoba ten dostęp już ma.

## 0.26.0 — 2026-09-05

- **Tablet Służbowy na prywatnym telefonie pracownika.** To ten sam ekran co
  na tablecie, bez wyboru osoby — konto jest już konkretną osobą.
  - Dostęp ma **tylko pracownik z ustawionym PIN-em blokady i e-mailem**.
    Loguje się tym samym PIN-em co na tablecie. Kto nie ma PIN-u, nie ma
    dostępu — nic się dla niego nie zmienia.
  - Kierownik wybiera **raz na lokal** (Pracownicy → Lokale), które bloki są
    dostępne: Wpisy, Raport, Grafik, Zadania, Wiadomości, Zgłoś problem,
    Wniosek o wolne. "Popraw zmianę" chodzi razem z Raportem — bez listy
    swoich zmian nie ma czego poprawiać.
  - Wyłączony blok znika w całości: bez **Wpisów** nie ma zakładki Zmiana ani
    przycisku "Rozpocznij zmianę", bez **Grafiku** nie ma na Pulpicie
    najbliższej zmiany ani licznika do końca zmiany.
  - **Tablet Służbowy zostaje bez zmian** — stoi w lokalu, pod fizyczną
    kontrolą, i ma zawsze pełny zestaw.
- Lokale sprzed tej zmiany mają wszystko włączone; nikt nic nie traci.

## 0.25.2 — 2026-09-05

- Pulpit: szeroki kafelek "Godziny — ten miesiąc vs poprzedni" zmienił się w
  zwykły ("Godziny w miesiącu", z procentem względem poprzedniego miesiąca),
  więc wszystkie liczby stoją teraz w jednym rzędzie.
- W Raportach i kosztach przy liście zmian pracownika widać **znacznik
  różnicy na konkretnym dniu** — ten sam co w Rejestrze Godzin — obok
  podsumowania, ile komuś wyszło ponad grafik albo poniżej.
- W stopce siatki grafiku powtórzony **dzień tygodnia i data** przy sumie
  osób i godzin: przy kilkunastu pracownikach nagłówek jest już poza
  ekranem i nie było wiadomo, którego dnia dotyczy suma.

## 0.25.1 — 2026-09-05

- **Zmiany osoby z wyłączonym kontem nie udają już obsady.** Gdy pracownik
  odchodzi, jego zmiany zostawały w grafiku: znikały z siatki (bo znikał
  cały wiersz), ale nadal liczyły się jako obsadzone — kierownik widział
  "wszystko pokryte", choć na te zmiany nikt nie miał przyjść.
  - Taka osoba **zostaje widoczna w siatce**, dopóki wiszą jej zmiany, z
    podpisem "KONTO WYŁĄCZONE" i przekreślonymi zmianami — da się je komuś
    przepisać albo usunąć.
  - Jej zmiany **nie liczą się do obsady** ani do sum dnia, więc dzień
    uczciwie pokazuje brak.
  - Przy archiwizacji pracownika kierownik dostaje pytanie: *"ma jeszcze N
    zmian w grafiku od dziś — zostaną zdjęte"*. Zdjęcie działa tą samą
    zasadą co ręczne usuwanie: wysłane czekają na wysyłkę grafiku,
    niewysłane znikają od razu.
  - W widoku miesiąca i na wydruku takie zmiany są przekreślone.

## 0.25.0 — 2026-09-05

- **Plan vs fakt — ile naprawdę wyszło godzin względem grafiku.**
  - Na **Pulpicie** nowy kafelek "Wczoraj — plan vs fakt": plan, fakt i
    różnica na plus lub minus.
  - W **Rejestrze Godzin** kafelek "Wpisy otwarte" zastąpiony różnicą
    plan/fakt za okres, przy wierszu widać różnicę dnia, a przycisk
    **"Tylko różnice"** zawęża listę do dni, w których coś się rozjechało.
  - W **Raportach i kosztach** różnica za miesiąc (z procentem) oraz przy
    karcie pracownika, ile wyszło mu ponad grafik albo poniżej.
- Porównujemy **sumy godzin w obrębie (osoba, dzień)**, nie parujemy zmiany
  jedna do jednej — ludzie wymieniają się między sobą bez systemu i tylko
  suma dnia jest na to odporna. Rozbieżność to sygnał dla kierownika, nie
  zarzut wobec pracownika.
- Liczymy tylko **dni zamknięte** (do wczoraj włącznie). Plan na cały miesiąc
  zestawiony z faktem za kilka dni pokazywałby "−80%" i nie znaczyłby nic.
- Różnice poniżej 15 minut są pomijane — to naturalny rozrzut odbić.

## 0.24.0 — 2026-09-05

- **Tablet Służbowy pokazuje, o której kto ma być.** Przy osobie, która
  jeszcze nie odbiła, widnieje zielone "o 09:00" wg grafiku — obok
  dotychczasowego czerwonego "od HH:MM" (zmiana trwa) i szarego "N godz."
  (zmiana skończona).
- Licznik nad listą mówi teraz prawdę: **ile osób jest na zmianie, ile wg
  grafiku jeszcze nie odbiło i ile już zakończyło**. Wcześniej "jeszcze nie
  odbiło" obejmowało też tych, którzy mają dziś wolne.
- **Lista jest posortowana wg grafiku**: najpierw ci na zmianie, potem
  oczekiwani dziś (wg godziny wejścia), potem ci po pracy, a osoby z wolnym
  na końcu.
- **Nowy widok "Dzień" w Grafiku kierownika**, obok "Tydzień" — jedna kolumna
  zamiast siedmiu, więc szybka poprawka da się zrobić z telefonu. Nawigacja
  chodzi wtedy po dniach, a "Miesiąc" i "Konfiguracja" odsunięte na bok jako
  osobna para.

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
