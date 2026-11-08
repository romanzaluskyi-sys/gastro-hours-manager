-- 0053 — Dyspozycja pracownika czeka na zatwierdzenie kierownika (0.84.0)
--
-- Decyzja właściciela (06.11.2026): wysłana dyspozycja pracownika NIE blokuje
-- Grafiku od razu. „Nie mogę” i „Mogę w godzinach” z wysłanego miesiąca idą
-- do „Do decyzji” — jedna karta na (osoba, miesiąc): „Zatwierdź wszystko”,
-- pojedyncze dni można odrzucić. Do decyzji Grafik pokazuje podpowiedź
-- „czeka”, ale nie blokuje. Odrzucony dzień znika (wolny do planowania), a
-- pracownik dostaje wiadomość. „Mogę cały dzień” niczego nie blokuje, więc
-- zatwierdzenia nie potrzebuje. Wpis kierownika wiąże od razu, jak dotąd.
--
-- 1. Kolumny `zatwierdzono_at`, `zatwierdzil` na wierszu dnia (nie na
--    miesiącu): pracownik, który po zatwierdzeniu zmieni jeden dzień, wysyła
--    do decyzji TEN dzień, a nie cały miesiąc od nowa.
-- 2. Dyspozycje wysłane przed tą migracją są ZATWIERDZONE (decyzja
--    właściciela) — dziś już blokują i tak zostaje.
-- 3. Trigger `dyspozycja_autor`:
--    * zapis pracownika (także tabletu) zawsze CZYŚCI zatwierdzenie — nikt
--      nie zatwierdza sam sobie, a zmiana treści wraca do kierownika;
--    * kierownik zatwierdza zmieniając WYŁĄCZNIE pola zatwierdzenia (jak
--      rozstrzygnięcie prośby o zwolnienie) — autor i treść zostają;
--    * kierownik nie zmieni ani nie usunie wpisu pracownika, który jest
--      ZATWIERDZONY, jest prośbą o zwolnienie albo jest „Mogę cały dzień” z
--      wysłanego miesiąca. Niezatwierdzony (szkic albo czekający) — może:
--      odrzucenie dnia to usunięcie wiersza, a wpis z Grafiku go zastępuje.
-- 4. Stara niedostępność (`absences.type = 'niedostepnosc'`): od 0.81.0 jej
--    przyszłe dni żyją w dyspozycji (0050 skopiowała je jako wpisy
--    kierownika), ale wiersze `absences` dalej blokowały — więc dzień
--    ustawiony w karcie na „Może cały dzień” zostawał zablokowany, a Grafik
--    rysował ten sam „nie może” dwoma różnymi wzorami (zgłoszenie 06.11.2026).
--    Tu przyszłe dni zostają WYŁĄCZNIE w dyspozycji: wiersz kończący się w
--    przyszłości jest skracany do wczoraj, a w całości przyszły — usuwany,
--    ale tylko gdy każdy jego dzień ma wiersz w dyspozycji (inaczej zostaje).
--    Przeszłość zostaje nietknięta (historia w karcie pracownika).
--
-- Kolejność: po 0052. Nowy front (0.84.0) na bazie bez 0053 nie zapisze
-- zatwierdzenia (PostgREST odrzuci nieznaną kolumnę), a stary front na nowej
-- bazie: wysłana dyspozycja przestaje blokować, dopóki ktoś jej nie
-- zatwierdzi — puść ją razem z deployem 0.84.0.

alter table dyspozycja add column if not exists zatwierdzono_at timestamptz;
alter table dyspozycja add column if not exists zatwierdzil text;

-- 2. Wysłane wcześniej = zatwierdzone. Klucz serwisowy nie ma auth.uid(),
-- więc trigger przepuszcza ten UPDATE bez zmian.
update dyspozycja d
set zatwierdzono_at = m.wyslano_at,
    zatwierdzil = 'przed 0.84.0'
from dyspozycja_miesiace m
where m.user_id = d.user_id
  and m.miesiac = date_trunc('month', d.date)::date
  and m.wyslano_at is not null
  and d.autor = 'pracownik'
  and d.zwolnienie_z is null
  and d.zatwierdzono_at is null;

