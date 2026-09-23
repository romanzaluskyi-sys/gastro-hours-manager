-- Etap 3c-2, porcja 2: „czyje to dane" przestaje być pytaniem otwartym.
--
-- STAN PRZED (zmierzony 23.09.2026 kontem tabletu): po `0031`/`0032` dane
-- LOKALU są zamknięte, ale dane LUDZI nie. Tablet w Bułce czyta 549
-- powiadomień — w tym „Twój termin: umowa dobiega końca" każdej z 29 osób z
-- całej sieci — 33 zgłoszenia, 33 wnioski o wolne, 115 wykonań zadań i całą
-- listę 42 osób z każdego lokalu.
--
-- ⚠️ `shifts` i `grafik_shifts` zostają POZA tą porcją, świadomie. To one mają
-- dwa udowodnione wyjątki sięgające poza własny lokal (widok miesiąca pokazuje
-- kierownikowi zmiany jego ludzi u sąsiada; `ostrzezeniaKodeksu` liczy
-- odpoczynek przez wszystkie lokale) i osobno 3071 + 1613 wierszy, na których
-- pomyłka wygląda jak pusty ekran, nie jak błąd. Godziny to też mniej wrażliwa
-- rzecz niż czyjaś wiadomość — dlatego idą na końcu, nie na początku.
--
-- ⚠️ Zdejmujemy polityki ENUMERUJĄC katalog, nie z listy nazw — patrz `0032`
-- i to, co kosztowało jej odkrycie.

-- --------------------------------------------------------------------------
-- 1. Kim jestem i kto jest „mój".
-- --------------------------------------------------------------------------
create or replace function public.moje_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $fn$ select id from users where auth_id = auth.uid() limit 1; $fn$;

create or replace function public.moje_imie()
returns text language sql stable security definer set search_path = public, pg_temp
as $fn$ select name from users where auth_id = auth.uid() limit 1; $fn$;

-- ⚠️ Zwraca TABLICĘ, a nie warunek na wiersz. Funkcja `stable` woła się raz na
-- zapytanie, a warunek z podzapytaniem — raz na wiersz; przy `notifications`
-- to pięćset wywołań zamiast jednego, przy `shifts` byłoby trzy tysiące.
-- Ta sama zasada co przy helperach z `0025`.
create or replace function public.moi_ludzie()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
  from users u
  where coalesce(u.default_lokal, '') = any (public.moje_lokale());
$fn$;

create or replace function public.imiona_moich_ludzi()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct u.name), '{}'::text[])
  from users u
  where coalesce(u.default_lokal, '') = any (public.moje_lokale());
$fn$;

grant execute on function public.moje_id()            to authenticated;
grant execute on function public.moje_imie()          to authenticated;
grant execute on function public.moi_ludzie()         to authenticated;
grant execute on function public.imiona_moich_ludzi() to authenticated;

-- --------------------------------------------------------------------------
-- 2. Czyszczenie polityk na tabelach tej porcji.
-- --------------------------------------------------------------------------
do $blok$
declare t text; p record;
begin
  foreach t in array array[
    'notifications', 'issues', 'absences', 'shift_swaps', 'task_completions'
  ]
  loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $blok$;

