-- Cztery rzeczy wokół pracownika i grafiku.
--
-- 1. `umowa_bezterminowa` — umowa bez daty końca. Bez tego pole "termin umowy"
--    zostawało puste, karta świeciła żółtym "Brak terminu", a cron nie miał
--    czego pilnować. Puste pole i "nie ma terminu, bo nie ma" to dwie różne
--    rzeczy i muszą wyglądać różnie.
-- 2. `ostatni_dzien` — znany ostatni dzień pracy. Po nim Grafik nie pozwala
--    wpisać zmiany, a cron przestaje przypominać o umowie komuś, kto i tak
--    odchodzi.
-- 3. `grafik_shifts.rozliczenie` — co kierownik zrobił ze zmianą z grafiku,
--    której nikt nie odbił: 'zapisano' (powstał wpis w shifts) albo
--    'odrzucono' (zmiana się nie odbyła). Bez tego odrzucona pozycja wracałaby
--    do kolejki codziennie, aż kolejkę przestano by czytać.

alter table users add column umowa_bezterminowa boolean not null default false;
alter table users add column ostatni_dzien date;

alter table grafik_shifts add column rozliczenie text;          -- 'zapisano' | 'odrzucono'
alter table grafik_shifts add column rozliczenie_przez text;
alter table grafik_shifts add column rozliczenie_at timestamptz;

-- weryfikacja
select table_name, column_name
from information_schema.columns
where (table_name = 'users' and column_name in ('umowa_bezterminowa', 'ostatni_dzien'))
   or (table_name = 'grafik_shifts' and column_name like 'rozliczenie%')
order by table_name, column_name;
