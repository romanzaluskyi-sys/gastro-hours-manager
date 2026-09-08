-- GRAFIK — migracja 2/3: wymagania obsady (wersjonowane miesięcznie)
-- Uruchom DOPIERO po zweryfikowaniu migracji 1.

create table staffing_rule_sets (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  obowiazuje_od date not null,       -- zawsze 1. dzień miesiąca
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table staffing_rule_sets enable row level security;
create policy "open" on staffing_rule_sets for all using (true) with check (true);
create index staffing_rule_sets_lokal_idx on staffing_rule_sets (lokal, obowiazuje_od);

create table staffing_rules (
  id uuid primary key default gen_random_uuid(),
  set_id text,                       -- luźne odwołanie do staffing_rule_sets.id
  wyjatek_id text,                   -- luźne odwołanie do grafik_wyjatki.id
  stanowisko text not null,
  days_of_week text,                 -- "1,2,3,4,5" — tylko dla reguł miesięcznych
  start_time time not null,
  end_time time not null,
  required_count int not null default 1,
  created_at timestamptz not null default now()
);
alter table staffing_rules enable row level security;
create policy "open" on staffing_rules for all using (true) with check (true);
create index staffing_rules_set_idx on staffing_rules (set_id);
create index staffing_rules_wyjatek_idx on staffing_rules (wyjatek_id);
