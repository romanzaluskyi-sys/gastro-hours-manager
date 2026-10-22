# Dyspozycja i poziomy na stanowisku

Specyfikacja funkcji przed 1.0. Makieta właściciela (22.10.2026):
<https://claude.ai/artifact/UmPJ6vv1MgLmFjwzjrbmc7> (zakładki „Pracownik”,
„Kierownik”, „Pytania otwarte”).

Wdrażane etapami. Każdy etap jest osobnym PR-em z Preview:

| Etap | Co | Wersja | Migracja | Stan |
|---|---|---|---|---|
| D1 | poziom 1·2·3 na stanowisku | 0.78.0 | `0047` | zrobione |
| D2 | strona „Dyspozycja” + blokada w Grafiku, giełdzie, kopiowaniu i przepisaniu | 0.79.0 | `0048` | zrobione |
| D3 | „Zapytaj” o jeden dzień (prośba kierownika, „Mogę / Nie mogę”) | 0.80.0 | `0049` | zrobione |
| D4 | jedno „Nie może” (stara niedostępność = dyspozycja) | 0.81.0 | `0050` | zrobione |
| D4 | „Prośba o zwolnienie ze zmiany” w „Do decyzji”, konflikt z wersją roboczą, dyspozycja w karcie pracownika, „Zapytaj” po zmianie godzin | 0.82.0 | `0051` | zrobione |
| D5 | termin w ustawieniach lokalu, przypomnienia (Pulpit, wiadomość, e-mail) | — | — | do zrobienia |

## Decyzje właściciela (22.10.2026)

- Dyspozycja jest **dla wszystkich**, na każdym urządzeniu i **bez PIN-u**. Nic
  nie jest obowiązkowe i nic nie stoi w karcie pracownika.
- **Bez preferowanej liczby godzin** („mniej / tyle co zwykle / więcej”) — na
  razie nie robimy.
- Do strony „Dyspozycja” przechodzą: dostępność, niedostępność i urlop. „Wolne”
  znika ze „Zgłoś”.
- **Grafik ważniejszy niż dyspozycja.** Dopóki na dany dzień nie ma
  opublikowanej zmiany tej osoby, jej „Nie mogę” wiąże kierownika. Dzień bez
  zaznaczenia jest wolny do planowania. Gdy zmiana jest już opublikowana, nowa
  dyspozycja na ten dzień to tylko prośba do kierownika (D4).
- **Termin** (dzień miesiąca w ustawieniach lokalu, D5) to przypomnienie i
  kontrola dla pracowników, NIE blokada.
- **„Zapytaj”** (D3): zawsze jeden dzień i jedna zmiana, jedno pytanie naraz.
  Po „Mogę” zmiana od razu trafia do grafiku (bez osobnej publikacji). Prośba
  bez odpowiedzi wygasa 24 h przed zmianą, bez osobnego powiadomienia.
- Kierownik dostaje powiadomienie **tylko przy konflikcie**. Bez liczników
  „9 z 12 wysłało” i bez napisów „nie podał(a) dyspozycji”.
- Przypomnienia o terminie (D5) — tylko do osób, które wysyłały dyspozycję w
  ostatnich trzech miesiącach.
- Poziom: klucz = **nazwa** stanowiska, kolumna jawna w `users_widok`, brak =
  „nieustawiony”.

## D2 — jak to działa

**Dane** (migracja `0048`):

- `dyspozycja` — wiersz na (osoba, dzień): `stan` = `moge` / `godziny` / `nie`,
  `od1–do1`, `od2–do2`, `notatka`, `autor` (`pracownik` / `kierownik`,
  ustawia trigger).
- `dyspozycja_miesiace` — (osoba, miesiąc): `wyslano_at`, `pozostale`.

**Kiedy wiąże** (`wiazeDyspozycja` w `src/utils/dyspozycja.ts`):

- wpis kierownika — zawsze;
- wpis pracownika — gdy jego miesiąc jest wysłany. Przed wysłaniem to szkic:
  zapisany w bazie, ale Grafik go nie bierze pod uwagę.

