-- =============================================================================
-- Wersja demonstracyjna (demo.shiftro.pl, 0.72.0) — TYLKO baza demo.
-- =============================================================================
-- ⚠️ To NIE jest migracja i NIE leży w docs/sql/migrations/. Migracje idą do
-- każdej bazy (`migrate.py --wszyscy`), a ten plik zawiera funkcję, która
-- czyści CAŁĄ bazę. Instaluje go wyłącznie `nowy-klient.py --demo`, w jednej
-- bazie. Powtarzalny (create or replace) — puszcza się go przy każdym przebiegu.
--
-- Trzy rzeczy:
--   1. `demo_znacznik()` — znacznik „to jest baza demo”. Reset
--      (api/cron/demo-reset.js) najpierw o niego pyta i bez niego NIC nie robi.
--      Zmienna DEMO=tak w Vercelu to za mało: zmienne ustawia się ręcznie i
--      da się je przekleić do złego projektu. Funkcji w bazie odwiedzający nie
--      założy (PostgREST nie wykonuje DDL), a w bazie klienta jej nie ma.
--   2. `demo_wyczysc()` — TRUNCATE wszystkich tabel w `public` poza listą.
--      Listę TABEL bierze z pg_tables, nie z pamięci (ta sama lekcja co przy
--      `0026`): nowa tabela z przyszłej migracji wyczyści się sama.
--   3. Ochrona trzech kont demo — odwiedzający jest właścicielem sieci i może
--      w karcie pracownika zmienić rolę, e-mail albo PIN. Jeden taki zapis
--      wyłączyłby przycisk logowania dla wszystkich do nocnego resetu.
--
-- ⚠️ Obie funkcje mają EXECUTE odebrane anonimowi i zalogowanym. Supabase
-- domyślnie daje je każdemu na nowej funkcji w `public` — bez `revoke` każdy
-- odwiedzający mógłby wyczyścić bazę jednym `rpc`.

create or replace function public.demo_znacznik()
returns text
language sql
immutable
as $$ select 'shiftro-demo'::text $$;

create or replace function public.demo_wyczysc()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lista text;
  ile integer;
begin
  select string_agg(format('public.%I', tablename), ', ' order by tablename), count(*)
    into lista, ile
    from pg_tables
   where schemaname = 'public'
     -- historia migracji, archiwum prognoz (zbierane latami, nie da się go
     -- odtworzyć) i dziennik błędów (żeby było widać, co psuło się w demo)
     and tablename not in ('schema_migrations', 'weather_forecasts', 'app_errors');
  if lista is null then
    return 0;
  end if;
  execute 'truncate table ' || lista || ' restart identity cascade';
  return ile;
end;
$$;

revoke all on function public.demo_znacznik() from public, anon, authenticated;
revoke all on function public.demo_wyczysc() from public, anon, authenticated;
grant execute on function public.demo_znacznik() to service_role;
grant execute on function public.demo_wyczysc() to service_role;

-- --- Ochrona kont demo -------------------------------------------------------
-- Działa TYLKO na zapisy z aplikacji (rola `authenticated`). Reset, crony i
-- funkcje `security definer` chodzą jako inna rola i przechodzą bez zmian.
-- ⚠️ Domena jest ta sama co w api/_lib/demoKonta.js i src/demo.ts.
-- ⚠️ Porównania z `nullif(…, '')`: karta pracownika zapisuje pusty PIN jako ''
-- (handleSaveUser), a baza mogła mieć NULL — bez tego zwykła zmiana notatki
-- byłaby odrzucana jako „zmiana PIN-u”.
create or replace function public.demo_chron_konta()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if lower(coalesce(old.email, '')) not like '%@demo.shiftro.pl' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception using
      message = 'To konto demonstracyjne — nie da się go usunąć. Dane demo wracają do stanu początkowego co noc.';
  end if;
  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.archived is distinct from old.archived
     or lower(trim(coalesce(new.email, ''))) is distinct from lower(trim(coalesce(old.email, '')))
     or nullif(new.pin, '') is distinct from nullif(old.pin, '')
     or nullif(new.kiosk_pin, '') is distinct from nullif(old.kiosk_pin, '')
     or new.auth_id is distinct from old.auth_id
     or nullif(new.ostatni_dzien::text, '') is distinct from nullif(old.ostatni_dzien::text, '')
  then
    raise exception using
      message = 'To konto demonstracyjne — rola, e-mail, PIN i aktywność są stałe, żeby każdy mógł się nim zalogować. Pozostałe pola możesz zmieniać.';
  end if;
  return new;
end;
$$;

drop trigger if exists demo_chron_konta on public.users;
create trigger demo_chron_konta
  before update or delete on public.users
  for each row execute function public.demo_chron_konta();
