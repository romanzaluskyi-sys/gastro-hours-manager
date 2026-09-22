-- Etap 3c-3: stawki, daty urodzenia i telefony przestają być widoczne dla
-- kolegów z sali.
--
-- STAN PRZED: po `0026` do danych trzeba konta — ale KAŻDE konto czyta całą
-- tabelę `users`. Czyli cztery tablety stojące w salach i cztery prywatne
-- telefony pracowników mają u siebie stawki, wynagrodzenia, daty urodzenia,
-- telefony, PIN-y i notatki kierownika o każdej z 29 osób. To jest ta część,
-- która stoi między nami a powierzeniem danych drugiego klienta.
--
-- ⚠️ `GRANT` działa na ROLĘ, a kierownik i pracownik to oboje `authenticated`
-- — uprawnieniami kolumnowymi nie da się ich rozróżnić. Rozróżnienie daje
-- WIDOK `users_widok`, który maskuje kolumny w zależności od tego, KTO pyta.
--
-- ⚠️ KOLEJNOŚĆ WDROŻENIA: ta migracja idzie PRZED deployem 0.43.0, a `0030`
-- (polityki na tabeli) DOPIERO PO nim i po odświeżeniu tabletów. Powód jest
-- taki sam jak zwykle, tylko działa w obie strony: nowy bundle pyta o
-- `users_widok`, więc widok musi już być; stary bundle pyta o `users`, więc
-- polityka nie może go jeszcze odciąć. Puszczone razem zostawiają okno, w
-- którym lista osób na tablecie jest pusta.

-- --------------------------------------------------------------------------
-- 1. Kto administruje kartoteką.
--
-- Osobny helper, a nie `widzi_wszystko()`: tamto odpowiada na pytanie „całą
-- sieć czy swoje lokale" i `manager_lokalu` jest tam po stronie NIE. Tutaj
-- pytanie jest inne — „czy ta osoba prowadzi kartoteki pracowników" — i
-- kierownik lokalu jest po stronie TAK, bo to on wpisuje stawki i terminy.
-- --------------------------------------------------------------------------
create or replace function public.widzi_kartoteke()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role in ('admin', 'manager', 'manager_lokalu')
     from users where auth_id = auth.uid() limit 1),
    false
  );
$$;

grant execute on function public.widzi_kartoteke() to authenticated;

-- --------------------------------------------------------------------------
-- 2. Widok kartoteki.
--
-- ⚠️ Widok CELOWO zostaje z prawami właściciela (bez `security_invoker`).
-- Gdyby chodził z prawami wołającego, potrzebowałby od niego uprawnienia do
-- `users` — a wtedy każdy mógłby pominąć widok i odpytać tabelę wprost.
-- To jest cały mechanizm: tabela ma politykę, która wydaje wiersz wyłącznie
-- właścicielowi konta i kierownikom, a listę załogi wydaje ten widok.
--
-- ⚠️ Konsekwencja, o której trzeba pamiętać: widok NIE przechodzi przez RLS
-- `users`. Gdy przyjdzie 3c-2 (zawężenie per lokal), warunek na WIERSZE
-- trzeba dopisać TUTAJ, w `where`, a nie w polityce tabeli — inaczej nie
-- zadziała.
--
-- Trzy poziomy widoczności:
--   jawne   — potrzebne każdemu, kto patrzy na listę załogi: kto to jest, w
--             jakim lokalu, na jakim stanowisku, czy profil ma blokadę PIN-em.
--             Tu siedzi też `typ_umowy`/`etat`/`wymiar_etatu`, bo z nich liczy
--             się NORMA GODZIN w Raporcie pracownika — a Raport pokazuje się
--             także na tablecie, gdzie patrzącym nie jest właściciel konta.
--             To są godziny, nie pieniądze.
--   własne  — pełne dane widzi osoba, której dotyczą, i kierownik.
--   kierownik — notatki o pracowniku widzi WYŁĄCZNIE kierownik: to jego
--             notatnik, nie dokument dla zainteresowanego.
-- --------------------------------------------------------------------------
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
) w;

comment on view public.users_widok is
  'Kartoteka widziana oczami pytającego: stawki, dane osobowe i PIN-y tylko '
  'dla kierownika i dla samego zainteresowanego. JEDYNA droga do listy załogi '
  'w aplikacji — tabela users wydaje wiersz tylko właścicielowi konta i '
  'kierownikom. Patrz migracja 0029.';

revoke all on public.users_widok from anon;
grant select on public.users_widok to authenticated;

-- --------------------------------------------------------------------------
-- 3. Osoba na próbę z tabletu — przez funkcję, nie przez INSERT.
--
-- Dzień próbny zaczyna się rano, kiedy kierownika w lokalu nie ma, więc ta
-- ścieżka musi zostać. Zmienia się to, że warunki sprawdza BAZA, a nie
-- przeglądarka: konto bez danych logowania, zawsze `open`, zawsze
-- „oczekuje" i zawsze w lokalu pytającego urządzenia.
-- --------------------------------------------------------------------------
create or replace function public.dodaj_probnego(
  p_name text,
  p_lokal text,
  p_stanowisko text,
  p_przez text default null
)
returns users
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare nowy users;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Wpisz imię i nazwisko.';
  end if;
  if coalesce(p_lokal, '') <> all (public.moje_lokale()) then
    raise exception 'Ten lokal nie należy do tego urządzenia.';
  end if;

  insert into users (
    name, role, default_lokal, default_stanowisko,
    email, pin, active, archived,
    probny_status, probny_od, probny_przez
  ) values (
    trim(p_name), 'open', p_lokal, p_stanowisko,
    '', '', true, false,
    -- ⚠️ Data w strefie lokalu, nie `current_date`: baza liczy dziś w UTC, a
    -- między północą a drugą w nocy to wczoraj według zegara w kuchni.
    'oczekuje', (timezone('Europe/Warsaw', now()))::date, p_przez
  )
  returning * into nowy;

  return nowy;
end;
$$;

revoke all on function public.dodaj_probnego(text, text, text, text) from public, anon;
grant execute on function public.dodaj_probnego(text, text, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- weryfikacja: czy widok nie zgubił żadnej kolumny tabeli
--
-- Lista kolumn w widoku jest wypisana ręcznie i to jest świadome — kolumna
-- dopisana w przyszłości ma NIE przeciekać sama z siebie. Ceną jest ryzyko
-- pominięcia czegoś, co aplikacja czyta, więc pytamy o to wprost. Pusty wynik
-- = wszystko na swoim miejscu.
-- --------------------------------------------------------------------------
select c.column_name as brakuje_w_widoku
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'users'
  and c.column_name not in (
    select v.column_name from information_schema.columns v
    where v.table_schema = 'public' and v.table_name = 'users_widok'
  )
order by 1;

-- weryfikacja: kto co widzi (uruchom zalogowany jako pracownik i jako kierownik)
select count(*) as wiersze,
       count(stawka) as ze_stawka,
       count(telefon) as z_telefonem,
       count(notatki) as z_notatka
from users_widok;