**Co blokuje** (`przeszkodaDyspozycji`): wiążące „Nie mogę” albo godziny
zmiany spoza „Mogę w godzinach”. Zmiana przez północ sprawdza też poranną część
następnego dnia. Koniec 00:00 w dyspozycji = północ.

**Gdzie blokuje:**

- `przeszkodaDnia` w Grafiku — panel przypisania (kandydat wyłączony z powodem)
  i „Powtórz w dniach”;
- kopiowanie tygodnia i przepisanie zmian na następcę — przez
  `przeszkodaDodatkowa`, podawaną z zewnątrz, bo `utils/grafik.ts` nie może
  importować `utils/dyspozycja.ts` (cykl);
- giełda — `mozeWziac`, `kandydaciNaZmiane`, `zmianyDoZamiany`,
  `offersForUser`, `odbiorcyGieldy`, `acceptSwap` (opcja `dysp`).

⚠️ **Poprawka ISTNIEJĄCEJ zmiany tej samej osoby w ten sam dzień nie podlega
blokadzie.** Konflikt z dyspozycją wpisaną później rozstrzyga D4. Blokada
uniemożliwiłaby nawet przesunięcie godziny.

**Ekran pracownika** (`src/components/DyspozycjaEkran.tsx`, w ramie z
`employeeSessionShared.tsx`):

- Domyślnie następny miesiąc; zakres od bieżącego miesiąca do +3.
- Zapis od razu, po każdym arkuszu — przed wysłaniem też (tablet gubi wi-fi).
- Dzień z opublikowaną zmianą: kłódka, bez edycji (komunikat: grafik
  obowiązuje). Dni minione — wyłączone.
- Urlop (tylko umowa o pracę — `moznaUrlop`): wniosek w `absences` na każdy
  ciągły zakres. Dyspozycja tych dni jest zdejmowana.
- „Pozostałe dni: Nie mogę” dopisuje „nie” w dniach od dziś, bez zaznaczenia,
  bez urlopu i bez opublikowanej zmiany (`dniPozostale`).

**RLS:** jedna polityka na polecenie, `ludzie_mojej_dyspozycji()` = ja +
(kierownik albo tablet) `moi_ludzie()`; właściciel wszystko. Kierownik nie
zmieni ani nie usunie wpisu pracownika — trigger `dyspozycja_autor` rzuca
wyjątek, także z pominięciem aplikacji.

**Sprawdziany:**

- `harness-dyspozycja.html` — arytmetyka, zapis na atrapie, giełda,
  kopiowanie, przepisanie;
- `harness-kiosk.html` — pełny przebieg ekranu;
- `harness-panel.html` — kandydat wyłączony w panelu przypisania;
- `harness-demo.html` — kolumny generatora.

## D3 — „Zapytaj”

**Dane** (migracja `0049`): `prosby_o_zmiane` — osoba, lokal, stanowisko,
dzień, godziny, `status` (`czeka` / `zgoda` / `odmowa` / `wycofana`),
`wygasa_at`, kto pyta, powód odmowy, `grafik_shift_id` po zgodzie. Logika:
`src/utils/prosby.ts` (jedyne miejsce, które pyta, wycofuje i odpowiada).

- **Prośba to NIE wiersz `grafik_shifts`** (ta sama zasada co płatne
  wydarzenia). Nie liczy się do obsady, publikacji ani giełdy.
- **Odpowiedź tylko przez RPC `odpowiedz_na_prosbe`** (security definer):
  sprawdza, kto odpowiada (sama osoba albo tablet jej lokalu), czy prośba
  czeka i nie wygasła, czy godziny nie nachodzą na inną zmianę. Przy zgodzie
  wstawia zmianę od razu OPUBLIKOWANĄ, a przy obu odpowiedziach — wiadomość
  dla kierownika lokalu (`notifications`, audience `manager`, typ
  `dyspozycja`; maili kierownik nie dostaje — raport dnia).
- **Wygasa 24 h przed zmianą**; gdy do zmiany zostało mniej, godzinę przed
  startem; za mniej niż godzinę pytać się nie da (`wygasaDla`). Wygasła
  prośba w siatce: „brak odpowiedzi”. Bez osobnego powiadomienia (decyzja 4).
- **Jedno pytanie naraz** o tę samą zmianę (`czekajacaNaZmiane`: lokal, dzień,
  stanowisko, nachodzące godziny) — pilnuje panel, nie baza.
