-- 0046 — dziennik przebiegów cronów (0.77.0, monitoring)
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
--
-- Bez żadnej polityki: pisze i czyta wyłącznie klucz serwisowy (jak
-- `email_raporty` w 0039 i `limity_pin` w 0045). Wiersze starsze niż 30 dni
-- sprząta sam zapis.
--
-- ⚠️ Kolejność dowolna: kod sprzed 0046 tej tabeli nie zna, a kod z 0.77.0 na
-- bazie bez niej po prostu nie zapisuje przebiegu (zdrowie mówi wtedy „brak
-- dziennika cronów”).

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

-- Sprawdzenie: tabela jest, RLS włączone, pusta.
select relname, relrowsecurity, (select count(*) from cron_przebiegi) as wierszy
from pg_class where relname = 'cron_przebiegi';
