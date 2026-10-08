# Wersja demonstracyjna — demo.shiftro.pl (od 0.72.0)

Dla potencjalnych klientów: wchodzą na **demo.shiftro.pl**, wybierają rolę
jednym przyciskiem — **Panel kierownika**, **Tablet Służbowy**, **Telefon
pracownika** — i klikają wszystko, co chcą. To, co wpiszą w jednej roli,
widzą w pozostałych (na komputerze w kilku kartach, na telefonie osobno).

**Demo to zwykły klient** w modelu silo: własny projekt Supabase, własny
projekt Vercel, to samo repozytorium. Różni się trzema rzeczami, wszystkimi
włączanymi przez `nowy-klient.py --demo`:

| Co | Gdzie | Po co |
|---|---|---|
| `REACT_APP_DEMO=tak` | Vercel (front) | trzy przyciski zamiast formularza, zakładka „DEMO”, sesja osobna w każdej karcie |
| `DEMO=tak` | Vercel (funkcje) | pierwszy bezpiecznik resetu; blokada zmiany PIN-u kont demo w `ustaw-haslo.js` |
| `docs/sql/demo/demo.sql` | baza demo | znacznik `demo_znacznik()` (drugi bezpiecznik), `demo_wyczysc()`, ochrona kont demo |

## Pierwsze uruchomienie (≈ 20 min) — próba procesu „nowy klient”

To jest dokładnie ta sama ścieżka co u prawdziwego klienta
([`NOWY-KLIENT.md`](NOWY-KLIENT.md)), bez Brevo, DPA i importu danych.

0. **Kod demo musi być na `main`** — skrypt buduje produkcję z `main`, a reset
   (`api/cron/demo-reset.js`) jest częścią tej paczki.
1. **Supabase → New project**: nazwa `shiftro-demo`, region **Frankfurt
   (eu-central-1)**. Dane są wymyślone, więc wystarczy darmowa organizacja —
   darmowy projekt usypia się po tygodniu bez ruchu, ale nocny reset to ruch.
   Ref projektu = człon z `https://<REF>.supabase.co`.
2. Tokeny w terminalu:

   ```bash
   export SUPABASE_PAT=sbp_...   # Supabase → Account → Access Tokens
   export VERCEL_TOKEN=...       # Vercel → Account Settings → Tokens
   ```

3. Suchy przebieg — niczego nie zmienia, pokazuje plan:

   ```bash
   python3 scripts/nowy-klient.py --klient demo --demo --projekt <REF>
   ```

4. To samo z `--wykonaj`. Kolejno: projekt → klucze → Auth (bez rejestracji) →
   migracje → **funkcje demo w bazie (krok 4a)** → CRON_SECRET → projekt Vercel
   `shiftro-demo` → zmienne (z `DEMO` i `REACT_APP_DEMO`) → domena
   `demo.shiftro.pl` → deploy → **pierwszy reset (krok 10)** → sprawdzenie →
   wpis `"demo": true` w `klienci.json`.
5. **DNS**: jeśli skrypt powie, że domena czeka — u rejestratora `shiftro.pl`
   rekord `CNAME demo → cname.vercel-dns.com`. Do tego czasu demo działa pod
   `shiftro-demo.vercel.app`.
6. **Sprawdzenie** (niżej).

Przerwany przebieg uruchamia się tym samym poleceniem; po pierwszym razie
wystarczy `python3 scripts/nowy-klient.py --klient demo --wykonaj` — flaga demo
siedzi już w rejestrze i nie zgubi się przy kolejnym przebiegu.

## Sprawdzenie

- [ ] `demo.shiftro.pl` pokazuje trzy przyciski i podpis
      „Shiftro · wersja demonstracyjna · wersja X”.
- [ ] **Panel kierownika** → Pulpit: „Do zrobienia teraz” ma sprawy, „Do
      decyzji” ma korekty, wniosek o urlop, osobę na próbę, brak odbicia,
      zmianę bez końca i prośbę z giełdy.
- [ ] W drugiej karcie (**Otwórz w nowej karcie**) **Tablet Służbowy**: lista
      osób Bistro Lipowa, ktoś jest już na zmianie. Panel w pierwszej karcie
      dalej jest panelem (sesje nie mieszają się między kartami).
- [ ] Na telefonie **Telefon pracownika** (Marek): na Pulpicie dzisiejsza
      zmiana 16:00–22:00, w Grafiku oferta Julii na giełdzie.
- [ ] Marek zaczyna zmianę na telefonie → w panelu Aktywni / „Teraz na
      zmianie” pojawia się po odświeżeniu (poll co 45 s).
- [ ] Zakładka **DEMO** → „Przywróć dane demo” → po kilkunastu sekundach
      strona się przeładowuje z danymi od nowa.

## Co jest w danych (scenariusz prezentacji)

Generator: [`api/_lib/demoDane.js`](../api/_lib/demoDane.js). Wszystko liczy
się od dzisiejszej daty, więc demo zawsze wygląda „na żywo”.

- **Bistro Lipowa** (Kraków, 8–22) i **Pizzeria Port** (Gdańsk, 12–23),
  17 osób w załodze (umowa o pracę, zlecenie, B2B; w tym dwóch kierowników
  lokali), do tego właścicielka, dwa tablety i osoba na próbę. Iryna z
  Pizzerii we wtorki pracuje w Bistro.
