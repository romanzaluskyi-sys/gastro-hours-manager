-- Usunięcie zmiany, do której odnosi się zgłoszenie "Popraw zmianę".
--
-- `issues.shift_id` to JEDYNY prawdziwy klucz obcy w tym projekcie (reszta
-- tabel ma luźne odwołania bez FK). Bez klauzuli ON DELETE Postgres domyślnie
-- blokuje usunięcie zmiany, na którą wskazuje jakiekolwiek zgłoszenie — a
-- pracownik zgłasza korektę właśnie do tych zmian, które potem bywają
-- kasowane. Kierownik widział wtedy tylko "Błąd usuwania" i nie miał jak
-- zrozumieć, czemu akurat ta zmiana się nie kasuje.
--
-- Wybieramy SET NULL, nie CASCADE: zgłoszenie jest zapisem tego, że pracownik
-- o coś prosił i jak to rozstrzygnięto. Kasowanie zmiany nie może kasować tej
-- historii — traci sens tylko wskaźnik na wiersz, którego już nie ma.
--
-- ⚠️ Skutek uboczny: zgłoszenie z wyzerowanym shift_id wygląda tak samo jak
-- zgłoszenie typu "Zapomniałem odbić" (tam shift_id jest null od początku).
-- Dla otwartych korekt to zresztą prawda — zmiany, której dotyczyły, już nie
-- ma.

alter table issues drop constraint if exists issues_shift_id_fkey;
alter table issues
  add constraint issues_shift_id_fkey
  foreign key (shift_id) references shifts(id) on delete set null;

-- weryfikacja: confdeltype 'n' = SET NULL
select conname, confdeltype
from pg_constraint
where conname = 'issues_shift_id_fkey';
