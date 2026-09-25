// @ts-nocheck
// Krótki przewodnik po panelu — statyczna treść, po jednej sekcji na
// zakładkę. Aktualizować przy każdej większej zmianie w danej zakładce.
//
// Druga mini-zakładka "Historia wersji" — skrócone podsumowanie
// CHANGELOG.md w repo (ten plik zostaje pełnym źródłem prawdy; tu tylko
// ostatnie kilka wersji, żeby dało się zobaczyć "co nowego" bez wychodzenia
// z apki). ⚠️ Aktualizować ręcznie razem z CHANGELOG.md przy każdym bumpie
// APP_VERSION — patrz CLAUDE.md "Wersjonowanie i CHANGELOG".
import React, { useState } from "react";
import {
  Home,
  CheckCircle2,
  FileText,
  Clock,
  Flag,
  Users,
  BarChart3,
  User,
} from "lucide-react";
import { APP_VERSION } from "../../config";
import { pageTitleCls, sectionCardCls, sectionHeaderCls } from "./designTokens";

const CHANGELOG = [
  {
    version: "0.52.0",
    date: "2026-09-25",
    items: [
      "Pracownicy: nowy układ — braki w danych widać na liście (filtr „Braki w danych”), tablety osobno.",
      "Karta: „Uzupełnij” przenosi do brakującego pola, skróty do sekcji przyklejone u góry.",
      "PIN ukryty do „Pokaż”, ostrzeżenie o łatwym PIN-ie; stawka w tym miesiącu przy umowie o pracę.",
      "Pasek „Zapisz zmiany” pojawia się tylko po zmianie; urlop można usunąć z „Cofnij”.",
    ],
  },
  {
    version: "0.51.1",
    date: "2026-09-25",
    items: [
      "Puls bez czerwonego licznika — w Skrzynce stoi w Informacjach, na Pulpicie licznik jest szary.",
      "Aktywni: „Dopisz wejście” najpierw pyta o godzinę (wg grafiku albo teraz).",
      "Aktywni: pasek u góry (na zmianie, po czasie, bez wejścia, lokale) filtruje listę.",
    ],
  },
  {
    version: "0.51.0",
    date: "2026-09-25",
    items: [
      "Aktywni: najpierw „Wymaga uwagi” (bez wejścia, po czasie), potem lokale z paskiem postępu zmiany.",
      "„Zakończ” pyta o godzinę (teraz albo wg grafiku) i można go cofnąć przez 6 sekund; „Dopisz wejście” z grafiku.",
      "Skrzynka zamiast Zgłoszeń i Powiadomień: Do zrobienia / Informacje / Archiwum, akcja przy każdej pozycji.",
      "Powtarzające się przypomnienia łączą się w jedną pozycję (×N); treść zgłoszeń anonimowych ukryta do „Pokaż”.",
    ],
  },
  {
    version: "0.50.0",
    date: "2026-09-25",
    items: [
      "Rejestr godzin: Grafik obok Faktu w każdym wierszu, różnica od 15 minut, „Poza grafikiem” zamiast różnicy równej całej zmianie.",
      "Liczby: godziny ponad plan i poniżej planu osobno; grupowanie po dniu albo po pracowniku.",
      "Przycisk „Bieżący miesiąc”, gdy oglądasz inny.",
      "Okno wpisu na środku ekranu: godziny z grafiku, −/+ 15 minut, historia wpisu.",
      "Powód wymagany przy poprawce godzin (widzi go pracownik); usunięcie można cofnąć przez 6 sekund.",
    ],
  },
  {
    version: "0.49.0",
    date: "2026-09-25",
    items: [
      "Nowy Pulpit: najpierw „Do zrobienia teraz” — zamknięcie wczorajszego dnia i sprawy do decyzji.",
      "Uzupełniony dzień zamyka się jednym „Zamknij”; prostą korektę godzin zatwierdzasz ✓ z Pulpitu. Obie rzeczy można cofnąć przez 6 sekund.",
      "Liczby z uczciwym porównaniem: pn–pt z pn–pt, 1–25 z 1–25.",
      "Teraz na zmianie zaczyna od osób z grafiku, które jeszcze nie odbiły.",
      "Koszt miesiąca liczy się jak w Raportach i kosztach (z umowy).",
    ],
  },
  {
    version: "0.48.0",
    date: "2026-09-25",
    items: [
      "Do decyzji: nowy wygląd — filtry po typie, jedna karta dla każdej sprawy, różnica godzin zamiast dwóch tabel.",
      "Godziny przyciskami −/+ o 15 minut; „Dopisz 10 h” liczy się na żywo.",
      "„Popraw” w karcie (na telefonie od dołu), z szybkimi godzinami i gotowymi powodami.",
      "Zaznacz kilka → „Zatwierdź N”. Każdą decyzję można cofnąć przez 6 sekund.",
      "Podpis „Czeka N dni” i wykrywanie zdublowanych korekt.",
    ],
  },
  {
    version: "0.47.0",
    date: "2026-09-25",
    items: [
      "Tablet Służbowy na całą szerokość tabletu, osoby po trzy w rzędzie.",
      "Zakładki na tablecie w pasku po lewej, jak w panelu kierownika.",
      "Na telefonie bez zmian — zakładki dalej na dole.",
      "Widoczny przycisk „Wybierz inną godzinę” przy starcie i przy końcu zmiany.",
      "Zatwierdzanie zmian: przyciski w rzędzie po prawej stronie karty.",
      "Tablet kilku lokali: przy osobie widać jej lokal, a reguły wpisu mówią, którego lokalu dotyczą.",
    ],
  },
  {
    version: "0.46.0",
    date: "2026-09-25",
    items: [
      "Zatwierdzanie zmian: jedna karta dla każdego typu decyzji, przyciski jeden pod drugim w tej samej kolejności.",
      "Znaczek w menu liczy wszystkie decyzje, także braki odbicia — tyle samo, co nagłówek strony.",
      "Pracownicy: lista idzie za lokalem z górnego paska; „Cała sieć” grupuje po lokalach.",
    ],
  },
  {
    version: "0.45.0",
    date: "2026-09-24",
    items: [
      "Karta lokalu → Rejestracja godzin: tylko odbicie, tylko cała zmiana albo oba sposoby.",
      "Okno na spóźniony wpis startu i końca (w minutach). Puste = bez limitu, 0 = tylko „teraz”.",
      "Godzina spoza okna trafia do kierownika jako korekta, a spóźniony start zaczyna zmianę od teraz.",
      "Zatwierdzenie prośby o sam start nie otwiera już zakończonej zmiany.",
      "Tablet Służbowy widzi korekty godzin swoich ludzi — „Popraw zmianę” wysłane z tabletu nie odbija się od uprawnień bazy.",
    ],
  },
  {
    version: "0.44.0",
    date: "2026-09-24",
    items: [
      "Nowa zakładka Ustawienia (tylko właściciel): lokale, stanowiska, firma i miejsce na subskrypcję.",
      "Karta lokalu w zwijanych sekcjach, z przyciskiem Zapisz zawsze na ekranie.",
      "Nowy lokal zakłada się z samej nazwy i miasta — resztę ustawia się w jego karcie.",
      "Lokale i stanowiska da się przywrócić z archiwum.",
    ],
  },
  {
    version: "0.43.0",
    date: "2026-09-22",
    items: [
      "Stawki, wynagrodzenia, daty urodzenia, telefony i PIN-y widzi już tylko kierownik — i każdy swoje własne.",
      "Notatki o pracowniku widzi wyłącznie kierownik.",
      "Kartotekę pracownika może zmieniać tylko kierownik.",
      "Osobę na próbę zakłada teraz serwer, a nie tablet — dla obsługi bez zmian.",
    ],
  },
  {
    version: "0.42.2",
    date: "2026-09-22",
    items: [
      "Zmiana zdjęta z grafiku znika też z giełdy — nie wisi już przy nazwisku jako „na giełdzie”.",
      "Obie strony dostają wiadomość, że propozycja przestała być aktualna.",
      "Nie da się przejąć zmiany, którą kierownik zdążył usunąć.",
    ],
  },
  {
    version: "0.42.1",
    date: "2026-09-22",
    items: [
      "PIN blokady profilu na Tablecie Służbowym sprawdza teraz baza — dla pracownika bez zmian, te same sześć cyfr.",
      "Tablet nie ma już u siebie PIN-ów wszystkich osób z lokalu.",
      "Gdy tablet straci połączenie, mówi o tym wprost zamiast twierdzić, że PIN jest zły.",
      "Osoba wypożyczona do innego lokalu otworzy swój profil na tamtejszym tablecie.",
    ],
  },
  {
    version: "0.42.0",
    date: "2026-09-21",
    items: [
      "Hasło sprawdza teraz serwer, a nie przeglądarka — dla wchodzącego nic się nie zmienia (ten sam e-mail i PIN).",
      "Aplikacja nie pobiera już listy pracowników z PIN-ami, zanim ktokolwiek się zaloguje.",
      "Aktualizacja aplikacji nie wylogowuje już wszystkich; to jedno wdrożenie jeszcze tak, bo stare sesje nie pasują do nowego mechanizmu.",
      "Zmiana PIN-u w karcie pracownika zmienia też hasło do logowania — dotąd ruszała tylko blokadę na tablecie.",
    ],
  },
  {
    version: "0.41.2",
    date: "2026-09-20",
    items: [
      "Pole „PIN blokady\" w karcie pracownika przyjmuje sześć cyfr — wcześniej nie dało się wpisać szóstej.",
      "Ten sam PIN otwiera profil na tablecie i loguje na prywatnym telefonie.",
      "Na Tablecie Służbowym PIN to dokładnie sześć cyfr i otwiera profil sam, bez przycisku — profil z krótszym PIN-em nie otworzy się w ogóle, popraw go w karcie.",
    ],
  },
  {
    version: "0.41.1",
    date: "2026-09-20",
    items: [
      "Klawiatura PIN-u na Tablecie Służbowym przyjmuje PIN dłuższy niż cztery cyfry: sześć otwiera profil samo, krótszy zatwierdza przycisk „Otwórz\".",
      "Obie długości działają naraz — PIN-y będą podnoszone do sześciu cyfr stopniowo.",
    ],
  },
  {
    version: "0.41.0",
    date: "2026-09-20",
    items: [
      "Wydanie porządkujące wdrożenia — w codziennej pracy nic się nie zmienia.",
      "Aplikacja nie ma już wpisanego w kodzie adresu bazy: nowe wdrożenie bez ustawień pokaże ekran „wdrożenie nieskonfigurowane\" zamiast po cichu czytać dane innej sieci.",
      "Nazwa sieci na ekranie logowania i w panelu ostrzega czerwonym napisem, gdy nie została ustawiona.",
      "Codzienne zadania w tle zgłaszają błąd zamiast działać po cichu przy złej konfiguracji.",
      "Zamiast białej strony przy awarii — ekran „Coś się zepsuło\" z przyciskiem odświeżenia; błędy zapisują się same razem z wersją i ekranem.",
    ],
  },
  {
    version: "0.40.0",
    date: "2026-09-19",
    items: [
      "Zmiana zaczęta i nieodbita do końca znika z „Kto jest teraz w pracy\" i trafia do Zatwierdzania zmian — godzin nikomu nie dopisujemy, do decyzji liczy się jako zero.",
      "Dwa przyciski decyzji: „Zapisz godziny\" (z podpowiedzią z grafiku) albo „Nie było zmiany\"; pracownik dostaje wiadomość w obu wypadkach.",
      "Progi ustawia się per lokal (Pracownicy → Lokale): tolerancja po grafiku (domyślnie 4 godz.) i maksymalna zmiana poza grafikiem (domyślnie 17 godz.).",
      "Na tablecie niezakończona zmiana z poprzedniego dnia świeci na czerwono i da się ją zamknąć właściwą godziną; przy nazwisku stoi podpis „Niezakończona zmiana z…\".",
      "Nowa osoba na próbę wprost z Tabletu Służbowego: imię i nazwisko, lokal, stanowisko — i już odbija godziny.",
      "Osoba na próbę nie pokazuje się w Grafiku i nie zaloguje się z własnego telefonu, dopóki kierownik jej nie zatwierdzi.",
      "Decyzja o niej czeka w Zatwierdzaniu zmian razem z liczbą odbitych godzin; odrzucenie przenosi konto do archiwum, a godziny zostają.",
      "Jedno kliknięcie w kolejce decyzji nie zapisze już godzin dwa razy — blokada działa natychmiast, a przed zapisem sprawdzamy bazę.",
      "Raporty i koszty: koszt liczy się też dla umowy o pracę (kwota z umowy plus narzut), a nie tylko dla stawki godzinowej.",
      "Zakładka otwiera się na miesiącu poprzednim; wejście z imienia w Rejestrze albo Aktywnych przenosi na miesiąc tamtej zmiany.",
      "„Według lokalu\" pokazuje koszt, a pasek pod kafelkami porównuje godziny i koszt z poprzednim miesiącem.",
      "W raporcie są tylko osoby z zarejestrowanymi godzinami w danym miesiącu; w wierszu widać, czyje zmiany zostały bez zakończenia. Eksport CSV działa.",
      "Godziny ponad normę doliczają się do kosztu po stawce z umowy — kwota z umowy jest podłogą, nie całością.",
      "Trzy przekroje pod kafelkami: Lokale, Stanowiska, Pracownicy — zamiast wszystkiego jedno pod drugim.",
      "Każdą pozycję rozwija strzałka: widać, z kogo składa się ta kwota, a kliknięcie nazwiska otwiera kartę tej osoby.",
    ],
  },
  {
    version: "0.39.0",
    date: "2026-09-17",
    items: [
      "Grafik pokazuje koszt pracy tygodnia i — jako propozycję — minimalny utarg, przy którym ten grafik mieści się w celu.",
      "W nagłówku każdego dnia stoi koszt dnia i jego udział w prognozowanym utargu; czerwony, gdy przekracza cel.",
      "Nowy widok „Wg budżetu\" obok „Wg osób\" i „Wg stanowisk\": ten sam nagłówek dni, a w wierszach cel, prognoza, koszt i zapas.",
      "Cel finansowy (oczekiwany utarg i docelowy % kosztu pracy) ustawia się na dzień tygodnia w Grafik → Konfiguracja → Budżet, wersjonowany miesięcznie jak wymagania obsady.",
      "Pojedynczy dzień da się zmienić bez ruszania reguły — kliknięciem w liczbę w trybie Edycja; dzień dostaje podpis „zmienione na ten dzień\".",
      "Przy umowie o pracę koszt godziny to kwota z umowy przez normę miesiąca plus narzut — tak liczy teraz również Puls, więc koszt dnia nie pokazuje już etatowców jako darmowych.",
      "Przy nazwisku w siatce widać różnicę wobec normy: „do normy: 16 h\" albo „+4,5 h ponad normą\" (tylko umowa o pracę).",
      "Przycisk „Zobacz, co czeka na wysłanie\" pod siatką pokazuje pełną listę zmian w wersji roboczej, zanim polecą powiadomienia.",
      "Zestaw konfiguracji — wymagań obsady albo celu finansowego — da się teraz usunąć.",
      "Prognozowany utarg i docelowy % kosztu pracy widać i wpisuje się w dwóch miejscach: w konfiguracji Grafiku i w karcie dnia w Pulsie. To jedna liczba, nie dwie kopie.",
    ],
  },
  {
    version: "0.38.0",
    date: "2026-09-16",
    items: [
      "Giełda zmian ma trzy drogi: wystaw dla wszystkich, oddaj konkretnej osobie, zamień się zmianami.",
      "Oferta skierowana jest widoczna tylko dla wskazanej osoby — reszta zespołu jej nie widzi.",
      "Przy zamianie kierownik widzi obie zmiany naraz i godziny po obu stronach (8 h za 8 h to zero różnicy).",
      "Każdy z trzech trybów kończy się tak samo: decyzją kierownika.",
      "Zadania widzi pracownik, który ma dziś zmianę w grafiku — albo każdy zaraz po rozpoczęciu zmiany. W dniu wolnym checklisty nie ma.",
    ],
  },
  {
    version: "0.37.0",
    date: "2026-09-14",
    items: [
      "Zadania układają się w bloki — checklisty typu „Otwarcie lokalu\" czy „Bezpieczeństwo żywności\". Porę, dni tygodnia i stanowiska ustawia się raz dla całego bloku.",
      "W jednym bloku zadania mogą się zmieniać dniami tygodnia — okap w poniedziałek, lodówka w środę. Blok jest nadrzędny: dni zadania tylko zawężają dni bloku.",
      "Zadanie może prosić o wpisanie wartości (temperatura, kwota, tak/nie) z normą — wpis trafia do dziennika dnia w Pulsie.",
      "Zadanie podpięte pod pozycję z konfiguracji Pulsu zamyka ją na karcie dnia, więc nikt nie mierzy tego samego dwa razy.",
      "Pomiaru nie da się odznaczyć — da się go poprawić, a przy wartości widać „poprawione: było X, powód\" (także w Pulsie).",
      "Do zadania można dopisać opis albo procedurę wykonania (nieobowiązkowo).",
      "U pracownika Pulpit pokazuje bloki z licznikiem; kliknięcie otwiera blok w zakładce Zadania.",
      "Sześć gotowych bloków w „Szybkim starcie\" — nowy lokal ustawia zadania na kilka kliknięć.",
    ],
  },
  {
    version: "0.36.2",
    date: "2026-09-13",
    items: [
      "Tej samej zmiany nie da się zapisać dwa razy — przed zapisem pytamy bazy, nie tylko własnej kopii danych.",
      "Przepracowane godziny odświeżają się w otwartej sesji co 45 sekund, więc tablet nie pokazuje już stanu sprzed tygodnia.",
    ],
  },
  {
    version: "0.36.1",
    date: "2026-09-13",
    items: [
      "Prognoza godzin nie gubi już dzisiejszego dnia, gdy zmiana wciąż trwa.",
      "Moja Praca wygląda tak samo jak ekrany pracownika — licznik zmiany, czas do końca, raport i grafik w jednej kolumnie.",
      "Kolejne wysłanie grafiku odświeża nieprzeczytaną wiadomość zamiast dokładać następną.",
      "Pracownik przewija grafik strzałkami dowolnie daleko — widzi następny miesiąc i może wystawić na giełdę zmianę z przyszłości.",
      "Grafik na miesiąc wygląda tak samo u pracownika i u kierownika: dzień tygodnia nad datą, godziny dnia, minione dni wyszarzone.",
    ],
  },
  {
    version: "0.36.0",
    date: "2026-09-12",
    items: [
      "Rozpoczęcie zmiany nie blokuje się już przez urlop wpisany na przyszły tydzień.",
      "Komunikat o nakładających się zmianach podaje datę i mówi, gdy tamta zmiana to urlop.",
      "Przypomnienie o zmianie bez odbicia nie trafia już do osób, które odbiły.",
      "Zgłoszenia anonimowe widzi kierownik lokalu, nie tylko administrator.",
      "Na zleceniu Raport pokazuje, ile godzin wyjdzie w miesiącu razem z tym, co stoi w grafiku.",
      "Moja Praca: najbliższa zmiana, licznik trwającej zmiany wobec grafiku, podsumowanie miesiąca i grafik pod raportem.",
    ],
  },
  {
    version: "0.35.1",
    date: "2026-09-09",
    items: [
      "Przy polach Od/Do w oknie zmiany są gotowe godziny z wymagań obsady — jedno kliknięcie zamiast wpisywania.",
    ],
  },
  {
    version: "0.35.0",
    date: "2026-09-09",
    items: [
      "Ostrzeżenia o odpoczynku przy wpisywaniu zmiany: 11 h na dobę i 35 h w tygodniu przy umowie o pracę, ponad 40 h bez dnia wolnego przy pozostałych umowach.",
      "Zapisać można zawsze — to sygnał, nie blokada. Odpoczynek liczy się przez wszystkie lokale.",
    ],
  },
  {
    version: "0.34.0",
    date: "2026-09-09",
    items: [
      "Znak produktu Shiftro na ekranie logowania, w panelu, na Tablecie Służbowym i jako ikona karty przeglądarki.",
    ],
  },
  {
    version: "0.33.0",
    date: "2026-09-09",
    items: [
      "Aplikacja nazywa się teraz Shiftro; pod nazwą stoi nazwa sieci.",
      "Nazwa sieci widoczna na ekranie logowania i w panelu.",
      "Przygotowanie pod kolejne restauracje: konfiguracja klienta wyszła z kodu do ustawień wdrożenia.",
    ],
  },
  {
    version: "0.32.0",
    date: "2026-09-09",
    items: [
      "Poprawka: widok \"Dzień\" w Grafiku nie pokazywał żadnych zmian.",
      "Nowy układ Grafiku \"Wg stanowisk\": wiersz to stanowisko, widać od razu, gdzie nikogo nie ma.",
      "Nowa kolejność zakładek i jaśniejszy pasek boczny; \"Zadania i sprzątanie\" to teraz \"Zadania\".",
      "Siatka Grafiku: stałe szerokości dni i dwuwierszowy wiersz pracownika — więcej osób na ekranie.",
      "W wierszu widać wykorzystanie umowy: \"128/176 h\" przy umowie o pracę, godziny i koszt przy zleceniu.",
      "Jedną zmianę można wpisać od razu na kilka dni tygodnia; dni z urlopem lub kolizją są pomijane.",
      "Wymagania obsady można teraz poprawiać, a nie tylko dodawać i kasować.",
      "Widok Miesiąc ma drugi układ wydruku \"Osoby × dni\" — wiersz na osobę, 31 kolumn, gotowy na A4 poziomo.",
      "W tym układzie pracownik tego lokalu ma cały swój miesiąc, razem ze zmianami w innych lokalach (na szaro), a przy nazwisku sumę godzin i zmian.",
    ],
  },
  {
    version: "0.31.0",
    date: "2026-09-09",
    items: [
      "Karta pracownika przebudowana na bloki; doszły telefon, data urodzenia i początek pracy.",
      "Typ umowy zamiast pola \"Etat\": zlecenie ma stawkę godzinową, umowa o pracę — wymiar etatu i kwotę miesięczną.",
      "Miesięczna norma godzin liczy się z kalendarza i zmienia co miesiąc. Pracownik widzi ją na dole swojego Raportu, razem z prognozą z wysłanego grafiku.",
      "\"Ten miesiąc\" w karcie pokazuje koszt lokalu i bilans okresu rozliczeniowego.",
      "Nowe ustawienia lokalu: okres rozliczeniowy i narzut pracodawcy (ZUS).",
      "Poprawka: \"Dzień wypłaty\" w ustawieniach lokalu nie zapisywał się.",
    ],
  },
  {
    version: "0.30.3",
    date: "2026-09-09",
    items: [
      "Raporty i koszty: wybór lokalu u góry decyduje, kogo widzisz; godziny i koszt osoby są zawsze pełne, z podpisem ile przypada na oglądany lokal.",
      "Poprawka: komunikat \"Błąd usuwania\" podaje teraz przyczynę.",
    ],
  },
  {
    version: "0.30.2",
    date: "2026-09-09",
    items: [
      "Raporty i koszty: jedna karta na osobę, niezależnie od liczby lokali. Podział na lokale został w sekcji \"Według lokalu\".",
      "Poprawka: \"Popraw zmianę\" podpowiadała stanowiska z niewłaściwego lokalu — teraz idą za wybranym lokalem.",
    ],
  },
  {
    version: "0.30.1",
    date: "2026-09-09",
    items: [
      "Poprawka: osoba wypożyczona do innego lokalu nie mogła zapisać godzin — tablet pokazywał \"Wypełnij wymagane pola!\". Lokal i stanowisko podpowiadają się teraz z grafiku tego dnia.",
    ],
  },
  {
    version: "0.30.0",
    date: "2026-09-08",
    items: [
      "Nowa sekcja \"Był w grafiku, nie odbił\" w Zatwierdzaniu zmian — dopisujesz godziny jednym kliknięciem, poprawiasz albo odrzucasz.",
      "Tablet Służbowy pokazuje też osoby, które grafik stawia dziś w tym lokalu, choć są przypisane gdzie indziej.",
      "Przy archiwizacji pracownika możesz przepisać jego przyszłe zmiany na następcę.",
      "Umowa bezterminowa i ostatni dzień pracy w karcie pracownika; po ostatnim dniu Grafik nie pozwoli wpisać zmiany.",
    ],
  },
  {
    version: "0.29.0",
    date: "2026-09-07",
    items: [
      "Nowa zakładka \"Puls\" w czterech widokach: lista dni, karta dnia, raport tygodnia, konfiguracja wpisów.",
      "Karta dnia: godziny, koszt i zadania policzone z góry; utarg i wpisy obok siebie, każdy blok z własnym Zapisz, które nie zamyka dnia. Zamknięty dzień można otworzyć ponownie.",
      "Lista dni pokazuje utarg wobec zwykłego poziomu, koszt wobec planu, wykonanie i pogodę wobec zapowiedzi sprzed tygodnia.",
      "Raport tygodnia sumuje siedem dni i pozwala cofnąć się do wcześniejszych tygodni.",
      "Na Pulpicie widać, że wczorajszy dzień nie został zamknięty — z przyciskiem prosto do właściwej karty.",
      "Karta liczy średni paragon i udział kosztu pracy w utargu.",
      "Temperatura poza normą świeci na czerwono; poprawka wpisu dopisuje nową wersję zamiast kasować starą (wymóg HACCP).",
      "Aplikacja zapamiętuje, co prognoza mówiła 3, 7 i 14 dni wcześniej, i pokazuje, o ile się pomyliła.",
      "W Puls → Konfiguracja ustawiasz, co trzeba wpisywać w lokalu; sześć typowych wpisów (lodówka, zamrażarka, dostawa, wydanie, olej, sprzątanie) dodaje się jednym kliknięciem.",
      "Karta dnia podpisuje święta, dni przed świętami i dzień wypłaty — to one zwykle tłumaczą nietypowy utarg.",
      "Do utargu dopisujesz powód (pogoda/wydarzenie/akcja/personel) i komentarz.",
      "Zgłoszenie zdarzenia ma pełny formularz: kategoria, uczestnicy, co zrobiono, skutek finansowy, status.",
      "Zamkniętego dnia nie da się po cichu zmienić — poprawka zapisuje starą wartość, nową i powód.",
      "Dzień może zamknąć kierownik zmiany — prawo nadajesz w karcie pracownika do konkretnego dnia i wygasa samo. Dostaje wtedy na tablecie ekran z utargiem i wpisami, bez kosztów i bez historii.",
      "Kierownik lokalu dostaje powiadomienie po zamknięciu i przypomnienie rano, gdy dnia nikt nie zamknął.",
      "Anonimowe zgłoszenie znów da się wysłać.",
    ],
  },
  {
    version: "0.28.0",
    date: "2026-09-05",
    items: [
      "Ostrzeżenia o obsadzie widać wprost w siatce Grafiku — czego brakuje, na jakim stanowisku i w jakich godzinach, bez najeżdżania kursorem.",
      "Nowe ostrzeżenie na żółto: wpisano więcej osób, niż wynika z wymagań. Znak zapytania znaczy, że na tę porę wymagania w ogóle nie wpisano.",
      "Druga zmiana pracownika w innym lokalu jest widoczna zawsze — wcześniej znikała, gdy miał już zmianę w oglądanym lokalu.",
    ],
  },
  {
    version: "0.27.0",
    date: "2026-09-05",
    items: [
      "'Wyczyść tydzień' obok 'Kopiuj z poprzedniego tygodnia' — tylko w trybie Edycja i tylko dla jednego lokalu, z potwierdzeniem podającym zakres i liczbę zmian.",
      "W widoku dnia przycisk czyści tylko ten dzień.",
    ],
  },
  {
    version: "0.26.3",
    date: "2026-09-05",
    items: [
      "Wyłączone 'Wpisy' ukrywają też kończenie zmiany — pracownik kończy ją wtedy na Tablecie Służbowym.",
      "Przy zmianie mniej niż 12 h przed startem widać 'za późno na giełdę' zamiast pustego miejsca.",
    ],
  },
  {
    version: "0.26.2",
    date: "2026-09-05",
    items: [
      "E-mail konta otwartego nie kasuje się już przy zapisie — bez tego nie dało się nadać dostępu z prywatnego telefonu.",
      "Logowanie nie rozróżnia wielkości liter ani spacji w e-mailu.",
    ],
  },
  {
    version: "0.26.1",
    date: "2026-09-05",
    items: [
      "Liczba godzin w stałej kolumnie, różnica plan/fakt na lewo od niej (Raporty i koszty, Rejestr Godzin).",
      "Pole e-mail w karcie pracownika z kontem otwartym — potrzebne, żeby nadać dostęp z prywatnego telefonu.",
    ],
  },
  {
    version: "0.26.0",
    date: "2026-09-05",
    items: [
      "Pracownik z PIN-em blokady i e-mailem może wejść na swój Tablet Służbowy z prywatnego telefonu — tym samym PIN-em co na tablecie.",
      "W Pracownicy → Lokale wybierasz raz dla całego lokalu, które bloki widzi pracownik na swoim telefonie (Wpisy, Raport, Grafik, Zadania, Wiadomości, Zgłoś, Wolne).",
      "Sam Tablet Służbowy zostaje bez zmian — zawsze ma pełny zestaw.",
    ],
  },
  {
    version: "0.25.2",
    date: "2026-09-05",
    items: [
      "Wszystkie liczby na Pulpicie w jednym rzędzie — szeroki kafelek godzin stał się zwykłym.",
      "W Raportach i kosztach znacznik różnicy plan/fakt przy konkretnym dniu, jak w Rejestrze Godzin.",
      "Dzień tygodnia i data powtórzone w stopce siatki grafiku.",
    ],
  },
  {
    version: "0.25.1",
    date: "2026-09-05",
    items: [
      "Zmiany pracownika z wyłączonym kontem nie liczą się już jako obsada — dzień pokazuje brak, a osoba zostaje widoczna z podpisem 'KONTO WYŁĄCZONE', żeby dało się je przepisać.",
      "Archiwizacja pracownika pyta o jego przyszłe zmiany i zdejmuje je z grafiku.",
    ],
  },
  {
    version: "0.25.0",
    date: "2026-09-05",
    items: [
      "Plan vs fakt: kafelek 'Wczoraj' na Pulpicie, różnica za okres i filtr 'Tylko różnice' w Rejestrze Godzin, różnica miesiąca i per pracownik w Raportach.",
      "Porównujemy sumy dnia, nie pojedyncze zmiany — wymiany między pracownikami bez systemu nie psują wtedy liczb.",
      "Liczymy tylko dni zamknięte (do wczoraj) i pomijamy różnice poniżej 15 minut.",
    ],
  },
  {
    version: "0.24.0",
    date: "2026-09-05",
    items: [
      "Tablet Służbowy: zielone 'o HH:MM' przy osobie oczekiwanej wg grafiku, uczciwy licznik (na zmianie / jeszcze nie odbiło / zakończyło) i lista posortowana wg grafiku.",
      "Nowy widok 'Dzień' w Grafiku — jedna kolumna zamiast siedmiu, do szybkich poprawek z telefonu.",
    ],
  },
  {
    version: "0.23.0",
    date: "2026-09-04",
    items: [
      "Pierwsze wydanie Grafiku — planowanie tygodnia i miesiąca, wymagania obsady, giełda zmian, grafik u pracownika.",
      "Urlop jest w raportach podpisany 'Urlop' zamiast nazwą lokalu, a w podsumowaniach widać osobno godziny urlopu i godziny bez urlopu.",
      "Zaimportowany grafik z arkusza Google za styczeń–wrzesień 2026.",
    ],
  },
  {
    version: "0.22.0",
    date: "2026-09-03",
    items: [
      "Giełda zmian — pracownik wystawia zmianę (najpóźniej 12 h przed), ktoś wolny ją bierze, kierownik zatwierdza w Zatwierdzanie zmian albo ✓/✗ wprost w siatce.",
      "Zmiana na giełdzie jest podświetlona w siatce — żółto gdy czeka na chętnego, zielono gdy ktoś się zgłosił — i widoczna po obu stronach: u oddającego i (na szaro) u przejmującego.",
      "Przy nazwisku widać, ile godzin w miesiącu przybędzie lub ubędzie po zatwierdzeniu zamiany; w Zatwierdzaniu zmian pełna różnica godzin obu osób.",
      "U pracownika: zielony = propozycja do wzięcia, żółty = Twoja zmiana na giełdzie, niebieski = czeka na kierownika. Odznaka na zakładce Grafik liczy nowy grafik i propozycje.",
      "Jedno 'Wyślij grafik pracownikom' wysyła wszystkie niewysłane zmiany od dziś w przód, ze wszystkich Twoich lokali — nie tylko oglądany tydzień.",
      "Powiadomienia na Tablecie Służbowym są per pracownik — nikt nie oznacza już cudzych wiadomości jako przeczytane.",
      "Wolne i urlop można wpisać wprost z grafiku; usunięcie wysłanej zmiany czeka na wysyłkę i pracownik dostaje o tym informację.",
      "Wniosek o wolne dostępny prosto z zakładki Grafik u pracownika.",
      "Niedostępność można zgłosić na jeden dzień, bez wpisywania tej samej daty dwa razy.",
    ],
  },
  {
    version: "0.21.0",
    date: "2026-09-03",
    items: [
      "Pracownik ma własną zakładkę Grafik — lista dni z godzinami, stanowiskiem, lokalem i składem zmiany; przełącznik Ten tydzień / Następny / Miesiąc.",
      "Na Pulpicie pracownika 'Twoja zmiana dziś' albo kafelek 'Następna zmiana'.",
      "Pracownik widzi wyłącznie wysłany grafik — wersja robocza nigdy do niego nie trafia.",
      "W trwającej zmianie widać, ile zostało do końca wg grafiku (i osobno, gdy planowany koniec już minął).",
    ],
  },
  {
    version: "0.20.0",
    date: "2026-09-03",
    items: [
      "W oknie zmiany wybierasz stanowisko RAZEM z lokalem ('Kelner · Sunset') — pracownika oddajesz do innego lokalu bez przechodzenia na jego zakładkę.",
      "Widać tylko stanowiska z karty pracownika, a na liście osób tylko tych, którzy mogą pracować w tym lokalu; resztę odsłaniają rozwijane linki.",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-09-03",
    items: [
      "W oknie przypisania zmiany widać wszystkich pracowników sieci (swoi pierwsi, przy obcych widać lokal) — dobieranie ludzi między lokalami bez wychodzenia z grafiku.",
      "'Dopisz stanowisko do umiejętności' jednym kliknięciem, prosto z grafiku.",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-09-03",
    items: [
      "Grafik — widok miesiąca dla jednego lokalu: w kratce dnia skrót stanowiska, godziny i imię, a czerwony numer dnia oznacza niepełną obsadę.",
      "Druk miesiąca na jednej kartce A4 poziomo — przycisk 'Drukuj'.",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-09-03",
    items: [
      "Grafik — tryb Edycja: '+ dodaj' w pustych komórkach, okno przypisania zmiany z podpowiadanymi godzinami, 'Przypisz i dodaj następną'.",
      "Blokujemy tylko nachodzące godziny, urlop i zgłoszony brak dostępności — zmiana dzielona między lokalami jest dozwolona.",
      "'Kopiuj z poprzedniego tygodnia', 'Dodaj pracownika' (także spoza stałej obsady lokalu) i 'Wyślij grafik pracownikom' — do wysłania grafik jest wersją roboczą.",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-09-03",
    items: [
      "Grafik — widok tygodnia: pracownicy w wierszach, siedem dni w kolumnach, osobna tabela na lokal. Urlopy, brak dostępności i praca w innym lokalu widoczne w komórkach.",
      "Dni z niepełną obsadą oznaczone na czerwono — najedź na liczbę, żeby zobaczyć na jakim stanowisku i w jakich godzinach brakuje ludzi.",
      "Sortowanie pracowników, legenda stanowisk i eksport tygodnia do CSV.",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-09-03",
    items: [
      "Nowa zakładka Grafik — na razie sekcja Konfiguracja: godziny otwarcia lokalu, wymagania obsady na stanowisko (dni, godziny, ile osób) i wyjątki na konkretne daty.",
      "Wymagania obsady obowiązują od wybranego miesiąca — można je skopiować na kolejny zamiast wpisywać od nowa.",
      "W karcie pracownika: lista innych stanowisk, na których umie pracować.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-09-03",
    items: [
      "Wnioski o urlop i niedostępność — pracownik wysyła w Zgłoś, kierownik zatwierdza w Zatwierdzanie zmian. Zatwierdzony urlop wpisuje się jako godziny automatycznie.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-09-03",
    items: [
      "Pogoda w pasku kierownika i na Pulpicie pracownika — aktualna temperatura dla miasta lokalu (Pracownicy → Lokale).",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-09-03",
    items: [
      "Stanowiska mają teraz własny skrót i kolor (Pracownicy → Stanowiska) — widoczne jako plakietka przy godzinach w koncie pracownika, Rejestrze Godzin i Mojej Pracy.",
    ],
  },
  {
    version: "0.11.1",
    date: "2026-09-04",
    items: [
      "Poprawka: strzałki nawigacji dat w Zadaniach i sprzątaniu nie przesuwają się już pod przycisk „Dziś” — kliknięcie daty pozwala też wybrać konkretny dzień.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-09-04",
    items: [
      "Zadania przypisane do stanowiska są teraz wspólne — odhaczenie przez jedną osobę liczy się dla wszystkich z tym stanowiskiem.",
      "Nowy formularz zadania: lokal i odbiorca razem, cała konfiguracja terminu w jednym miejscu, typ „Ogólne” domyślny.",
      "Kafelek „Zadania dziś” na Pulpicie kierownika już nie zależy od tego, czy ktoś odbił zmianę.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-09-03",
    items: [
      "Zadania: priorytet (niski/średni/wysoki) i dowolny wybór dni tygodnia zamiast jednego dnia, plus typ „Ogólne” na dowolną porę dnia.",
      "Panel kierownika: sekcja „Niewykonane dzisiaj”, pełna lista zadań z filtrem po lokalu/stanowisku, kafelek „Zadania dziś” na Pulpicie.",
      "Zgłoszenie można od razu zamienić w zadanie dla kierownika.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-09-02",
    items: [
      "Nowa zakładka Zadania i sprzątanie — checklisty na zmianę (poranne/obiadowe/wieczorne) i zadania cykliczne, wspólne dla lokalu albo osobne dla każdego pracownika.",
      "Panel „Kontrola wykonania po osobach” — kierownik widzi na bieżąco postęp każdego pracownika i zadania wspólne dla lokalu.",
      "Pracownik widzi swoje zadania na dziś, z paskiem postępu w trakcie zmiany i podsumowaniem po jej zakończeniu.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-09-02",
    items: [
      "Nowy Panel Kierownika — Pulpit, Zatwierdzanie zmian, Rejestr Godzin, Aktywni, Zgłoszenia, Pracownicy, Raporty i koszty w nowym, spójnym stylu.",
      "Poprawka godzin od pracownika trafia do prawdziwej kolejki decyzji (Zatwierdzanie zmian) zamiast tylko zgłoszenia tekstowego.",
      "Karta pracownika: stawka, etat, notatki kierownika, PIN blokady na kiosku ustawiane wprost w formularzu.",
      "Raport godzin i kosztów per pracownik + historia poprawek każdej zmiany.",
      "Nowy ekran logowania i pasek „dostępna nowa wersja”.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-08-31",
    items: [
      "Ten sam nowy wygląd co na kiosku, teraz też na osobistym telefonie pracownika.",
      "Małe podkreślone „Wyloguj” w zakładce Więcej.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-08-31",
    items: [
      "Nowy wygląd Tabletu Służbowego — wybór siebie z listy, potem własny pulpit.",
      "Blokada profilu na kiosku 4-cyfrowym PIN-em.",
      "„Zgłoś” można wysłać anonimowo i przypiąć do konkretnej zmiany.",
      "Urządzenie samo wraca do ekranu logowania po aktualizacji aplikacji.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-08-28",
    items: [
      "Nie da się już zapisać dwóch nakładających się zmian.",
      "Przypomnienie o już zarejestrowanych dziś zmianach.",
      "Naprawiono błąd zapisu nowego pracownika z pustymi terminami.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-08-28",
    items: [
      "Zapisywanie zmiany jest teraz natychmiastowe (bez czekania na Google Sheets).",
      "Zalogowanie przetrwa odświeżenie strony.",
    ],
  },
];

const SECTIONS = [
  {
    Icon: Home,
    title: "Pulpit",
    body: "Ekran startowy. Godziny dziś/w tym tygodniu, koszt miesiąca (jeśli pracownikom ustawiono stawkę), skrót do zgłoszeń czekających na decyzję, kto teraz pracuje i czyje terminy sanepid/umowy się kończą. To dobre miejsce, żeby zacząć dzień.",
  },
  {
    Icon: CheckCircle2,
    title: "Zatwierdzanie zmian",
    body: "Tu trafiają poprawki godzin zgłoszone przez pracowników przez „Zgłoś → Popraw zmianę”. Dla każdej: Zatwierdź (przyjmujesz dane tak, jak podał pracownik), Popraw (wpisujesz własne godziny + podajesz powód — pracownik go zobaczy), albo Zapytaj (gdy zgłoszenie jest niekompletne, np. brak godziny zakończenia). Zatwierdzone zmiany od razu trafiają do Rejestru Godzin. Nad tą kolejką: osobna sekcja „Wnioski o wolne” — urlop albo dni niedostępności zgłoszone przez pracowników przez „Zgłoś → Wolne / urlop”. Zatwierdzony urlop od razu wpisuje się jako godziny (8h za dzień roboczy) we wszystkich raportach.",
  },
  {
    Icon: FileText,
    title: "Rejestr Godzin",
    body: "Wszystkie zapisane zmiany, pogrupowane po stanowisku. Szukaj po imieniu/stanowisku/dacie/godzinie, sortuj, dodawaj wpis ręcznie (+ Dodaj wpis) dla dowolnego pracownika. Ikona zegara (Historia) przy wierszu pokazuje, kto i kiedy poprawił daną zmianę oraz dlaczego. Eksport CSV zapisuje aktualnie widoczny (przefiltrowany) miesiąc.",
  },
  {
    Icon: Clock,
    title: "Aktywni",
    body: "Kto w tej chwili pracuje, z licznikiem czasu na żywo (podświetla się na czerwono po 8h). „Zakończ zmianę” zamyka zmianę ręcznie — przydaje się, gdy ktoś zapomniał odbić wyjście.",
  },
  {
    Icon: Flag,
    title: "Zgłoszenia",
    body: "Wolne zgłoszenia od pracowników (nie poprawki godzin — te są w Zatwierdzanie zmian) — awarie, braki, uwagi, czasem anonimowe. „Oznacz jako rozwiązane” zamyka temat.",
  },
  {
    Icon: Users,
    title: "Pracownicy",
    body: "Lista + karta szczegółów. Klikasz osobę z listy po lewej, edytujesz po prawej. Lokal i stanowisko są wymagane (poza kontem typu „Tablet lokalu”); przy koncie logującym się samodzielnie — też email i PIN. Reszta bloków jest opcjonalna. Blok „Umowa i wynagrodzenie” decyduje, jak liczy się koszt: przy zleceniu wpisujesz stawkę godzinową, przy umowie o pracę — wymiar etatu i kwotę z umowy, a normę godzin aplikacja liczy sama z kalendarza. „PIN blokady na kiosku” dotyczy tylko kont typu „Otwarte Konto” używanych na wspólnym tablecie. Sekcja „Urlop” pozwala od razu wpisać urlop pracownikowi (od-do), bez czekania na wniosek — zatwierdzony automatycznie. Usunięcie na zawsze jest możliwe tylko z zakładki Archiwum — najpierw zarchiwizuj, potem usuń. Lokale i Stanowiska (przyciski przy Aktywni/Archiwum, tylko dla Szefa) to osobny, rzadko używany słownik nazw.",
  },
  {
    Icon: BarChart3,
    title: "Raporty i koszty",
    body: "Zestawienie miesięczne wg lokalu i wg pracownika. Kliknij pracownika po lewej, żeby zobaczyć jego pełny raport (zmiany, godziny, koszt) po prawej — to samo miejsce, do którego prowadzi kliknięcie imienia w Rejestr Godzin i Aktywni.",
  },
  {
    Icon: User,
    title: "Moja Praca",
    body: "Kierownik też odbija godziny — to Twój własny „Zmiana”/„Raport”, dokładnie jak u pracownika. Ikonka osoby przy dzwoneczku u góry prowadzi tu z każdej zakładki.",
  },
];

export default function Przewodnik() {
  const [view, setView] = useState("instrukcja"); // "instrukcja" | "wersje"

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className={pageTitleCls}>Przewodnik</h2>
          <p className="text-sm text-[#6E6E66] mt-1">
            {view === "instrukcja"
              ? "Krótko o tym, co robi każda zakładka."
              : "Skrót zmian — pełna historia w CHANGELOG.md."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("instrukcja")}
            className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
              view === "instrukcja"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Jak korzystać
          </button>
          <button
            onClick={() => setView("wersje")}
            className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
              view === "wersje"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Historia wersji
          </button>
        </div>
      </div>

      {view === "instrukcja" && (
        <div className="space-y-4">
          {SECTIONS.map(({ Icon, title, body }) => (
            <div key={title} className={sectionCardCls}>
              <div className={sectionHeaderCls}>
                <span className="flex items-center gap-2">
                  <Icon size={17} />
                  {title}
                </span>
              </div>
              <p className="p-4 text-[14px] text-[#171714] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      )}

      {view === "wersje" && (
        <div className="space-y-4">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className={sectionCardCls}>
              <div className={sectionHeaderCls}>
                <span className="flex items-center gap-2">
                  v{entry.version}
                  {entry.version === APP_VERSION && (
                    <span className="bg-[#DE3A22] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                      bieżąca
                    </span>
                  )}
                </span>
                <span className="text-xs font-normal text-[#8F8E86]">{entry.date}</span>
              </div>
              <ul className="p-4 space-y-1.5 text-[14px] text-[#171714] list-disc list-inside">
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
