-- Jak w tym lokalu wpisuje się godziny: sposób wpisu i okna tolerancji.
--
-- Do tej pory pracownik mógł wpisać na tablecie DOWOLNĄ godzinę startu i końca
-- — cztery godziny wstecz, jutro, cokolwiek. Właściciel chce, żeby lokal sam
-- decydował, na ile to wolno (ustalenia z 2026-09-24):
--
-- 1. `tryb_wpisu` — jak pracownik zapisuje zmianę:
--      'odbicie' — tylko osobno: "Rozpocznij" teraz, "Zakończ" potem;
--      'cala'    — tylko cała zmiana naraz (początek i koniec jednym zapisem);
--      NULL      — oba sposoby, czyli dokładnie to, co było do tej pory.
--
-- 2. `start_wstecz_min` / `koniec_wstecz_min` — o ile minut PO FAKCIE wolno
--    jeszcze wpisać początek / koniec. NULL = bez ograniczeń (jak dotąd),
--    0 = tylko "teraz". Gdy limit jest ustawiony, godziny w przyszłości
--    (ponad kilka minut zapasu) też przestają przechodzić — wpisanie z góry
--    całej zmiany, której jeszcze nie było, to dokładnie to, przed czym te
--    okna mają chronić.
--
--    ⚠️ Wpis POZA oknem nie przepada: aplikacja proponuje wysłanie go do
--    kierownika jako zwykłej korekty (`issues.type = 'correction'`), którą
--    kierownik zatwierdza w Zatwierdzaniu zmian. Okno decyduje o tym, co
--    pracownik może zapisać SAM, a nie o tym, co w ogóle da się zapisać.
--
-- 3. Kiedy zmianę można zamknąć W OGÓLE — to już jest: `tolerancja_po_grafiku_h`
--    i `max_dlugosc_zmiany_h` z 0023. Po tym progu zmiana przestaje być trwającą
--    i trafia do kierownika.
--
-- Wszystko NULL-owe i bez wartości domyślnej, więc ta migracja nie zmienia
-- niczego żadnemu lokalowi, dopóki właściciel sam czegoś nie ustawi.
--
-- ⚠️ Sprawdzanie okien siedzi w PRZEGLĄDARCE (utils/wpisy.ts). Dopóki `shifts`
-- ma otwarte polityki (Etap 3c-2 jeszcze tej tabeli nie objął), ktoś
-- technicznie sprawny może je obejść. Twardy zamek to trigger na `shifts` —
-- razem z jej zawężeniem, nie wcześniej.
--
-- Kolejność wdrożenia: TA MIGRACJA PRZED DEPLOYEM 0.45.0. Nowa karta lokalu
-- zapisuje te kolumny, a PostgREST odrzuca cały zapis z kolumną, której nie zna
-- — bez migracji "Zapisz" w karcie każdego lokalu kończyłby się błędem.

alter table lokale add column tryb_wpisu text
  check (tryb_wpisu is null or tryb_wpisu in ('odbicie', 'cala'));
alter table lokale add column start_wstecz_min integer
  check (start_wstecz_min is null or start_wstecz_min >= 0);
alter table lokale add column koniec_wstecz_min integer
  check (koniec_wstecz_min is null or koniec_wstecz_min >= 0);

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'lokale'
  and column_name in ('tryb_wpisu', 'start_wstecz_min', 'koniec_wstecz_min')
order by column_name;
