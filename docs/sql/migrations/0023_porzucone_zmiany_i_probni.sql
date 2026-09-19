-- Dwie rzeczy, które zaczynają się tam, gdzie kończy się odbicie na tablecie.
--
-- 1. ZMIANA BEZ ZAKOŃCZENIA. Ktoś odbił start i wyszedł nie odbijając końca —
--    najczęściej dlatego, że tablet stał w kuchni, a wyjście było przez salę.
--    Taka zmiana wisi otwarta w nieskończoność: kierownikowi kłamie ekran
--    "Kto jest teraz w pracy", a pracownikowi BLOKUJE kolejne odbicie (formularz
--    przechodzi wtedy w tryb "zakończ trwającą zmianę" i nie da się zacząć nowej).
--
--    ⚠️ Godzin NIE dopisujemy automatycznie i nie wpisujemy zgadywanego końca.
--    `end_time` zostaje NULL, a to znaczy zero godzin wszędzie — każde
--    podsumowanie w tej apce liczy `end_time - start_time` i pomija wiersze bez
--    końca. Dzięki temu nie trzeba dokładać wyjątku w dziesięciu miejscach.
--    Kierownik decyduje w zakładce Zatwierdzanie zmian: `rozliczenie` to ta sama
--    para nazw co przy zmianach z grafiku bez odbicia (grafik_shifts, 0016) —
--    'zapisano' (godziny wpisane ręcznie) albo 'odrzucono' (zmiany nie było).
--    Bez tej kolumny odrzucona pozycja wracałaby do kolejki codziennie.
--    `porzucona_powiadomiono_at` pilnuje tylko tego, żeby codzienny cron nie
--    wysłał tej samej wiadomości drugi raz.
--
--    Progi stoją na LOKALU, nie w kodzie — z tego samego powodu co narzut i
--    okres rozliczeniowy z 0018: to decyzja organizacyjna, jednakowa dla całej
--    załogi. Puste = wartości domyślne (4 h po grafiku, 17 h bez grafiku), żeby
--    ta migracja niczego nie zmieniła lokalom, których nikt nie skonfiguruje.
--
-- 2. PRACOWNIK NA PRÓBĘ. Ktoś przychodzi na dzień próbny, a dzień bywa płatny —
--    czyli trzeba mu zapisać godziny, zanim istnieje jakakolwiek umowa i zanim
--    kierownik w ogóle o nim wie. Osoba dodana z Tabletu Służbowego to zwykły
--    wiersz w `users` (godziny odwołują się do user_id, a Raport, Aktywni i
--    Rejestr czytają users — osobna tabela kazałaby zdublować wszystko), tylko
--    oznaczony `probny_status`. 'oczekuje' znaczy: widoczny na tablecie, może
--    odbijać godziny, NIE pokazuje się w Grafiku i czeka na decyzję kierownika.

alter table lokale add column tolerancja_po_grafiku_h numeric;  -- puste = 4
alter table lokale add column max_dlugosc_zmiany_h numeric;     -- puste = 17

alter table shifts add column rozliczenie text;                 -- 'zapisano' | 'odrzucono'
alter table shifts add column rozliczenie_przez text;
alter table shifts add column rozliczenie_at timestamptz;
alter table shifts add column porzucona_powiadomiono_at timestamptz;

alter table users add column probny_status text;  -- 'oczekuje' | 'zatwierdzony' | 'odrzucony'
alter table users add column probny_od date;
alter table users add column probny_przez text;

-- weryfikacja
select table_name, column_name
from information_schema.columns
where (table_name = 'lokale' and column_name in ('tolerancja_po_grafiku_h', 'max_dlugosc_zmiany_h'))
   or (table_name = 'shifts' and (column_name like 'rozliczenie%' or column_name = 'porzucona_powiadomiono_at'))
   or (table_name = 'users' and column_name like 'probny%')
order by table_name, column_name;
