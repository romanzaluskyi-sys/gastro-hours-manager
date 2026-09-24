-- Druga próba naprawy timeoutu: wymuszamy jedno wywołanie, nie prosimy o nie.
--
-- `0035` usunęła funkcje Z ARGUMENTEM Z WIERSZA — i to była poprawna diagnoza
-- klasy problemu, ale niewystarczająca. Powiadomienia dalej były puste,
-- właściciel odblokował tabelę ręcznie (słusznie).
--
-- CZEGO ZABRAKŁO: funkcja `stable` bez argumentów MOŻE zostać policzona raz,
-- ale planer nie ma takiego obowiązku — przy politykach RLS zwykle liczy ją
-- dla każdego wiersza. Żeby wymusić jedno wywołanie, trzeba owinąć ją w
-- PODZAPYTANIE SKALARNE:
--
--     kolumna = any ((select public.funkcja())::text[])     -- liczone RAZ (InitPlan)
--     kolumna = any (public.funkcja())              -- bywa liczone co wiersz
--
-- To jest znany wzorzec dla RLS w Supabase — ten sam powód, dla którego pisze
-- się `(select auth.uid())` zamiast `auth.uid()`. Różnica nie wynika z logiki,
-- tylko z tego, jak planer traktuje podzapytanie bez odwołań do wiersza.
--
-- ⚠️ Owijamy też wywołania WEWNĄTRZ funkcji pomocniczych. `moi_ludzie()`
-- woła `moje_lokale()` w warunku `where` nad tabelą `users` — czyli raz na
-- każdego z 42 pracowników. Przy 553 powiadomieniach to mnoży się z tym, co
-- wyżej.
--
-- ⚠️ POMIARU NIE RÓB Z SQL EDITORA. Migracja i edytor chodzą prawami
-- właściciela, a ten OMIJA RLS — `count(*)` wróci natychmiast niezależnie od
-- tego, czy polityka jest szybka. Zmierz `scripts/sprawdz-dostep.py` kontem
-- tabletu i otwórz „Wiadomości" na urządzeniu.

-- --------------------------------------------------------------------------
-- 1. Funkcje pomocnicze — nie wołają się nawzajem raz na wiersz.
-- --------------------------------------------------------------------------
create or replace function public.moi_ludzie()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
  from users u
  where coalesce(u.default_lokal, '') = any ((select public.moje_lokale())::text[])
     or exists (
          select 1
          from unnest(string_to_array(coalesce(u.allowed_lokale, ''), ',')) as l
          where trim(l) <> '' and trim(l) = any ((select public.moje_lokale())::text[])
        )
     or ((select public.jest_kierownikiem())
         and coalesce(u.default_lokal, '') = ''
         and coalesce(u.allowed_lokale, '') = '');
$fn$;

create or replace function public.imiona_moich_ludzi()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct u.name), '{}'::text[])
  from users u
  where u.id = any ((select public.moi_ludzie())::uuid[]);
$fn$;

create or replace function public.lokale_do_pracy()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct x.l), '{}'::text[])
  from (
    select unnest((select public.moje_lokale())) as l
    union
    select gs.lokal
      from grafik_shifts gs
      join users u on u.id::text = gs.user_id
     where u.auth_id = (select auth.uid())
       and gs.published_at is not null
       and gs.deleted_at is null
       and gs.date between current_date - 1 and current_date + 1
    union
    select s.lokal
      from shifts s
      join users u on u.id = s.user_id
     where u.auth_id = (select auth.uid())
       and s.start_time >= current_date - 1
  ) x
  where x.l is not null and x.l <> '';
$fn$;

-- --------------------------------------------------------------------------
-- 2. Powiadomienia — z powrotem zawężone, tym razem z InitPlanem.
--
-- ⚠️ Zdejmujemy ENUMERUJĄC katalog (lekcja z `0032`): po ręcznym odblokowaniu
-- stoi tu polityka o nazwie, której ta migracja nie musi znać.
-- --------------------------------------------------------------------------
do $blok$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy %I on public.notifications', p.policyname);
  end loop;
end $blok$;

create policy "moje_wiadomosci" on public.notifications
  for all to authenticated
  using (
    (coalesce(audience, 'employee') <> 'manager'
     and coalesce(user_name, '') = any ((select public.imiona_moich_ludzi())::text[]))
    or (coalesce(audience, '') = 'manager'
        and (select public.jest_kierownikiem())
        and (coalesce(lokal, '') = any ((select public.moje_lokale())::text[])
             or coalesce(lokal, '') = ''
             or (select public.widzi_wszystko())))
  )
  with check (true);

