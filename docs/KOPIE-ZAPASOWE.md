# Kopie zapasowe i odtwarzanie

Decyzja z 2026-09-20: **płatny plan Supabase z automatycznymi kopiami**, a nie
własny skrypt eksportu. Powód jest prosty — kopia, którą ktoś musi pamiętać
uruchomić, przestaje powstawać mniej więcej wtedy, gdy zaczyna być potrzebna.

⚠️ **Do zrobienia po stronie właściciela** (nie da się tego zrobić z repo):
Supabase → projekt klienta → Settings → Billing → plan płatny. Cennik sprawdź
w dniu zakupu; rozliczenie idzie za organizację plus zużycie każdego projektu,
a w modelu silo **każdy klient to osobny projekt**, więc kolejny klient
podnosi rachunek. To jest realny koszt jednego klienta i tak trzeba go liczyć
przy ustalaniu ceny abonamentu.

## Co kopie obejmują, a czego nie

| Awaria | Czy kopia pomoże |
|---|---|
| Baza uszkodzona, projekt skasowany, awaria po stronie Supabase | tak |
| Zła migracja, która zepsuła dane | tak (odtworzenie do punktu sprzed) |
| Kierownik skasował pracownika albo miesiąc godzin | teoretycznie tak, praktycznie **źle** — patrz niżej |
| Ktoś wyciągnął dane przez publiczny klucz | nie, kopia nie ma z tym nic wspólnego |

⚠️ **Odtworzenie bazy cofa CAŁĄ bazę, nie jeden wiersz.** Przywrócenie
skasowanego wczoraj pracownika kosztowałoby utratę wszystkiego, co zapisano od
wczoraj — godzin, wpisów Pulsu, zadań. Dlatego przed pomyłkami człowieka broni
nas co innego i tak ma zostać:

- kasowanie na trwałe jest tylko w widoku Archiwum, nigdy z listy aktywnych;
- pracownika najpierw się archiwizuje;
- zmiana w Grafiku znika przez `deleted_at`, a nie `DELETE`;
- poprawka wpisu w Pulsie i pomiaru w Zadaniach to NOWY wiersz z
  `corrected_from`, stary zostaje.

Kopia zapasowa jest od katastrof, nie od pomyłek.

## Odtwarzanie — kolejność

1. **Zatrzymaj zapisy.** Vercel → projekt klienta → Deployments → Pause (albo
   wyłącz domenę). Odtwarzanie przy działającej aplikacji kończy się bazą,
   która jest po części stara, a po części nowa, i nie wiadomo w której części.
2. **Supabase → Database → Backups** → wybierz punkt i odtwórz.
3. **Sprawdź liczby, zanim wpuścisz ludzi:**
   ```sql
   select 'users' t, count(*) from users
   union all select 'shifts', count(*) from shifts
   union all select 'grafik_shifts', count(*) from grafik_shifts
   union all select 'day_logs', count(*) from day_logs
   union all select 'task_completions', count(*) from task_completions;

   select max(start_time) from shifts;   -- do kiedy sięga odtworzony stan
   ```
4. **Sprawdź migracje**: `select count(*) from schema_migrations;` ma się
   zgadzać z liczbą plików w `docs/sql/migrations/` (bez `README.md`). Jeśli
   odtworzony punkt jest sprzed migracji, dograj brakujące:
   `python3 scripts/migrate.py --projekt <REF> --wykonaj`.
5. **Wznów Vercel** i wejdź na ekran logowania — sprawdź nazwę najemcy.
6. **Powiedz kierownikom, do której godziny sięga stan.** Godziny odbite po tym
   momencie nie istnieją i ktoś musi je wpisać ręcznie; bez tej informacji
   zniknięcie dnia pracy wygląda na kolejną usterkę systemu.

## ⚠️ Odtwarzanie trzeba raz przećwiczyć

Kopia, której nikt nigdy nie odtworzył, jest obietnicą, nie kopią. Raz, na
spokojnie: odtwórz kopię do NOWEGO, tymczasowego projektu Supabase, policz
wiersze zapytaniem wyżej, skasuj projekt. Godzina raz, zamiast uczenia się
procedury w dniu awarii.

Zapisz tu datę, kiedy to zrobiono:

| Data ćwiczenia | Kto | Wynik |
|---|---|---|
| — | — | jeszcze nie ćwiczone |

## Google Sheets

Arkusz per klient (patrz `docs/NOWY-KLIENT.md` §3) to **niezależna kopia
godzin** — nie planowana jako kopia zapasowa, ale faktycznie nią jest:
historia odbić leży tam poza Supabase, u innego dostawcy. Warto o tym
pamiętać, zanim ktoś uzna synchronizację z arkuszem za zbędny relikt.
