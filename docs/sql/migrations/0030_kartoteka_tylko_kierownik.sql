-- Etap 3c-3, część druga: tabela `users` przestaje wydawać cudze wiersze.
--
-- ⚠️ DOPIERO PO wdrożeniu 0.43.0 I PO ODŚWIEŻENIU WSZYSTKICH TABLETÓW.
-- Bundle sprzed 0.43.0 czyta listę załogi wprost z `users`; po tej migracji
-- dostanie z niej wyłącznie własny wiersz, czyli ekran wyboru osoby na
-- tablecie będzie PUSTY. To nie jest „gorzej wygląda" — to lokal, który rano
-- nie odbije zmiany.
--
-- Sprawdź przed uruchomieniem: każdy tablet i każda przeglądarka kierownika
-- pokazuje wersję 0.43.0 (ekran logowania / stopka sidebara).
--
-- Widok `users_widok` i funkcja `dodaj_probnego` stoją już z migracji `0029`.

-- --------------------------------------------------------------------------
-- 1. Sama tabela: kto widzi wiersz i kto może go zmienić.
--
-- ⚠️ Zapis zamykamy razem z odczytem i to nie jest osobna sprawa. Maskowanie
-- odczytu przy otwartym zapisie byłoby teatrem: nie przeczytasz cudzej
-- stawki, ale przestawisz sobie `role` na `admin` i przeczytasz wszystko.
-- --------------------------------------------------------------------------
drop policy if exists "zalogowani" on public.users;
drop policy if exists "kartoteka_czyta" on public.users;
drop policy if exists "kartoteka_pisze" on public.users;

-- Odczyt wprost z tabeli: własny wiersz albo kierownik. Listę załogi
-- wszyscy pozostali biorą z `users_widok`.
create policy "kartoteka_czyta" on public.users
  for select to authenticated
  using (public.widzi_kartoteke() or auth_id = auth.uid());

-- Zapis: wyłącznie kierownik. Tablet zakłada osobę na próbę przez
-- `dodaj_probnego` niżej, a nie wprost — urządzenie stojące na sali nie ma
-- prawa tworzyć dowolnych kont.
create policy "kartoteka_pisze" on public.users
  for all to authenticated
  using (public.widzi_kartoteke())
  with check (public.widzi_kartoteke());


-- weryfikacja: polityki na users
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'users'
order by policyname;
