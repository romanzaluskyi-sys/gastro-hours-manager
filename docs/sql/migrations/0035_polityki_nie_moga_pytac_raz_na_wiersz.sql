-- AWARIA I JEJ NAPRAWA: polityka nie może wołać funkcji raz na wiersz.
--
-- OBJAW (23.09.2026, zgłoszone przez właściciela): na Tablecie Służbowym
-- pracownicy NIE MAJĄ ŻADNYCH powiadomień, wszystko puste. Pomiar pokazał
-- czemu: odczyt `notifications` kończy się `57014 — canceling statement due to
-- statement timeout`. Aplikacja łapie to jako błąd i zostawia pustą listę
-- (`loadNotifications` w App.tsx celowo nie przerywa reszty), więc awaria
-- wygląda jak „nikt nic nie napisał".
--
-- PRZYCZYNA: polityka z `0033`/`0034` wołała `public.widzi_lokal(lokal)` —
-- funkcję, która BIERZE WARTOŚĆ Z WIERSZA. Takiej Postgres nie policzy raz:
-- musi ją wykonać dla każdego wiersza, a w środku ona woła `moje_lokale()`,
-- które przeszukuje `users` i `lokale`. Przy 553 powiadomieniach to pół
-- tysiąca kaskad zapytań na jeden odczyt.
--
-- ⚠️ ZASADA: w polityce RLS funkcja `stable` BEZ ARGUMENTÓW liczy się raz na
-- zapytanie (planer robi z niej InitPlan) — ale ta sama funkcja z argumentem
-- z wiersza liczy się raz na WIERSZ. Dlatego porównujemy
--     kolumna = any (funkcja_bez_argumentow())
-- zamiast
--     funkcja_z_argumentem(kolumna)
-- Wynik logiczny jest ten sam, koszt różni się o rząd wielkości. Tabele z
-- `0031` przeżyły tę pomyłkę tylko dlatego, że mają po kilkadziesiąt wierszy;
-- `shifts` z 3071 wierszami wywróciłby się tak samo, więc poprawiamy WSZYSTKIE
-- naraz, zanim dojdzie do nich kolejna porcja.
--
-- ⚠️ Gdyby po tej migracji powiadomienia dalej były puste, natychmiastowy
-- ratunek to polityka otwarta dla zalogowanych:
--     drop policy if exists "moje_wiadomosci" on public.notifications;
--     create policy "zalogowani" on public.notifications
--       for all to authenticated using (true) with check (true);

-- --------------------------------------------------------------------------
-- 1. Lokale, w których mogę pracować — jako TABLICA, nie jako pytanie o wiersz.
--
-- Zastępuje `pracuje_w_lokalu(lokal)` wszędzie tam, gdzie stała w polityce.
-- Sama funkcja zostaje (nie szkodzi), ale polityki jej już nie wołają.
-- --------------------------------------------------------------------------
create or replace function public.lokale_do_pracy()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct x.l), '{}'::text[])
  from (
    select unnest(public.moje_lokale()) as l
    union
    select gs.lokal
      from grafik_shifts gs
      join users u on u.id::text = gs.user_id
     where u.auth_id = auth.uid()
       and gs.published_at is not null
       and gs.deleted_at is null
       and gs.date between current_date - 1 and current_date + 1
    union
    select s.lokal
      from shifts s
      join users u on u.id = s.user_id
     where u.auth_id = auth.uid()
       and s.start_time >= current_date - 1
  ) x
  where x.l is not null and x.l <> '';
$fn$;

grant execute on function public.lokale_do_pracy() to authenticated;

-- --------------------------------------------------------------------------
-- 2. Powiadomienia — to jest ta awaria.
-- --------------------------------------------------------------------------
drop policy if exists "moje_wiadomosci" on public.notifications;
create policy "moje_wiadomosci" on public.notifications
  for all to authenticated
  using (
    -- wiadomość do człowieka: moja albo kogoś z moich ludzi
    (coalesce(audience, 'employee') <> 'manager'
     and coalesce(user_name, '') = any (public.imiona_moich_ludzi()))
    -- wiadomość dla kierowników: mój lokal (albo bez lokalu)
    or (coalesce(audience, '') = 'manager'
        and public.jest_kierownikiem()
        and (coalesce(lokal, '') = any (public.moje_lokale())
             or coalesce(lokal, '') = ''
             or public.widzi_wszystko()))
  )
  with check (true);

