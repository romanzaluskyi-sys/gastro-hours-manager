-- Zrzut RZECZYWISTEGO schematu bazy — do odtworzenia migracji 0001–0004.
--
-- Tabele sprzed rejestru migracji (users, lokale, stanowiska, shifts, issues,
-- notifications, shift_edits, tasks, task_completions, absences) powstawały
-- klikaniem w Supabase Table Editor i nie mają nigdzie swojego SQL-a. Zanim
-- napiszemy je jako migracje, bierzemy prawdę z bazy, a nie z CLAUDE.md —
-- ten opis już raz mylił się co do typów (błędy #12/#13: shifts.id to uuid).
--
-- ⚠️ JEDNO zapytanie, nie cztery. Supabase SQL Editor pokazuje wynik tylko
-- OSTATNIEJ instrukcji z wklejonego bloku — rozbicie na osobne select-y
-- wygląda jakby zadziałało, a zwraca jedną czwartą danych.
--
-- JAK UŻYĆ: wklej całość, uruchom, skopiuj wynik, wklej z powrotem w rozmowie.
-- Nic nie zapisuje, tylko czyta.

select sekcja, tabela, poz, opis from (

  -- 1. kolumny
  select
    '1-kolumny'   as sekcja,
    c.table_name  as tabela,
    c.ordinal_position as poz,
    c.column_name
      || ' :: ' || c.data_type
      || case when c.character_maximum_length is not null
              then '(' || c.character_maximum_length || ')' else '' end
      || case when c.is_nullable = 'NO' then ' NOT NULL' else '' end
      || case when c.column_default is not null
              then ' DEFAULT ' || c.column_default else '' end as opis
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'

  union all

  -- 2. klucze główne, unikalności, indeksy
  select '2-indeksy', tablename, 0, indexdef
  from pg_indexes
  where schemaname = 'public'

  union all

  -- 3. polityki RLS
  select '3-polityki', tablename, 0,
         policyname || ' [' || cmd || '] using=' || coalesce(qual, '-')
         || ' check=' || coalesce(with_check, '-')
  from pg_policies
  where schemaname = 'public'

  union all

  -- 4. czy RLS w ogóle włączone (pięć najstarszych tabel nie ma polityk —
  --    sprawdzamy, czy to brak polityki, czy wyłączone RLS)
  select '4-rls', tablename, 0,
         case when rowsecurity then 'RLS włączone' else 'RLS WYŁĄCZONE' end
  from pg_tables
  where schemaname = 'public'

) z
order by sekcja, tabela, poz;
