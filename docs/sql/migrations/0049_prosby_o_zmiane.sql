-- 0049 — „Zapytaj”: prośba kierownika o JEDNĄ zmianę wbrew dyspozycji (0.80.0)
--
-- Kierownik nie może wpisać osoby, która w wysłanej dyspozycji nie może danego
-- dnia (0048). Może ją ZAPYTAĆ — zawsze o jeden dzień i jedną zmianę. Prośba
-- czeka na odpowiedź „Mogę” / „Nie mogę” i wygasa 24 h przed zmianą
-- (`wygasa_at`, liczone w aplikacji — patrz src/utils/prosby.ts).
--
-- ⚠️ Prośba NIE jest wierszem `grafik_shifts` (ta sama zasada co płatne
-- wydarzenia, 0.74.0): inaczej trzeba by ją wyłączać z obsady, publikacji,
-- giełdy, „bez odbicia” i Aktywnych. Zmiana powstaje dopiero przy „Mogę” —
-- od razu OPUBLIKOWANA, bo pracownik właśnie się na nią zgodził.
--
-- ⚠️ Odpowiedź idzie WYŁĄCZNIE przez RPC `odpowiedz_na_prosbe` (security
-- definer). Pracownik nie ma prawa zapisu do `grafik_shifts` (0040) i tak ma
-- zostać; funkcja sprawdza, kto odpowiada, czy prośba jeszcze czeka i nie
-- wygasła, i czy godziny nie nachodzą na inną zmianę tej osoby — dopiero
-- wtedy wstawia zmianę i daje znać kierownikowi lokalu.
--
-- Kto widzi: osoba, której dotyczy, tablet i kierownik jej lokalu
-- (`ludzie_mojej_dyspozycji()` z 0048), właściciel. Zakłada i wycofuje tylko
-- kierownik. Bez polityki delete — wycofanie to `status = 'wycofana'`.
--
-- Kolejność dowolna: nowa tabela i funkcja. Wymaga 0048.