- **„Zapytaj” tylko przy nowej zmianie na jeden dzień** (panel przypisania,
  grupa „Niedostępni wg dyspozycji”); pozostałe przeszkody (urlop, kolizja,
  koniec pracy) dalej po prostu blokują.
- **Kierownik widzi skutek bez przeładowania**: App w pollu (45 s) pobiera
  `prosby_o_zmiane` i dociąga z `grafik_shifts` zmiany powstałe po „Mogę”
  (`grafik_shifts` nie jest w pollu).
- Zdania wiadomości (`tekstProsby`, `tekstWycofania`) rozpoznają
  `opisWiadomosci` i `api/_lib/wiadomosci.js`, kopię ma generator demo.
  Link `?otworz=dyspozycja` (i `wolne`) prowadzi na ekran Dyspozycji.

**Sprawdziany:** `harness-dyspozycja.html` (wygasanie, siatka, jedno
pytanie naraz, zapis), `harness-kiosk.html` (karta na Pulpicie, „Mogę” przez
RPC i zmiana w grafiku, „Nie mogę” z powodem), `harness-panel.html` (grupa
„tylko Zapytaj”, potwierdzenie, zapis prośby, „zapytano” i „czeka na zgodę”),
`harness-email.html` (dwa maile).

## D4 — krok 1: jedno „Nie może” (0.81.0, migracja `0050`)

Decyzja właściciela (22.10.2026): stara „niedostępność” (`absences.type =
'niedostepnosc'`) i „Nie mogę” z Dyspozycji to TO SAMO.

- **Kierownik wpisuje „Nie może” do `dyspozycja`** (panel zmiany → „Wolne /
  urlop” → „Nie może”, `wpiszNieMogeZaPracownika`), nie do `absences`. Wpis
  kierownika wiąże od razu. Dni, które pracownik zaznaczył SAM, zostają bez
  zmian (trigger i tak by ich nie przepuścił); jego własne „nie” też nie jest
  nadpisywane. Dawne `addNiedostepnoscDirectly` usunięte.
- **Stara niedostępność daje „Zapytaj”** — `przeszkodaDnia` zwraca dla niej
  `dyspozycja: true`, więc kandydat trafia do grupy „tylko Zapytaj”, a nie jest
  po prostu wyłączony. Urlop dalej blokuje bez pytania.
- **W kalendarzu pracownika** stara niedostępność stoi jako „Nie mogę” z „K”
  (`niedostepnoscNa`), tylko do odczytu; „Pozostałe dni” jej nie nadpisuje, a
  podsumowanie liczy ją jako „nie mogę”.
- **Migracja `0050`** przepisuje PRZYSZŁE dni zatwierdzonych niedostępności do
  `dyspozycja` jako wpis kierownika (`on conflict do nothing` — wpis
  pracownika wygrywa). Wiersze `absences` zostają jako historia i dalej
  blokują; aplikacja traktuje je tak samo jak „Nie mogę”.
- Wiadomość: „Kierownik wpisał Ci w dyspozycji „Nie mogę”: …” (typ
  `dyspozycja`) — rozpoznają ją `opisWiadomosci` i `api/_lib/wiadomosci.js`.
- ⚠️ Zostaje świadomie: `scripts/import-grafik.py` dalej zakłada
  `absences.niedostepnosc` dla URP bez godzin — działa to tak samo jak „Nie
  mogę”, ale przy następnej zmianie tego skryptu warto przepiąć go na
  `dyspozycja`.

## D4 — konflikty z grafikiem (0.82.0, migracja `0051`)

**Prośba o zwolnienie ze zmiany.** Pracownik dotyka w Dyspozycji dnia, na
który ma OPUBLIKOWANĄ zmianę → arkusz z powodem → `poprosOZwolnienie`: wpis
„nie” z `zwolnienie_z` = id zmiany + wiadomość dla kierownika lokalu zmiany.
Zmiana zostaje w grafiku.

- **Jawna kolumna, nie „wpis nowszy niż `published_at`”** — ponowna
  publikacja poprawionej zmiany przestawia `published_at` i prośba znikałaby,
  zanim ktoś ją zobaczył.
