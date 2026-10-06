-- Etap 3c-2, porcja 3 (ostatnia): godziny (`shifts`) i grafik (`grafik_shifts`)
-- przestają być widoczne w całej sieci.
--
-- STAN PRZED: obie tabele mają od `0026` politykę "zalogowani" —
-- `using (true)` dla każdego zalogowanego. Tablet w jednym lokalu czyta
-- godziny i grafik wszystkich czterech, a prywatny telefon pracownika — godziny
-- każdej osoby w sieci. Po `0031`/`0033` to są ostatnie dwie tabele z danymi
-- ludzi, które jeszcze tak wyglądają.
--
-- ⚠️ Dlaczego te dwie szły na końcu (patrz `0033`): mają UDOWODNIONE wyjątki
-- sięgające poza własny lokal — i polityka niżej je zachowuje, każdy osobnym
-- warunkiem:
--   * widok miesiąca pokazuje kierownikowi CAŁY miesiąc jego ludzi, także
--     zmiany u sąsiada (ustalenie właściciela, 5c);
--   * `ostrzezeniaKodeksu` liczy odpoczynek przez wszystkie lokale naraz, a
--     panel przypisania sprawdza kolizję kandydata z innego lokalu;
--   * giełda: kandydaci do oddania/zamiany są sprawdzani po ICH grafiku, a
--     oferta skierowana do konkretnej osoby może wskazywać zmianę z lokalu,
--     którego ta osoba nie ma w karcie;
--   * wypożyczony pracownik przy „Cały lokal" ogląda grafik lokalu, w którym
--     go zaplanowano, a nie tylko swojego macierzystego.
--
-- ZASADA, z której wynika reszta: **kogo widzisz na liście osób
-- (`users_widok`), tego godziny i grafik widzisz W CAŁOŚCI**, a do tego
-- wszystko, co dzieje się w Twoim lokalu. Lista i godziny nie mogą mówić co
-- innego — tablet, który pokazuje osobę, a nie widzi jej otwartej zmiany w
-- drugim lokalu, pokazałby ją jako „nie na zmianie" i przepuścił duplikat
-- (`znajdzKolizjeWBazie` pyta bazę właśnie przez tę politykę).
--
-- ⚠️ Prywatny telefon pracownika (role inne niż kierownik i `kiosk`) widzi
-- w `shifts` WYŁĄCZNIE własne godziny. Ekrany pracownika filtrują i tak po
-- `user_id === employee.id`; cudze godziny potrzebne są tylko tabletowi
-- (stan dnia na liście osób) i kierownikowi. Grafik dostaje szerzej, bo
-- pracownik ogląda „Cały lokal" i wybiera kandydata na giełdzie.
--
-- ⚠️ ZAPIS do `grafik_shifts` tylko dla kierownika. Grafik piszą wyłącznie
-- ekrany kierownika (Grafik, Zatwierdzanie, decyzja giełdy, publikacja,
-- przepisanie na następcę); przyjęcie oferty przez pracownika pisze do
-- `shift_swaps`, nie do grafiku. Dziś każde zalogowane konto — także tablet na
-- sali — mogło przestawić sobie zmianę w grafiku.
-- ⚠️ Polityka jest jedna (`for all`), więc DELETE sprawdza tylko warunek
-- odczytu. Usunięcie przez pracownika widocznego wiersza grafiku jest
-- technicznie dalej możliwe — tak jak dziś; INSERT i UPDATE już nie.
--
-- ⚠️ Każde wywołanie funkcji w PODZAPYTANIU SKALARNYM z rzutowaniem na typ
-- tablicy — `= any ((select f())::text[])`. Bez rzutowania Postgres czyta to
-- jako ANY (podzapytanie) i pada na `text = text[]` (tak padła usunięta
-- migracja "InitPlan" 24.09.2026); bez podzapytania funkcja liczy się zwykle
-- RAZ NA WIERSZ, a `shifts` ma ~3000 wierszy (patrz `0035` i timeout na
-- `notifications`). Sprawdzone `explain analyze` na lokalnym Postgresie 16:
-- każda funkcja to InitPlan z `loops=1`.
--
-- ⚠️ Polityki zdejmujemy ENUMERUJĄC `pg_policies` (lekcja z `0032`): jedna
-- zapomniana, otwarta polityka unieważnia nową bez śladu.
--
-- WDROŻENIE: nie wymaga deployu aplikacji ani odświeżenia tabletów.
--   1. `python3 scripts/sprawdz-dostep.py ... --zapisz przed.json` kontem
--      KIEROWNIKA Z KOMPLETEM LOKALI i osobno kontem TABLETU;
--   2. `python3 scripts/migrate.py --projekt REF --do 0040 --wykonaj`;
--   3. `--porownaj przed.json` oboma kontami. U kierownika z kompletem lokali
--      `shifts` i `grafik_shifts` NIE MAJĄ PRAWA spaść ani o wiersz — każdy
--      spadek to przezawężenie (najpewniej wiersz z nazwą lokalu spoza
--      słownika `lokale`). Tablet ma spaść.
--   Natychmiastowy ratunek, gdyby ekran godzin zrobił się pusty:
--     drop policy if exists "godziny" on public.shifts;
--     create policy "zalogowani" on public.shifts
--       for all to authenticated using (true) with check (true);
--     drop policy if exists "grafik" on public.grafik_shifts;
--     create policy "zalogowani" on public.grafik_shifts
--       for all to authenticated using (true) with check (true);

