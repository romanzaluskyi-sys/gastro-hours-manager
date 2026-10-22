-- 0047 — poziom doświadczenia na stanowisku (0.78.0)
--
-- Kierownik ustawia w karcie pracownika poziom na każdym dozwolonym
-- stanowisku: 1 — wdrażany (pracuje z kimś obok), 2 — samodzielny,
-- 3 — może szkolić. Grafik pokazuje go przy kandydatach i ostrzega, gdy na
-- stanowisku stoją w jakiejś godzinie same osoby z poziomem 1.
--
-- `users.poziomy_stanowisk` (jsonb) = { "Bar": 3, "Kasa": 2 }.
--   * Klucz to NAZWA stanowiska, nie para (stanowisko, lokal) — tak samo jak
--     `allowed_stanowiska`: ta sama nazwa w innym lokalu to to samo
--     uprawnienie i na tym opiera się wypożyczanie ludzi.
--   * Brak klucza (i NULL) = poziom NIEUSTAWIONY, nie „1”. Inaczej po tej
--     migracji każda zmiana w sieci świeciłaby ostrzeżeniem „same osoby z
--     poziomem 1”, a pierwszy alarm o niczym uczy ignorować wszystkie
--     następne. Nowe stanowisko dopisane w karcie dostaje 1 jawnie.
--
-- `users_widok`: kolumna JAWNA (jak `default_stanowisko`). Pracownik na
-- Tablecie Służbowym ogląda swoje poziomy oczami konta tabletu, a ono dostaje
-- kolumny „własne albo kierownik” puste — ukryta, nie pokazałaby się wcale.
-- ⚠️ `create or replace view` pozwala dokładać kolumny tylko NA KOŃCU, więc
-- stoi za `email_powiadomienia`. Reszta widoku przepisana dosłownie z 0046.
--
-- Kolejność dowolna: nowa kolumna i widok z jedną kolumną więcej. Stary
-- bundle jej nie zna i nie wysyła, nowy działa też na bazie bez 0047
-- (poziomy są wtedy po prostu nieustawione, a zapis karty pomija pole).

alter table users add column if not exists poziomy_stanowisk jsonb;

alter table users drop constraint if exists users_poziomy_stanowisk_obiekt;
alter table users add constraint users_poziomy_stanowisk_obiekt
  check (poziomy_stanowisk is null or jsonb_typeof(poziomy_stanowisk) = 'object');

create or replace view public.users_widok as
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
  null::text                                          as pin,        -- 0046: nie wychodzi
  null::text                                          as kiosk_pin,  -- 0046: nie wychodzi
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
  case when w.kierownik then u.notatki_updated_at end as notatki_updated_at,
  -- własne albo kierownik (0039)
  case when w.wolno then u.email_powiadomienia end    as email_powiadomienia,
  -- jawne (0047) — na końcu, patrz nagłówek
  u.poziomy_stanowisk
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

-- Sprawdzenie: kolumna w tabeli i w widoku (ma wyjść 2).
select count(*) as kolumna_poziomow
from information_schema.columns
where table_schema = 'public'
  and table_name in ('users', 'users_widok')
  and column_name = 'poziomy_stanowisk';
