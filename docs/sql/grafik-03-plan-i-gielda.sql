-- GRAFIK — migracja 3/3: plan zmian + giełda zmian
-- Uruchom DOPIERO po zweryfikowaniu migracji 2.

create table grafik_shifts (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  user_id text,
  user_name text,
  stanowisko text,
  date date not null,
  start_time time not null,
  end_time time not null,            -- end < start => zmiana przez północ
  published_at timestamptz,
  created_by text,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table grafik_shifts enable row level security;
create policy "open" on grafik_shifts for all using (true) with check (true);
create index grafik_shifts_lokal_date_idx on grafik_shifts (lokal, date);
create index grafik_shifts_user_date_idx on grafik_shifts (user_id, date);

create table shift_swaps (
  id uuid primary key default gen_random_uuid(),
  grafik_shift_id text not null,     -- luźne odwołanie do grafik_shifts.id
  lokal text,
  date date,
  author_user_id text,
  author_user_name text,
  taker_user_id text,
  taker_user_name text,
  status text not null default 'na_gieldzie',
    -- na_gieldzie | przyjeta | zatwierdzona | odrzucona | wycofana
  note text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table shift_swaps enable row level security;
create policy "open" on shift_swaps for all using (true) with check (true);
create index shift_swaps_status_idx on shift_swaps (status, date);
