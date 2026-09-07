-- Wyrównanie RLS: włączenie go na pięciu najstarszych tabelach.
--
-- Zrzut produkcji z 2026-09-07 pokazał, że users, lokale, stanowiska, shifts
-- i issues mają RLS WYŁĄCZONE — powstawały klikaniem w Table Editor, zanim
-- ktokolwiek pisał tu SQL. Wszystko, co powstało później, ma RLS włączone
-- z otwartą polityką.
--
-- ⚠️ Ta migracja NIE zmienia niczego w działaniu aplikacji dziś. Polityka
-- jest tak samo otwarta jak wszędzie indziej, więc klucz publishable widzi
-- dokładnie to, co widział. Chodzi o coś innego: przy WYŁĄCZONYM RLS
-- Postgres IGNORUJE polityki. Gdy na Etapie A zaczniemy je zawężać, tabela
-- z wyłączonym RLS przyjmie napisaną politykę i po cichu jej nie zastosuje —
-- czyli dokładnie te pięć tabel z danymi osobowymi i stawkami zostałoby
-- otwarte, a my byśmy o tym nie wiedzieli. Tanie teraz, trudne do wykrycia
-- później.

alter table users      enable row level security;
alter table lokale     enable row level security;
alter table stanowiska enable row level security;
alter table shifts     enable row level security;
alter table issues     enable row level security;

drop policy if exists "open" on users;
drop policy if exists "open" on lokale;
drop policy if exists "open" on stanowiska;
drop policy if exists "open" on shifts;
drop policy if exists "open" on issues;

create policy "open" on users      for all using (true) with check (true);
create policy "open" on lokale     for all using (true) with check (true);
create policy "open" on stanowiska for all using (true) with check (true);
create policy "open" on shifts     for all using (true) with check (true);
create policy "open" on issues     for all using (true) with check (true);

-- weryfikacja: po tej migracji WSZYSTKIE tabele mają rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and rowsecurity = false;
