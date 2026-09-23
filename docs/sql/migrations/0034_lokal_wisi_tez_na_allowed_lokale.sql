-- Poprawka do `0033`: `default_lokal` NIE jest tym, po czym poznaje się lokal.
--
-- OBJAW (zmierzony 23.09.2026 kontem kierownika z czterema lokalami — a takie
-- konto po zawężeniu PER LOKAL nie ma prawa stracić ani jednego wiersza):
--     users_widok    42 → 37
--     notifications  553 → 537
--
-- PRZYCZYNA, jedna dla obu: `moi_ludzie()` i `imiona_moich_ludzi()` pytały
-- wyłącznie o `users.default_lokal`. Tymczasem:
--   * **konta tabletów mają PUSTY `default_lokal`** — lokal wiszą na
--     `allowed_lokale` (patrz `KioskDashboard.tsx`, który czyta właśnie tę
--     kolumnę). Cztery tablety wypadły więc z kartoteki kierownika, czyli
--     przestał móc nimi administrować.
--   * wiersz `notifications` dla kierownika bywa BEZ lokalu, a
--     `widzi_lokal('')` jest fałszem dla każdego, kto nie widzi całej sieci.
--
-- ⚠️ Zasada, którą to zostawia: pytanie „w którym lokalu jest ta osoba" ma
-- DWIE odpowiedzi w tej bazie — `default_lokal` (pracownik) i `allowed_lokale`
-- (tablet, kierownik). Kod, który pyta tylko o pierwszą, działa na ludziach i
-- gubi urządzenia. Dlatego odpowiedź siedzi w JEDNYM miejscu — `moi_ludzie()`
-- — a nie w warunku przepisywanym przy każdej tabeli.
--
-- ⚠️ Wiersz BEZ żadnego lokalu (konto właściciela) zostaje widoczny dla
-- kierownika. Wiersz, którego nie widzi nikt, znika z administracji po cichu.
-- Dla tabletu takiej furtki nie ma — nie ma czego tam administrować.

create or replace function public.moi_ludzie()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
  from users u
  where coalesce(u.default_lokal, '') = any (public.moje_lokale())
     or exists (
          select 1
          from unnest(string_to_array(coalesce(u.allowed_lokale, ''), ',')) as l
          where trim(l) <> '' and trim(l) = any (public.moje_lokale())
        )
     or (public.jest_kierownikiem()
         and coalesce(u.default_lokal, '') = ''
         and coalesce(u.allowed_lokale, '') = '');
$fn$;

create or replace function public.imiona_moich_ludzi()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct u.name), '{}'::text[])
  from users u
  where u.id = any (public.moi_ludzie());
$fn$;

-- Powiadomienie dla kierowników bez lokalu wraca do kierowników.
drop policy if exists "moje_wiadomosci" on public.notifications;
create policy "moje_wiadomosci" on public.notifications
  for all to authenticated
  using (
    case when coalesce(audience, 'employee') = 'manager'
      then public.jest_kierownikiem()
           and (public.widzi_lokal(lokal) or coalesce(lokal, '') = '')
      else coalesce(user_name, '') = any (public.imiona_moich_ludzi())
        or coalesce(user_name, '') = coalesce(public.moje_imie(), '#')
    end
  )
  with check (true);

-- Kartoteka pyta tym samym predykatem co reszta, zamiast powtarzać warunek.
drop view if exists public.users_widok;
create view public.users_widok as
select
  -- jawne
  u.id,
  u.auth_id,
  u.name,
  u.role,
  u.active,
  u.archived,
  u.created_at,
  u.default_lokal,
  u.default_stanowisko,
  u.allowed_lokale,
  u.allowed_stanowiska,
  u.probny_status,
  u.probny_od,
  u.probny_przez,
  u.puls_do,
  u.ma_kiosk_pin,
  u.typ_umowy,
  u.etat,
  u.wymiar_etatu,
  -- własne albo kierownik
  case when w.wolno then u.email end                  as email,
  case when w.wolno then u.pin end                    as pin,
  case when w.wolno then u.kiosk_pin end              as kiosk_pin,
  case when w.wolno then u.stawka end                 as stawka,
  case when w.wolno then u.wynagrodzenie_mies end     as wynagrodzenie_mies,
  case when w.wolno then u.telefon end                as telefon,
  case when w.wolno then u.data_urodzenia end         as data_urodzenia,
  case when w.wolno then u.data_zatrudnienia end      as data_zatrudnienia,
  case when w.wolno then u.sanepid_expiry end         as sanepid_expiry,
  case when w.wolno then u.sanepid_last_notified end  as sanepid_last_notified,
  case when w.wolno then u.umowa_expiry end           as umowa_expiry,
  case when w.wolno then u.umowa_last_notified end    as umowa_last_notified,
  case when w.wolno then u.umowa_bezterminowa end     as umowa_bezterminowa,
  case when w.wolno then u.ostatni_dzien end          as ostatni_dzien,
  -- tylko kierownik
  case when w.kierownik then u.notatki end            as notatki,
  case when w.kierownik then u.notatki_updated_by end as notatki_updated_by,
  case when w.kierownik then u.notatki_updated_at end as notatki_updated_at
from users u
cross join lateral (
  select
    public.widzi_kartoteke()                                  as kierownik,
    public.widzi_kartoteke() or u.auth_id = auth.uid()        as wolno
) w
where public.widzi_wszystko()
   or u.auth_id = auth.uid()
   or u.id = any (public.moi_ludzie())
   or exists (
        select 1 from grafik_shifts gs
        where gs.user_id = u.id::text
          and gs.published_at is not null
          and gs.deleted_at is null
          and gs.date between current_date - 1 and current_date + 1
          and gs.lokal = any (public.moje_lokale())
      );

comment on view public.users_widok is
  'Kartoteka widziana oczami pytającego: kolumny wrażliwe tylko dla kierownika '
  'i zainteresowanego, wiersze zawężone przez moi_ludzie() plus wypożyczeni z '
  'grafiku. Migracje 0029, 0033, 0034.';

revoke all on public.users_widok from anon;
grant select on public.users_widok to authenticated;

-- weryfikacja: kierownik z kompletem lokali ma widzieć TYLE SAMO co przed 0033
select 'users_widok' as co, count(*) from users_widok
union all select 'notifications', count(*) from notifications;
