-- Rejestr zastosowanych migracji.
--
-- Do 2026-09 schemat był zmieniany ręcznie: właściciel wklejał SQL do
-- Supabase SQL Editor i nikt nie zapisywał, co już poszło. Przy JEDNEJ
-- bazie to działało. Od modelu silo (osobny projekt Supabase na klienta,
-- patrz plan rozwoju) baz jest N i ręczne pilnowanie przestaje być możliwe
-- — dlatego ten rejestr i scripts/migrate.py.
--
-- checksum trzyma sha256 pliku w chwili zastosowania. Jeśli ktoś edytuje
-- już zastosowaną migrację, runner to wykryje i odmówi cichego przejścia
-- dalej — inaczej dwie bazy rozjechałyby się bez śladu.

create table if not exists schema_migrations (
  version   text primary key,          -- np. "0005_grafik_podstawy"
  checksum  text not null,
  applied_at timestamptz not null default now(),
  applied_by text
);

alter table schema_migrations enable row level security;
-- Rejestr czyta i pisze wyłącznie runner (Management API, prawa właściciela),
-- nie aplikacja — więc tutaj, w odróżnieniu od reszty tabel, NIE ma otwartej
-- polityki. Klucz publishable z bundla nie ma tu czego szukać.

-- weryfikacja
select version, applied_at from schema_migrations order by version;
