# Migracje

Jeden uporządkowany katalog. Numer w nazwie to kolejność, nazwa nigdy się
nie zmienia po zastosowaniu, treść pliku **nigdy** nie jest edytowana po
zastosowaniu — poprawka to nowa migracja z kolejnym numerem.

```bash
python3 scripts/migrate.py --projekt <REF>              # plan, nic nie zmienia
python3 scripts/migrate.py --projekt <REF> --wykonaj    # zapis WSZYSTKIEGO, co czeka
python3 scripts/migrate.py --projekt <REF> --do 0029 --wykonaj   # zapis do 0029 włącznie
```

⚠️ **`--wykonaj` bez `--do` stosuje WSZYSTKIE czekające migracje naraz.** Gdy
migracja jest związana z kolejnością wdrożenia — jedna przed deployem, druga po
nim (patrz `0029`/`0030`) — bez `--do` polecą obie i zostawią okno, w którym
aplikacja i baza mówią co innego. 22.09.2026 zdarzyło się dokładnie to: `0030`
poszła przy aplikacji w wersji 0.42.2, która czyta listę załogi wprost z
`users`, i ekran wyboru osoby na tablecie zrobił się pusty.

Runner trzyma stan w tabeli `schema_migrations` i pilnuje sumy kontrolnej
każdego zastosowanego pliku. Zmiana treści zastosowanej migracji zatrzymuje
go z błędem, zamiast pozwolić dwóm bazom rozjechać się po cichu.

## Dlaczego to powstało

Do 2026-09 schemat zmieniało się wklejaniem SQL-a do Supabase SQL Editor.
Przy jednej bazie to działało (choć raz już kosztowało cichy rollback całej
migracji — patrz błąd #12 w CLAUDE.md). Od modelu silo — osobny projekt
Supabase na każdego klienta — baz jest N i ręczne pilnowanie przestaje być
wykonalne.

## Stan katalogu

| Numery | Co | Status |
|---|---|---|
| `0000` | rejestr migracji | nowe |
| `0001`–`0004` | podstawowy schemat: `users`, `lokale`, `stanowiska`, `shifts`, `issues`, `notifications`, `shift_edits`, `tasks`, `task_completions`, `absences` | odtworzone ze zrzutu, **w produkcji już istnieją** |
| `0005`–`0009` | Grafik (przeniesione z `docs/sql/grafik-0X-*.sql`, treść bez zmian) | **w produkcji już zastosowane** |
| `0010` | Dziennik dnia ("Puls") | nowe |
| `0011` | wyrównanie RLS na pięciu najstarszych tabelach | nowe |
| `0012` | naprawa anonimowych zgłoszeń (`issues.user_name` NOT NULL) | nowe |
| `0013` | archiwum prognoz pogody (`weather_forecasts`) | nowe |
| `0014` | powód i komentarz do utargu, dzień wypłaty lokalu | nowe |
| `0015` | prawo kierownika zmiany do zamykania Pulsu (`users.puls_do`) | nowe |
| `0016` | umowa bezterminowa, ostatni dzień pracy, rozliczanie zmian bez odbicia | nowe |
| `0017` | `issues.shift_id` ON DELETE SET NULL — usuwanie zmiany ze zgłoszeniem | nowe |
| `0018` | typ umowy, wymiar etatu, wynagrodzenie miesięczne; okres rozliczeniowy i narzut na lokalu | nowe |
| `0019` | bloki zadań (`task_blocks`), pola pomiaru na zadaniu, `task_completions.entry_id` | nowe |
| `0020` | dni tygodnia na poziomie zadania wewnątrz bloku (`tasks.days_of_week` wraca do życia) | nowe |
| `0021` | giełda zmian: oddanie konkretnej osobie i zamiana zmianami (`shift_swaps.typ`, `target_*`, `wzajemna_shift_id`) | nowe |
| `0022` | budżet Grafiku: cel na dzień tygodnia (`grafik_budzet_cele`) i wyjątek na datę (`grafik_budzet_dni`) | nowe |
| `0023` | zmiany bez odbitego końca (`shifts.rozliczenie`, progi na `lokale`) i pracownik na próbę (`users.probny_status`) | nowe |
| `0024` | dziennik błędów aplikacji (`app_errors`) | nowe |
| `0025` | tożsamość w Supabase Auth (`users.auth_id`), helpery do polityk, `sprawdz_kiosk_pin` | nowe |
| `0026` | polityki bez anonima — klucz z przeglądarki przestaje otwierać bazę | nowe |
| `0027` | PIN blokady tabletu przestaje wychodzić z bazy (`users.ma_kiosk_pin`, poprawka `sprawdz_kiosk_pin`) | nowe |
| `0028` | sprzątnięcie ofert giełdy wskazujących na usunięte zmiany | nowe |
| `0029` | widok kartoteki bez stawek (`users_widok`) i `dodaj_probnego` — PRZED deployem 0.43.0 | nowe |
| `0030` | `users` wydaje tylko własny wiersz i kierownikom — PO deployu 0.43.0 i odświeżeniu tabletów | nowe |
| `0031` | dane lokalu zostają w lokalu: utargi, budżet, wymagania obsady, checklisty (Etap 3c-2, porcja 1) | nowe |
| `0032` | zdjęcie starych otwartych polityk, o których `0026` nie wiedziała (unieważniały `0031`) | nowe |
| `0033` | czyje to dane: wiadomości, zgłoszenia, wolne, giełda, wykonania i wiersze `users_widok` (Etap 3c-2, porcja 2) | nowe |
| `0034` | poprawka do `0033`: lokal wisi też na `allowed_lokale` (tablety wypadały z kartoteki) | nowe |

`0001`–`0004` odtworzono ze zrzutu prawdziwej bazy
(`docs/sql/tools/zrzut-schematu.sql`, 2026-09-07), a nie z opisu w
CLAUDE.md — ten opis rozjechał się z rzeczywistością w czterech miejscach
(patrz sekcja niżej).

## Rozjazdy między CLAUDE.md a bazą (stan na 2026-09-07)

Znalezione przy odtwarzaniu. W migracjach zapisany jest stan **faktyczny**.

- **RLS wyłączone** na `users`, `lokale`, `stanowiska`, `shifts`, `issues` —
  CLAUDE.md sugeruje, że wszystkie tabele mają otwartą politykę. Naprawia to `0011`.
- **`users.allowed_lokale` to `text`**, nie tablica — CLAUDE.md pisze
  `allowed_lokale[]`. Konwencja to lista po przecinku, jak `allowed_stanowiska`.
- **`users.default_stanowisko`**, nie `stanowisko` — tak nazywa się kolumna.
- **`issues.user_name` jest `NOT NULL`** — CLAUDE.md pisze, że przy
  `is_anonymous` jest `NULL`. Baza na to nie pozwoli.

## Pierwsze uruchomienie na istniejącej bazie

Produkcja ma już wszystko od `0001` do `0009`. Nie wolno puścić tego drugi
raz — trzeba tylko odnotować:

```bash
python3 scripts/migrate.py --projekt <REF> \
  --oznacz-zastosowane 0001 0002 0003 0004 0005 0006 0007 0008 0009 --wykonaj
```

Potem `0010` i `0011` pójdą już normalnie.
