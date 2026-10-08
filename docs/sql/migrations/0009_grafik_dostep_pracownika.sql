-- Dostęp pracownika do Tabletu Służbowego na PRYWATNYM telefonie.
--
-- Kierownik wybiera raz, na poziomie LOKALU, które bloki są dostępne dla
-- jego pracowników — nie osobno dla każdej osoby (ustalenie właściciela).
-- Prywatny telefon jest kopią Tabletu Służbowego: te same ekrany, bez
-- wyboru pracownika, bo konto to już jedna konkretna osoba.
--
-- Format: lista kluczy po przecinku, ta sama konwencja co allowed_lokale i
-- users.allowed_stanowiska (NIE tablica Postgresa):
--   WPISY, RAPORT, GRAFIK, ZADANIA, WIADOMOSCI, ZGLOS_PROBLEM, WOLNE
-- POPRAW_ZMIANE nie jest osobnym kluczem — chodzi z RAPORT, bo bez raportu
-- pracownik nie widzi, co właściwie poprawia.
--
-- NULL = wszystko dostępne (tak zachowują się wszystkie istniejące lokale,
-- więc migracja niczego nikomu nie zabiera).

-- ⚠️ `if not exists` dopisane 2026-10-08 — ten sam powód co w 0005: kolumna
-- jest już w 0001 (zrzut produkcji), więc na pustej bazie migracja padała.
alter table lokale add column if not exists dostepne_bloki text;

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'lokale' and column_name = 'dostepne_bloki';
