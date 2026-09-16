-- Bloki zadań — checklisty zamiast luźnych zadań.
--
-- Do 0.36.x każde zadanie niosło własny rozkład (pora, dni tygodnia, cykl) i
-- własnego adresata (stanowisko). "Poranne otwarcie dla kucharza" to było osiem
-- zadań, w każdym te same dni tygodnia wpisane ręcznie — i osiem miejsc, w
-- których można się pomylić. Blok podnosi to o poziom wyżej:
--
--   blok    = KIEDY (pora + dni tygodnia, opcjonalnie cykl) i DLA KOGO
--             (lista stanowisk; puste = wszyscy)
--   zadanie = jeden wiersz checklisty: tytuł, opcjonalny opis/procedura,
--             opcjonalne POLA DO WPISANIA (temperatura, kwota, tak/nie) i
--             opcjonalny własny cykl ("okna raz na 7 dni" w codziennym bloku)
--
-- ⚠️ Rozkład i adresat żyją TYLKO na bloku. Kolumny tasks.schedule_type,
-- tasks.days_of_week, tasks.stanowisko i tasks.for_manager zostają w bazie z
-- danymi (jak scope i owner_label wcześniej), ale kod przestaje je czytać —
-- inaczej mielibyśmy dwa źródła odpowiedzi na to samo pytanie.
--
-- Drugi powód tej migracji: pomiar. Zadanie z polami zapisuje wynik do
-- day_log_entries — tam, gdzie już mieszka cały dziennik HACCP, razem z
-- kontrolą normy i poprawkami przez nowy wiersz (corrected_from). Dzięki temu
-- pomiar zrobiony w trakcie zmiany NIE jest drugim, konkurencyjnym zapisem
-- obok Pulsu, tylko tym samym zapisem zebranym wcześniej — a zadanie wskazujące
-- na pozycję z konfiguracji Pulsu (tasks.template_key) zamyka ją na karcie dnia,
-- więc nikt nie mierzy tej samej lodówki dwa razy.


-- ── bloki ────────────────────────────────────────────────────────────────

create table task_blocks (
  id uuid primary key default gen_random_uuid(),
  lokal text not null,
  nazwa text not null,                 -- "Otwarcie lokalu", "Bezpieczeństwo żywności"
  opis text,

  -- lista nazw stanowisk po przecinku (konwencja allowed_lokale / allowed_stanowiska,
  -- NIE tablica Postgresa). Puste = blok dla wszystkich na zmianie.
  stanowiska text,

  schedule_type text not null default 'ogolne',  -- poranne|obiadowe|wieczorne|ogolne|cykliczne
  cycle_days int,                      -- tylko dla 'cykliczne'
  days_of_week text,                   -- "1,2,3,4,5" — null = codziennie (jak w tasks)
  deadline_time time,                  -- domyślny termin dla zadań bloku

  for_manager boolean not null default false,
  kolejnosc int not null default 0,
  active boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index task_blocks_lokal_idx on task_blocks (lokal, archived);

alter table task_blocks enable row level security;
create policy "task_blocks_open_all" on task_blocks for all using (true) with check (true);


-- ── zadania w bloku ──────────────────────────────────────────────────────

alter table tasks add column block_id text;        -- luźne odwołanie do task_blocks.id
alter table tasks add column kolejnosc int not null default 0;

-- Pola do wpisania przy odhaczeniu — ten sam kształt co day_log_templates.pola:
--   [{"klucz":"temp","label":"Temperatura","typ":"number","min":0,"max":5,"jednostka":"°C"}]
-- Pusta tablica = zwykła checkbox-owa zadanie, dokładnie jak dziś.
alter table tasks add column pola jsonb not null default '[]'::jsonb;

-- Typ wpisu w dzienniku (słownik day_log_entries.typ) — używany tylko wtedy,
-- gdy zadanie ma pola.
alter table tasks add column typ text;

-- Gdy ustawione, zadanie zbiera pozycję z konfiguracji Pulsu o tym kluczu:
-- pola biorą się z szablonu (jedno źródło definicji), a wpis dostaje ten sam
-- template_key, więc karta dnia widzi pozycję jako wypełnioną i nie prosi o nią
-- drugi raz. To jest ten "konektor", który nie pozwala powstać duplikatom.
alter table tasks add column template_key text;

create index tasks_block_idx on tasks (block_id);


-- ── wykonanie z pomiarem ─────────────────────────────────────────────────
-- Wartości NIE są tu przechowywane — leżą w day_log_entries, a tu stoi tylko
-- wskaźnik. Jedna wartość w jednym miejscu; poprawka (nowy wiersz wpisu)
-- przestawia ten wskaźnik na nową wersję.
alter table task_completions add column entry_id text;


-- ── przeniesienie istniejących zadań do bloków ───────────────────────────
-- Każda dotychczasowa kombinacja (lokal, stanowisko, pora, cykl, dni, kierownik)
-- dostaje swój blok, nazwany po porze i stanowisku. Nic nie znika z ekranów w
-- dniu wdrożenia, a kierownik przemianuje bloki na własne nazwy procesu.
-- ⚠️ Dwa bloki mogą wyjść z tą samą nazwą, gdy różnią się tylko dniami tygodnia
-- — to celowo nie jest naprawiane w SQL-u: w konfiguracji widać pod nazwą dni,
-- a wymyślanie unikalnych nazw automatem dałoby napisy gorsze od ręcznych.
with grupy as (
  select
    lokal,
    coalesce(stanowisko, '')      as stanowisko,
    schedule_type,
    coalesce(cycle_days, 0)       as cycle_days,
    coalesce(days_of_week, '')    as days_of_week,
    for_manager
  from tasks
  where not archived
  group by 1, 2, 3, 4, 5, 6
),
nowe as (
  insert into task_blocks (lokal, nazwa, stanowiska, schedule_type, cycle_days, days_of_week, for_manager)
  select
    lokal,
    (case schedule_type
       when 'poranne'   then 'Poranne'
       when 'obiadowe'  then 'Obiadowe'
       when 'wieczorne' then 'Wieczorne'
       when 'cykliczne' then 'Cykliczne'
       else 'Ogólne'
     end)
    || (case when stanowisko <> '' then ' · ' || stanowisko else '' end)
    || (case when for_manager then ' (kierownik)' else '' end),
    nullif(stanowisko, ''),
    schedule_type,
    nullif(cycle_days, 0),
    nullif(days_of_week, ''),
    for_manager
  from grupy
  returning id, lokal, stanowiska, schedule_type, cycle_days, days_of_week, for_manager
)
update tasks t
set block_id = n.id::text
from nowe n
where t.lokal = n.lokal
  and coalesce(t.stanowisko, '')   = coalesce(n.stanowiska, '')
  and t.schedule_type              = n.schedule_type
  and coalesce(t.cycle_days, 0)    = coalesce(n.cycle_days, 0)
  and coalesce(t.days_of_week, '') = coalesce(n.days_of_week, '')
  and t.for_manager                = n.for_manager
  and not t.archived;


-- weryfikacja
select 'task_blocks' as co, count(*)::text as ile from task_blocks
union all
select 'zadania w blokach', count(*)::text from tasks where block_id is not null and not archived
union all
select 'zadania BEZ bloku (ma być 0)', count(*)::text from tasks where block_id is null and not archived
union all
select 'nowe kolumny', string_agg(column_name, ', ' order by column_name)
  from information_schema.columns
  where table_name in ('tasks', 'task_completions')
    and column_name in ('block_id', 'kolejnosc', 'pola', 'typ', 'template_key', 'entry_id');
