-- Dni tygodnia na POZIOMIE ZADANIA, wewnątrz bloku.
--
-- Jeden blok "Mycie i dezynfekcja", ale w poniedziałek myje się okap, a w
-- czwartek lodówkę. Do 0.37.0 wymagało to dwóch bloków o tej samej nazwie i
-- różnych dniach — czyli dokładnie tego rozdrabniania, przed którym bloki
-- miały chronić.
--
-- Zasada (ustalenie właściciela): **blok jest ważniejszy**. Blok decyduje, czy
-- tego dnia w ogóle się pojawia; dni zadania mogą ten zbiór tylko ZAWĘZIĆ,
-- nigdy rozszerzyć. Zadanie z sobotą w bloku pon–pt nie pokaże się w sobotę.
--
-- Kolumna `tasks.days_of_week` już istnieje — po migracji 0019 była martwa
-- (rozkład przeniósł się na blok). Tu wraca do życia z NOWYM znaczeniem:
-- "które dni z dni bloku", a puste = wszystkie dni bloku.
--
-- ⚠️ Dlatego trzeba wyczyścić stare kopie. Migracja 0019 grupowała zadania w
-- bloki m.in. PO days_of_week, więc każde przeniesione zadanie ma dziś w tej
-- kolumnie dokładnie to samo, co jego blok. Zostawione tak, wyglądałoby
-- niewinnie do pierwszej zmiany dni bloku: kierownik przestawia blok na
-- weekend, a zadania po cichu znikają, bo wciąż mają w sobie "pon–pt".

-- 1. Najpierw odtwórz jednodniowy rozkład ze starej kolumny `day_of_week`.
--    0019 grupowała po `days_of_week`, więc zadania opisane wyłącznie starym
--    `day_of_week` (sprzed 2026-09-03) trafiły do bloku "codziennie" i
--    zgubiły swój jedyny dzień. Teraz jest gdzie go zapisać.
update tasks
set days_of_week = day_of_week::text
where block_id is not null
  and days_of_week is null
  and day_of_week is not null;

-- 2. Wyczyść kopię dni, która i tak stoi na bloku. `is not distinct from`
--    zamiast `=`, żeby złapać też parę (null, null).
update tasks t
set days_of_week = null
from task_blocks b
where t.block_id = b.id::text
  and t.days_of_week is not distinct from b.days_of_week;

-- weryfikacja: ile zadań ma własne, WĘŻSZE dni niż ich blok
select
  (select count(*) from tasks where block_id is not null and not archived) as zadania_w_blokach,
  (select count(*) from tasks t join task_blocks b on t.block_id = b.id::text
    where t.days_of_week is not null and not t.archived)                    as zadania_z_wlasnymi_dniami,
  (select count(*) from tasks t join task_blocks b on t.block_id = b.id::text
    where t.days_of_week is not distinct from b.days_of_week
      and t.days_of_week is not null and not t.archived)                    as kopie_dni_bloku_ma_byc_0;