-- --------------------------------------------------------------------------
-- 3. Powiadomienia — najbardziej osobista tabela w tym zestawie.
--
-- ⚠️ Tablet MUSI widzieć wiadomości wszystkich osób ze swojego lokalu: nikt nie
-- wchodzi tam na cudzą stronę, więc koperta przy nazwisku na liście wyboru jest
-- jedynym sygnałem, że ktoś ma nieprzeczytaną wiadomość (patrz „Tablet
-- Służbowy zna grafik"). Dlatego kluczem jest `imiona_moich_ludzi()`, a nie
-- samo moje imię.
--
-- ⚠️ Wiersz dla kierowników (`audience='manager'`) ma lokal i rolę — pracownik
-- nie ma po co czytać, co zgłoszono kierownikowi.
-- --------------------------------------------------------------------------
create policy "moje_wiadomosci" on public.notifications
  for all to authenticated
  using (
    case when coalesce(audience, 'employee') = 'manager'
      then public.jest_kierownikiem() and public.widzi_lokal(lokal)
      else coalesce(user_name, '') = any (public.imiona_moich_ludzi())
        or coalesce(user_name, '') = coalesce(public.moje_imie(), '#')
    end
  )
  with check (true);

-- ⚠️ `with check (true)` jest tu ŚWIADOME: powiadomienia tworzy się DLA KOGOŚ
-- INNEGO — pracownik zgłasza korektę i budzi kierownika, kierownik odpowiada
-- pracownikowi. Warunek na zapis lustrzany do odczytu zablokowałby dokładnie to,
-- po co ta tabela istnieje.

-- --------------------------------------------------------------------------
-- 4. Zgłoszenia, wolne, giełda, wykonania zadań.
-- --------------------------------------------------------------------------
-- ⚠️ Zgłoszenie ANONIMOWE nie ma `user_id`, więc nie da się z niego odczytać
-- lokalu — i musi trafiać do każdego kierownika. Inaczej wraca błąd z 0.32.0:
-- znaczek w menu liczył zgłoszenie, którego ekran nie pokazywał.
create policy "moje_zgloszenia" on public.issues
  for all to authenticated
  using (
    user_id = public.moje_id()
    or (public.jest_kierownikiem()
        and (coalesce(is_anonymous, false) or user_id is null
             or user_id = any (public.moi_ludzie())))
  )
  with check (true);

create policy "moje_wolne" on public.absences
  for all to authenticated
  using (
    public.widzi_lokal(lokal)
    or user_id = public.moje_id()
    or (public.jest_kierownikiem() and user_id = any (public.moi_ludzie()))
  )
  with check (true);

create policy "gielda_lokalu" on public.shift_swaps
  for all to authenticated
  using (
    public.widzi_lokal(lokal)
    or author_user_id = public.moje_id()::text
    or taker_user_id  = public.moje_id()::text
    or target_user_id = public.moje_id()::text
  )
  with check (true);

-- Lokal wisi o jeden przeskok dalej, przy zadaniu. Ten sam, szerszy predykat
-- co `tasks` — wypożyczony odhacza checklistę tam, gdzie dziś stoi.
create policy "wykonania_lokalu" on public.task_completions
  for all to authenticated
  using (
    exists (select 1 from tasks t
            where t.id::text = task_completions.task_id
              and public.pracuje_w_lokalu(t.lokal))
    or user_id = public.moje_id()::text
  )
  with check (true);

-- --------------------------------------------------------------------------
-- 5. Lista osób — te same kolumny co w `0029`, dołożony warunek na WIERSZE.
--
-- ⚠️ Warunek musi stać TUTAJ, w widoku, a nie w polityce `users`: widok chodzi
-- z prawami właściciela i przez RLS tabeli nie przechodzi (patrz `0029`).
--
-- Kogo widzę: siebie, ludzi ze swoich lokali, oraz tych, których opublikowany
-- grafik stawia u mnie — wypożyczony musi dać się wybrać na tablecie, inaczej
-- nie odbije zmiany tam, gdzie faktycznie pracuje.
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
) w
where public.widzi_wszystko()
   or u.auth_id = auth.uid()
   or coalesce(u.default_lokal, '') = any (public.moje_lokale())
   or exists (
        select 1 from grafik_shifts gs
        where gs.user_id = u.id::text
          and gs.published_at is not null
          and gs.deleted_at is null
          and gs.date between current_date - 1 and current_date + 1
          and gs.lokal = any (public.moje_lokale())
      );

comment on view public.users_widok is
  'Kartoteka widziana oczami pytającego: stawki, dane osobowe i PIN-y tylko '
  'dla kierownika i dla samego zainteresowanego, a WIERSZE zawężone do swoich '
  'lokali plus wypożyczonych z grafiku. Migracje 0029 i 0033.';

revoke all on public.users_widok from anon;
grant select on public.users_widok to authenticated;

-- weryfikacja: inwentarz polityk (patrz 0032 — liczba > 1 to pułapka)
select t.tablename, count(p.policyname) as ile_polityk,
       string_agg(p.policyname, ', ' order by p.policyname) as polityki
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.tablename <> 'schema_migrations'
group by t.tablename
order by count(p.policyname) desc, t.tablename;
