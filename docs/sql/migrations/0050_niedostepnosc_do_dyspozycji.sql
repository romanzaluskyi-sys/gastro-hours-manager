-- 0050 — stara niedostępność → dyspozycja „Nie mogę” (0.81.0)
--
-- Do 0.79.0 „nie mogę pracować” zapisywało się w `absences` jako
-- `type = 'niedostepnosc'` (wniosek pracownika albo wpis kierownika z Grafiku).
-- Od 0.81.0 to jedno pojęcie: dyspozycja „Nie mogę” (0048). Ta migracja
-- przepisuje PRZYSZŁE dni zatwierdzonych niedostępności do `dyspozycja` jako
-- wpis kierownika (`autor = 'kierownik'` — wiąże od razu, bez wysyłania
-- miesiąca, i pracownik widzi go w swoim kalendarzu).
--
-- ⚠️ Wiersze `absences` ZOSTAJĄ — to historia (karta pracownika, Archiwum
-- Skrzynki) i dalej blokują jak dotąd. Aplikacja od 0.81.0 traktuje je tak
-- samo jak „Nie mogę” (daje „Zapytaj”), więc podwójny zapis niczego nie psuje.
-- ⚠️ Dzień, który pracownik zaznaczył już SAM w dyspozycji, zostaje bez
-- zmian (`on conflict do nothing`) — jego słowo jest nowsze.
--
-- Klucz serwisowy (migrate.py) nie ma `auth.uid()`, więc trigger
-- `dyspozycja_autor` przepuszcza `autor` taki, jaki podajemy.
-- Kolejność: po 0048. Powtarzalna (drugi przebieg nic nie dopisze).

insert into dyspozycja (user_id, user_name, date, stan, notatka, autor, autor_name)
select a.user_id::uuid,
       a.user_name,
       d::date,
       'nie',
       a.note,
       'kierownik',
       coalesce(a.decided_by, 'kierownik')
from absences a
cross join lateral generate_series(greatest(a.start_date, current_date), a.end_date, interval '1 day') as d
where a.type = 'niedostepnosc'
  and a.status = 'approved'
  and a.user_id is not null
  and a.end_date >= current_date
on conflict (user_id, date) do nothing;

-- Sprawdzenie: ile przyszłych dni niedostępności ma już swój wpis „Nie mogę”.
select
  (select count(*) from absences a
     cross join lateral generate_series(greatest(a.start_date, current_date), a.end_date, interval '1 day') d
     where a.type = 'niedostepnosc' and a.status = 'approved' and a.user_id is not null and a.end_date >= current_date) as dni_niedostepnosci,
  (select count(*) from dyspozycja where autor = 'kierownik' and stan = 'nie' and date >= current_date) as wpisow_nie_moge_kierownika;
