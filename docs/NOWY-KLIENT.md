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
| `SUPABASE_URL` | crony (`api/cron/*.js`) | jak wyżej |
| `SUPABASE_KEY` | crony | jak wyżej |
| `CRON_SECRET` | autoryzacja crona | losowy ciąg |

⚠️ **`REACT_APP_*` trafiają do bundla na etapie BUILDA.** Samo zapisanie
zmiennej nic nie zmienia w już zbudowanej paczce — po każdej zmianie zrób
redeploy.

⚠️ **Zmienne bez `REACT_APP_` (`SUPABASE_URL`, `SUPABASE_KEY`, `CRON_SECRET`)
są dla funkcji w `api/`** i czytają się w runtime. To dwa różne mechanizmy i
dlatego te same wartości trzeba wpisać dwa razy.

### Jak sprawdzić, że nie podłączyło się do cudzej bazy

`src/config.ts` ma **fallback na wartości pierwszego klienta** — bez niego
merge tej zmiany zgasiłby działającą produkcję. Fallback jest jednocześnie
pułapką: projekt bez ustawionych zmiennych po cichu czyta dane pierwszego
klienta.

Dlatego nazwa najemcy (`REACT_APP_TENANT`) stoi **na ekranie logowania pod
nazwą produktu i w panelu kierownika pod nazwiskiem**. Po pierwszym deployu
otwórz ekran logowania: jeśli widzisz tam nazwę starego klienta, zmiennych
nie ustawiono i aplikacja czyta cudzą bazę. To jedyny sygnał widoczny gołym
okiem — nie pomijaj tego sprawdzenia.

## 3. Google Apps Script (opcjonalnie)

Synchronizacja z arkuszem Google jest per klient: własna kopia
`Odbior_Danych.gs`, własny arkusz, własny deploy Web App, a jego URL wchodzi
do `REACT_APP_GOOGLE_SCRIPT_URL`. Klient, który nie miał wcześniej systemu na
arkuszach, tego w ogóle nie potrzebuje — zostaw zmienną pustą.

## 4. Dane startowe

W tej kolejności, bo każdy krok korzysta z poprzedniego:

1. **Lokale** (Pracownicy → Lokale) — nazwa, miasto (do pogody), dzień
   wypłaty, okres rozliczeniowy, narzuty.
2. **Stanowiska** (Pracownicy → Stanowiska) — nazwa, skrót (do siatki
   grafiku), kolor.
3. **Konto właściciela** — rola `admin`, e-mail + PIN.
4. **Pracownicy** — reszta załogi.
5. **Wymagania obsady** (Grafik → Konfiguracja) — bez nich kontrola obsady
   nie ma czego pilnować i każdy dzień wygląda na poprawny.
6. **Szablony wpisów Pulsu** (Puls → Konfiguracja, sekcja "Szybki start") —
   sześć typowych wpisów HACCP, każdy dodawany jednym kliknięciem. Sekcja
   znika, gdy wszystkie są już dodane.

## 5. Zanim wejdą prawdziwe dane

⚠️ **Umowa powierzenia przetwarzania danych (DPA) musi być podpisana ZANIM
dane osobowe pracowników klienta trafią do bazy**, nie po. Imiona, e-maile,
daty urodzenia, terminy sanepid i stawki to dane osobowe, a właściciel
repozytorium jest tu podmiotem przetwarzającym.
