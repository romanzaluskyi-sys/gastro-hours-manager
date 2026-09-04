-- GRAFIK — migracja 1/3: rozszerzenia istniejących tabel + godziny otwarcia
-- Wklej CAŁOŚĆ naraz, potem uruchom zapytanie weryfikujące na dole.

alter table users add column allowed_stanowiska text;

create table lokale_godziny (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  day_of_week int not null,          -- 0=niedziela .. 6=sobota (JS Date.getDay())
  open_time time,
  close_time time,
  zamkniete boolean not null default false,
  created_at timestamptz not null default now()
);
alter table lokale_godziny enable row level security;
create policy "open" on lokale_godziny for all using (true) with check (true);
create index lokale_godziny_lokal_idx on lokale_godziny (lokal);

create table grafik_wyjatki (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  date_from date not null,
  date_to date not null,
  zamkniete boolean not null default false,
  open_time time,
  close_time time,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table grafik_wyjatki enable row level security;
create policy "open" on grafik_wyjatki for all using (true) with check (true);
create index grafik_wyjatki_lokal_idx on grafik_wyjatki (lokal, date_from);
