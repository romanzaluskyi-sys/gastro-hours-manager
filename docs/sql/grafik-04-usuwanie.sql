-- GRAFIK — migracja 4: usunięcie zmiany jako ZAREJESTROWANA zmiana grafiku.
--
-- Bez tego usunięcie było natychmiastowe i bezgłośne: wiersz znikał, więc
-- nie było czego wysłać, a pracownik nigdy się nie dowiadywał, że jego
-- zmiana zniknęła. Teraz usunięcie JUŻ WYSŁANEJ zmiany tylko ją oznacza
-- (deleted_at) — znika z grafiku od razu, ale czeka na "Wyślij grafik
-- pracownikom", które kasuje wiersz na dobre i informuje pracownika.
-- Zmiana nigdy niewysłana kasuje się od razu, bo nikt jej nie widział.

alter table grafik_shifts add column deleted_at timestamptz;

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'grafik_shifts' and column_name = 'deleted_at';
