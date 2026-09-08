-- Rdzeń: fakt przepracowanych godzin, zgłoszenia i powiadomienia.
-- Odtworzone ze zrzutu produkcji (2026-09-07). RLS: shifts i issues mają je
-- WYŁĄCZONE (patrz 0011), notifications ma włączone z otwartą polityką.

create table shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_name text not null,
  lokal text not null,
  stanowisko text not null,
  start_time timestamptz not null,
  end_time timestamptz,                -- NULL = zmiana trwa
  godzin numeric,
  created_at timestamptz default timezone('utc'::text, now()),
  is_urlop boolean not null default false,
  absence_id text                      -- luźne odwołanie do absences.id, bez FK
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  -- ⚠️ NOT NULL, mimo że CLAUDE.md pisze, że przy is_anonymous user_name jest
  -- NULL. Baza na to nie pozwoli — anonimowe zgłoszenie musi mieć tu JAKĄŚ
  -- wartość. Nie zmieniamy tego tutaj (odtwarzamy stan faktyczny), ale
  -- pisząc nowy kod do issues, nie licz na NULL w tej kolumnie.
  user_name text not null,
  issue_text text not null,
  status text default 'nowe'::text,
  created_at timestamptz default timezone('utc'::text, now()),
  is_anonymous boolean default false,
  shift_id uuid,
  type text default 'problem'::text,   -- 'problem' | 'correction'
  proposed_date date,                  -- poniżej: tylko dla type='correction'
  proposed_lokal text,
  proposed_stanowisko text,
  proposed_start_time text,            -- "HH:MM", NIE typ time
  proposed_end_time text
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  -- user_name i action były pierwotnie NOT NULL (z czasów, gdy tabela
  -- obsługiwała tylko powiadomienia o edycji zmiany). Ograniczenie zdjęto,
  -- bo createManagerNotification/createEmployeeNotification ich nie wypełniają.
  user_name text,
  lokal text,
  actor_name text,
  action text,                         -- 'edit' | 'delete' (stary wariant)
  shift_date date,
  old_start text,
  old_end text,
  new_start text,
  new_end text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  audience text not null default 'employee'::text,   -- 'employee' | 'manager'
  message text,                        -- nowy wariant; obecność decyduje o formacie
  type text
);

alter table notifications enable row level security;
create policy "notifications_public_all" on notifications for all using (true) with check (true);

-- weryfikacja
select table_name, count(*) as kolumn
from information_schema.columns
where table_schema = 'public' and table_name in ('shifts', 'issues', 'notifications')
group by table_name order by table_name;
