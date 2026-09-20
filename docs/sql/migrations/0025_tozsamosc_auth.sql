-- Fundament pod prawdziwą autoryzację (Etap 3a planu infrastruktury).
--
-- ⚠️ Ta migracja NIE zmienia jeszcze żadnej polityki RLS i nie zmienia
-- zachowania aplikacji. Dokłada tożsamość i narzędzia, na których policyjki
-- staną w następnym kroku. Zawężanie dostępu przy jednoczesnym przepinaniu
-- logowania byłoby zmianą, której nie da się wycofać po kawałku — a po drugiej
-- stronie są cztery lokale, które muszą odbijać godziny jutro rano.
--
-- Stan wyjściowy, dla porządku: wszystkie polityki to `using (true)`, a PIN-y
-- porównuje przeglądarka po pobraniu CAŁEJ tabeli `users`. Klucz publishable
-- jedzie w paczce do każdego, kto otworzy stronę, więc dziś każdy, kto zna
-- adres, może odczytać i zapisać wszystko: stawki, daty urodzenia, PIN-y.
--
-- KTO SIĘ LOGUJE (stan na 2026-09-20, 29 aktywnych kont):
--   * 4 kierowników i 4 tablety  — e-mail + 6-cyfrowy `pin`
--   * 4 pracowników z telefonem  — e-mail + `kiosk_pin`
--   * pozostałych 17 pracowników NIE loguje się w ogóle — wybiera się ich z
--     listy na tablecie, który jest już zalogowany.
-- Dlatego kont w Supabase Auth będzie 12, nie 29. Tożsamością przy odbijaniu
-- zmiany na wspólnym tablecie jest TABLET (decyzja właściciela, 2026-09-20):
-- to odwzorowuje rzeczywistość — urządzenie stoi w lokalu pod fizyczną
-- kontrolą, a wpisywanie loginu przed każdym odbiciem zabiłoby sens kiosku.

alter table users add column if not exists auth_id uuid unique;

comment on column users.auth_id is
  'Powiązanie z auth.users. NULL = konto, którym nikt się nie loguje '
  '(pracownik obsługiwany z tabletu). Ustawia scripts/utworz-konta-auth.py.';

-- --------------------------------------------------------------------------
-- Helpery do polityk.
--
-- ⚠️ MUSZĄ być `security definer`. Polityka na tabeli `users`, która sama
-- czyta `users`, żeby sprawdzić rolę, zapętliłaby się w nieskończoność.
-- Funkcja z definerem omija RLS i przerywa to zapętlenie — to jest standardowy
-- wzorzec, a nie obejście.
--
-- ⚠️ `set search_path` na każdej z nich. Bez tego ktoś, kto może tworzyć
-- obiekty w swoim schemacie, podstawia własną tabelę `users` i funkcja z
-- prawami właściciela czyta jego dane zamiast naszych.
--
-- ⚠️ `stable`, nie `volatile` — inaczej Postgres woła funkcję RAZ NA WIERSZ
-- przy każdym zapytaniu z polityką. Przy `shifts` to dziesiątki tysięcy
-- wywołań na jedno wejście w Rejestr Godzin.
-- --------------------------------------------------------------------------

create or replace function public.moje_konto()
returns users
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.moja_rola()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from users where auth_id = auth.uid() limit 1;
$$;

-- Kto widzi WSZYSTKO. `admin` i `manager` (rola bez przypisania do lokalu —
-- istnieje w bazie obok `manager_lokalu`, patrz CLAUDE.md) mają dziś w
-- aplikacji dostęp do całej sieci i polityki mają to odwzorować, a nie
-- zmieniać przy okazji.
create or replace function public.widzi_wszystko()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role in ('admin', 'manager') from users where auth_id = auth.uid() limit 1),
    false
  );
$$;

-- Lokale, do których zalogowany ma dostęp — NAZWAMI, bo cały projekt wiąże
-- się z lokalem przez `lokale.name`, nie przez id.
--
-- ⚠️ `allowed_lokale` to TEKST po przecinku, nie tablica Postgresa (patrz
-- migracja 0001). Puste u kierownika sieci znaczy "wszystkie" — dokładnie tak
-- liczy to dziś `hasAccessToLokal` w ManagerDashboard.tsx i te dwa miejsca
-- muszą mówić to samo, inaczej ekran pokaże coś, czego baza nie wyda.
create or replace function public.moje_lokale()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.widzi_wszystko() then array(select name from lokale)
    else (
      select array_remove(array_agg(distinct trim(l)), '')
      from users u,
           unnest(
             string_to_array(
               coalesce(u.allowed_lokale, '') || ',' || coalesce(u.default_lokal, ''),
               ','
             )
           ) as l
      where u.auth_id = auth.uid()
    )
  end;
$$;

-- --------------------------------------------------------------------------
-- Sprawdzenie PIN-u blokady na tablecie, BEZ wypuszczania PIN-u z bazy.
--
-- Dziś tablet pobiera całą tabelę `users` razem z kolumną `kiosk_pin` i
-- porównuje w przeglądarce — czyli PIN każdego pracownika jest w pamięci
-- urządzenia, zanim ktokolwiek go wpisze. Po tej zmianie tablet pyta bazę i
-- dostaje wyłącznie tak/nie.
--
-- ⚠️ Świadome ograniczenie: to jest wyrocznia "czy ten PIN jest dobry", więc
-- przy 6 cyfrach da się ją teoretycznie przelecieć. Wywołać może ją jednak
-- TYLKO zalogowany tablet i TYLKO dla pracownika ze swojego lokalu — czyli
-- ktoś, kto już ma poświadczenia urządzenia stojącego w lokalu. Licznik prób
-- byłby tu kolejną tabelą i kolejną rzeczą do pilnowania; jeśli kiedyś
-- będzie potrzebny, to jest miejsce, w którym go dołożyć.
create or replace function public.sprawdz_kiosk_pin(p_user_id uuid, p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from users u
    where u.id = p_user_id
      and u.kiosk_pin is not null
      and u.kiosk_pin <> ''
      and u.kiosk_pin = p_pin
      -- pracownik musi należeć do lokalu pytającego
      and coalesce(u.default_lokal, '') = any (public.moje_lokale())
  );
$$;

revoke all on function public.sprawdz_kiosk_pin(uuid, text) from public, anon;
grant execute on function public.sprawdz_kiosk_pin(uuid, text) to authenticated;

grant execute on function public.moje_konto()      to authenticated;
grant execute on function public.moja_rola()       to authenticated;
grant execute on function public.widzi_wszystko()  to authenticated;
grant execute on function public.moje_lokale()     to authenticated;

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'users' and column_name = 'auth_id';

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('moje_konto','moja_rola','widzi_wszystko','moje_lokale','sprawdz_kiosk_pin')
order by routine_name;