- **Kolejka jest LICZONA** (`prosbyOZwolnienie`): otwarta prośba, zmiana
  istnieje (bez `deleted_at`) i jest od dziś w przód. Liczy ją ta sama funkcja
  w trzech miejscach: karta w `ZatwierdzanieZmian` (grupa „zwolnienie”),
  `shellBadges.zatwierdzanie` i `sprawy` w `PulpitHome`. W kratce Grafiku
  „prosi o zwolnienie”.
- **Bez zatwierdzania hurtem** (`tak: null`) — zdjęcie robi dziurę w obsadzie.
- **`rozstrzygnijZwolnienie`**: przy „Zdejmij” NAJPIERW kasuje zmianę (od razu,
  bez `deleted_at` — pracownik dostaje wiadomość teraz, publikacja
  powiedziałaby mu to drugi raz), potem ślad decyzji
  (`rozstrzygnieto_at/rozstrzygnal/rozstrzygniecie`). Oferty z giełdy wycofuje
  komponent (`wycofajOfertyDlaZmian`, cykl importów). Wiadomości: „Kierownik
  zdjął / zostawił Twoją zmianę…”.
- Trigger `dyspozycja_autor` pozwala kierownikowi zmienić w cudzym wpisie
  WYŁĄCZNIE pola rozstrzygnięcia; zmiana treści przez pracownika czyści ślad.
- Pracownik widzi prośbę w „Moich wnioskach” (czeka / zostaje / zdjęta) i
  może ją wycofać (kasuje wpis dnia).

**Konflikt z wersją roboczą** (`konfliktySzkicu`): zmiana NIGDY niewysłana
(bez `published_at`) wbrew wiążącej dyspozycji. W kratce: „X: nie może
(zgłoszone dd.mm)” z „Zdejmij” (6 s „Cofnij”) i „Zapytaj” (prośba o tę samą
zmianę, szkic znika od razu). Po zapisie / wysłaniu dyspozycji przez
pracownika kierownik dostaje wiadomość „Konflikt z wersją roboczą grafiku:
…” — tylko o NOWYM konflikcie (`noweKonfliktySzkicu`).

**„Zapytaj” po zmianie godzin.** Gdy wybrana w panelu osoba ma jedyną
przeszkodę w dyspozycji (np. godziny wyszły poza „Mogę w godzinach” PO
wyborze), główny przycisk to „Zapytaj: X”. Do 0.81.0 zapis kończył się oknem
blokady z „Napisz do pracownika” i wiadomością „Kierownik próbował wpisać Ci
zmianę…”, na którą nie dało się odpowiedzieć. Przy przeszkodzie z dyspozycji
okno blokady (edycja zmiany) nie ma już „Napisz do pracownika”.

**Dyspozycja w karcie pracownika** (`manager/DyspozycjaKarta.tsx`, sekcja
„Dyspozycja” w Pracownicy): kalendarz miesiąca (bieżący do +3), „wysłał(a)
dd.mm” i „ostatnio zmienił(a)”. Kierownik ustawia dzień pusty albo wpisany
przez siebie (`ustawDzienZaPracownika`); dzień pracownika — tylko odczyt.
Wiadomość: „Kierownik wpisał Ci w dyspozycji „…”: dd.mm.” / „Kierownik usunął
wpis z Twojej dyspozycji: dd.mm.”.

⚠️ **Kolejność:** `0051` PRZED deployem 0.82.0 (nowe kolumny + podmiana
funkcji triggera; stary front ich nie dotyka).

⚠️ Raport kierownika mailem (`api/_lib/raport.js`) nie liczy próśb o
zwolnienie w „Wymaga decyzji” — tak jak nie liczy wydarzeń do rozliczenia.

**Sprawdziany:** `harness-dyspozycja.html` (kolejka, rozstrzygnięcie,
konflikty, karta), `harness-panel.html` (karta w „Do decyzji”, znacznik w
kratce, „Zapytaj” po zmianie godzin, sekcja w karcie), `harness-kiosk.html`
(arkusz prośby, „Moje wnioski”, wycofanie), `harness-email.html` (maile),
`harness-demo.html` (jedna prośba w demo).
