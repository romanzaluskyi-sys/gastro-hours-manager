-- Etap 3c-2, pierwsza porcja: dane JEDNEGO lokalu zostają w tym lokalu.
--
-- STAN PRZED: po `0029`/`0030` cudze stawki i dane osobowe są zakryte, ale
-- KAŻDE zalogowane konto — w tym cztery tablety stojące w salach — czyta
-- utargi, cele finansowe, wymagania obsady, godziny otwarcia i checklisty
-- WSZYSTKICH czterech lokali. Tablet w Ceglanej widzi, ile utargu zrobił
-- Sunset i jaki ma cel kosztu pracy.
--
-- ⚠️ Ta migracja obejmuje tabele, w których zawężenie do lokalu jest
-- JEDNOZNACZNE — nic w aplikacji nie sięga tu poza własny lokal. Tabele
-- „ludzkie" (`shifts`, `grafik_shifts`, `absences`, `issues`, `notifications`,
-- `shift_swaps`, `task_completions`) zostają na później, bo mają udowodnione
-- wyjątki: widok miesiąca POKAZUJE kierownikowi zmiany jego ludzi w CUDZYCH
-- lokalach, a `ostrzezeniaKodeksu` liczy odpoczynek przez wszystkie lokale
-- naraz. Wrzucone tu razem, zepsułyby oba ekrany po cichu.
--
-- ⚠️ `lokale` i `stanowiska` zostają otwarte ŚWIADOMIE. To same nazwy, a
-- formularz „Popraw zmianę" używa PEŁNYCH słowników — opisuje przeszłą
-- zmianę, która mogła się odbyć w innym lokalu (patrz CLAUDE.md, „Raporty i
-- koszty"). Zawężenie zabrałoby wypożyczonemu pracownikowi możliwość
-- poprawienia własnej zmiany.
--
-- ⚠️ ROLLBACK, gdyby coś stanęło pusto: dla danej tabeli wystarczy wrócić do
-- polityki z `0026`:
--     drop policy if exists "<nazwa niżej>" on public.<tabela>;
--     create policy "zalogowani" on public.<tabela>
--       for all to authenticated using (true) with check (true);

-- --------------------------------------------------------------------------
-- 1. Trzy predykaty.
--
-- `jest_kierownikiem()` staje się JEDNYM źródłem odpowiedzi na „czy ta osoba
-- prowadzi lokal". `widzi_kartoteke()` z `0029` przepinamy na nie zamiast
-- powtarzać listę ról w drugim miejscu — dwie kopie tej listy rozjechałyby
-- się przy pierwszej nowej roli, a rozjazd w uprawnieniach nie daje o sobie
-- znać, dopóki ktoś czegoś nie zobaczy.
-- --------------------------------------------------------------------------
create or replace function public.jest_kierownikiem()
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

create or replace function public.widzi_kartoteke()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.jest_kierownikiem();
$$;

-- ⚠️ `widzi_wszystko()` zostaje osobno i NIE jest tym samym pytaniem:
-- `manager_lokalu` prowadzi kartotekę, ale sieci nie widzi.
--
-- ⚠️ Wiersz z pustym `lokal` zostaje widoczny dla `admin`. Taki wiersz to
-- prawie zawsze dane sprzed jakiejś migracji; ukryty przed wszystkimi znika
-- bez śladu i nikt się nie dowie, że w ogóle był.
create or replace function public.widzi_lokal(p_lokal text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.widzi_wszystko()
      or coalesce(p_lokal, '') = any (public.moje_lokale());
$$;

-- ⚠️ Osobny, SZERSZY predykat dla rzeczy, których człowiek potrzebuje STOJĄC
-- NA SALI. Wypożyczony pracownik ma w karcie swój lokal macierzysty, a pracuje
-- dziś gdzie indziej — `widzi_lokal` zabrałoby mu checklistę tam, gdzie
-- faktycznie stoi: pusty ekran zadań w cudzym lokalu, rano. Wypożyczanie ludzi
-- między lokalami to u właściciela normalna praktyka, nie wyjątek.
--
-- ⚠️ Dotyczy WYŁĄCZNIE zadań i tego, co się w lokalu mierzy. Utargi, budżet i
-- wymagania obsady zostają przy `widzi_lokal` — do pracy na sali nie są
-- potrzebne, a to są właśnie te liczby, które ten etap ma zamknąć.
--
-- ⚠️ Okno wczoraj–jutro, jak w `sprawdz_kiosk_pin` (migracja 0027): baza liczy
-- `current_date` w UTC, lokale pracują w czasie polskim, a zmiana nocna
-- przechodzi przez północ.
create or replace function public.pracuje_w_lokalu(p_lokal text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.widzi_lokal(p_lokal)
      or exists (
        select 1
        from grafik_shifts gs
        join users u on u.id::text = gs.user_id
        where u.auth_id = auth.uid()
          and gs.published_at is not null
          and gs.deleted_at is null
          and gs.date between current_date - 1 and current_date + 1
          and gs.lokal = p_lokal
      )
      or exists (
        select 1
        from shifts s
        join users u on u.id = s.user_id
        where u.auth_id = auth.uid()
          and s.start_time >= current_date - 1
          and s.lokal = p_lokal
      );
$$;

grant execute on function public.jest_kierownikiem()     to authenticated;
grant execute on function public.widzi_lokal(text)       to authenticated;
grant execute on function public.pracuje_w_lokalu(text)  to authenticated;

-- --------------------------------------------------------------------------
-- 2. Tabele z kolumną `lokal` — widzi je ten, kto ma ten lokal.
--
-- ⚠️ Polityka RLS zwraca MNIEJ WIERSZY, nie błąd. To jest tu zaletą: ekran,
-- który tych danych nie używa, dostaje pustą listę zamiast „permission
-- denied" na środku. I jest wadą przy diagnozie — patrz `--porownaj` w
-- scripts/sprawdz-dostep.py, bo pustej listy nie odróżnisz okiem od dnia,
-- w którym nic się nie działo.
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'day_logs',            -- utargi i zamknięcia dnia
    'day_log_entries',     -- wpisy HACCP
    'staffing_rule_sets',  -- zestawy wymagań obsady
    'grafik_wyjatki',      -- wyjątki w grafiku
    'lokale_godziny'       -- godziny otwarcia
  ]
  loop
    execute format('drop policy if exists "zalogowani" on public.%I', t);
    execute format('drop policy if exists "swoj_lokal" on public.%I', t);
    execute format(
      'create policy "swoj_lokal" on public.%I for all to authenticated '
      'using (public.widzi_lokal(lokal)) with check (public.widzi_lokal(lokal))',
      t
    );
  end loop;
end $$;

-- Zadania i to, co się w lokalu mierzy — przez SZERSZY predykat, żeby
-- wypożyczony nie stanął rano przed pustą checklistą (powód wyżej).
do $$
declare t text;
begin
  foreach t in array array['tasks', 'task_blocks', 'day_log_templates']
  loop
    execute format('drop policy if exists "zalogowani" on public.%I', t);
    execute format('drop policy if exists "lokal_pracy" on public.%I', t);
    execute format(
      'create policy "lokal_pracy" on public.%I for all to authenticated '
      'using (public.pracuje_w_lokalu(lokal)) '
      'with check (public.pracuje_w_lokalu(lokal))',
      t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- 3. Wymagania obsady — lokal jest o jeden przeskok dalej.
--
-- `staffing_rules` wisi ALBO na zestawie miesięcznym (`set_id`), ALBO na
-- wyjątku (`wyjatek_id`) — obie drogi muszą być w polityce, inaczej połowa
-- reguł zniknęłaby z konfiguracji Grafiku bez żadnego komunikatu.
-- --------------------------------------------------------------------------
drop policy if exists "zalogowani" on public.staffing_rules;
drop policy if exists "swoj_lokal" on public.staffing_rules;
create policy "swoj_lokal" on public.staffing_rules
  for all to authenticated
  using (
    exists (select 1 from staffing_rule_sets s
            where s.id::text = staffing_rules.set_id
              and public.widzi_lokal(s.lokal))
    or exists (select 1 from grafik_wyjatki w
               where w.id::text = staffing_rules.wyjatek_id
                 and public.widzi_lokal(w.lokal))
  )
  with check (
    exists (select 1 from staffing_rule_sets s
            where s.id::text = staffing_rules.set_id
              and public.widzi_lokal(s.lokal))
    or exists (select 1 from grafik_wyjatki w
               where w.id::text = staffing_rules.wyjatek_id
                 and public.widzi_lokal(w.lokal))
  );

-- --------------------------------------------------------------------------
-- 4. Pieniądze Grafiku — lokal ORAZ rola.
--
-- „Budżetu nie widzi pracownik — ani na tablecie, ani na prywatnym telefonie"
-- (ustalenie właściciela, CLAUDE.md 5f). Dotąd widział: App pobiera te tabele
-- dla każdej roli, a polityka nikogo nie odróżniała. Ekrany pracownika ich nie
-- rysują, więc pusta lista niczego tam nie zmienia.
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['grafik_budzet_cele', 'grafik_budzet_dni']
  loop
    execute format('drop policy if exists "zalogowani" on public.%I', t);
    execute format('drop policy if exists "budzet_kierownika" on public.%I', t);
    execute format(
      'create policy "budzet_kierownika" on public.%I for all to authenticated '
      'using (public.jest_kierownikiem() and public.widzi_lokal(lokal)) '
      'with check (public.jest_kierownikiem() and public.widzi_lokal(lokal))',
      t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- 5. Historia korekt godzin — tylko kierownik.
--
-- `shift_edits` nie ma kolumny lokalu, a czyta ją wyłącznie panel („Historia"
-- w Rejestrze Godzin i licznik korekt w Raportach). Zawężenie do lokalu
-- wymagałoby skoku przez `shifts`; rola załatwia większość ryzyka teraz.
-- --------------------------------------------------------------------------
drop policy if exists "zalogowani" on public.shift_edits;
drop policy if exists "tylko_kierownik" on public.shift_edits;
create policy "tylko_kierownik" on public.shift_edits
  for all to authenticated
  using (public.jest_kierownikiem()) with check (public.jest_kierownikiem());

-- --------------------------------------------------------------------------
-- 6. Dziennik błędów — pisać może każdy, czytać tylko admin.
--
-- ⚠️ Zapis zostaje otwarty dla WSZYSTKICH, łącznie z niezalogowanymi (wyjątek
-- z `0026` zostaje nietknięty): awaria, która najbardziej potrzebuje śladu,
-- zdarza się na ekranie logowania. Odczyt to co innego — wiersz niesie imię,
-- lokal, adres ekranu i treść błędu, czyli mapę tego, kto gdzie pracuje.
-- --------------------------------------------------------------------------
drop policy if exists "zalogowani" on public.app_errors;
drop policy if exists "bledy_pisza_wszyscy" on public.app_errors;
drop policy if exists "bledy_czyta_admin" on public.app_errors;
create policy "bledy_pisza_wszyscy" on public.app_errors
  for insert to authenticated with check (true);
create policy "bledy_czyta_admin" on public.app_errors
  for select to authenticated using (public.widzi_wszystko());

-- weryfikacja: gdzie wciąż stoi otwarta polityka z 0026
select tablename, policyname
from pg_policies
where schemaname = 'public' and policyname = 'zalogowani'
order by tablename;

-- weryfikacja: co widzi TO konto (uruchom zalogowany jako tablet i jako kierownik)
select 'day_logs' as tabela, count(*) from day_logs
union all select 'grafik_budzet_cele', count(*) from grafik_budzet_cele
union all select 'tasks', count(*) from tasks
union all select 'staffing_rules', count(*) from staffing_rules
union all select 'shift_edits', count(*) from shift_edits
union all select 'app_errors', count(*) from app_errors
union all select 'day_log_templates', count(*) from day_log_templates
union all select 'lokale_godziny', count(*) from lokale_godziny;
