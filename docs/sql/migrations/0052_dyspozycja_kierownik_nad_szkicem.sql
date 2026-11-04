-- 0052 — Wpis kierownika w dyspozycji: szkic pracownika i kierownik o sobie (0.83.0)
--
-- Zgłoszenie z 04.11.2026: kierownik wpisywał w Grafiku („Wolne / urlop” →
-- „Nie może”) dzień niedostępności, pracownik dostawał wiadomość, a Grafik
-- dalej pozwalał wpisać zmianę; drugie „Zapisz” mówiło „Nic do zapisania”.
-- Dwie przyczyny, obie w triggerze `dyspozycja_autor` (0048/0051):
--
--   1. Wiersz pracownika był nietykalny, także SZKIC (miesiąc niewysłany).
--      Szkic nie wiąże (`wiazeDyspozycja`), więc dzień zaznaczony przez
--      pracownika w kalendarzu, ale niewysłany, był dla kierownika martwy:
--      jego „Nie może” pomijano, a Grafik szkicu i tak nie widział.
--      Od tej migracji kierownik może ZASTĄPIĆ (update) albo usunąć szkic.
--      ⚠️ Wysłana dyspozycja i prośba o zwolnienie ze zmiany (`zwolnienie_z`)
--      zostają chronione jak dotąd — zmienia je tylko pracownik.
--
--   2. Wpis kierownika O SOBIE (kierownik też pracuje, „Moja praca”) dostawał
--      autora 'pracownik'. Kierownik nie ma ekranu „Wyślij dyspozycję”, więc
--      taki wpis nie wiązał NIGDY. Od tej migracji każdy zapis kierownika to
--      autor 'kierownik'.
--
-- Pozostałe zasady bez zmian: rozstrzygnięcie prośby o zwolnienie nie zmienia
-- autora, klucz serwisowy (bez auth.uid()) przechodzi, pracownik zapisujący
-- swój dzień zostaje autorem 'pracownik' (także gdy nadpisuje wpis kierownika).
--
-- Kolejność: dowolna (podmiana funkcji). Front 0.83.0 na bazie bez 0052
-- zapisze puste dni jak dotąd, a przy szkicu pracownika pokaże błąd z
-- triggera zamiast udawać sukces.

create or replace function public.dyspozycja_autor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ja uuid;
  kierownik boolean;
  tylko_rozstrzygniecie boolean;
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

  if tg_op = 'UPDATE' then
    tylko_rozstrzygniecie :=
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
    tylko_rozstrzygniecie := false;
  end if;

  -- Kierownik rozstrzyga prośbę o zwolnienie: zmieniają się same pola
  -- rozstrzygnięcia, reszta wiersza zostaje taka, jak ją wpisał pracownik.
  if tg_op = 'UPDATE' and kierownik and tylko_rozstrzygniecie then
    new.autor := old.autor;
    new.autor_name := old.autor_name;
    new.zmieniono_at := old.zmieniono_at;
    return new;
  end if;

  -- Wiersz pracownika: chroniony, gdy jego miesiąc jest WYSŁANY albo wiersz
  -- jest prośbą o zwolnienie. Szkic kierownik może zastąpić albo usunąć.
  if tg_op in ('UPDATE', 'DELETE')
     and kierownik
     and old.user_id is distinct from ja
     and old.autor = 'pracownik' then
    chroniony := old.zwolnienie_z is not null
      or exists (
        select 1 from public.dyspozycja_miesiace m
        where m.user_id = old.user_id
          and m.miesiac = date_trunc('month', old.date)::date
          and m.wyslano_at is not null
      );
    if chroniony then
      raise exception 'Dyspozycję wysłaną przez pracownika zmienia tylko on. Kierownik może zapytać o jeden dzień w Grafiku.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.autor := case when kierownik then 'kierownik' else 'pracownik' end;
  new.autor_name := (select name from users where id = ja);
  new.zmieniono_at := now();
  -- Nowa treść wpisu otwiera sprawę na nowo (poprzednie rozstrzygnięcie
  -- dotyczyło poprzedniej treści).
  if tg_op = 'UPDATE' and not tylko_rozstrzygniecie then
    new.rozstrzygnieto_at := null;
    new.rozstrzygnal := null;
    new.rozstrzygniecie := null;
  end if;
  return new;
end;
$$;

-- Sprawdzenie: wpisy kierownika o sobie sprzed tej migracji (autor
-- 'pracownik', ale piszący = osoba = kierownik). Nie wiążą — wpisz je jeszcze
-- raz z Grafiku albo z karty pracownika, żeby dostały autora 'kierownik'.
select d.user_name, d.date, d.stan
from dyspozycja d
join users u on u.id = d.user_id
where d.autor = 'pracownik'
  and d.autor_name = u.name
  and u.role in ('admin', 'manager', 'manager_lokalu')
  and d.date >= current_date
order by d.date;
