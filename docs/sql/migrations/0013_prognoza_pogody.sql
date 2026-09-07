-- Archiwum prognoz pogody — do mierzenia, ile warta jest prognoza z wyprzedzeniem.
--
-- Po co: kierownik planuje obsadę z wyprzedzeniem i musi wiedzieć, na ile dni
-- naprzód prognoza jest jeszcze wiarygodna. "Deszczowa sobota" widziana 3 dni
-- wcześniej to inna informacja niż ta sama widziana 14 dni wcześniej — i dopóki
-- nie zmierzymy różnicy, obie wyglądają tak samo pewnie.
--
-- Jeden wiersz = jedna prognoza na jeden dzień, wykonana N dni wcześniej.
--   horizon_days = 0  -> STAN FAKTYCZNY (to, co się naprawdę wydarzyło)
--   horizon_days = 3  -> co prognoza mówiła 3 dni przed tym dniem
-- Dzięki temu "trafność" to zwykłe porównanie wierszy w obrębie (miasto,
-- target_date), bez osobnej tabeli na wyniki.
--
-- Klucz to MIASTO, nie lokal: trzy lokale sieci są w Koszalinie i dzielą tę
-- samą pogodę. Trzymanie tego per lokal potroiłoby zapytania i dane bez żadnej
-- nowej informacji. lokale.miasto łączy jedno z drugim.

create table weather_forecasts (
  id uuid primary key default gen_random_uuid(),
  miasto text not null,
  target_date date not null,
  horizon_days int not null,           -- 0 = fakt, 1..14 = ile dni przed

  temp_max numeric,
  temp_min numeric,
  opady_mm numeric,                    -- suma dobowa
  opady_prawdopodobienstwo int,        -- %, tylko dla prognoz
  kod int,                             -- WMO weather code, ten sam co w utils/weather.ts

  zrodlo text not null,                -- 'forecast' | 'previous_runs'
  created_at timestamptz not null default now()
);

-- Druga wymuszona unikalność w projekcie (po day_logs). Powód ten sam:
-- duplikat cicho zafałszowałby średnią błędu, a cała wartość tej tabeli
-- leży właśnie w tej średniej. Potrzebna też do zapisu przez upsert —
-- cron chodzi codziennie i za każdym razem widzi te same dni naprzód.
create unique index weather_forecasts_klucz_idx
  on weather_forecasts (miasto, target_date, horizon_days);

create index weather_forecasts_data_idx on weather_forecasts (target_date);

alter table weather_forecasts enable row level security;
create policy "open" on weather_forecasts for all using (true) with check (true);

-- weryfikacja
select count(*) as kolumn from information_schema.columns
where table_schema = 'public' and table_name = 'weather_forecasts';
