-- Giełda zmian: oddanie konkretnej osobie i zamiana zmianami.
--
-- Do tej pory był jeden tryb: wystaw dla wszystkich, ktoś się zgłasza,
-- kierownik zatwierdza. W praktyce ludzie i tak najpierw dogadują się między
-- sobą, a dopiero potem szukają sposobu, żeby to wpisać — więc dwa nowe tryby
-- opisują to, co i tak się dzieje:
--
--   gielda   — jak dotąd: widzą wszyscy uprawnieni, bierze pierwszy chętny
--   oddanie  — zmiana idzie do JEDNEJ wskazanej osoby, nikt inny jej nie widzi
--   zamiana  — ja biorę twoją zmianę, ty moją; obie przepisują się naraz
--
-- ⚠️ Stan (`status`) i cała ścieżka decyzji zostają BEZ ZMIAN dla wszystkich
-- trzech: na_gieldzie → przyjeta → zatwierdzona/odrzucona/wycofana, a ostatnie
-- słowo zawsze ma kierownik. Nowe tryby zmieniają tylko to, KTO widzi ofertę i
-- co się przepisuje po zatwierdzeniu. Osobna maszyna stanów dla każdego trybu
-- oznaczałaby trzy miejsca, w których można zapomnieć o kierowniku.

alter table shift_swaps add column typ text not null default 'gielda';
  -- 'gielda' | 'oddanie' | 'zamiana'

-- Adresat przy 'oddanie' i 'zamiana'. Dopóki nie przyjmie, jest w
-- target_*, a nie w taker_* — to dwie różne rzeczy: "komu zaproponowano"
-- i "kto wziął". Zlanie ich w jedno kolumną taker_* dałoby ofertę, która
-- wygląda na przyjętą, zanim ktokolwiek ją zobaczył.
alter table shift_swaps add column target_user_id text;
alter table shift_swaps add column target_user_name text;

-- Przy 'zamiana' — zmiana adresata, która idzie w drugą stronę, do autora.
-- Luźne odwołanie do grafik_shifts.id, jak grafik_shift_id obok.
alter table shift_swaps add column wzajemna_shift_id text;

create index shift_swaps_target_idx on shift_swaps (target_user_id, status);

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'shift_swaps'
  and column_name in ('typ', 'target_user_id', 'target_user_name', 'wzajemna_shift_id')
order by column_name;
