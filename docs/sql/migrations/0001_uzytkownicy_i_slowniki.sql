-- Podstawa: ludzie i słowniki. Odtworzone ze ZRZUTU prawdziwej bazy
-- (docs/sql/tools/zrzut-schematu.sql, 2026-09-07), nie z opisu w CLAUDE.md.
--
-- Kolejność kolumn celowo taka jak w produkcji — świeża baza ma być
-- identyczna, żeby dało się porównywać zrzuty między klientami.
--
-- ⚠️ RLS na tych trzech tabelach jest w produkcji WYŁĄCZONE. Powstawały
-- klikaniem w Table Editor, zanim ktokolwiek pisał tu SQL. Odtwarzamy stan
-- faktyczny, a wyrównanie idzie osobno w 0011 — inaczej świeża baza
-- różniłaby się od produkcyjnej i zrzuty przestałyby się zgadzać.

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  pin text,
  role text default 'closed',
  active boolean default true,
  default_lokal text,
  default_stanowisko text,
  created_at timestamptz default timezone('utc'::text, now()),
  archived boolean default false,
  allowed_lokale text,                 -- lista po przecinku, NIE tablica Postgresa
  sanepid_expiry date,
  sanepid_last_notified date,
  umowa_expiry date,
  umowa_last_notified date,
  kiosk_pin text,                      -- 4 cyfry, blokada na kiosku; NIE mylić z pin
  stawka numeric,                      -- zł/h; puste = brak stawki, NIE zero
  etat text,                           -- 'pełny' | 'część' — WYMIAR, nie forma zatrudnienia
  notatki text,
  notatki_updated_by text,
  notatki_updated_at timestamptz,
  allowed_stanowiska text              -- lista po przecinku, jak allowed_lokale
);

create table lokale (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,           -- lokale_name_key; na tej unikalności stoi
                                       -- cały projekt — wszystkie tabele wiążą się
                                       -- z lokalem przez NAZWĘ, nie przez id
  created_at timestamptz default timezone('utc'::text, now()),
  archived boolean default false,
  miasto text,                         -- do pogody (Open-Meteo)
  dostepne_bloki text                  -- NULL = wszystko dostępne, '' = nic
);

create table stanowiska (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lokal_name text not null,            -- nazwa, nie id — jak wszędzie
  created_at timestamptz default timezone('utc'::text, now()),
  archived boolean default false,
  skrot text,
  kolor text                           -- hex, np. '#DE3A22'
);

-- weryfikacja
select table_name, count(*) as kolumn
from information_schema.columns
where table_schema = 'public' and table_name in ('users', 'lokale', 'stanowiska')
group by table_name order by table_name;
