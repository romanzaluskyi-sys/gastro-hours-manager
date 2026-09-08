# Migracje

Jeden uporządkowany katalog. Numer w nazwie to kolejność, nazwa nigdy się
nie zmienia po zastosowaniu, treść pliku **nigdy** nie jest edytowana po
zastosowaniu — poprawka to nowa migracja z kolejnym numerem.

```bash
python3 scripts/migrate.py --projekt <REF>            # plan, nic nie zmienia
python3 scripts/migrate.py --projekt <REF> --wykonaj  # zapis
```

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
