# Uruchomienie nowego klienta (model silo)

Jedno repozytorium, N klientów. Każdy klient dostaje **własny projekt
Supabase** i **własny projekt Vercel**; różni ich wyłącznie konfiguracja w
zmiennych środowiskowych. Jeśli kiedykolwiek pojawi się pokusa, żeby coś
odróżniającego klientów wpisać do kodu — to jest moment, w którym "drugi
klient" zamienia się w "kopię repozytorium", a każda kolejna poprawka musi
być wklejana ręcznie w obie kopie.

## 1. Baza

1. Nowy projekt w Supabase (region: Frankfurt — najbliżej Polski).
2. Wygeneruj **publishable key** (`sb_publishable_...`), nie service role.
3. Zastosuj migracje od zera:

   ```bash
   python3 scripts/migrate.py --projekt <REF>              # plan, nic nie zmienia
   python3 scripts/migrate.py --projekt <REF> --wykonaj    # zapis
   ```

   ⚠️ **NIE** używaj `--oznacz-zastosowane` — ta flaga jest do baz, które już
   mają schemat sprzed runnera. Na pustej bazie oznaczyłaby migracje jako
   wykonane, nie wykonując ich.
4. Sprawdź, że przeszły wszystkie: tabela `schema_migrations` ma tyle wierszy,
   ile plików w `docs/sql/migrations/` (bez `README.md`).

## 2. Vercel

Nowy projekt z tego samego repozytorium. Zmienne w Project Settings →
Environment Variables:

| Zmienna | Do czego | Przykład |
|---|---|---|
| `REACT_APP_SUPABASE_URL` | front | `https://xxx.supabase.co` |
| `REACT_APP_SUPABASE_KEY` | front | `sb_publishable_...` |
| `REACT_APP_GOOGLE_SCRIPT_URL` | front, synchronizacja z arkuszem | URL Web App |
| `REACT_APP_TENANT` | nazwa klienta na ekranie logowania i w panelu | `Gastro Emka` |
| `REACT_APP_PRODUKT` | nazwa produktu | `Shiftro` |
| `SUPABASE_URL` | crony (`api/cron/*.js`) i `api/admin/ustaw-haslo.js` | jak wyżej |
| `SUPABASE_SERVICE_KEY` | crony (każdy zapis) i `ustaw-haslo.js` (hasło w Auth) | `sb_secret_...` |
| `SUPABASE_KEY` | tylko `ustaw-haslo.js` — sprawdza token wołającego | `sb_publishable_...` |
| `CRON_SECRET` | autoryzacja crona | losowy ciąg |

⚠️ **Crony czytają `SUPABASE_SERVICE_KEY`, NIE `SUPABASE_KEY`.** Do 0.41.x
chodziły kluczem publishable, czyli jako anonim; migracja `0026` zabrała
anonimowi wszystko, więc przeszły na klucz serwisowy. Ustawiony sam
`SUPABASE_KEY` daje pięć kronów zwracających 500 z nazwą brakującej zmiennej.

⚠️ **`SUPABASE_SERVICE_KEY` omija RLS i może wszystko.** Nigdy z przedrostkiem
`REACT_APP_` (trafiłby do paczki w przeglądarce), nigdy w repozytorium. Bez
niego nie działa żaden cron, a zmiana PIN-u w karcie pracownika nie zmieni
hasła do logowania (kierownik zobaczy o tym wyraźną wiadomość).

⚠️ **Ustaw każdą z nich dla WSZYSTKICH trzech środowisk** (Production,
Preview, Development). Ustawione tylko dla produkcji dają podgląd każdego PR-a
z ekranem „brak konfiguracji" — wygląda to na zepsuty kod, a zepsute są
ustawienia projektu.

⚠️ **`REACT_APP_*` trafiają do bundla na etapie BUILDA.** Samo zapisanie
zmiennej nic nie zmienia w już zbudowanej paczce — po każdej zmianie zrób
redeploy.

⚠️ **Zmienne bez `REACT_APP_` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`SUPABASE_KEY`, `CRON_SECRET`)
są dla funkcji w `api/`** i czytają się w runtime. To dwa różne mechanizmy i
dlatego te same wartości trzeba wpisać dwa razy.

### Co się stanie, jeśli zmiennych nie ustawisz

Nic złego i nic cichego — i to jest cały sens tego, jak to jest zrobione.

- **Aplikacja** pokaże ekran „wdrożenie nieskonfigurowane" z listą brakujących
  zmiennych zamiast ekranu logowania.
- **Crony** zwrócą 500 z nazwą brakującej zmiennej (widać to w Vercel →
  Deployments → Functions jako czerwony przebieg).

