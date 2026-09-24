-- Tablet Służbowy widzi KOREKTY godzin osób ze swojego lokalu.
--
-- Polityka `moje_zgloszenia` z 0033/0036 wpuszcza do `issues` autora
-- (`user_id = moje_id()`) i kierowników. Tablet nie jest ani jednym, ani
-- drugim: pracownik wysyła z niego zgłoszenie z SWOIM user_id, a zalogowane
-- jest konto tabletu.
--
-- Skutek jest gorszy niż "tablet nie widzi cudzych zgłoszeń". `api.post`
-- zapisuje z `Prefer: return=representation`, czyli INSERT … RETURNING, a
-- Postgres sprawdza zwracany wiersz polityką SELECT — i gdy go nie widać,
-- odrzuca CAŁY zapis ("new row violates row-level security policy").
-- `with check (true)` tu nie pomaga, bo dotyczy tylko samego wstawienia.
-- Czyli od 0033 "Zgłoś → Popraw zmianę" wysłane z tabletu najpewniej kończy
-- się błędem połączenia.
--
-- Od 0.45.0 z tej samej drogi korzysta wpis spoza okna tolerancji lokalu
-- (utils/wpisy.ts): pracownik wysyła godzinę kierownikowi jako korektę, a
-- tablet musi tę korektę WIDZIEĆ, żeby zmiana czekająca na decyzję przestała
-- u niego blokować kolejne odbicie — także po przeładowaniu strony.
--
-- Zakres świadomie wąski:
--   - tylko rola `kiosk` — prywatny telefon pracownika dalej widzi wyłącznie
--     swoje zgłoszenia, nie kolegów;
--   - tylko `type = 'correction'`. Korekta to godziny, a godziny tego lokalu
--     tablet i tak ma w `shifts`. Zgłoszenia PROBLEMÓW ("Zgłoś problem")
--     zostają poza zasięgiem tabletu — tam bywa skarga na kogoś z tej samej
--     sali. Ten sam błąd RETURNING dotyczy ich nieanonimowej wersji; to
--     osobna decyzja właściciela, nie ta migracja.
--
-- ⚠️ Każde wywołanie funkcji w PODZAPYTANIU SKALARNYM — patrz 0035/0036.
-- ⚠️ Nazwę polityki bierzemy z 0036; inwentarz na końcu pokazuje, czy na
-- `issues` nie została druga, zapomniana polityka.

drop policy if exists "moje_zgloszenia" on public.issues;
create policy "moje_zgloszenia" on public.issues
  for all to authenticated
  using (
    user_id = (select public.moje_id())
    or ((select public.jest_kierownikiem())
        and (coalesce(is_anonymous, false) or user_id is null
             or user_id = any ((select public.moi_ludzie()))))
    or ((select public.moja_rola()) = 'kiosk'
        and type = 'correction'
        and user_id = any ((select public.moi_ludzie())))
  )
  with check (true);

-- weryfikacja: na `issues` ma stać dokładnie JEDNA polityka
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'issues'
order by policyname;