-- 3. Trigger.
create or replace function public.dyspozycja_autor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ja uuid;
  kierownik boolean;
  tylko_decyzja boolean;
  chroniony boolean;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  ja := public.moje_id();
  kierownik := public.jest_kierownikiem();

  -- „Tylko decyzja” = treść wiersza bez zmian; zmieniają się wyłącznie pola
  -- rozstrzygnięcia prośby o zwolnienie albo zatwierdzenia.
  if tg_op = 'UPDATE' then
    tylko_decyzja :=
      new.user_id is not distinct from old.user_id
      and new.date is not distinct from old.date
      and new.stan is not distinct from old.stan
      and new.od1 is not distinct from old.od1
      and new.do1 is not distinct from old.do1
      and new.od2 is not distinct from old.od2
      and new.do2 is not distinct from old.do2
      and new.notatka is not distinct from old.notatka
      and new.zwolnienie_z is not distinct from old.zwolnienie_z;
  else
    tylko_decyzja := false;
  end if;

  -- Kierownik rozstrzyga (zwolnienie / zatwierdzenie): reszta wiersza zostaje
  -- taka, jak ją wpisał pracownik.
  if tg_op = 'UPDATE' and kierownik and tylko_decyzja then
    new.autor := old.autor;
    new.autor_name := old.autor_name;
    new.zmieniono_at := old.zmieniono_at;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and kierownik
     and old.user_id is distinct from ja
     and old.autor = 'pracownik' then
    chroniony := old.zwolnienie_z is not null
      or old.zatwierdzono_at is not null
      or (old.stan = 'moge' and exists (
        select 1 from public.dyspozycja_miesiace m
        where m.user_id = old.user_id
          and m.miesiac = date_trunc('month', old.date)::date
          and m.wyslano_at is not null
      ));
    if chroniony then
      raise exception 'Zatwierdzoną dyspozycję pracownika zmienia tylko on. Kierownik może zapytać o jeden dzień w Grafiku.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.autor := case when kierownik then 'kierownik' else 'pracownik' end;
  new.autor_name := (select name from users where id = ja);
  new.zmieniono_at := now();
  if kierownik then
    -- Wpis kierownika wiąże od razu — zatwierdzenie jest jego własne.
    new.zatwierdzono_at := now();
    new.zatwierdzil := new.autor_name;
  else
    -- Pracownik (także tablet) niczego sobie nie zatwierdza ani nie
    -- rozstrzyga: nowa treść wraca do kierownika, a zapis BEZ zmiany treści
    -- zostawia pola decyzji takie, jakie były (nie da się ich ustawić samemu).
    if tg_op = 'UPDATE' and tylko_decyzja then
      new.zatwierdzono_at := old.zatwierdzono_at;
      new.zatwierdzil := old.zatwierdzil;
    else
      new.zatwierdzono_at := null;
      new.zatwierdzil := null;
    end if;
    if tg_op = 'UPDATE' then
      new.rozstrzygnieto_at := case when tylko_decyzja then old.rozstrzygnieto_at else null end;
      new.rozstrzygnal := case when tylko_decyzja then old.rozstrzygnal else null end;
      new.rozstrzygniecie := case when tylko_decyzja then old.rozstrzygniecie else null end;
    end if;
  end if;
  if tg_op = 'UPDATE' and kierownik and not tylko_decyzja then
    new.rozstrzygnieto_at := null;
    new.rozstrzygnal := null;
    new.rozstrzygniecie := null;
  end if;
  return new;
end;
$$;

-- 4. Stara niedostępność: przyszłe dni tylko w dyspozycji.
-- Najpierw dopisz to, czego 0050 mogła nie mieć (powtarzalne).
insert into dyspozycja (user_id, user_name, date, stan, notatka, autor, autor_name, zatwierdzono_at, zatwierdzil)
select a.user_id::uuid,
       a.user_name,
       d::date,
       'nie',
       a.note,
       'kierownik',
       coalesce(a.decided_by, 'kierownik'),
       now(),
       coalesce(a.decided_by, 'kierownik')
from absences a
cross join lateral generate_series(greatest(a.start_date, current_date), a.end_date, interval '1 day') as d
where a.type = 'niedostepnosc'
  and a.status = 'approved'
  and a.user_id is not null
  and a.end_date >= current_date
on conflict (user_id, date) do nothing;

-- W całości przyszłe: usuń, tylko gdy KAŻDY dzień ma wiersz w dyspozycji.
delete from absences a
where a.type = 'niedostepnosc'
  and a.status = 'approved'
  and a.user_id is not null
  and a.start_date >= current_date
  and not exists (
    select 1
    from generate_series(a.start_date, a.end_date, interval '1 day') d
    where not exists (
      select 1 from dyspozycja w where w.user_id = a.user_id::uuid and w.date = d::date
    )
  );

-- Trwające: skróć do wczoraj (przeszłość zostaje jako historia).
update absences a
set end_date = current_date - 1
where a.type = 'niedostepnosc'
  and a.status = 'approved'
  and a.user_id is not null
  and a.start_date < current_date
  and a.end_date >= current_date
  and not exists (
    select 1
    from generate_series(current_date, a.end_date, interval '1 day') d
    where not exists (
      select 1 from dyspozycja w where w.user_id = a.user_id::uuid and w.date = d::date
    )
  );

-- Sprawdzenie: (1) ile wierszy pracowników jest już zatwierdzonych, ile czeka;
-- (2) ile przyszłych dni starej niedostępności zostało (powinno być 0 albo
-- tylko wiersze bez user_id).
select
  (select count(*) from dyspozycja where autor = 'pracownik' and zatwierdzono_at is not null) as zatwierdzone_pracownikow,
  (select count(*) from dyspozycja where autor = 'pracownik' and zatwierdzono_at is null and stan <> 'moge'
     and zwolnienie_z is null and date >= current_date) as nie_moge_bez_zatwierdzenia,
  (select count(*) from absences where type = 'niedostepnosc' and status = 'approved' and end_date >= current_date) as stara_niedostepnosc_w_przyszlosci;
