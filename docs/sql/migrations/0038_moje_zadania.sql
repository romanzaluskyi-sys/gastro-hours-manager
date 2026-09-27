-- "Moje zadania" — własna lista kierownika (Zadania → Moje zadania, 0.56.0).
--
-- Do tej pory "Utwórz zadanie" przy zgłoszeniu zakładało wiersz w `tasks` z
-- `for_manager = true` i bez bloku. Taki wiersz lądował w wirtualnym bloku
-- "Bez bloku" i wracał CODZIENNIE jak pozycja checklisty — a sprawa ze
-- zgłoszenia ("zadzwonić do serwisu ekspresu") jest jednorazowa: ma termin,
-- jest zrobiona albo nie. Checklisty i lista spraw kierownika to dwie różne
-- rzeczy, więc dostają dwie tabele.
--
-- ⚠️ Osobna tabela, a nie kolejna kolumna w `tasks`, także z powodu
-- uprawnień: `tasks` czyta każdy, kto PRACUJE w lokalu (`pracuje_w_lokalu`,
-- 0031) — w tym tablet stojący na sali. Notatka kierownika typu "porozmawiać
-- z Dawidem o godzinach" nie może być do odczytania z tabletu.
--
-- Źródło (`zrodlo`):
--   'wlasne'     — wpisane ręcznie;
--   'zgloszenie' — przycisk "Utwórz zadanie" w Skrzynce; `zrodlo_id` = issues.id;
--   'puls'       — wpis z karty dnia albo pomiar poza normą; `zrodlo_id` =
--                  day_log_entries.id (albo pusty, gdy to notatka dnia).
-- `zrodlo_opis` to gotowy podpis ("Zgłoszenie · Karina 03.09") — zgłoszenie
-- anonimowe i tak nie ma autora, a podpis nie może zniknąć, gdy źródło
-- zostanie zarchiwizowane.
--
-- `lokal` NULL = "Cała sieć". `termin` NULL = bez terminu.
-- `wlasciciel_id` NULL = widzą wszyscy kierownicy (tak trafiają tu zadania
-- przeniesione z `tasks`, bo nie wiadomo, kto je założył).

create table if not exists public.zadania_moje (
  id uuid primary key default gen_random_uuid(),
  wlasciciel_id uuid,
  wlasciciel_name text,
  lokal text,
  tytul text not null,
  termin date,
  zrodlo text not null default 'wlasne'
    check (zrodlo in ('wlasne', 'zgloszenie', 'puls')),
  zrodlo_id text,
  zrodlo_opis text,
  zrobione_at timestamptz,
  zrobione_przez text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.zadania_moje enable row level security;

-- Tylko kierownik, i tylko swoje (albo wspólne, bez właściciela).
-- ⚠️ Wywołania funkcji w podzapytaniu skalarnym — patrz 0035: bez tego planer
-- woła je raz na wiersz.
drop policy if exists "moje_zadania" on public.zadania_moje;
create policy "moje_zadania" on public.zadania_moje
  for all to authenticated
  using (
    (select public.jest_kierownikiem())
    and (wlasciciel_id is null or wlasciciel_id = (select (public.moje_konto()).id))
  )
  with check (
    (select public.jest_kierownikiem())
    and (wlasciciel_id is null or wlasciciel_id = (select (public.moje_konto()).id))
  );

grant all on public.zadania_moje to authenticated;
revoke all on public.zadania_moje from anon;

-- Zadania ze zgłoszeń, które do dziś wisiały w `tasks` jako "Bez bloku".
-- Przenosimy je tutaj (bez właściciela) i archiwizujemy w `tasks` — historia
-- wykonań zostaje, a checklista przestaje pokazywać je codziennie.
insert into public.zadania_moje (lokal, tytul, termin, zrodlo, zrodlo_id, zrodlo_opis, created_at)
select
  t.lokal,
  t.title,
  null,
  'zgloszenie',
  t.source_issue_id,
  coalesce(
    'Zgłoszenie · ' || nullif(i.user_name, '') || ' ' || to_char(i.created_at, 'DD.MM'),
    'Zgłoszenie'
  ),
  t.created_at
from public.tasks t
left join public.issues i on i.id::text = t.source_issue_id
where t.source_issue_id is not null
  and t.block_id is null
  and coalesce(t.archived, false) = false
  and not exists (
    select 1 from public.zadania_moje z
    where z.zrodlo = 'zgloszenie' and z.zrodlo_id = t.source_issue_id
  );

update public.tasks
set archived = true
where source_issue_id is not null
  and block_id is null
  and coalesce(archived, false) = false;

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'zadania_moje'
order by ordinal_position;

select policyname, cmd from pg_policies where tablename = 'zadania_moje';
