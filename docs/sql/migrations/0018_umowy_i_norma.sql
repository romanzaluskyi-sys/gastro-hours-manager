-- Typ umowy i norma miesięczna.
--
-- Dotąd cała wiedza o wynagrodzeniu mieściła się w dwóch kolumnach: `stawka`
-- (zł/h) i `etat` (tekst z zamkniętej listy). To za mało, bo dwie umowy
-- liczą się zupełnie inaczej:
--
--   zlecenie      — koszt = godziny × stawka. Każda godzina kosztuje.
--   umowa o pracę — koszt = suma miesięczna, niezależnie od tego, ile godzin
--                   człowiek faktycznie przepracował. Godziny mówią wtedy nie
--                   o koszcie, tylko o tym, czy lokal ten koszt wykorzystał.
--
-- `etat` mieszał te dwa światy (trzymał i wymiar, i typ umowy naraz) i był
-- wypełniony u 3 z 24 osób. Zastępujemy go rozdzielonymi polami; kolumna
-- zostaje w bazie nieużywana, żeby nie kasować danych, z których powstała
-- migracja poniżej.
--
-- `okres_rozliczeniowy` na lokalu, nie na pracowniku: to decyzja
-- organizacyjna właściciela, jednakowa dla wszystkich. Pole w każdej karcie
-- byłoby 24 kopiami tej samej wartości, które kiedyś rozjadą się po cichu.
--
-- `narzut_*` (ZUS i reszta obciążeń pracodawcy, w procentach) domyślnie
-- puste = 0. Dopóki właściciel go nie wpisze, nic się nie zmienia i nic nie
-- jest zmyślane; gdy wpisze, labour cost zaczyna pokazywać wydatek lokalu,
-- a nie samą wypłatę.

alter table users add column telefon text;
alter table users add column data_urodzenia date;
alter table users add column data_zatrudnienia date;
alter table users add column typ_umowy text;            -- 'umowa_o_prace' | 'zlecenie' | 'b2b' | 'inna'
alter table users add column wymiar_etatu numeric;      -- 1 | 0.75 | 0.5 ... — skaluje normę
alter table users add column wynagrodzenie_mies numeric;

alter table lokale add column okres_rozliczeniowy int;  -- miesiące, puste = 1
alter table lokale add column narzut_umowa numeric;     -- % ponad wynagrodzenie, puste = 0
alter table lokale add column narzut_zlecenie numeric;

-- Przeniesienie tego, co dziś siedzi w `etat`. "Część etatu" NIE dostaje
-- wymiaru: nikt nie zapisał którego, a zgadnięte 0,5 wyglądałoby jak fakt.
update users set typ_umowy = 'zlecenie'
 where typ_umowy is null and etat = 'zlecenie';
update users set typ_umowy = 'umowa_o_prace', wymiar_etatu = 1
 where typ_umowy is null and etat = 'pełny';
update users set typ_umowy = 'umowa_o_prace'
 where typ_umowy is null and etat = 'część';

-- weryfikacja
select table_name, column_name, data_type
from information_schema.columns
where (table_name = 'users'
       and column_name in ('telefon','data_urodzenia','data_zatrudnienia',
                           'typ_umowy','wymiar_etatu','wynagrodzenie_mies'))
   or (table_name = 'lokale'
       and column_name in ('okres_rozliczeniowy','narzut_umowa','narzut_zlecenie'))
order by table_name, column_name;
