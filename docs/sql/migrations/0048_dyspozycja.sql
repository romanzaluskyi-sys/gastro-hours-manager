-- 0048 — Dyspozycja: kiedy pracownik może, a kiedy nie może pracować (0.79.0)
--
-- Pracownik zaznacza w kalendarzu dni: „Mogę cały dzień”, „Mogę w godzinach”
-- (do dwóch przedziałów) albo „Nie mogę”. Urlop NIE jest tutaj — dalej idzie
-- wnioskiem do `absences`, bo wymaga zgody kierownika i daje godziny.
--
-- Dwie tabele:
--   * `dyspozycja`          — jeden wiersz na (osoba, dzień). Brak wiersza =
--                             dzień bez zaznaczenia, wolny do planowania.
--   * `dyspozycja_miesiace` — „Wysłano 14.10” i wybór „Pozostałe dni”. Dopóki
--                             miesiąca nie wysłano, jego wiersze są SZKICEM:
--                             kierownik ich nie bierze pod uwagę (patrz
--                             `wiazeDyspozycja` w src/utils/dyspozycja.ts).
--
-- Kto widzi i kto pisze (ta sama reguła na select/insert/update/delete):
--   * każdy — swoje wiersze;
--   * Tablet Służbowy i kierownik — wiersze swoich ludzi (`moi_ludzie()`):
--     tablet, bo dyspozycję wypełnia się także na wspólnym urządzeniu (decyzja
--     właściciela: dla wszystkich, bez PIN-u); kierownik, bo wpisuje ją w
--     imieniu osoby, która powiedziała mu to osobiście;
--   * właściciel — wszystkie.
--
-- ⚠️ `autor` ustawia TRIGGER, nie przeglądarka: zapis kierownika o kimś innym
-- = 'kierownik', każdy inny (pracownik, tablet) = 'pracownik'. Wiersza, który
-- wpisał pracownik, kierownik NIE zmieni i nie usunie, także z pominięciem
-- aplikacji — jedyna droga to „Zapytaj” o jeden dzień w Grafiku. Klucz
-- serwisowy (crony, reset demo, skrypty) nie ma `auth.uid()` i przechodzi.
--
-- Kolejność dowolna: same nowe tabele. Stary bundle ich nie zna.

create table if not exists dyspozycja (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_name text,
  date date not null,
  stan text not null check (stan in ('moge', 'godziny', 'nie')),
  od1 time,
  do1 time,
  od2 time,
  do2 time,
  notatka text,
  autor text not null default 'pracownik' check (autor in ('pracownik', 'kierownik')),
  autor_name text,
  zmieniono_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dyspozycja_osoba_dzien unique (user_id, date),
  constraint dyspozycja_godziny check (stan <> 'godziny' or (od1 is not null and do1 is not null)),
  constraint dyspozycja_drugi_przedzial check ((od2 is null) = (do2 is null))
);
create index if not exists dyspozycja_dzien on dyspozycja (date);

create table if not exists dyspozycja_miesiace (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  miesiac date not null check (extract(day from miesiac) = 1),
  wyslano_at timestamptz,
  wyslal_name text,
  pozostale text check (pozostale in ('bez', 'nie')),
  created_at timestamptz not null default now(),
  constraint dyspozycja_miesiace_osoba unique (user_id, miesiac)
);

-- Czyją dyspozycję wolno mi czytać i zmieniać. Tablica, a nie warunek na
-- wiersz — w polityce liczy się RAZ (InitPlan), patrz CLAUDE.md.
create or replace function public.ludzie_mojej_dyspozycji()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select array_remove(
    array[(select public.moje_id())]
      || case
           when (select public.jest_kierownikiem())
             or coalesce((select public.moja_rola()), '') = 'kiosk'
           then (select public.moi_ludzie())
           else '{}'::uuid[]
         end,
    null
  );
$fn$;

alter table dyspozycja enable row level security;
alter table dyspozycja_miesiace enable row level security;

-- Polityki enumerujemy z pg_policies — nigdy z pamięci (CLAUDE.md, 0032).
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('dyspozycja', 'dyspozycja_miesiace')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

create policy "dyspozycja_odczyt" on public.dyspozycja
  for select to authenticated
  using ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));
create policy "dyspozycja_dodanie" on public.dyspozycja
  for insert to authenticated
  with check ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));
create policy "dyspozycja_zmiana" on public.dyspozycja
  for update to authenticated
  using ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]))
  with check ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));
create policy "dyspozycja_usuniecie" on public.dyspozycja
  for delete to authenticated
  using ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));

create policy "dyspozycja_miesiace_odczyt" on public.dyspozycja_miesiace
  for select to authenticated
  using ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));
create policy "dyspozycja_miesiace_dodanie" on public.dyspozycja_miesiace
  for insert to authenticated
  with check ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));
create policy "dyspozycja_miesiace_zmiana" on public.dyspozycja_miesiace
  for update to authenticated
  using ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]))
  with check ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));
create policy "dyspozycja_miesiace_usuniecie" on public.dyspozycja_miesiace
  for delete to authenticated
  using ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));

grant select, insert, update, delete on public.dyspozycja to authenticated;
grant select, insert, update, delete on public.dyspozycja_miesiace to authenticated;
revoke all on public.dyspozycja from anon;
revoke all on public.dyspozycja_miesiace from anon;

-- Autor wpisu i ochrona wpisów pracownika przed kierownikiem.
create or replace function public.dyspozycja_autor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ja uuid;
  kierownik boolean;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  ja := public.moje_id();
  kierownik := public.jest_kierownikiem();

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
  return new;
end;
$$;

drop trigger if exists dyspozycja_autor on public.dyspozycja;
create trigger dyspozycja_autor
  before insert or update or delete on public.dyspozycja
  for each row execute function public.dyspozycja_autor();

-- Sprawdzenie: po cztery polityki na tabelę (jedna na polecenie).
select tablename, count(*) as polityk
from pg_policies
where schemaname = 'public' and tablename in ('dyspozycja', 'dyspozycja_miesiace')
group by tablename
order by tablename;