-- ⚠️ `imiona_moich_ludzi()` zawiera już MOJE imię (jestem jednym ze swoich
-- ludzi), więc osobny warunek na `moje_imie()` zniknął — był drugim wywołaniem
-- funkcji w tym samym predykacie i niczego nie dokładał.

-- --------------------------------------------------------------------------
-- 3. Te same poprawki na pozostałych tabelach — zanim urosną.
-- --------------------------------------------------------------------------
do $blok$
declare t text;
begin
  -- lokal wprost w wierszu: porównanie z tablicą zamiast wywołania z argumentem
  foreach t in array array[
    'day_logs', 'day_log_entries', 'staffing_rule_sets',
    'grafik_wyjatki', 'lokale_godziny'
  ]
  loop
    execute format('drop policy if exists "swoj_lokal" on public.%I', t);
    execute format(
      'create policy "swoj_lokal" on public.%I for all to authenticated '
      'using (public.widzi_wszystko() or coalesce(lokal, '''') = any (public.moje_lokale())) '
      'with check (public.widzi_wszystko() or coalesce(lokal, '''') = any (public.moje_lokale()))',
      t
    );
  end loop;

  foreach t in array array['tasks', 'task_blocks', 'day_log_templates']
  loop
    execute format('drop policy if exists "lokal_pracy" on public.%I', t);
    execute format(
      'create policy "lokal_pracy" on public.%I for all to authenticated '
      'using (public.widzi_wszystko() or coalesce(lokal, '''') = any (public.lokale_do_pracy())) '
      'with check (public.widzi_wszystko() or coalesce(lokal, '''') = any (public.lokale_do_pracy()))',
      t
    );
  end loop;

  foreach t in array array['grafik_budzet_cele', 'grafik_budzet_dni']
  loop
    execute format('drop policy if exists "budzet_kierownika" on public.%I', t);
    execute format(
      'create policy "budzet_kierownika" on public.%I for all to authenticated '
      'using (public.jest_kierownikiem() and (public.widzi_wszystko() '
      '       or coalesce(lokal, '''') = any (public.moje_lokale()))) '
      'with check (public.jest_kierownikiem() and (public.widzi_wszystko() '
      '       or coalesce(lokal, '''') = any (public.moje_lokale())))',
      t
    );
  end loop;
end $blok$;

drop policy if exists "moje_wolne" on public.absences;
create policy "moje_wolne" on public.absences
  for all to authenticated
  using (
    public.widzi_wszystko()
    or coalesce(lokal, '') = any (public.moje_lokale())
    or user_id = public.moje_id()
    or (public.jest_kierownikiem() and user_id = any (public.moi_ludzie()))
  )
  with check (true);

drop policy if exists "gielda_lokalu" on public.shift_swaps;
create policy "gielda_lokalu" on public.shift_swaps
  for all to authenticated
  using (
    public.widzi_wszystko()
    or coalesce(lokal, '') = any (public.moje_lokale())
    or author_user_id = public.moje_id()::text
    or taker_user_id  = public.moje_id()::text
    or target_user_id = public.moje_id()::text
  )
  with check (true);

-- `staffing_rules` i `task_completions` sięgają przez klucz do innej tabeli.
-- Podzapytanie zostaje (bez niego nie ma jak), ale w środku porównujemy z
-- tablicą, żeby nie wołać funkcji z argumentem dla każdego wiersza.
drop policy if exists "swoj_lokal" on public.staffing_rules;
create policy "swoj_lokal" on public.staffing_rules
  for all to authenticated
  using (
    public.widzi_wszystko()
    or exists (select 1 from staffing_rule_sets s
               where s.id::text = staffing_rules.set_id
                 and coalesce(s.lokal, '') = any (public.moje_lokale()))
    or exists (select 1 from grafik_wyjatki w
               where w.id::text = staffing_rules.wyjatek_id
                 and coalesce(w.lokal, '') = any (public.moje_lokale()))
  )
  with check (true);

drop policy if exists "wykonania_lokalu" on public.task_completions;
create policy "wykonania_lokalu" on public.task_completions
  for all to authenticated
  using (
    public.widzi_wszystko()
    or exists (select 1 from tasks t
               where t.id::text = task_completions.task_id
                 and coalesce(t.lokal, '') = any (public.lokale_do_pracy()))
    or user_id = public.moje_id()::text
  )
  with check (true);

-- weryfikacja: policz to, co się wywracało. Ma wrócić liczba, nie timeout.
select count(*) as widziane_powiadomienia from notifications;
select count(*) as widziane_zadania from tasks;
