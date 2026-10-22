-- 0051 — „Prośba o zwolnienie ze zmiany” (0.82.0)
--
-- Pracownik zaznacza „Nie mogę” na dzień, na który MA już opublikowaną zmianę.
-- Grafik obowiązuje — zmiana zostaje, a sprawa staje w „Do decyzji” u
-- kierownika: „Zostaw w grafiku” albo „Zdejmij zmianę”. Sama prośba to ten
-- wiersz `dyspozycja` z `zwolnienie_z` = id zmiany z grafiku (luźne odwołanie,
-- bez FK — jak `shift_swaps.grafik_shift_id`). Kolejka jest LICZONA
-- (`prosbyOZwolnienie` w src/utils/dyspozycja.ts), nie przechowywana osobno.
-- ⚠️ Świadomie jawna kolumna, a NIE „wpis nowszy niż published_at”:
-- ponowna publikacja poprawionej zmiany przestawia published_at i prośba
-- znikałaby z kolejki, zanim ktokolwiek ją zobaczył.
-- Ślad decyzji, żeby rozstrzygnięta sprawa nie wracała:
--   rozstrzygnieto_at / rozstrzygnal / rozstrzygniecie ('zostaje' | 'zdjeta').
-- Zmiana wpisu przez pracownika otwiera sprawę na nowo (trigger czyści ślad).
--
-- ⚠️ Trigger `dyspozycja_autor` (0048) nie pozwalał kierownikowi ruszyć wpisu
-- pracownika W OGÓLE. Od tej migracji wolno mu zmienić WYŁĄCZNIE trzy pola
-- rozstrzygnięcia — treść wpisu (stan, godziny, notatka, dzień, osoba), autor
-- i `zmieniono_at` zostają nietknięte, więc decyzja kierownika nie udaje
-- nowej dyspozycji pracownika.
--
-- ⚠️ Puść PRZED deployem 0.82.0 (same nowe kolumny + podmiana funkcji
-- triggera, stary front ich nie dotyka). Nowy front na bazie bez 0051 nie
-- zapisze prośby o zwolnienie (PostgREST odrzuci nieznaną kolumnę).

alter table dyspozycja add column if not exists zwolnienie_z text;
alter table dyspozycja add column if not exists rozstrzygnieto_at timestamptz;
alter table dyspozycja add column if not exists rozstrzygnal text;
alter table dyspozycja add column if not exists rozstrzygniecie text;

alter table dyspozycja drop constraint if exists dyspozycja_rozstrzygniecie;
alter table dyspozycja add constraint dyspozycja_rozstrzygniecie
  check (rozstrzygniecie is null or rozstrzygniecie in ('zostaje', 'zdjeta'));

create or replace function public.dyspozycja_autor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ja uuid;
  kierownik boolean;
  tylko_rozstrzygniecie boolean;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  ja := public.moje_id();
  kierownik := public.jest_kierownikiem();

  if tg_op = 'UPDATE' then
    tylko_rozstrzygniecie :=
      new.user_id is not distinct from old.user_id
      and new.date is not distinct from old.date
      and new.stan is not distinct from old.stan
      and new.od1 is not distinct from old.od1
      and new.do1 is not distinct from old.do1
      and new.od2 is not distinct from old.od2
      and new.do2 is not distinct from old.do2
      and new.notatka is not distinct from old.notatka
      and new.zwolnienie_z is not distinct from old.zwolnienie_z;
  else
    tylko_rozstrzygniecie := false;
  end if;

  -- Kierownik rozstrzyga prośbę o zwolnienie: zmieniają się same pola
  -- rozstrzygnięcia, reszta wiersza zostaje taka, jak ją wpisał pracownik.
  if tg_op = 'UPDATE' and kierownik and tylko_rozstrzygniecie then
    new.autor := old.autor;
    new.autor_name := old.autor_name;
    new.zmieniono_at := old.zmieniono_at;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and kierownik
     and old.user_id is distinct from ja
     and old.autor = 'pracownik' then
    raise exception 'Dyspozycję wpisaną przez pracownika zmienia tylko on. Kierownik może zapytać o jeden dzień w Grafiku.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.autor := case when kierownik and new.user_id is distinct from ja then 'kierownik' else 'pracownik' end;
  new.autor_name := (select name from users where id = ja);
  new.zmieniono_at := now();
  -- Nowa treść wpisu otwiera sprawę na nowo (poprzednie rozstrzygnięcie
  -- dotyczyło poprzedniej treści).
  if tg_op = 'UPDATE' and not tylko_rozstrzygniecie then
    new.rozstrzygnieto_at := null;
    new.rozstrzygnal := null;
    new.rozstrzygniecie := null;
  end if;
  return new;
end;
$$;

-- Sprawdzenie: cztery nowe kolumny.
select count(*) as kolumny_rozstrzygniecia
from information_schema.columns
where table_schema = 'public' and table_name = 'dyspozycja'
  and column_name in ('zwolnienie_z', 'rozstrzygnieto_at', 'rozstrzygnal', 'rozstrzygniecie');
