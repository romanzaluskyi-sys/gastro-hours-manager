-- DZIENNIK DNIA ("Puls") — karta dnia, wpisy HACCP i szablony wpisów.
--
-- Zamyka dzień jedna osoba, raz, w 60–90 sekund. Wszystko, co da się
-- policzyć z tego, co już jest w bazie (godziny plan/fakt, koszt dnia,
-- obsada, % zadań, pogoda), NIE jest tu przechowywane jako wpis do
-- wypełnienia — liczy się w locie. Tutaj trafia tylko to, czego system
-- sam nie wie.
--
-- Trzy tabele:
--   day_logs           — jedna karta na (lokal, dzień)
--   day_log_entries    — pojedyncze zapisy: temperatury, dostawy, incydenty
--   day_log_templates  — CO trzeba wpisać w tym lokalu i o której porze
--
-- Szablony są kluczowe dla sprzedaży: sushi mierzy co innego niż kawiarnia,
-- a pizzeria jeszcze co innego. Bez szablonów każdy nowy typ lokalu
-- oznaczałby migrację we WSZYSTKICH bazach klientów (model silo).


-- ── karta dnia ───────────────────────────────────────────────────────────

create table day_logs (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  date date not null,

  -- ręczne, przy zamknięciu dnia
  obrot numeric,                 -- utarg brutto, zł (średni paragon liczymy, nie zapisujemy)
  liczba_paragonow int,
  cos_nadzwyczajnego boolean,
  notatka text,
  handover text,                 -- "dla następnej zmiany" — to, po co ludzie lubią papierowy dziennik
  tagi text,                     -- lista po przecinku, konwencja jak allowed_lokale

  -- migawka kontekstu w chwili zamknięcia; NIE odpytujemy pogody wstecz przy
  -- każdym raporcie, bo raport za pół roku ma pokazywać to, co było wtedy
  pogoda_temp numeric,
  pogoda_kod int,

  status text not null default 'otwarty',   -- 'otwarty' | 'zamkniety'
  closed_by text,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ⚠️ Pierwsza wymuszona unikalność w tym projekcie — reszta tabel świadomie
-- jej nie ma. Tu jest, bo dwie karty na ten sam dzień znaczą dwa utargi,
-- a każda suma i każdy procent labour cost liczony z tego byłby fałszywy.
-- Potrzebna też do zapisu przez upsert (on conflict).
create unique index day_logs_lokal_date_idx on day_logs (lokal, date);

alter table day_logs enable row level security;
create policy "open" on day_logs for all using (true) with check (true);


-- ── pojedyncze wpisy ─────────────────────────────────────────────────────

create table day_log_entries (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  date date not null,
  day_log_id text,               -- luźne odwołanie do day_logs.id, bez FK
                                 -- (ten sam wzorzec co shift_edits.shift_id —
                                 -- żadna tabela w tym projekcie nie ma FK)

  typ text not null,             -- 'temperatura'|'dostawa'|'incydent'|'sprzatanie'|'inne'
  template_key text,             -- day_log_templates.klucz, gdy wpis powstał z wymaganej pozycji
  payload jsonb not null default '{}'::jsonb,

  recorded_by text,
  recorded_at timestamptz not null default now(),

  -- HACCP: zapisu nie wolno cicho poprawić. Korekta to NOWY wiersz
  -- wskazujący na stary, nigdy update na miejscu.
  corrected_from uuid,
  corrected_reason text,

  created_at timestamptz not null default now()
);

create index day_log_entries_lokal_date_idx on day_log_entries (lokal, date);
create index day_log_entries_typ_idx on day_log_entries (typ, date);

alter table day_log_entries enable row level security;
create policy "open" on day_log_entries for all using (true) with check (true);


-- ── szablony: co trzeba wpisać w tym lokalu ──────────────────────────────

create table day_log_templates (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  klucz text not null,           -- stabilny, np. 'temp_lodowka_kuchnia'
  nazwa text not null,           -- "Lodówka kuchnia"
  typ text not null,             -- ten sam słownik co day_log_entries.typ

  pora text,                     -- 'poranne'|'obiadowe'|'wieczorne'|'ogolne'
                                 -- ten sam słownik co tasks.schedule_type — przypomnienia
                                 -- liczy isTaskDueOn() z utils/tasks.ts, NIE drugi planista
  days_of_week text,             -- "1,2,3,4,5", 0=niedziela..6=sobota, jak tasks.days_of_week
  wymagany boolean not null default true,

  -- definicja pól wpisu, np.
  --   [{"klucz":"temp","label":"Temperatura","typ":"number","min":0,"max":5,"jednostka":"°C"}]
  -- min/max dają czerwony alert przy wartości poza normą — lodówka na 12°C
  -- ma się rzucać w oczy, a nie leżeć w tabeli jako zwykła liczba.
  pola jsonb not null default '[]'::jsonb,

  kolejnosc int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index day_log_templates_lokal_idx on day_log_templates (lokal, archived);

alter table day_log_templates enable row level security;
create policy "open" on day_log_templates for all using (true) with check (true);


-- weryfikacja
select table_name, count(*) as kolumn
from information_schema.columns
where table_schema = 'public'
  and table_name in ('day_logs', 'day_log_entries', 'day_log_templates')
group by table_name
order by table_name;
