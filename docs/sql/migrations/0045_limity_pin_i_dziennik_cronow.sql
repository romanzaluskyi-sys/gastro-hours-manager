-- 0045 — dwie nowe tabele, bez wpływu na działającą aplikację (0.77.0)
--
--   * `limity_pin`     — liczniki prób PIN-u na tablecie i próśb „Nie pamiętam
--                        PIN-u” (używa ich api/admin/ustaw-haslo.js, a od 0046
--                        także `sprawdz_kiosk_pin`);
--   * `cron_przebiegi` — dziennik przebiegów cronów (monitoring, niżej).
--
-- ⚠️ Kolejność dowolna — to jedyne, czego ta migracja pilnuje. Obie tabele są
-- nowe i nikt w wersji sprzed 0.77.0 ich nie zna, więc 0045 może wejść PRZED
-- deployem. Wydzielona z PIN-ów właśnie po to: Preview PR-a chodzi na bazie
-- produkcyjnej i bez `limity_pin` „Nie pamiętam PIN-u” nie dało się przetestować
-- przed merge, a 0046 (hash PIN-ów) wolno puścić dopiero PO deployu.
--
-- Obie bez żadnej polityki: pisze i czyta wyłącznie klucz serwisowy i funkcje
-- `security definer` (jak `email_raporty` w 0039).

-- --------------------------------------------------------------------------
-- 1. Limity prób PIN-u.
--    rodzaj 'kiosk' → klucz = users.id (PIN na tablecie),
--    rodzaj 'reset' → klucz = e-mail (prośba „Nie pamiętam PIN-u”).
-- --------------------------------------------------------------------------
create table if not exists limity_pin (
  id bigint generated always as identity primary key,
  rodzaj text not null,
  klucz text not null,
  kiedy timestamptz not null default now()
);
create index if not exists limity_pin_szukaj on limity_pin (rodzaj, klucz, kiedy);
alter table limity_pin enable row level security;

-- --------------------------------------------------------------------------
-- 2. Dziennik przebiegów cronów (monitoring).
--
-- Do 0.76.0 nieudany cron nie zostawiał śladu nigdzie poza logami Vercela,
-- do których nikt nie zagląda. Cron, który przestał się wywoływać w ogóle
-- (zmieniony sekret, wyłączony pg_cron, projekt bez CRON_SECRET), nie zostawiał
-- NIC — a skutkiem są ciche braki: nikt nie dostaje przypomnień, raportu ani
-- maili, i wygląda to dokładnie jak spokojny dzień.
--
-- Każdy cron zapisuje tu swój przebieg (api/_lib/przebieg.js), a /api/zdrowie
-- sprawdza, czy każdy z oczekiwanych miał UDANY przebieg w swoim oknie.
-- Codzienny przegląd wszystkich klientów robi .github/workflows/monitoring.yml.
-- Wiersze starsze niż 30 dni sprząta sam zapis. Kod z 0.77.0 na bazie bez tej
-- tabeli po prostu nie zapisuje przebiegu (zdrowie mówi wtedy „brak dziennika”).
-- --------------------------------------------------------------------------
create table if not exists cron_przebiegi (
  id bigint generated always as identity primary key,
  nazwa text not null,                 -- 'check-odbicia', 'wyslij-maile', …
  start_at timestamptz not null,
  czas_ms int,
  kod int,                             -- status HTTP odpowiedzi crona
  ok boolean not null,                 -- kod < 300
  info text                            -- błąd albo skrót odpowiedzi (do 300 znaków)
);
create index if not exists cron_przebiegi_nazwa_start on cron_przebiegi (nazwa, start_at desc);
create index if not exists cron_przebiegi_start on cron_przebiegi (start_at);
alter table cron_przebiegi enable row level security;

-- Sprawdzenie: obie tabele są i mają włączone RLS.
select relname, relrowsecurity
from pg_class where relname in ('limity_pin', 'cron_przebiegi') order by relname;
