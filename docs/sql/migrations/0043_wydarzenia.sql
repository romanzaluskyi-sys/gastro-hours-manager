-- Wydarzenia (Roadmap p.3, 0.74.0) — zebranie, grupa, inwentaryzacja,
-- kontrola, wydarzenie w okolicy. Specyfikacja: docs/WYDARZENIA.md.
--
-- Dwie tabele:
--   * `wydarzenia` — samo wydarzenie (dzień, lokal albo cała sieć, godziny,
--     dla kogo, czy płatne);
--   * `wydarzenia_uczestnicy` — KTO dostał wiadomość = kto jest uczestnikiem.
--     Lista jest ZAPISYWANA, nie liczona przy każdym odczycie: kierownik może
--     kogoś odznaczyć albo dopisać spoza listy, a „tylko ci z grafiku” znaczy
--     „ci, którzy byli w grafiku w chwili zapisu” — późniejsza zmiana grafiku
--     nie ma po cichu zmieniać, kto został zaproszony.
-- Plus `shifts.wydarzenie_id` — godziny z rozliczonego płatnego wydarzenia
-- (etap W4), żeby Rejestr mógł podpisać wiersz nazwą wydarzenia.
--
-- ⚠️ Płatne wydarzenie NIE jest wierszem `grafik_shifts`. Inaczej musiałoby
-- być wyłączone z kontroli obsady, giełdy, „bez odbicia”, porzuconych,
-- Aktywnych i publikacji — kilkanaście miejsc, z których któreś zostałoby
-- pominięte. Godziny płatnych wydarzeń dolicza świadomie `utils/wydarzenia.ts`.
--
-- Kto co może (właściciel, 2026-10-08):
--   * TWORZY, ZMIENIA i ODWOŁUJE tylko kierownik — w swoich lokalach; „Cała
--     sieć” (lokal NULL) tylko ten, kto widzi wszystko.
--   * WIDZI: każdy z lokalu (także osoba, której wydarzenie nie dotyczy —
--     „Cały lokal” w grafiku pracownika, bez wiadomości), wypożyczony w
--     lokalu, w którym go zaplanowano, uczestnik zawsze, „Cała sieć” wszyscy.
--   * LISTĘ UCZESTNIKÓW widzi kierownik i tablet swojego lokalu; prywatny
--     telefon — tylko własny wiersz.
--
-- ⚠️ Polityki są OSOBNE na każde polecenie (select / insert / update / delete),
-- a nie jedna `for all`: odczyt jest szerszy niż zapis, a `for all` z
-- warunkiem odczytu pozwoliłoby uczestnikowi skasować wydarzenie. Inwentarz z
-- końca `0032` pokaże tu po cztery polityki — to zamierzone, nie
-- „zapomniana otwarta polityka”: każda dotyczy innego polecenia, więc nie
-- składają się przez LUB.
--
-- ⚠️ Kształt predykatów jak w `0040`: każda funkcja w podzapytaniu skalarnym z
-- rzutowaniem, żadnej funkcji z argumentem z wiersza.

create table if not exists public.wydarzenia (
  id uuid primary key default gen_random_uuid(),
  lokal text,                                   -- NULL = cała sieć
  data date not null,
  godz_od time,                                 -- NULL = cały dzień
  godz_do time,                                 -- < godz_od = przez północ
  typ text not null default 'inne'
    check (typ in ('zebranie', 'grupa', 'inwentaryzacja', 'kontrola', 'okolica', 'inne')),
  tytul text not null,
  opis text,
  stanowiska text,                              -- po przecinku; NULL = wszystkie
  zakres text not null default 'wszyscy'
    check (zakres in ('wszyscy', 'grafik')),    -- kogo powiadomić
  liczba_gosci int,
  platne boolean not null default false,
  utworzyl text,
  zmienil text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  odwolane_at timestamptz,
  odwolal text,
  rozliczone_at timestamptz,                    -- płatne: obecność zapisana
  rozliczone_przez text,
  -- Płatne bez godzin nie ma czego wpisać do grafiku ani rozliczyć.
  constraint wydarzenia_platne_ma_godziny
    check (not platne or (godz_od is not null and godz_do is not null))
);

create index if not exists wydarzenia_data_idx on public.wydarzenia (data);
create index if not exists wydarzenia_lokal_data_idx on public.wydarzenia (lokal, data);

create table if not exists public.wydarzenia_uczestnicy (
  id uuid primary key default gen_random_uuid(),
  wydarzenie_id uuid not null references public.wydarzenia (id) on delete cascade,
  user_id uuid not null,
  user_name text,
  powiadomiono_at timestamptz,
  obecny boolean,                               -- płatne: NULL = nie rozliczono
  shift_id uuid,                                -- płatne: wiersz w `shifts`
  created_at timestamptz not null default now(),
  unique (wydarzenie_id, user_id)
);

create index if not exists wydarzenia_uczestnicy_user_idx on public.wydarzenia_uczestnicy (user_id);

alter table public.shifts add column if not exists wydarzenie_id text;  -- luźne odwołanie, bez FK

-- --------------------------------------------------------------------------
-- Funkcje pomocnicze. `security definer`, bo polityka `wydarzenia` pyta o
-- uczestników, a polityka uczestników o wydarzenia — bez definera to pętla.
-- --------------------------------------------------------------------------

