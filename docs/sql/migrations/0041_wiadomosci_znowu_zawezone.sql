-- Etap 3c-2, zamknięcie: `notifications` wraca pod zawężenie.
--
-- STAN PRZED: 23.09.2026 polityka z `0033`/`0034` dawała timeout
-- (`57014`) i na Tablecie Służbowym zniknęły wszystkie wiadomości. Właściciel
-- odblokował tabelę RĘCZNIE ratunkiem z `0035` — polityka "zalogowani",
-- `using (true)`. Próba ponownego zawężenia (dawna migracja "InitPlan") padła
-- 24.09 na `text = text[]` i została usunięta. Od tamtej pory każde zalogowane
-- konto czyta WSZYSTKIE wiadomości w sieci — także „Twój termin: umowa
-- dobiega końca" i odpowiedzi kierownika na zgłoszenia.
--
-- ⚠️ Osobna migracja od `0040` świadomie: to tabela, która już raz wyłączyła
-- tablety. Wdrażaj ją PO `0040`, z pomiarem przed i po, i sprawdź na
-- tablecie, że koperty przy nazwiskach dalej się świecą.
--
-- Co się zmienia względem `0035` (poza kształtem zapytania):
--   * **Prywatny telefon widzi wyłącznie SWOJE wiadomości.** `0033` dało
--     każdemu `imiona_moich_ludzi()` — to było pomyślane dla tabletu (koperta
--     przy nazwisku na liście wyboru), ale objęło też telefon pracownika, który
--     czytał wiadomości całej swojej załogi.
--   * **Tablet widzi wiadomości osób ze SWOJEJ LISTY** (`widoczni_ludzie()` z
--     `0040`), czyli także wypożyczonych z grafiku. Dotąd wypożyczony stał na
--     liście bez koperty, choć miał nieprzeczytaną wiadomość.
--   * Kierownik — bez zmian: wiadomości swoich ludzi i wiadomości dla
--     kierowników swojego lokalu (albo bez lokalu).
--
-- ⚠️ Kształt zapytania: każda funkcja w PODZAPYTANIU SKALARNYM z rzutowaniem
-- (`= any ((select f())::text[])`), żadnej funkcji z argumentem z wiersza.
-- Sprawdzone `explain analyze` na lokalnym Postgresie 16 przy 600 wierszach:
-- każda funkcja to InitPlan z `loops=1`.
--
-- ⚠️ `with check (true)` ŚWIADOMIE (patrz `0033`): wiadomość tworzy się DLA
-- KOGOŚ INNEGO. Ale samo `with check` nie wystarcza: `api.post` to
-- INSERT … RETURNING, a zwracany wiersz Postgres sprawdza polityką ODCZYTU.
-- Tablet nie widzi wiadomości dla kierowników, więc jego „Popraw zmianę"
-- (która budzi kierownika) padałaby w CAŁOŚCI z „new row violates row-level
-- security policy" — sprawdzone na lokalnej bazie. Dlatego od 0.70.3
-- wiadomości zapisuje się `api.dodajBezOdczytu` (`api/notifications.ts`,
-- `notifyEmployee` w ManagerDashboard).
--
-- ⚠️ KOLEJNOŚĆ: ta migracja idzie DOPIERO PO deployu 0.70.3 i po odświeżeniu
-- tabletów (pasek „dostępna nowa wersja"). Stary bundle zapisuje wiadomości
-- z RETURNING i po tej migracji przestałby budzić kierownika. `0040` tej
-- zależności nie ma.
--
-- WDROŻENIE:
--   0. deploy 0.70.3 i odświeżenie WSZYSTKICH tabletów;
--   1. `sprawdz-dostep.py --zapisz` kontem kierownika z kompletem lokali i
--      kontem tabletu;
--   2. `python3 scripts/migrate.py --projekt REF --do 0041 --wykonaj`;
--   3. na tablecie: koperta przy osobie z nieprzeczytaną wiadomością, wejście
--      w Wiadomości, wysłanie korekty (budzi kierownika);
--   4. `--porownaj`: kierownik z kompletem lokali — `notifications` BEZ
--      spadku; tablet — spadek.
--   Natychmiastowy ratunek (to samo co 23.09):
--     drop policy if exists "moje_wiadomosci" on public.notifications;
--     create policy "zalogowani" on public.notifications
--       for all to authenticated using (true) with check (true);

create or replace function public.imiona_widocznych_ludzi()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct u.name), '{}'::text[])
  from users u
  where u.id = any ((select public.widoczni_ludzie())::uuid[]);
$fn$;

revoke all on function public.imiona_widocznych_ludzi() from public, anon;
grant execute on function public.imiona_widocznych_ludzi() to authenticated;

-- Zdjęcie WSZYSTKICH polityk (ręcznie dodana "zalogowani" nie ma śladu w
-- repo — dlatego katalog, nie lista nazw).
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
    (select public.widzi_wszystko())
    -- wiadomość do człowieka
    or (coalesce(audience, 'employee') <> 'manager'
        and (coalesce(user_name, '') = coalesce((select public.moje_imie()), '#')
             or (((select public.jest_kierownikiem())
                  or coalesce((select public.moja_rola()), '') = 'kiosk')
                 and coalesce(user_name, '') = any ((select public.imiona_widocznych_ludzi())::text[]))))
    -- wiadomość dla kierowników: mój lokal albo bez lokalu
    or (coalesce(audience, '') = 'manager'
        and (select public.jest_kierownikiem())
        and (coalesce(lokal, '') = ''
             or coalesce(lokal, '') = any ((select public.moje_lokale())::text[])))
  )
  with check (true);

-- weryfikacja: dokładnie jedna polityka i liczba zamiast timeoutu
select tablename, count(*) as ile_polityk, string_agg(policyname, ', ') as polityki
from pg_policies
where schemaname = 'public' and tablename = 'notifications'
group by tablename;
select count(*) as widziane_powiadomienia from notifications;
