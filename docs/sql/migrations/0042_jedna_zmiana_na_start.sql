-- Jedna osoba nie zaczyna dwóch zmian w tej samej chwili — unikalny indeks
-- `(user_id, start_time)` na `shifts` (0.73.0).
--
-- Po co: aplikacja pyta bazy tuż przed zapisem (`znajdzKolizjeWBazie`, 0.36.2 i
-- 0.40.0), ale dwa zapisy w tej samej chwili zdążą zapytać, zanim którykolwiek
-- wiersz wyląduje (08.09.2026: dwa wiersze 3,7 ms od siebie, Dawid z 20 h
-- zamiast 10). Indeks jest jedynym zamkiem, który przeżywa taki wyścig, i
-- działa także dla zapisów spoza aplikacji (import z Google Forms przyniósł
-- trzy z czterech znanych duplikatów). Pełny opis:
-- docs/DUPLIKATY-I-SWIEZOSC-DANYCH.md.
--
-- ⚠️ To DRUGA wymuszona unikalność w projekcie (pierwsza: `day_logs (lokal,
-- date)`), z tego samego powodu: dwa wiersze o jednym zdarzeniu to podwojone
-- godziny i nieprawdziwa suma. Żaden prawidłowy przypadek jej nie narusza —
-- zmiana dzielona ma dwa RÓŻNE starty, urlop materializuje się raz na dzień.
--
-- ⚠️ Wiersze bez `user_id` nie są objęte (NULL-e w indeksie unikalnym są
-- różne). Na 13.09.2026 takich wierszy było zero.
--
-- Kolejność (cała migracja to jedna transakcja — błąd cofa wszystko):
--   1. DOKŁADNE kopie (ta sama osoba, start, koniec, lokal, stanowisko, urlop)
--      kasujemy, zostawiając jeden wiersz: najpierw ten, do którego odwołuje
--      się zgłoszenie (`issues.shift_id`), potem najstarszy.
--   2. Gdy zostanie para różniąca się czymkolwiek poza tym — migracja się
--      PRZERYWA z listą. Którą wersję zostawić, decyduje człowiek; zgadywanie
--      byłoby podpisem pod czyjąś wypłatą.
--   3. Indeks.
--
-- Aplikacja tłumaczy naruszenie (kod 23505 z nazwą tego indeksu) na zdanie dla
-- człowieka — `opisBledu` w src/api/supabase.ts.

-- 1. Dokładne kopie.
with ranking as (
  select
    s.id,
    row_number() over (
      partition by s.user_id, s.start_time, s.end_time, s.lokal, s.stanowisko, coalesce(s.is_urlop, false)
      order by
        (exists (select 1 from issues i where i.shift_id = s.id)) desc,
        s.created_at asc nulls last,
        s.id::text asc
    ) as nr
  from shifts s
  where s.user_id is not null
)
delete from shifts
where id in (select id from ranking where nr > 1);

-- 2. To, czego nie da się rozstrzygnąć automatycznie.
do $$
declare
  lista text;
begin
  select string_agg(
           format('%s · %s · %s', coalesce(min_name, '?'), user_id, to_char(start_time at time zone 'Europe/Warsaw', 'YYYY-MM-DD HH24:MI')),
           E'\n'
         )
    into lista
  from (
    select user_id, start_time, min(user_name) as min_name
    from shifts
    where user_id is not null
    group by user_id, start_time
    having count(*) > 1
  ) d;
  if lista is not null then
    raise exception E'Ta sama osoba ma dwie RÓŻNE zmiany o tym samym starcie — usuń zbędną w Rejestrze godzin i uruchom migrację ponownie:\n%', lista;
  end if;
end $$;

-- 3. Indeks.
create unique index if not exists shifts_osoba_start_uniq on shifts (user_id, start_time);

-- Sprawdzenie (powinno zwrócić jeden wiersz):
-- select indexname from pg_indexes where tablename = 'shifts' and indexname = 'shifts_osoba_start_uniq';
