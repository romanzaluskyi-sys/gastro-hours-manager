-- 0046 — PIN-y przestają leżeć w bazie jawnym tekstem (0.77.0)
--
-- STAN PRZED:
--   * `users.pin` — kopia HASŁA do Supabase Auth (kierownik, tablet, `closed`)
--     jawnym tekstem. `api/admin/ustaw-haslo.js` pilnował, żeby obie były tą
--     samą rzeczą, a kierownik widział ją w karcie pod „Pokaż”. Auth trzyma
--     własny hash i nikt w aplikacji nie potrzebuje tej kopii do niczego.
--   * `users.kiosk_pin` — blokada profilu na tablecie i zarazem hasło
--     pracownika z prywatnym telefonem, też jawnym tekstem; `users_widok`
--     wydawał go kierownikowi razem z listą załogi.
--   * `sprawdz_kiosk_pin` dało się wołać bez limitu: kto miał sesję tabletu,
--     mógł przejść wszystkie 10^6 PIN-ów kolegi zwykłą pętlą — a ten PIN jest
--     też jego hasłem do logowania.
--
-- PO:
--   * `pin` jest zawsze NULL (kolumna zostaje, bo czytają ją stare bundle);
--   * `kiosk_pin` trzyma hash bcrypt (pgcrypto). Kolumna wyliczana
--     `ma_kiosk_pin` (0027) działa dalej bez zmian — liczy się z niepustej
--     wartości, nie z jej treści;
--   * PIN-y zmienia WYŁĄCZNIE serwer (klucz SERVICE ROLE: `ustaw-haslo.js`,
--     skrypty, reset danych demo). Zapis z aplikacji (konto zalogowane) do tych
--     dwóch kolumn trigger po cichu pomija — patrz niżej, dlaczego po cichu;
--   * `users_widok` nie wydaje żadnego z nich, także kierownikowi;
--   * po 10 nieudanych próbach w 15 minut profil na tablecie jest zablokowany
--     (`limity_pin`). Ta sama tabela liczy prośby o reset PIN-u e-mailem.
--
-- ⚠️ KOLEJNOŚĆ: ta migracja idzie PO deployu 0.77.0 i odświeżeniu tabletów
-- (ta sama zasada co 0029/0030). Nowa aplikacja działa na bazie bez 0046
-- (zmienia PIN przez serwer, nie czyta go z widoku), stara na bazie z 0046
-- działa gorzej: karta kierownika/tabletu ma tam PIN jako pole wymagane, a
-- widok oddaje je puste — zapis karty wymagałby wpisania PIN-u od nowa.
--
-- ⚠️ Kto po tej migracji nie ma konta w Auth, nie ma też PIN-u w bazie, z
-- którego dałoby się je założyć (`scripts/utworz-konta-auth.py` przestaje mieć
-- z czego brać hasła). Logowanie od 0.42.0 i tak idzie WYŁĄCZNIE przez Auth,
-- więc taki PIN niczego już nie otwierał. Ostatnie zapytanie wypisuje te
-- konta — kierownik ustawia im PIN w karcie, a serwer zakłada konto.

