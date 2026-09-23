-- Stare, otwarte polityki, o których `0026` nie wiedziała.
--
-- ZNALEZIONE 23.09.2026, przy sprawdzaniu, czemu `0031` nie zawęziło części
-- tabel. Inwentarz `pg_policies` pokazał pięć tabel z DWIEMA politykami:
--
--   tasks             → tasks_open_all            + lokal_pracy
--   task_blocks       → task_blocks_open_all      + lokal_pracy
--   task_completions  → task_completions_open_all + zalogowani
--   notifications     → notifications_public_all  + zalogowani
--   shift_edits       → "open access"             + tylko_kierownik
--
-- ⚠️ Polityki PERMISYWNE składają się przez LUB. Jedna otwarta unieważnia
-- każdą następną — nowa polityka wygląda w katalogu poprawnie i nie robi nic.
-- To najgorszy rodzaj awarii uprawnień: wszystko wygląda na zrobione.
--
-- PRZYCZYNA: `0026` zdejmowała polityki PO NAZWIE — `drop policy "open"` i
-- `drop policy "zalogowani"`. Listę TABEL brała z `pg_tables` właśnie po to,
-- żeby nie zapomnieć o nowej (i ten komentarz stoi w `0026`), ale listę NAZW
-- POLITYK wypisała z pamięci. Te pięć nazwano inaczej — w migracjach `0019`,
-- `0021` i przy ręcznych poprawkach w SQL Editorze.
--
-- ⚠️ ZASADA NA PRZYSZŁOŚĆ: zdejmując polityki, ENUMERUJ je z `pg_policies`
-- dla danej tabeli, nigdy nie wypisuj nazw. Nazwa, której nie znasz, jest
-- dokładnie tą, która zostanie otwarta.
--
-- Skutek, który to miało: od `0026` każde ZALOGOWANE konto czytało cudze
-- powiadomienia, wykonania zadań i historię korekt godzin, a `0031` nie
-- zawęziło zadań ani bloków. Anonima to nie dotyczyło — jego odcina `REVOKE`
-- z `0026`, czyli uprawnienie, a nie polityka (potwierdzone pomiarem: 401 na
-- wszystkich 24 tabelach).

-- --------------------------------------------------------------------------
-- 1. Zdejmujemy WSZYSTKO, co na tych tabelach stoi — z katalogu, nie z listy.
-- --------------------------------------------------------------------------
do $$
declare t text;
        p record;
begin
  foreach t in array array[
    'tasks', 'task_blocks', 'task_completions', 'notifications', 'shift_edits'
  ]
  loop
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      -- %I radzi sobie też z nazwą ze spacją ("open access").
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- 2. Odtwarzamy to, co miało tam stać.
--
-- `tasks`/`task_blocks` — zawężenie z `0031`, tym razem bez towarzystwa.
-- --------------------------------------------------------------------------
create policy "lokal_pracy" on public.tasks
  for all to authenticated
  using (public.pracuje_w_lokalu(lokal))
  with check (public.pracuje_w_lokalu(lokal));

create policy "lokal_pracy" on public.task_blocks
  for all to authenticated
  using (public.pracuje_w_lokalu(lokal))
  with check (public.pracuje_w_lokalu(lokal));

create policy "tylko_kierownik" on public.shift_edits
  for all to authenticated
  using (public.jest_kierownikiem())
  with check (public.jest_kierownikiem());

-- ⚠️ `task_completions` i `notifications` wracają na politykę OTWARTĄ dla
-- zalogowanych — świadomie, a nie z przeoczenia. To tabele „ludzkie": kto co
-- wykonał i czyja to wiadomość. Mają własne wyjątki (Tablet Służbowy pokazuje
-- wiadomości WSZYSTKICH osób ze swojego lokalu, bo nikt nie wchodzi tam na
-- cudzą stronę) i zawężam je osobną porcją, po pomiarze. Wrzucone tutaj przy
-- okazji sprzątania nazw, zmieniłyby zachowanie przy migracji, która miała
-- tylko posprzątać.
create policy "zalogowani" on public.task_completions
  for all to authenticated using (true) with check (true);

create policy "zalogowani" on public.notifications
  for all to authenticated using (true) with check (true);

-- --------------------------------------------------------------------------
-- weryfikacja: pełny inwentarz polityk.
--
-- Oczekiwane po tej migracji:
--   app_errors  x3  (anonim_pisze_bledy, bledy_czyta_admin, bledy_pisza_wszyscy)
--   users       x2  (kartoteka_czyta, kartoteka_pisze)
--   reszta      x1
-- KAŻDA inna tabela z liczbą > 1 to polityka, która unieważnia sąsiadkę.
-- --------------------------------------------------------------------------
select t.tablename,
       t.rowsecurity as rls_wlaczone,
       count(p.policyname) as ile_polityk,
       string_agg(p.policyname, ', ' order by p.policyname) as polityki
from pg_tables t
left join pg_policies p
       on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.tablename <> 'schema_migrations'
group by t.tablename, t.rowsecurity
order by count(p.policyname) desc, t.tablename;
