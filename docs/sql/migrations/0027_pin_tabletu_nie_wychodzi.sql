-- Etap 3c-2, część pierwsza: PIN blokady przestaje wychodzić z bazy.
--
-- STAN PRZED: tablet pobiera całą tabelę `users` razem z kolumną `kiosk_pin`
-- i porównuje wpisane cyfry W PRZEGLĄDARCE. Czyli PIN-y wszystkich pracowników
-- lokalu leżą w pamięci urządzenia, zanim ktokolwiek dotknie klawiatury —
-- a urządzenie stoi na sali, zalogowane, tygodniami. Blokada chroniąca profil
-- przed kolegą z tej samej zmiany jest wtedy warta tyle, co otwarta konsola
-- przeglądarki.
--
-- Funkcja `sprawdz_kiosk_pin` istnieje od `0025` i nikt jej dotąd nie wołał
-- (celowo: dopóki polityki były otwarte, tablet i tak czytał `users`, więc
-- osobny deploy niczego by nie zabezpieczył). Po `0026` ma to już sens.
--
-- Ta migracja robi dwie rzeczy: daje aplikacji sposób na narysowanie kłódki
-- BEZ znajomości PIN-u i naprawia dziurę w samej funkcji, opisaną niżej.

-- --------------------------------------------------------------------------
-- 1. Kłódka przy nazwisku bez wydawania PIN-u.
--
-- Tablet musi wiedzieć, KTÓRE profile są zablokowane (rysuje przy nich kłódkę
-- i tylko dla nich pokazuje klawiaturę). Dziś wnioskuje to z obecności
-- `kiosk_pin`, więc potrzebuje samej wartości. Kolumna wyliczana odpowiada na
-- to pytanie, nie odpowiadając na żadne inne.
--
-- ⚠️ To jest też warunek wstępny dla 3c-3: dopiero mając `ma_kiosk_pin`,
-- można odebrać uprawnienie do kolumny `kiosk_pin` i nie zepsuć przy tym
-- ekranu wyboru osoby.
-- --------------------------------------------------------------------------
alter table users
  add column if not exists ma_kiosk_pin boolean
  generated always as (kiosk_pin is not null and kiosk_pin <> '') stored;

comment on column users.ma_kiosk_pin is
  'Czy profil jest zablokowany PIN-em. Wyliczana z kiosk_pin — tablet rysuje '
  'po niej kłódkę, nie znając samego PIN-u. Patrz migracja 0027.';

-- --------------------------------------------------------------------------
-- 2. Naprawa `sprawdz_kiosk_pin`: wypożyczeni.
--
-- ⚠️ Wersja z `0025` wpuszczała wyłącznie osoby, których `default_lokal` jest
-- lokalem pytającego tabletu. Tymczasem ekran wyboru osoby pokazuje także
-- WYPOŻYCZONYCH — tych, których opublikowany grafik stawia dziś właśnie tutaj
-- (patrz `dzisWGrafiku` w KioskDashboard.tsx). Taka osoba widzi swoje nazwisko
-- na liście, wpisuje własny PIN i dostaje "niepoprawny" — bez żadnego sposobu,
-- żeby się domyślić dlaczego. Rano, przed zmianą, w cudzym lokalu.
--
-- ⚠️ Okno to WCZORAJ–JUTRO, nie sam dzisiejszy dzień. Baza liczy `current_date`
-- w UTC, a lokale pracują w czasie polskim: między północą a drugą w nocy
-- "dzisiaj" znaczyłoby tu co innego niż na tablecie, a to są godziny, w których
-- ktoś kończy nocną zmianę. Rozszerzenie o dobę w obie strony nic nie otwiera —
-- to nadal wyłącznie osoba, którą grafik stawia w lokalu pytającego — a zdejmuje
-- całą klasę błędów ze strefą czasową.
--
-- ⚠️ `grafik_shifts.user_id` jest typu `text`, a `users.id` to `uuid`
-- (konwencja luźnych odwołań w tym projekcie) — stąd rzutowanie.
-- --------------------------------------------------------------------------
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
      and (
        -- przypisany do lokalu pytającego na stałe
        coalesce(u.default_lokal, '') = any (public.moje_lokale())
        -- albo wypożyczony: grafik stawia go tu na przełomie doby
        or exists (
          select 1
          from grafik_shifts gs
          where gs.user_id = u.id::text
            and gs.published_at is not null
            and gs.deleted_at is null
            and gs.date between current_date - 1 and current_date + 1
            and gs.lokal = any (public.moje_lokale())
        )
      )
  );
$$;

revoke all on function public.sprawdz_kiosk_pin(uuid, text) from public, anon;
grant execute on function public.sprawdz_kiosk_pin(uuid, text) to authenticated;

-- weryfikacja: kolumna wyliczana jest i jest read-only dla PostgREST
select column_name, data_type, is_generated
from information_schema.columns
where table_name = 'users' and column_name in ('kiosk_pin', 'ma_kiosk_pin')
order by column_name;

-- weryfikacja: ile profili jest zablokowanych (bez pokazywania PIN-ów)
select count(*) filter (where ma_kiosk_pin) as zablokowane,
       count(*) filter (where ma_kiosk_pin and length(kiosk_pin) <> 6) as zle_dlugosci
from users
where active and not archived;