-- --------------------------------------------------------------------------
-- 3. Ten sam kształt na pozostałych tabelach.
-- --------------------------------------------------------------------------
do $blok$
declare t text;
begin
  foreach t in array array[
    'day_logs', 'day_log_entries', 'staffing_rule_sets',
    'grafik_wyjatki', 'lokale_godziny'
  ]
  loop
    execute format('drop policy if exists "swoj_lokal" on public.%I', t);
    execute format(
      'create policy "swoj_lokal" on public.%I for all to authenticated '
      'using ((select public.widzi_wszystko()) '
      '       or coalesce(lokal, '''') = any ((select public.moje_lokale())::text[])) '
      'with check ((select public.widzi_wszystko()) '
      '       or coalesce(lokal, '''') = any ((select public.moje_lokale())::text[]))',
      t
    );
  end loop;

  foreach t in array array['tasks', 'task_blocks', 'day_log_templates']
  loop
    execute format('drop policy if exists "lokal_pracy" on public.%I', t);
    execute format(
      'create policy "lokal_pracy" on public.%I for all to authenticated '
      'using ((select public.widzi_wszystko()) '
      '       or coalesce(lokal, '''') = any ((select public.lokale_do_pracy())::text[])) '
      'with check ((select public.widzi_wszystko()) '
      '       or coalesce(lokal, '''') = any ((select public.lokale_do_pracy())::text[]))',
      t
    );
  end loop;

  foreach t in array array['grafik_budzet_cele', 'grafik_budzet_dni']
  loop
    execute format('drop policy if exists "budzet_kierownika" on public.%I', t);
    execute format(
      'create policy "budzet_kierownika" on public.%I for all to authenticated '
      'using ((select public.jest_kierownikiem()) and ((select public.widzi_wszystko()) '
      '       or coalesce(lokal, '''') = any ((select public.moje_lokale())::text[]))) '
      'with check ((select public.jest_kierownikiem()) and ((select public.widzi_wszystko()) '
      '       or coalesce(lokal, '''') = any ((select public.moje_lokale())::text[])))',
      t
    );
  end loop;
end $blok$;

drop policy if exists "moje_wolne" on public.absences;
create policy "moje_wolne" on public.absences
  for all to authenticated
  using (
    (select public.widzi_wszystko())
    or coalesce(lokal, '') = any ((select public.moje_lokale())::text[])
    or user_id = (select public.moje_id())
    or ((select public.jest_kierownikiem()) and user_id = any ((select public.moi_ludzie())::uuid[]))
  )
  with check (true);

drop policy if exists "gielda_lokalu" on public.shift_swaps;
create policy "gielda_lokalu" on public.shift_swaps
  for all to authenticated
  using (
    (select public.widzi_wszystko())
    or coalesce(lokal, '') = any ((select public.moje_lokale())::text[])
    or author_user_id = (select public.moje_id())::text
    or taker_user_id  = (select public.moje_id())::text
    or target_user_id = (select public.moje_id())::text
  )
  with check (true);

drop policy if exists "moje_zgloszenia" on public.issues;
create policy "moje_zgloszenia" on public.issues
  for all to authenticated
  using (
    user_id = (select public.moje_id())
    or ((select public.jest_kierownikiem())
        and (coalesce(is_anonymous, false) or user_id is null
             or user_id = any ((select public.moi_ludzie())::uuid[])))
  )
  with check (true);

drop policy if exists "swoj_lokal" on public.staffing_rules;
create policy "swoj_lokal" on public.staffing_rules
  for all to authenticated
  using (
    (select public.widzi_wszystko())
    or exists (select 1 from staffing_rule_sets s
               where s.id::text = staffing_rules.set_id
                 and coalesce(s.lokal, '') = any ((select public.moje_lokale())::text[]))
    or exists (select 1 from grafik_wyjatki w
               where w.id::text = staffing_rules.wyjatek_id
                 and coalesce(w.lokal, '') = any ((select public.moje_lokale())::text[]))
  )
  with check (true);

drop policy if exists "wykonania_lokalu" on public.task_completions;
create policy "wykonania_lokalu" on public.task_completions
  for all to authenticated
  using (
    (select public.widzi_wszystko())
    or exists (select 1 from tasks t
               where t.id::text = task_completions.task_id
                 and coalesce(t.lokal, '') = any ((select public.lokale_do_pracy())::text[]))
    or user_id = (select public.moje_id())::text
  )
  with check (true);

drop policy if exists "tylko_kierownik" on public.shift_edits;
create policy "tylko_kierownik" on public.shift_edits
  for all to authenticated
  using ((select public.jest_kierownikiem()))
  with check ((select public.jest_kierownikiem()));

-- weryfikacja: inwentarz polityk (liczba > 1 poza app_errors x3 i users x2 = pułapka)
select t.tablename, count(p.policyname) as ile_polityk,
       string_agg(p.policyname, ', ' order by p.policyname) as polityki
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.tablename <> 'schema_migrations'
group by t.tablename
order by count(p.policyname) desc, t.tablename;
