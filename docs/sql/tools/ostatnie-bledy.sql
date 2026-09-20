-- Co się ostatnio wywaliło w aplikacji (tabela app_errors, migracja 0024).
-- Wklej do Supabase → SQL Editor.

-- 1. Ostatnie 50 błędów, od najnowszego.
select
  to_char(created_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI') as kiedy,
  app_version as wersja,
  typ,
  ekran,
  user_name as kto,
  lokal,
  left(komunikat, 120) as komunikat
from app_errors
order by created_at desc
limit 50;

-- 2. Co się powtarza — to jest właściwe pytanie, nie "co było ostatnie".
--    Błąd, który zdarzył się raz, zwykle był jednorazowy; ten, który wraca
--    codziennie u trzech osób, jest usterką.
select
  left(komunikat, 120) as komunikat,
  count(*)                        as ile,
  count(distinct user_name)       as u_ilu_osob,
  min(app_version)                as od_wersji,
  max(created_at) at time zone 'Europe/Warsaw' as ostatnio
from app_errors
where created_at > now() - interval '30 days'
group by 1
order by ile desc
limit 20;

-- 3. Pełny ślad jednego błędu (podstaw id z zapytania 1).
-- select * from app_errors where id = '...';

-- 4. Sprzątanie: dziennik błędów nie jest archiwum, trzymanie go bez końca
--    nie ma sensu. Puszczaj raz na jakiś czas.
-- delete from app_errors where created_at < now() - interval '90 days';
