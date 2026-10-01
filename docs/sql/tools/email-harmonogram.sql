-- Harmonogram wysyłki e-maili do pracowników (0.70.0) + podgląd, co poszło.
-- Wklej do Supabase → SQL Editor. NIE jest migracją: adres aplikacji i sekret
-- są inne u każdego klienta (model silo), a runner migracji jest wspólny.
--
-- Dlaczego baza, a nie Vercel Cron: Vercel na planie Hobby wywołuje crona
-- najwyżej raz dziennie, a odpowiedź kierownika na korektę ma dojść po kilku
-- minutach. pg_cron + pg_net są w darmowym planie Supabase.
-- Raport kierownika chodzi zwykłym Vercel Cronem (vercel.json) — raz dziennie.

-- 1. Rozszerzenia (Database → Extensions pokazuje to samo; tu jednym ruchem).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Sekret w Vault, nie w treści zadania — `cron.job` czyta każdy z prawami
--    do bazy, a Vault trzyma go zaszyfrowanego. Wartość = CRON_SECRET z Vercela.
--    (Przy zmianie sekretu: select vault.update_secret(id, 'NOWY') …)
select vault.create_secret('WKLEJ_TU_CRON_SECRET', 'shiftro_cron_secret');

-- 3. Zadanie co 5 minut. Podmień adres na adres aplikacji TEGO klienta.
select cron.schedule(
  'shiftro-wyslij-maile',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://WKLEJ-ADRES-APLIKACJI/api/cron/wyslij-maile',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'shiftro_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- --- Sprawdzanie ----------------------------------------------------------

-- Czy zadanie istnieje i kiedy ostatnio chodziło:
select jobid, jobname, schedule, active from cron.job where jobname = 'shiftro-wyslij-maile';
select status, return_message, start_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'shiftro-wyslij-maile')
 order by start_time desc limit 10;

-- Co odpowiedział endpoint (pg_net trzyma odpowiedzi kilka godzin):
select created, status_code, left(content, 200) as odpowiedz
  from net._http_response order by created desc limit 10;

-- Co się stało z wiadomościami z ostatniej doby:
select to_char(created_at at time zone 'Europe/Warsaw', 'DD.MM HH24:MI') as kiedy,
       user_name, type, email_info
  from notifications
 where coalesce(audience, 'employee') = 'employee'
   and created_at > now() - interval '1 day'
 order by created_at desc;

-- Raporty kierowników:
select r.created_at at time zone 'Europe/Warsaw' as kiedy, u.name, r.rodzaj, r.okres, r.status
  from email_raporty r left join users u on u.id = r.user_id
 order by r.created_at desc limit 20;

-- Wyłączenie wysyłki do pracowników (np. na czas awarii):
-- select cron.unschedule('shiftro-wyslij-maile');