-- --------------------------------------------------------------------------
-- 1. pgcrypto. W Supabase jest zainstalowane w schemacie `extensions` w każdym
--    projekcie; tworzymy je tylko tam, gdzie go nie ma (lokalny Postgres do
--    sprawdzania łańcucha migracji). Funkcje niżej mają `extensions` w
--    search_path, więc znajdą `crypt` także wtedy, gdy ktoś zainstalował je
--    kiedyś w `public`.
-- --------------------------------------------------------------------------
create schema if not exists extensions;
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'crypt') then
    create extension pgcrypto with schema extensions;
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 2. Limity prób — tabela `limity_pin` powstaje w 0045 (sama tabela nic nie
--    zmienia, więc mogła wejść przed deployem; tu tylko z niej korzystamy).
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 3. Trigger: PIN-y zmienia tylko serwer, a `kiosk_pin` zapisuje się hashem.
--
-- ⚠️ Zapis z aplikacji jest POMIJANY, nie odrzucany. Karta pracownika (także
-- w bundlu sprzed 0.77.0, otwartym na czyimś laptopie) wysyła cały wiersz, a
-- widok oddaje PIN-y puste — odrzucenie zrobiłoby „Błąd zapisu pracownika”
-- przy KAŻDEJ karcie, a przepuszczenie pustej wartości skasowałoby blokadę.
-- Stary bundle zmienia PIN dodatkowo przez `ustaw-haslo.js`, a ten od 0.77.0
-- zapisuje `kiosk_pin` sam — więc nic się nie gubi.
--
-- ⚠️ „Aplikacja” = jest `auth.uid()` (ta sama reguła co `pilnuj_okna_wpisu`
-- w 0044). Crony, skrypty, SQL Editor i `ustaw-haslo.js` chodzą kluczem
-- serwisowym, bez użytkownika. `dodaj_probnego` (tablet) ma `auth.uid()` i
-- zakłada konto bez PIN-u — tak ma być.
--
-- ⚠️ Nazwa zaczyna się od „c”, żeby trigger szedł PRZED `demo_chron_konta`
-- (BEFORE-triggery idą alfabetycznie): ochrona kont demo ma widzieć PIN-y już
-- przywrócone, inaczej każda zmiana karty konta demo z aplikacji wyglądałaby
-- na zmianę PIN-u.
--
-- ⚠️ Sześć cyfr sprawdzamy tylko przy NOWEJ wartości. Stary PIN krótszy niż
-- sześć cyfr (sprzed 0.41.2) dostaje hash jak każdy inny — i tak nie da się go
-- wpisać na tablecie, ale migracja nie może się na nim wywrócić.
-- --------------------------------------------------------------------------
create or replace function public.chron_piny()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'UPDATE' then
      new.kiosk_pin := old.kiosk_pin;
    else
      new.kiosk_pin := null;
    end if;
  end if;

  -- Hasło jest w Auth; kopii nie trzymamy u nikogo.
  new.pin := null;

  if new.kiosk_pin = '' then
    new.kiosk_pin := null;
  end if;

  if new.kiosk_pin is not null and new.kiosk_pin !~ '^\$2[abxy]\$[0-9]{2}\$' then
    if (tg_op = 'INSERT' or new.kiosk_pin is distinct from old.kiosk_pin)
       and new.kiosk_pin !~ '^[0-9]{6}$' then
      raise exception 'PIN ma mieć dokładnie 6 cyfr.' using errcode = 'P0001';
    end if;
    new.kiosk_pin := crypt(new.kiosk_pin, gen_salt('bf', 8));
  end if;

  return new;
end;
$$;

drop trigger if exists chron_piny on public.users;
create trigger chron_piny
  before insert or update on public.users
  for each row execute function public.chron_piny();

-- To, co już jest w bazie: `pin` znika, `kiosk_pin` dostaje hash (trigger
-- robi jedno i drugie; migracja idzie bez `auth.uid()`).
update users
   set pin = null
 where pin is not null
    or (kiosk_pin is not null and kiosk_pin !~ '^\$2[abxy]\$[0-9]{2}\$');