-- --------------------------------------------------------------------------
-- 1. Kogo widzę na liście — JEDNA odpowiedź, ta sama co `where` w `users_widok`
--    (`0034`): moi ludzie, ja i wypożyczeni, których opublikowany grafik
--    stawia dziś w moim lokalu (okno wczoraj–jutro, bo `current_date` jest w
--    UTC, a lokale pracują w czasie polskim).
--
-- ⚠️ Zmieniając warunek w `users_widok`, zmień go TUTAJ — rozjazd znaczy, że
--    tablet pokazuje osobę, której godzin nie widzi.
-- --------------------------------------------------------------------------
create or replace function public.widoczni_ludzie()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
  from (
    select unnest((select public.moi_ludzie())::uuid[]) as id
    union
    select (select public.moje_id())
    union
    select u.id
      from grafik_shifts gs
      join users u on u.id::text = gs.user_id
     where gs.published_at is not null
       and gs.deleted_at is null
       and gs.date between current_date - 1 and current_date + 1
       and gs.lokal = any ((select public.moje_lokale())::text[])
  ) x
  where x.id is not null;
$fn$;

-- Lokale, w których MNIE zaplanowano (opublikowane, od miesiąca wstecz w
-- przód). Wypożyczony ogląda „Cały lokal" w dniu, w którym tam pracuje —
-- także za tydzień, nie tylko dziś, więc okno `lokale_do_pracy()` (±1 dzień)
-- tu nie wystarcza.
create or replace function public.lokale_mojego_grafiku()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct gs.lokal), '{}'::text[])
  from grafik_shifts gs
  where gs.user_id = (select public.moje_id())::text
    and gs.published_at is not null
    and gs.deleted_at is null
    and gs.date >= current_date - 31
    and coalesce(gs.lokal, '') <> '';
$fn$;

-- Zmiany grafiku, o które toczy się ŻYWA sprawa na giełdzie: jestem jej
-- stroną (autor, chętny, adresat) albo oferta jest z mojego lokalu (kierownik
-- decyduje, tablet pokazuje). Obie strony zamiany — także ta wzajemna, która
-- bywa z innego lokalu. Bez tego oferta skierowana do osoby z innego lokalu
-- znikałaby jej z ekranu (`offersForUser` sprawdza, czy zmiana istnieje), a
-- kierownik miałby wyłączone „Zatwierdź", bo nie widziałby drugiej zmiany.
create or replace function public.zmiany_z_gieldy()
returns text[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct x.id), '{}'::text[])
  from (
    select unnest(array[sw.grafik_shift_id, sw.wzajemna_shift_id]) as id
    from shift_swaps sw
    where sw.status in ('na_gieldzie', 'przyjeta')
      and (sw.author_user_id = (select public.moje_id())::text
           or sw.taker_user_id = (select public.moje_id())::text
           or sw.target_user_id = (select public.moje_id())::text
           or coalesce(sw.lokal, '') = any ((select public.moje_lokale())::text[]))
  ) x
  where x.id is not null and x.id <> '';
$fn$;

revoke all on function public.widoczni_ludzie()       from public, anon;
revoke all on function public.lokale_mojego_grafiku() from public, anon;
revoke all on function public.zmiany_z_gieldy()       from public, anon;
grant execute on function public.widoczni_ludzie()       to authenticated;
grant execute on function public.lokale_mojego_grafiku() to authenticated;
grant execute on function public.zmiany_z_gieldy()       to authenticated;