- Godziny od 1. dnia poprzedniego miesiąca (Raporty i koszty mają cały
  zamknięty miesiąc), grafik dwa tygodnie w przód; ostatnie trzy dni to
  **szkic** do wysłania.
- **Do decyzji**: Julia prosi o +45 min, Zuzanna „zapomniała odbić” sobotę,
  Natalia chce urlopu, Szymon jest na próbie (dodany „z tabletu”, odbił start),
  wczoraj ktoś z kuchni nie odbił zmiany, trzy dni temu ktoś w Pizzerii nie
  odbił końca, Iryna przejęła zmianę Wiktorii i czeka na zgodę.
- **Skrzynka**: anonimowe zgłoszenie o zmywarce, prośba Oleny o rękawice.
- **Pracownicy**: Julii za 12 dni wygasa sanepid, Dmytro jest po terminie,
  Olena nie ma wpisanego terminu („Braki w danych”).
- **Puls**: zamknięte dni z utargiem; wczoraj w Bistro karta z kompletem
  wpisów („Zamknij” na Pulpicie), w Pizzerii pusta („Uzupełnij”); trzy dni
  temu lodówka 7,2 °C poza normą.
- **Zadania**: pięć bloków na lokal, ostatni tydzień prawie cały odhaczony,
  dziś rano w Bistro zrobione otwarcie.
- **Telefon (Marek)**: dzisiaj 16:00–22:00 do odbicia, nieprzeczytana
  wiadomość o grafiku, zmiana Julii na giełdzie do wzięcia.
- **Tablet**: profil Marka chroni PIN (ten sam co na ekranie wejścia) —
  pokazuje blokadę profilu.

## Jak to działa i o co łatwo się potknąć

- **Konta**: `kierownik@` (admin), `tablet@` (kiosk Bistro), `pracownik@`
  (Marek, rola `open` z `kiosk_pin`) w domenie `demo.shiftro.pl`, jeden PIN.
  Lista stoi w DWÓCH miejscach — [`api/_lib/demoKonta.js`](../api/_lib/demoKonta.js)
  i [`src/demo.ts`](../src/demo.ts) — oraz domena w `demo.sql`;
  `harness-demo.html` pilnuje, żeby się zgadzały. PIN jest publiczny z
  założenia.
- **Reset** (`api/cron/demo-reset.js`, cron `30 1 * * *` UTC ≈ 2:30/3:30 w
  Polsce, `maxDuration` 60 s): konta w Auth (założy brakujące, przywróci PIN
  tylko gdy logowanie nie przechodzi, skasuje konta założone przez
  odwiedzających) → `demo_wyczysc()` → zapis danych. ⚠️ Cron stoi w
  `vercel.json` WSZYSTKICH klientów; u nich kończy się na `DEMO≠tak` (200
  „pominięto”). Drugi bezpiecznik to `demo_znacznik()` w bazie — zmienną da
  się przekleić do złego projektu, funkcji w bazie klienta nie ma.
- `demo_wyczysc()` bierze listę tabel z `pg_tables` (poza
  `schema_migrations`, `weather_forecasts`, `app_errors`), więc nowa tabela z
  przyszłej migracji czyści się sama. **Ale generator jej nie wypełni** —
  dokładając funkcję, dopisz jej dane do `demoDane.js` i puść
  `harness-demo.html` (sprawdza każdą kolumnę z migracjami).
- **Ochrona kont** (trigger `demo_chron_konta`): odwiedzający jest
  właścicielem sieci i mógłby zmienić rolę, e-mail, PIN albo wyłączyć konto
  demo — wtedy przycisk przestałby działać wszystkim do nocy. Reszta pól
  karty (notatki, stawka…) zmienia się normalnie. Trigger działa tylko na
  zapisy z aplikacji, reset przechodzi.
- **Sesja w `sessionStorage`** (`api/auth.ts`) — osobna dla każdej karty, a
  wylogowanie z `scope=local`. Z domyślnym globalnym wylogowaniem jeden
  odwiedzający, który kliknął „Wróć do wyboru roli”, wylogowałby wszystkich
  korzystających z tego konta.
- **E-maile w demo nie wychodzą**: bez `BREVO_API_KEY`, bez pg_cron, a
  wiadomości z generatora mają `email_at` ustawione.
- **Demo jest wspólne** — dwie osoby naraz widzą swoje zmiany nawzajem.
  Przed ważną prezentacją: „Przywróć dane demo” w zakładce DEMO (tylko z konta
  Panel kierownika; najwyżej raz na minutę).
- Reset ręcznie z terminala:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://demo.shiftro.pl/api/cron/demo-reset
  ```

## Po wydaniu nowej wersji

Demo jest w `klienci.json`, więc `migrate.py --wszyscy` i `klienci.py sprawdz`
obejmują je same. Zmiana w `docs/sql/demo/demo.sql` wchodzi do bazy przy
ponownym `nowy-klient.py --klient demo --wykonaj` (krok 4a jest powtarzalny).
Zmiana w generatorze wchodzi z deployem — nowe dane pojawią się po najbliższym
resecie.
