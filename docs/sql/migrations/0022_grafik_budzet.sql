-- Grafik → Budżet: oczekiwany utarg i docelowy % kosztu pracy na dzień tygodnia.
--
-- Do tej pory Grafik wiedział, ILU ludzi ma stać na zmianie (wymagania obsady),
-- ale nie wiedział, ILE to ma kosztować. Kierownik układał tydzień i dowiadywał
-- się o koszcie dopiero w Pulsie, czyli po fakcie — a wtedy jedyne, co da się z
-- tym zrobić, to opisać w komentarzu, dlaczego wyszło drożej.
--
-- Dwie tabele, bo to dwie różne rzeczy:
--
--   grafik_budzet_cele — REGUŁA: ile spodziewamy się utargu w typowy wtorek i
--                        jaki % z tego wolno wydać na pracę. Wersjonowane
--                        miesięcznie, dokładnie jak staffing_rule_sets.
--   grafik_budzet_dni  — WYJĄTEK na konkretną datę: "w ten wtorek będzie
--                        inaczej". Jedno kliknięcie w siatce.
--
-- ⚠️ Dlaczego cele NIE wiszą na staffing_rule_sets, mimo że wersjonują się tak
-- samo: utworzenie zestawu celów na październik utworzyłoby wtedy także PUSTY
-- zestaw wymagań obsady, a `findRuleSetForDate` bierze najnowszy zestaw ≤ data.
-- Kontrola dziur w obsadzie zamilkłaby na cały miesiąc i nikt by tego nie
-- zauważył, bo brak ostrzeżeń wygląda dokładnie jak brak problemów. To są dwie
-- niezależne decyzje kierownika i mają mieć dwie niezależne wersje.
--
-- ⚠️ Dlaczego wyjątki dnia NIE są w grafik_wyjatki: tamto jest bytem o zakresie
-- dat, z własnymi wymaganiami obsady i godzinami otwarcia. Olówek w siatce ma
-- zmienić JEDNĄ liczbę na JEDEN dzień, a nie po cichu ruszyć godziny otwarcia.

create table grafik_budzet_cele (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  obowiazuje_od date not null,        -- zawsze 1. dzień miesiąca, jak staffing_rule_sets
  day_of_week int not null,           -- 0=niedziela, jak wszędzie w projekcie (JS getDay)
  oczekiwany_utarg numeric,           -- null = nie wpisano; NIE zero
  cel_koszt_pct numeric,              -- null = nie wpisano; NIE zero
  created_by text,
  created_at timestamptz not null default now()
);
alter table grafik_budzet_cele enable row level security;
create policy "open" on grafik_budzet_cele for all using (true) with check (true);

-- Jedyna wymuszona unikalność w tym module. Dwa wiersze na ten sam wtorek to
-- dwie różne odpowiedzi na "ile wolno wydać" i cicho wygrywałby ten, który
-- akurat wróci pierwszy z REST-a.
create unique index grafik_budzet_cele_klucz
  on grafik_budzet_cele (lokal, obowiazuje_od, day_of_week);

create table grafik_budzet_dni (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  date date not null,
  oczekiwany_utarg numeric,           -- null = zostaje wartość z zestawu
  cel_koszt_pct numeric,              -- null = zostaje wartość z zestawu
  autor text,
  created_at timestamptz not null default now()
);
alter table grafik_budzet_dni enable row level security;
create policy "open" on grafik_budzet_dni for all using (true) with check (true);

create unique index grafik_budzet_dni_klucz on grafik_budzet_dni (lokal, date);

-- weryfikacja
select table_name, column_name, data_type
from information_schema.columns
where table_name in ('grafik_budzet_cele', 'grafik_budzet_dni')
order by table_name, ordinal_position;
