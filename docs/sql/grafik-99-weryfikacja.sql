-- Uruchom PO KAŻDEJ migracji (patrz błąd #12 w CLAUDE.md — całe wklejenie
-- to jedna transakcja, jeden błąd cofa też polecenia, które wyglądały na
-- wykonane). Po migracji 3 powinno być widać wszystkie tabele.

select table_name, column_name, data_type
from information_schema.columns
where table_name in (
  'lokale_godziny', 'grafik_wyjatki', 'staffing_rule_sets',
  'staffing_rules', 'grafik_shifts', 'shift_swaps'
)
order by table_name, ordinal_position;

-- osobno, bo to kolumna w istniejącej tabeli:
select column_name, data_type from information_schema.columns
where table_name = 'users' and column_name = 'allowed_stanowiska';
