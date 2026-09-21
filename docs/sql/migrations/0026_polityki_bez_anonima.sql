-- Etap 3c-1: klucz z przeglądarki przestaje otwierać bazę.
--
-- STAN PRZED (zmierzony scripts/sprawdz-dostep.py, 2026-09-21): anonim — czyli
-- ktokolwiek, kto otworzył stronę i wziął klucz publishable z paczki — CZYTAŁ
-- I ZAPISYWAŁ wszystkie 13 tabel. Imiona, e-maile, stawki, daty urodzenia,
-- PIN-y, utargi, godziny. Polityki istniały, ale wszystkie brzmiały
-- `using (true)`, więc nie odróżniały nikogo od nikogo.
--
-- Ta migracja NIE zmienia tego, co widzi ZALOGOWANY. Odcina wyłącznie dostęp
-- bez logowania. To jest ten podział, po którym można rozmawiać o powierzeniu
-- danych drugiego klienta: dziś wystarczy adres strony, po tej migracji trzeba
-- konta.
--
-- ⚠️ Zawężanie tego, co widzą POSZCZEGÓLNE role zalogowane (kierownik lokalu
-- tylko swoje lokale, pracownik tylko swoje dane, stawki niewidoczne dla
-- kolegów) to osobny krok — 3c-2 i 3c-3. Wymaga zmian w aplikacji, bo dziś
-- ekrany pobierają wszystko i filtrują u siebie. Rozdzielone świadomie: ten
-- krok daje największą część bezpieczeństwa i NIE dotyka ani jednego ekranu.

-- --------------------------------------------------------------------------
-- ⚠️ Pętla po WSZYSTKICH tabelach, nie lista z palca.
--
-- Lista wypisana ręcznie jest prawdziwa w dniu pisania i fałszywa przy
-- pierwszej nowej tabeli — a dziurą byłaby wtedy dokładnie ta najnowsza,
-- najmniej sprawdzona. `pg_tables` nie da się zapomnieć zaktualizować.
--
-- `schema_migrations` zostaje poza pętlą: rejestr migracji czyta i pisze
-- wyłącznie runner prawami właściciela (patrz 0000), aplikacja nie ma tam
-- czego szukać i nie ma mieć.
-- --------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'schema_migrations'
  loop
    -- Przy WYŁĄCZONYM RLS Postgres IGNORUJE polityki — tabela z napisaną
    -- polityką wyglądałaby na zabezpieczoną i nie byłaby. Ta sama pułapka co
    -- w 0011, tam dotyczyła pięciu najstarszych tabel.
    execute format('alter table public.%I enable row level security', t.tablename);

    execute format('drop policy if exists "open" on public.%I', t.tablename);
    execute format('drop policy if exists "zalogowani" on public.%I', t.tablename);

    -- Zalogowani dostają dokładnie to, co mieli. Nic tu nie zawężamy.
    execute format(
      'create policy "zalogowani" on public.%I for all to authenticated using (true) with check (true)',
      t.tablename
    );
    execute format('grant all on public.%I to authenticated', t.tablename);

    -- I właściwa zmiana: anonim traci wszystko.
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- Jedyny wyjątek: dziennik błędów przyjmuje wpisy od niezalogowanych.
--
-- ⚠️ Awaria, która najbardziej potrzebuje zapisu, zdarza się PRZED
-- zalogowaniem: komponent wywala się na ekranie logowania i zostaje biała
-- strona. Gdyby anonim nie mógł tu pisać, dokładnie ta klasa błędów byłaby
-- niewidoczna — a to ona najczęściej blokuje pracę.
--
-- Wyjątek jest jednokierunkowy: INSERT tak, SELECT nie. Podrzucenie śmieci do
-- dziennika kosztuje nas wiersz; odczyt cudzych błędów kosztowałby imiona,
-- lokale i adresy ekranów.
-- --------------------------------------------------------------------------
drop policy if exists "anonim_pisze_bledy" on public.app_errors;
create policy "anonim_pisze_bledy" on public.app_errors
  for insert to anon with check (true);
grant insert on public.app_errors to anon;

-- weryfikacja: żadna tabela nie może zostać z wyłączonym RLS
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and rowsecurity = false;

-- weryfikacja: co ma anonim (powinien zostać sam INSERT na app_errors)
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
order by table_name, privilege_type;
