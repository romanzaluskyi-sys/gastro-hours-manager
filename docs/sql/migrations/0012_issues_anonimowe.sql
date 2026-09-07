-- Naprawa: anonimowe zgłoszenie nie da się dziś wysłać.
--
-- employeeSessionShared.tsx:838 wysyła user_name = null, gdy pracownik
-- zaznaczy "anonimowo" — a kolumna jest NOT NULL (zrzut z 2026-09-07).
-- Postgres odrzuca insert, pracownik dostaje błąd i zgłoszenie przepada.
-- Nikt tego nie zgłosił, bo anonimowe zgłoszenie z definicji nie ma autora,
-- który by dopytał.
--
-- Zdejmujemy NOT NULL zamiast wstawiać podstawkę w rodzaju 'Anonim' —
-- dokładnie tak samo naprawiono kiedyś notifications.user_name/action, gdy
-- ta tabela dostała drugiego konsumenta. Kod już wszędzie rozpoznaje
-- anonimowe zgłoszenie po fladze is_anonymous, nie po treści user_name.

alter table issues alter column user_name drop not null;

-- weryfikacja
select column_name, is_nullable
from information_schema.columns
where table_name = 'issues' and column_name = 'user_name';
