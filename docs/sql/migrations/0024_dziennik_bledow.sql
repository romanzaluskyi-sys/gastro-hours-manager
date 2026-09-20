-- Dziennik błędów aplikacji.
--
-- Do 0.41.0 błąd w przeglądarce nie zostawiał żadnego śladu. Komponent, który
-- wywalił się przy renderowaniu, gasił CAŁĄ stronę na biało — a że stoi to na
-- tablecie w kuchni, jedyną formą zgłoszenia był telefon: "nie działa".
-- Bez wersji, bez ekranu, bez treści błędu, zwykle następnego dnia.
--
-- ⚠️ Ta tabela NIE jest analityką i nie ma rosnąć bez końca. Zapisujemy
-- najwyżej kilka wierszy na sesję przeglądarki (`LIMIT_NA_SESJE` w
-- src/api/errors.ts) i pomijamy powtórzenia tej samej treści — bez tego jeden
-- błąd w pętli renderowania potrafi wygenerować tysiące wierszy w minutę,
-- czyli dokładnie wtedy, gdy baza jest najbardziej potrzebna do pracy.
--
-- ⚠️ Nie zapisujemy tu NICZEGO, czego nie ma już w bazie: imię zalogowanej
-- osoby i lokal owszem, ale żadnych danych z formularzy ani treści wpisów.
-- Stos wywołań z produkcji jest zminifikowany i tak ma zostać — do odtworzenia
-- błędu wystarcza wersja aplikacji, ekran i komunikat.
--
-- Jak to czytać: docs/sql/tools/ostatnie-bledy.sql

create table if not exists app_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  app_version text,          -- APP_VERSION z paczki, która się wywaliła
  tenant      text,          -- REACT_APP_TENANT, czyli u kogo
  typ         text,          -- 'render' | 'window' | 'promise'
  komunikat   text,
  stos        text,
  ekran       text,          -- widok/zakładka, jeśli dało się ustalić
  user_name   text,
  rola        text,
  lokal       text,
  url         text,
  user_agent  text
);

create index if not exists app_errors_created_at_idx on app_errors (created_at desc);

alter table app_errors enable row level security;
drop policy if exists "open" on app_errors;
create policy "open" on app_errors for all using (true) with check (true);

-- weryfikacja
select column_name, data_type
from information_schema.columns
where table_name = 'app_errors'
order by ordinal_position;