⚠️ Do 0.40.0 było inaczej: kod miał wpisany adres i klucz **pierwszego
klienta** jako wartość zapasową, więc nowe wdrożenie bez zmiennych po cichu
czytało i **zapisywało cudzą bazę**, wyglądając przy tym na sprawne. Tej
wartości zapasowej już nie ma — w `src/config.ts` ani w żadnym z kronów. Jeśli
kiedykolwiek pojawi się pomysł, żeby ją przywrócić „na wszelki wypadek", to
jest dokładnie ten wypadek, przed którym ma chronić jej brak.

### Sprawdzenie po pierwszym deployu

Nazwa najemcy (`REACT_APP_TENANT`) stoi **na ekranie logowania pod nazwą
produktu** i **w panelu kierownika pod nazwiskiem**. Otwórz ekran logowania i
sprawdź, czy stoi tam nazwa TEGO klienta. Nieustawiona zmienna wyświetli się
jako czerwone „⚠ brak REACT_APP_TENANT" — nie da się jej przeoczyć, ale nie
blokuje logowania (brak nazwy nie jest powodem, żeby zgasić aplikację).

Drugie sprawdzenie, jednorazowe: wywołaj ręcznie jednego crona z nagłówkiem
`Authorization: Bearer $CRON_SECRET` i zobacz, czy odpowiada 200, a nie 500.
Crony chodzą raz na dobę, więc bez tego o błędnej konfiguracji dowiesz się
dopiero następnego ranka.

## 3. Google Apps Script (opcjonalnie)

Synchronizacja z arkuszem Google jest per klient: własna kopia
`Odbior_Danych.gs`, własny arkusz, własny deploy Web App, a jego URL wchodzi
do `REACT_APP_GOOGLE_SCRIPT_URL`. Klient, który nie miał wcześniej systemu na
arkuszach, tego w ogóle nie potrzebuje — zostaw zmienną pustą.

## 4. Konto właściciela

Na pustej bazie nie ma kim się zalogować: logowanie idzie przez Supabase Auth,
a anonim nie może nic zapisać do `users` (migracja `0026`). Pierwsze konto
zakłada więc skrypt, a nie aplikacja:

```bash
export SUPABASE_SERVICE_KEY=sb_secret_...
python3 scripts/pierwszy-admin.py --url https://<REF>.supabase.co --imie "Imię Nazwisko" --email adres@klienta.pl
python3 scripts/pierwszy-admin.py --url https://<REF>.supabase.co --imie "Imię Nazwisko" --email adres@klienta.pl --wykonaj
```

Skrypt losuje 6-cyfrowy PIN i wypisuje go **raz** — przekaż go właścicielowi
bezpiecznym kanałem; zmieni go sam w swojej karcie. Jeśli w bazie jest już
aktywny admin, skrypt przerywa: to narzędzie do pustej bazy, nie do
dokładania kont. Kolejne konta (kierownicy, tablety, pracownicy) zakłada
właściciel w aplikacji — karta pracownika tworzy konto w Auth sama.

⚠️ `scripts/utworz-konta-auth.py` to NIE to samo: tamten dowiązuje konta do
wierszy, które już są w `users` (jednorazowa migracja pierwszego klienta na
Auth). Na pustej bazie nie zrobi nic.

## 5. Dane startowe

Zalogowany jako właściciel, w tej kolejności, bo każdy krok korzysta z
poprzedniego:

1. **Lokale** (Pracownicy → Lokale) — nazwa, miasto (do pogody), dzień
   wypłaty, okres rozliczeniowy, narzuty.
2. **Stanowiska** (Pracownicy → Stanowiska) — nazwa, skrót (do siatki
   grafiku), kolor.
3. **Pracownicy** — reszta załogi. Kierownicy i tablety dostają e-mail + PIN
   i od razu konto do logowania; pracownicy obsługiwani z tabletu nie
   potrzebują ani jednego, ani drugiego.
4. **Wymagania obsady** (Grafik → Konfiguracja) — bez nich kontrola obsady
   nie ma czego pilnować i każdy dzień wygląda na poprawny.
5. **Szablony wpisów Pulsu** (Puls → Konfiguracja, sekcja "Szybki start") —
   sześć typowych wpisów HACCP, każdy dodawany jednym kliknięciem. Sekcja
   znika, gdy wszystkie są już dodane.

## 6. Zanim wejdą prawdziwe dane

⚠️ **Umowa powierzenia przetwarzania danych (DPA) musi być podpisana ZANIM
dane osobowe pracowników klienta trafią do bazy**, nie po. Imiona, e-maile,
daty urodzenia, terminy sanepid i stawki to dane osobowe, a właściciel
repozytorium jest tu podmiotem przetwarzającym.