-- --------------------------------------------------------------------------
-- 4. `sprawdz_kiosk_pin`: porównanie z hashem i limit prób.
--
-- Kto może zostać sprawdzony — bez zmian względem 0027 (przypisany do lokalu
-- pytającego albo wypożyczony tu przez opublikowany grafik, okno wczoraj–
-- jutro). Profil spoza tego zakresu dostaje `false` BEZ liczenia próby: inaczej
-- tablet jednego lokalu mógłby blokować ludzi drugiego.
--
-- ⚠️ Blokada to WYJĄTEK, a nie `false`. „Niepoprawny PIN” przy PIN-ie dobrym
-- kazałby wpisywać go w kółko. Komunikat zaczyna się od „Za dużo prób” — po
-- tym rozpoznaje go KioskDashboard.tsx. Tablet sprzed 0.77.0 pokaże wtedy swój
-- komunikat o połączeniu; to przejściowe.
--
-- ⚠️ Licznik jest per OSOBA, nie per tablet: przy jednym koncie na lokal
-- urządzenia i tak się nie odróżni. Ceną jest to, że złośliwy kolega może
-- zablokować komuś profil na kwadrans — kierownik zdejmuje blokadę, ustawiając
-- PIN w karcie (ustaw-haslo.js czyści licznik).
--
-- ⚠️ `volatile`, bo funkcja PISZE (licznik). Wersje 0025/0027 były `stable`;
-- tablet woła ją POST-em, więc dla PostgREST to bez różnicy.
-- --------------------------------------------------------------------------
create or replace function public.sprawdz_kiosk_pin(p_user_id uuid, p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  limit_prob constant int := 10;
  okno constant interval := interval '15 minutes';
  v_hash text;
  v_ok boolean;
begin
  select u.kiosk_pin
    into v_hash
    from users u
   where u.id = p_user_id
     and u.kiosk_pin is not null
     and u.kiosk_pin <> ''
     and (
       coalesce(u.default_lokal, '') = any ((select public.moje_lokale())::text[])
       or exists (
         select 1
           from grafik_shifts gs
          where gs.user_id = u.id::text
            and gs.published_at is not null
            and gs.deleted_at is null
            and gs.date between current_date - 1 and current_date + 1
            and gs.lokal = any ((select public.moje_lokale())::text[])
       )
     );
  if v_hash is null then
    return false;
  end if;

  if (select count(*)
        from limity_pin
       where rodzaj = 'kiosk'
         and klucz = p_user_id::text
         and kiedy > now() - okno) >= limit_prob then
    raise exception 'Za dużo prób PIN-u. Profil jest zablokowany na 15 minut — albo poproś kierownika o nowy PIN.'
      using errcode = 'P0001';
  end if;

  v_ok := crypt(coalesce(p_pin, ''), v_hash) = v_hash;

  if v_ok then
    delete from limity_pin where rodzaj = 'kiosk' and klucz = p_user_id::text;
  else
    insert into limity_pin (rodzaj, klucz) values ('kiosk', p_user_id::text);
  end if;
  -- Sprzątanie po drodze — tabela ma mieć dzień historii, nie archiwum.
  delete from limity_pin where kiedy < now() - interval '1 day';

  return v_ok;
end;
$$;

revoke all on function public.sprawdz_kiosk_pin(uuid, text) from public, anon;
grant execute on function public.sprawdz_kiosk_pin(uuid, text) to authenticated;

-- --------------------------------------------------------------------------
-- 5. `users_widok` bez PIN-ów. Kolumny `pin` i `kiosk_pin` ZOSTAJĄ (puste) —
--    create or replace view nie pozwala ich usunąć, a stare bundle je czytają.
--    Reszta przepisana dosłownie z 0039. Kłódkę i „ma konto” mówią
--    `ma_kiosk_pin` i `auth_id`.
-- --------------------------------------------------------------------------
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
  case when w.wolno then u.email_powiadomienia end    as email_powiadomienia
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

-- --------------------------------------------------------------------------
-- Sprawdzenie (ostatnie zapytanie — jego wynik pokazuje migrate.py):
--   jawne_piny          — ma być 0;
--   kiosk_bez_hasha     — ma być 0;
--   bez_konta_w_auth    — aktywne konta, które logują się do aplikacji, a nie
--                         mają konta w Auth: kierownik ustawia im PIN w karcie.
-- --------------------------------------------------------------------------
select
  count(*) filter (where pin is not null)                                         as jawne_piny,
  count(*) filter (where kiosk_pin is not null
                     and kiosk_pin !~ '^\$2[abxy]\$[0-9]{2}\$')                   as kiosk_bez_hasha,
  count(*) filter (where ma_kiosk_pin)                                            as zablokowane_profile,
  count(*) filter (where active and not archived and auth_id is null
                     and email is not null and email <> ''
                     and role in ('admin', 'manager', 'manager_lokalu', 'kiosk', 'closed')) as bez_konta_w_auth
from users;
