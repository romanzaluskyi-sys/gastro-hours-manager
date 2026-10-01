-- 0039 — powiadomienia e-mail (0.70.0)
--
-- Wiadomość w aplikacji dalej jest źródłem prawdy; e-mail to jej KOPIA dla
-- osób z wpisanym adresem. Wysyła serwer (api/cron/wyslij-maile.js i
-- api/cron/raport-kierownika.js przez Brevo), nigdy przeglądarka: klucz
-- poczty nie może trafić do paczki, a tablet w kuchni gubi wi-fi.
--
-- ⚠️ KOLEJNOŚĆ: ta migracja idzie PRZED deployem 0.70.0. Nowy bundle zapisuje
-- `notifications.dane`; bez kolumny PostgREST odrzuciłby cały wiersz.
-- (createEmployeeNotification ponawia zapis bez `dane`, ale to siatka, nie plan.)

-- Szczegóły wiadomości w kształcie do pokazania (wiersze "Zmiana / Godziny /
-- Było → Jest"). Treść (`message`) zostaje jedyną rzeczą, którą czyta
-- aplikacja — `dane` czyta tylko szablon e-maila. Puste = e-mail pokaże samą
-- treść.
alter table notifications add column if not exists dane jsonb;

-- Kiedy i z jakim skutkiem ten wiersz obsłużyła wysyłka e-maili
-- ('wysłano', 'pominięto: …', 'błąd: …'). Ta sama rola co
-- shifts.porzucona_powiadomiono_at: pilnuje, żeby nic nie poszło dwa razy.
alter table notifications add column if not exists email_at timestamptz;
alter table notifications add column if not exists email_info text;

-- Wszystko, co już jest w bazie, uznajemy za obsłużone — inaczej pierwsze
-- uruchomienie wysłałoby ludziom pocztą wiadomości sprzed tygodni.
update notifications
   set email_at = now(), email_info = 'pominięto: sprzed 0039'
 where email_at is null;

-- Kolejka wysyłki to "email_at is null" — indeks częściowy zostaje mały, bo
-- obsłużone wiersze z niego wypadają.
create index if not exists notifications_email_czeka
  on notifications (created_at)
  where email_at is null;

-- Zgoda na e-maile. Domyślnie TAK (decyzja właściciela, 2026-10-01): adres w
-- karcie wpisuje się po to, żeby dało się do kogoś napisać. Wyłącza kierownik
-- w karcie albo sama osoba linkiem "Ustawienia powiadomień" z każdego maila.
alter table users add column if not exists email_powiadomienia boolean not null default true;

-- Raporty kierownika (dzienny, tygodniowy) — jeden wiersz na (osoba, rodzaj,
-- okres). Unikalność to cała ochrona przed drugim mailem z tym samym raportem,
-- gdy Vercel wywoła crona dwa razy.
create table if not exists email_raporty (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rodzaj text not null,          -- 'dzien' | 'tydzien'
  okres text not null,           -- '2026-09-30' albo '2026-09-22' (poniedziałek)
  status text,                   -- 'wysłano' | 'błąd: …'
  created_at timestamptz not null default now(),
  unique (user_id, rodzaj, okres)
);
-- Bez żadnej polityki: pisze i czyta wyłącznie klucz serwisowy (omija RLS).
alter table email_raporty enable row level security;

-- Widok kartoteki: kolumna dochodzi na KOŃCU (create or replace view pozwala
-- tylko dopisywać), reszta przepisana dosłownie z 0034. Poziom "własne albo
-- kierownik" — to ustawienie osoby, nie informacja dla współpracowników.
create or replace view public.users_widok as
select
  -- jawne
  u.id,
  u.auth_id,
  u.name,
  u.role,
  u.active,
  u.archived,
  u.created_at,
  u.default_lokal,
  u.default_stanowisko,
  u.allowed_lokale,
  u.allowed_stanowiska,
  u.probny_status,
  u.probny_od,
  u.probny_przez,
  u.puls_do,
  u.ma_kiosk_pin,
  u.typ_umowy,
  u.etat,
  u.wymiar_etatu,
  -- własne albo kierownik
  case when w.wolno then u.email end                  as email,
  case when w.wolno then u.pin end                    as pin,
  case when w.wolno then u.kiosk_pin end              as kiosk_pin,
  case when w.wolno then u.stawka end                 as stawka,
  case when w.wolno then u.wynagrodzenie_mies end     as wynagrodzenie_mies,
  case when w.wolno then u.telefon end                as telefon,
  case when w.wolno then u.data_urodzenia end         as data_urodzenia,
  case when w.wolno then u.data_zatrudnienia end      as data_zatrudnienia,
  case when w.wolno then u.sanepid_expiry end         as sanepid_expiry,
  case when w.wolno then u.sanepid_last_notified end  as sanepid_last_notified,
  case when w.wolno then u.umowa_expiry end           as umowa_expiry,
  case when w.wolno then u.umowa_last_notified end    as umowa_last_notified,
  case when w.wolno then u.umowa_bezterminowa end     as umowa_bezterminowa,
  case when w.wolno then u.ostatni_dzien end          as ostatni_dzien,
  -- tylko kierownik
  case when w.kierownik then u.notatki end            as notatki,
  case when w.kierownik then u.notatki_updated_by end as notatki_updated_by,
  case when w.kierownik then u.notatki_updated_at end as notatki_updated_at,
  -- własne albo kierownik (0039)
  case when w.wolno then u.email_powiadomienia end    as email_powiadomienia
from users u
cross join lateral (
  select
    public.widzi_kartoteke()                                  as kierownik,
    public.widzi_kartoteke() or u.auth_id = auth.uid()        as wolno
) w
where public.widzi_wszystko()
   or u.auth_id = auth.uid()
   or u.id = any (public.moi_ludzie())
   or exists (
        select 1 from grafik_shifts gs
        where gs.user_id = u.id::text
          and gs.published_at is not null
          and gs.deleted_at is null
          and gs.date between current_date - 1 and current_date + 1
          and gs.lokal = any (public.moje_lokale())
      );

-- Sprawdzenie po zapisie:
--   select column_name from information_schema.columns
--    where table_name = 'notifications' and column_name in ('dane','email_at','email_info');
--   select count(*) filter (where email_at is null) from notifications;   -- 0