create table if not exists prosby_o_zmiane (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_name text,
  lokal text not null,
  stanowisko text,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'czeka' check (status in ('czeka', 'zgoda', 'odmowa', 'wycofana')),
  wygasa_at timestamptz not null,
  kto_pyta text,
  kto_pyta_id uuid,
  powod text,
  odpowiedz_at timestamptz,
  odpowiedzial text,
  grafik_shift_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists prosby_o_zmiane_dzien on prosby_o_zmiane (date);
create index if not exists prosby_o_zmiane_osoba on prosby_o_zmiane (user_id, status);

alter table prosby_o_zmiane enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'prosby_o_zmiane'
  loop
    execute format('drop policy %I on public.prosby_o_zmiane', p.policyname);
  end loop;
end;
$$;

create policy "prosby_odczyt" on public.prosby_o_zmiane
  for select to authenticated
  using ((select public.widzi_wszystko()) or user_id = any ((select public.ludzie_mojej_dyspozycji())::uuid[]));
create policy "prosby_dodanie" on public.prosby_o_zmiane
  for insert to authenticated
  with check (
    (select public.jest_kierownikiem())
    and ((select public.widzi_wszystko()) or user_id = any ((select public.moi_ludzie())::uuid[]))
  );
create policy "prosby_zmiana" on public.prosby_o_zmiane
  for update to authenticated
  using (
    (select public.jest_kierownikiem())
    and ((select public.widzi_wszystko()) or user_id = any ((select public.moi_ludzie())::uuid[]))
  )
  with check (
    (select public.jest_kierownikiem())
    and ((select public.widzi_wszystko()) or user_id = any ((select public.moi_ludzie())::uuid[]))
  );

grant select, insert, update on public.prosby_o_zmiane to authenticated;
revoke all on public.prosby_o_zmiane from anon;

-- Odpowiedź pracownika. Zwraca wiersz prośby po zmianie i — przy zgodzie —
-- wstawioną zmianę: { "prosba": {...}, "zmiana": {...} | null }.
create or replace function public.odpowiedz_na_prosbe(p_id uuid, p_zgoda boolean, p_powod text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ja uuid := public.moje_id();
  rola text := public.moja_rola();
  pr prosby_o_zmiane%rowtype;
  zm grafik_shifts%rowtype;
  kto text;
  od_ts timestamp;
  do_ts timestamp;
  opis text;
begin
  select * into pr from prosby_o_zmiane where id = p_id for update;
  if not found then
    raise exception 'Nie ma takiej prośby.';
  end if;

  -- Odpowiada sama osoba albo tablet jej lokalu (tożsamością na wspólnym
  -- tablecie jest tablet — decyzja właściciela z Etapu 3).
  if not (pr.user_id = ja or (rola = 'kiosk' and pr.user_id = any (public.moi_ludzie()))) then
    raise exception 'Ta prośba jest do kogoś innego.';
  end if;
  if pr.status <> 'czeka' then
    raise exception 'Na tę prośbę już odpowiedziano albo kierownik ją wycofał.';
  end if;
  if now() >= pr.wygasa_at then
    raise exception 'Prośba wygasła — zapytaj kierownika, czy zmiana jest jeszcze aktualna.';
  end if;

  kto := coalesce((select name from users where id = ja), pr.user_name);
  opis := to_char(pr.date, 'DD.MM') || ', ' || to_char(pr.start_time, 'HH24:MI') || '–' ||
          to_char(pr.end_time, 'HH24:MI') || ', ' || coalesce(pr.stanowisko, '') || ' · ' || pr.lokal;

  if p_zgoda then
    od_ts := pr.date + pr.start_time;
    do_ts := pr.date + pr.end_time + case when pr.end_time <= pr.start_time then interval '1 day' else interval '0' end;
    if exists (
      select 1 from grafik_shifts g
      where g.user_id = pr.user_id::text
        and g.deleted_at is null
        and g.date between pr.date - 1 and pr.date + 1
        and tsrange(g.date + g.start_time,
                    g.date + g.end_time + case when g.end_time <= g.start_time then interval '1 day' else interval '0' end)
            && tsrange(od_ts, do_ts)
    ) then
      raise exception 'W tych godzinach masz już inną zmianę.';
    end if;

    insert into grafik_shifts (lokal, user_id, user_name, stanowisko, date, start_time, end_time,
                               published_at, created_by, updated_by, updated_at)
    values (pr.lokal, pr.user_id::text, pr.user_name, pr.stanowisko, pr.date, pr.start_time, pr.end_time,
            now(), pr.kto_pyta, kto, now())
    returning * into zm;

    update prosby_o_zmiane
       set status = 'zgoda', odpowiedz_at = now(), odpowiedzial = kto, grafik_shift_id = zm.id
     where id = pr.id
     returning * into pr;

    insert into notifications (audience, lokal, message, type, is_read)
    values ('manager', pr.lokal, pr.user_name || ' zgodził(a) się na zmianę: ' || opis || '. Jest już w grafiku.', 'dyspozycja', false);
  else
    update prosby_o_zmiane
       set status = 'odmowa', odpowiedz_at = now(), odpowiedzial = kto, powod = nullif(trim(coalesce(p_powod, '')), '')
     where id = pr.id
     returning * into pr;

    insert into notifications (audience, lokal, message, type, is_read)
    values ('manager', pr.lokal,
            pr.user_name || ' nie może przyjść na zmianę: ' || opis ||
              coalesce('. Powód: ' || pr.powod, '') || '.',
            'dyspozycja', false);
  end if;

  return jsonb_build_object('prosba', to_jsonb(pr), 'zmiana', case when p_zgoda then to_jsonb(zm) else null end);
end;
$$;

revoke all on function public.odpowiedz_na_prosbe(uuid, boolean, text) from public, anon;
grant execute on function public.odpowiedz_na_prosbe(uuid, boolean, text) to authenticated;

-- Sprawdzenie: trzy polityki (odczyt, dodanie, zmiana) i funkcja.
select
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'prosby_o_zmiane') as polityk,
  (select count(*) from pg_proc where proname = 'odpowiedz_na_prosbe') as funkcja;