-- --------------------------------------------------------------------------
-- 2. Zdjęcie WSZYSTKICH polityk z obu tabel (z katalogu, nie z pamięci).
-- --------------------------------------------------------------------------
do $blok$
declare t text; p record;
begin
  foreach t in array array['shifts', 'grafik_shifts']
  loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $blok$;

-- --------------------------------------------------------------------------
-- 3. Godziny (fakt).
--
-- ⚠️ Warunek zapisu = warunek odczytu, i to jest konieczne, nie wygodne:
--    `api.post` to INSERT … RETURNING, więc wiersz, którego piszący nie
--    WIDZI, odrzuca cały zapis (patrz `0037`). Tablet zapisuje godziny osób z
--    listy, kierownik — swoich ludzi i wszystkiego w swoim lokalu, pracownik
--    z prywatnego telefonu — wyłącznie swoje.
-- ⚠️ Wiersze bez `user_id` (historia z Google Forms) widzi kierownik i
--    tablet po lokalu, a cała sieć — właściciel. Ekrany pracownika i tak ich
--    nie pokazywały (filtrują po `user_id`).
-- --------------------------------------------------------------------------
create policy "godziny" on public.shifts
  for all to authenticated
  using (
    (select public.widzi_wszystko())
    or user_id = (select public.moje_id())
    or (((select public.jest_kierownikiem())
         or coalesce((select public.moja_rola()), '') = 'kiosk')
        and (coalesce(lokal, '') = any ((select public.moje_lokale())::text[])
             or user_id = any ((select public.widoczni_ludzie())::uuid[])))
  )
  with check (
    (select public.widzi_wszystko())
    or user_id = (select public.moje_id())
    or (((select public.jest_kierownikiem())
         or coalesce((select public.moja_rola()), '') = 'kiosk')
        and (coalesce(lokal, '') = any ((select public.moje_lokale())::text[])
             or user_id = any ((select public.widoczni_ludzie())::uuid[])))
  );

-- --------------------------------------------------------------------------
-- 4. Grafik (plan).
--
-- ⚠️ `grafik_shifts.user_id` to TEKST (`0007`), stąd `::text[]` na tablicy
--    uuid — porównanie tekstu z tekstem, bez rzutowania kolumny (wiersz z
--    nie-uuid w `user_id` wywróciłby `user_id::uuid` całe zapytanie).
-- ⚠️ Zapis kierownika: jego lokal ALBO jego człowiek (zmiana wpisana z siatki
--    jednego lokalu do drugiego — kafelek „stanowisko · lokal"). Cudzego
--    człowieka w cudzym lokalu kierownik lokalu nie zapisze — to grafik
--    sąsiada.
-- --------------------------------------------------------------------------
create policy "grafik" on public.grafik_shifts
  for all to authenticated
  using (
    (select public.widzi_wszystko())
    or coalesce(lokal, '') = any ((select public.moje_lokale())::text[])
    or coalesce(user_id, '') = any ((select public.widoczni_ludzie())::text[])
    or coalesce(lokal, '') = any ((select public.lokale_mojego_grafiku())::text[])
    or id::text = any ((select public.zmiany_z_gieldy())::text[])
  )
  with check (
    (select public.widzi_wszystko())
    or ((select public.jest_kierownikiem())
        and (coalesce(lokal, '') = any ((select public.moje_lokale())::text[])
             or coalesce(user_id, '') = any ((select public.moi_ludzie())::text[])))
  );

-- --------------------------------------------------------------------------
-- 5. Weryfikacja.
-- --------------------------------------------------------------------------
-- a) inwentarz: na `shifts` i `grafik_shifts` ma stać DOKŁADNIE jedna
--    polityka (patrz `0032` — liczba > 1 to polityka unieważniająca sąsiadkę)
select tablename, count(*) as ile_polityk, string_agg(policyname, ', ') as polityki
from pg_policies
where schemaname = 'public' and tablename in ('shifts', 'grafik_shifts')
group by tablename
order by tablename;

-- b) czy żaden wiersz nie ma lokalu spoza słownika — taki wiersz wypada
--    kierownikowi lokalu (właściciel dalej go widzi). Ma wrócić pusto; jeśli
--    nie, popraw nazwy PRZED porównaniem liczby wierszy.
select 'shifts' as tabela, lokal, count(*) from shifts
where coalesce(lokal, '') not in (select name from lokale) group by lokal
union all
select 'grafik_shifts', lokal, count(*) from grafik_shifts
where coalesce(lokal, '') not in (select name from lokale) group by lokal;
