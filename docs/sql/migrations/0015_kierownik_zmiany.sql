-- Prawo do zamykania Pulsu dla kierownika zmiany.
--
-- Kierownik lokalu nie zawsze jest na miejscu wieczorem, a dzień musi ktoś
-- zamknąć — inaczej utarg i temperatury wpisuje się nazajutrz z pamięci, czyli
-- zmyśla. Zamiast nowej roli (mamy ich już sześć i każda kolejna to sprawdzanie
-- uprawnień w kilkudziesięciu miejscach) dajemy PRAWO NA CZAS.
--
-- `puls_do` to ostatni dzień, w którym ta osoba może zamknąć Puls swojego
-- lokalu z Tabletu Służbowego. Kluczowa własność: prawo wygasa samo. Uprawnień,
-- które trzeba pamiętać odebrać, nikt nigdy nie odbiera.
--
-- Osoba z tym prawem widzi WYŁĄCZNIE dzisiejszą kartę i wyłącznie to, co sama
-- wpisuje: utarg, notatki, wpisy dnia, zdarzenia. Bez historii, bez tygodnia,
-- bez konfiguracji i — świadomie — bez kosztów pracy i stawek.

alter table users add column puls_do date;

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'users' and column_name = 'puls_do';
