-- 0044 — okna tolerancji wpisu godzin pilnowane przez BAZĘ (0.76.0)
--
-- Do 0.75.0 okna z karty lokalu (`start_wstecz_min`, `koniec_wstecz_min`,
-- migracja 0036) sprawdzała WYŁĄCZNIE przeglądarka (`sprawdzGodzine` w
-- src/utils/wpisy.ts). Kto znał adres API i miał konto pracownika albo
-- tabletu, mógł zapisać sobie zmianę sprzed tygodnia zwykłym zapytaniem.
-- `0040` zawęziło, KTO pisze do `shifts`; ten trigger pilnuje, KIEDY.
--
-- Reguły są TE SAME co w przeglądarce, żeby baza nigdy nie odrzuciła czegoś,
-- co ekran przepuścił:
--   - nowa zmiana bez końca (odbicie startu) → okno STARTU;
--   - nowa zmiana z końcem (cała zmiana naraz) → okno KOŃCA;
--   - dopisanie / zmiana końca istniejącej zmiany → okno KOŃCA;
--   - zmiana startu istniejącej zmiany → okno STARTU;
--   - godzina w przyszłości ponad 5 min (W_PRZOD_MIN) → odmowa.
--   Ustawienie NULL = bez limitu (lokal nieskonfigurowany działa jak dotąd).
--
-- ⚠️ Kogo dotyczy: tylko kont, które NIE są kierownikiem — pracownika z
-- prywatnym telefonem i tabletu (`kiosk`). Kierownik rozstrzyga korekty i
-- dopisuje godziny po fakcie (Do decyzji, Rejestr, rozliczenie wydarzeń), więc
-- jego nic tu nie zatrzymuje. Crony i skrypty (klucz SERVICE ROLE, bez
-- `auth.uid()`) też nie.
--
-- ⚠️ ZAPAS 15 minut ponad okno w obie strony. Godzinę liczy URZĄDZENIE, a
-- zegar tabletu w kuchni bywa przestawiony, do tego dochodzi wolne wi-fi.
-- Bez zapasu lokal z oknem „tylko teraz” (0) nie mógłby odbić startu z
-- tabletu spóźnionego o dwie minuty. Zamek ma zatrzymać wpisywanie z pamięci
-- godzinami po fakcie, a nie minuty różnicy zegarów.
--
-- ⚠️ Komunikat zaczyna się od „Poza oknem wpisu” — po tym rozpoznaje go
-- `opisBledu` w src/api/supabase.ts i ekran pracownika pokazuje go zamiast
-- ogólnego „Błąd zapisu”. Zmieniając początek zdania, popraw tamto miejsce.

create or replace function public.pilnuj_okna_wpisu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  zapas constant interval := interval '15 minutes';
  w_przod constant interval := interval '5 minutes';
  l record;
  okno_startu int;
  okno_konca int;
begin
  -- Serwer (crony, skrypty, SQL Editor) i kierownik — bez ograniczeń.
  if auth.uid() is null or (select public.jest_kierownikiem()) then
    return new;
  end if;

  select start_wstecz_min, koniec_wstecz_min
    into l
    from lokale
   where name = new.lokal
   limit 1;
  okno_startu := l.start_wstecz_min;
  okno_konca := l.koniec_wstecz_min;

  if tg_op = 'INSERT' then
    if new.end_time is null then
      if okno_startu is not null then
        if new.start_time < now() - make_interval(mins => okno_startu) - zapas then
          raise exception 'Poza oknem wpisu: w lokalu % start można zapisać samemu najwyżej % min po fakcie. Wyślij godzinę do kierownika (Zgłoś → Popraw zmianę) i sprawdź zegar urządzenia.',
            new.lokal, okno_startu using errcode = 'P0001';
        end if;
        if new.start_time > now() + w_przod + zapas then
          raise exception 'Poza oknem wpisu: start w przyszłości. Sprawdź zegar urządzenia.' using errcode = 'P0001';
        end if;
      end if;
    elsif okno_konca is not null then
      if new.end_time < now() - make_interval(mins => okno_konca) - zapas then
        raise exception 'Poza oknem wpisu: w lokalu % całą zmianę można zapisać samemu najwyżej % min po jej końcu. Wyślij ją do kierownika (Zgłoś → Popraw zmianę) i sprawdź zegar urządzenia.',
          new.lokal, okno_konca using errcode = 'P0001';
      end if;
      if new.end_time > now() + w_przod + zapas then
        raise exception 'Poza oknem wpisu: koniec w przyszłości. Sprawdź zegar urządzenia.' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: pilnujemy tylko godzin, które się ZMIENIAJĄ.
  if new.end_time is not null
     and new.end_time is distinct from old.end_time
     and okno_konca is not null then
    if new.end_time < now() - make_interval(mins => okno_konca) - zapas then
      raise exception 'Poza oknem wpisu: w lokalu % koniec można zapisać samemu najwyżej % min po fakcie. Wyślij godzinę do kierownika (Zgłoś → Popraw zmianę) i sprawdź zegar urządzenia.',
        new.lokal, okno_konca using errcode = 'P0001';
    end if;
    if new.end_time > now() + w_przod + zapas then
      raise exception 'Poza oknem wpisu: koniec w przyszłości. Sprawdź zegar urządzenia.' using errcode = 'P0001';
    end if;
  end if;
  if new.start_time is distinct from old.start_time
     and okno_startu is not null
     and new.start_time < now() - make_interval(mins => okno_startu) - zapas then
    raise exception 'Poza oknem wpisu: w lokalu % start można zapisać samemu najwyżej % min po fakcie. Wyślij godzinę do kierownika (Zgłoś → Popraw zmianę).',
      new.lokal, okno_startu using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_okno_wpisu on public.shifts;
create trigger shifts_okno_wpisu
  before insert or update of start_time, end_time, lokal on public.shifts
  for each row execute function public.pilnuj_okna_wpisu();
