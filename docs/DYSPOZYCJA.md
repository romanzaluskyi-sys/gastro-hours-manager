# Dyspozycja i poziomy na stanowisku

Specyfikacja funkcji przed 1.0. Makieta właściciela (22.10.2026):
<https://claude.ai/artifact/UmPJ6vv1MgLmFjwzjrbmc7> (zakładki „Pracownik”,
„Kierownik”, „Pytania otwarte”).

Wdrażane etapami. Każdy etap jest osobnym PR-em z Preview:

| Etap | Co | Wersja | Migracja | Stan |
|---|---|---|---|---|
| D1 | poziom 1·2·3 na stanowisku | 0.78.0 | `0047` | zrobione |
| D2 | strona „Dyspozycja” + blokada w Grafiku, giełdzie, kopiowaniu i przepisaniu | 0.79.0 | `0048` | zrobione |
| D3 | „Zapytaj” o jeden dzień (prośba kierownika, „Mogę / Nie mogę”) | — | — | do zrobienia |
| D4 | konflikt z wersją roboczą, „Prośba o zwolnienie ze zmiany” w „Do decyzji”, dyspozycja w karcie pracownika | — | — | do zrobienia |
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
