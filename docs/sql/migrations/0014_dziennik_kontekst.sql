-- Kontekst dnia i powód odchylenia utargu.
--
-- 1. Utarg bez wyjaśnienia jest liczbą, z której nic nie wynika. Sobota niżej
--    o 30% znaczy co innego, gdy lało, co innego przy awarii pieca, a jeszcze
--    co innego, gdy zabrakło ludzi. Powód wpisany raz, w chwili gdy kierownik
--    jeszcze pamięta, jest wart więcej niż analiza robiona pół roku później.
--    Zamknięta lista powodów (nie wolny tekst), bo po tym będziemy filtrować.
-- 2. Dzień wypłaty wpływa na ruch w gastronomii na tyle, że warto go znać przy
--    porównywaniu dni. Trzymamy go per lokal, bo sieci potrafią mieć różne
--    terminy; święta liczy utils/kalendarz.ts, tego nie zapisujemy nigdzie.

alter table day_logs add column obrot_powod text;      -- 'pogoda'|'wydarzenie'|'akcja'|'personel'|'inne'
alter table day_logs add column obrot_komentarz text;

alter table lokale add column dzien_wyplaty int;       -- dzień miesiąca, NULL = 10

-- weryfikacja
select table_name, column_name
from information_schema.columns
where (table_name = 'day_logs' and column_name in ('obrot_powod', 'obrot_komentarz'))
   or (table_name = 'lokale' and column_name = 'dzien_wyplaty')
order by table_name, column_name;