-- Wydarzenia, które widzę jako ktoś z lokalu: cała sieć, moje lokale, lokale,
-- w których mnie zaplanowano (wypożyczony).
create or replace function public.wydarzenia_mojego_lokalu()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(w.id), '{}'::uuid[])
  from wydarzenia w
  where w.lokal is null
     or w.lokal = any ((select public.moje_lokale())::text[])
     or w.lokal = any ((select public.lokale_mojego_grafiku())::text[]);
$fn$;

-- Wydarzenia, w których jestem uczestnikiem (także z innego lokalu — „+ dodaj
-- osobę spoza listy”).
create or replace function public.moje_wydarzenia()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(u.wydarzenie_id), '{}'::uuid[])
  from wydarzenia_uczestnicy u
  where u.user_id = (select public.moje_id());
$fn$;

-- Czy mogę zmieniać wydarzenie w tym lokalu. Funkcja z argumentem, ale wołana
-- tylko w `with check` przy zapisie jednego wiersza — nie przy odczycie listy.
create or replace function public.moge_zmieniac_wydarzenie(p_lokal text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $fn$
  select (select public.jest_kierownikiem())
     and (
       (select public.widzi_wszystko())
       or (p_lokal is not null and p_lokal = any ((select public.moje_lokale())::text[]))
     );
$fn$;

-- Wydarzenia, które mogę zmieniać — do polityk uczestników.
create or replace function public.wydarzenia_do_zmiany()
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(w.id), '{}'::uuid[])
  from wydarzenia w
  where (select public.jest_kierownikiem())
    and (
      (select public.widzi_wszystko())
      or w.lokal = any ((select public.moje_lokale())::text[])
    );
$fn$;

-- --------------------------------------------------------------------------
-- Polityki.
-- --------------------------------------------------------------------------
alter table public.wydarzenia enable row level security;
alter table public.wydarzenia_uczestnicy enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('wydarzenia', 'wydarzenia_uczestnicy')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ⚠️ Warunek na KOLUMNACH wiersza, nie `id = any (wydarzenia_mojego_lokalu())`.
-- `api.post` to INSERT … RETURNING, a zwracany wiersz przechodzi przez tę
-- politykę — funkcja `stable` widzi tabelę z chwili startu polecenia, czyli
-- BEZ świeżo wstawionego wiersza, i kierownik lokalu dostałby odmowę na własne
-- wydarzenie. Ta sama treść co w `wydarzenia_mojego_lokalu()` — zmieniając
-- jedno, zmień drugie.
create policy "wydarzenia_odczyt" on public.wydarzenia
  for select to authenticated
  using (
    (select public.widzi_wszystko())
    or lokal is null
    or lokal = any ((select public.moje_lokale())::text[])
    or lokal = any ((select public.lokale_mojego_grafiku())::text[])
    or id = any ((select public.moje_wydarzenia())::uuid[])
  );

create policy "wydarzenia_dodanie" on public.wydarzenia
  for insert to authenticated
  with check ((select public.moge_zmieniac_wydarzenie(lokal)));

create policy "wydarzenia_zmiana" on public.wydarzenia
  for update to authenticated
  using (id = any ((select public.wydarzenia_do_zmiany())::uuid[]))
  with check ((select public.moge_zmieniac_wydarzenie(lokal)));

-- Odwołanie to `odwolane_at`, nie DELETE — ale kierownik może skasować
-- wydarzenie wpisane przez pomyłkę, zanim ktokolwiek dostał wiadomość.
create policy "wydarzenia_usuniecie" on public.wydarzenia
  for delete to authenticated
  using (id = any ((select public.wydarzenia_do_zmiany())::uuid[]));

create policy "uczestnicy_odczyt" on public.wydarzenia_uczestnicy
  for select to authenticated
  using (
    (select public.widzi_wszystko())
    or user_id = (select public.moje_id())
    or (((select public.jest_kierownikiem())
         or coalesce((select public.moja_rola()), '') = 'kiosk')
        and wydarzenie_id = any ((select public.wydarzenia_mojego_lokalu())::uuid[]))
  );

create policy "uczestnicy_dodanie" on public.wydarzenia_uczestnicy
  for insert to authenticated
  with check (wydarzenie_id = any ((select public.wydarzenia_do_zmiany())::uuid[]));

create policy "uczestnicy_zmiana" on public.wydarzenia_uczestnicy
  for update to authenticated
  using (wydarzenie_id = any ((select public.wydarzenia_do_zmiany())::uuid[]))
  with check (wydarzenie_id = any ((select public.wydarzenia_do_zmiany())::uuid[]));

create policy "uczestnicy_usuniecie" on public.wydarzenia_uczestnicy
  for delete to authenticated
  using (wydarzenie_id = any ((select public.wydarzenia_do_zmiany())::uuid[]));

grant select, insert, update, delete on public.wydarzenia to authenticated;
grant select, insert, update, delete on public.wydarzenia_uczestnicy to authenticated;
revoke all on public.wydarzenia from anon;
revoke all on public.wydarzenia_uczestnicy from anon;

-- Sprawdzenie:
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('wydarzenia', 'wydarzenia_uczestnicy') order by 1, 3;
