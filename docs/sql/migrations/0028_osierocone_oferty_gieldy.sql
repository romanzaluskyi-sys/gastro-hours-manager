-- Sprzątnięcie ofert giełdy, których zmiana już nie istnieje.
--
-- OBJAW (22.09.2026, Olena): zmiana wystawiona na giełdę, nikt jej nie wziął,
-- kierownik usunął ją z grafiku — a Tablet Służbowy przy nazwisku dalej pisał
-- „Giełda: na giełdzie". Bez końca, bo nic tego wiersza nie sprzątało.
--
-- PRZYCZYNA: `shift_swaps.grafik_shift_id` to luźne odwołanie tekstem, bez
-- klucza obcego (konwencja tego projektu), a ŻADNA ze ścieżek usuwania zmiany
-- nie dotykała `shift_swaps` — ani pojedyncze usunięcie, ani czyszczenie
-- zakresu, ani zdejmowanie zmian odchodzącemu pracownikowi. Od 0.42.2 robi to
-- `wycofajOfertyDlaZmian` w `utils/swaps.ts`, a aplikacja dodatkowo sprawdza
-- przy ODCZYCIE, czy zmiana wciąż istnieje. Ta migracja dotyczy wierszy, które
-- osierociały wcześniej.
--
-- ⚠️ Status 'wycofana', nie kasowanie wiersza. Giełda jest zapisem tego, co
-- się działo — kto komu co proponował i jak się to skończyło. Skasowany wiersz
-- odpowiada „nigdy nie było", a było.

update shift_swaps s
set status = 'wycofana',
    decided_at = coalesce(s.decided_at, now()),
    decided_by = coalesce(s.decided_by, 'porządki 0028'),
    note = coalesce(nullif(s.note, ''), 'Zmiana została zdjęta z grafiku.')
where s.status in ('na_gieldzie', 'przyjeta')
  and (
    -- zmiany nie ma w ogóle (nigdy niewysłana, skasowana od razu)
    not exists (
      select 1 from grafik_shifts g
      where g.id::text = s.grafik_shift_id
    )
    -- albo jest, ale oznaczona do usunięcia przy najbliższej publikacji
    or exists (
      select 1 from grafik_shifts g
      where g.id::text = s.grafik_shift_id
        and g.deleted_at is not null
    )
    -- przy zamianie wystarczy, że zniknęła DRUGA strona: bez niej nie ma
    -- czego przepisać w obie strony, a sama oferta jest już nie do spełnienia
    or (
      s.wzajemna_shift_id is not null
      and not exists (
        select 1 from grafik_shifts g
        where g.id::text = s.wzajemna_shift_id
          and g.deleted_at is null
      )
    )
  );

-- weryfikacja: nie powinno zostać ANI JEDNEJ aktywnej oferty bez żywej zmiany
select s.id, s.date, s.author_user_name, s.status
from shift_swaps s
where s.status in ('na_gieldzie', 'przyjeta')
  and not exists (
    select 1 from grafik_shifts g
    where g.id::text = s.grafik_shift_id and g.deleted_at is null
  );
