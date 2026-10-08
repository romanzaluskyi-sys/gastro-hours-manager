#!/usr/bin/env python3
"""Stosowanie migracji SQL do bazy Supabase.

Domyślnie SUCHY PRZEBIEG — niczego nie zmienia, tylko drukuje plan.
Zapis dopiero z --wykonaj (ta sama konwencja co scripts/import-grafik.py).

    python3 scripts/migrate.py --projekt gdzossvaauznqsrfqovw
    python3 scripts/migrate.py --projekt gdzossvaauznqsrfqovw --wykonaj

Wszystkie bazy z rejestru klientów (klienci.json) jednym przebiegiem — tak ma
wyglądać każde wydanie z nową migracją:

    python3 scripts/migrate.py --wszyscy
    python3 scripts/migrate.py --wszyscy --wykonaj

Pierwsze uruchomienie na ISTNIEJĄCEJ bazie (ta, która działa dziś) —
migracje 0005–0009 są tam już zastosowane ręcznie, więc trzeba je oznaczyć
zamiast puszczać drugi raz:

    python3 scripts/migrate.py --projekt REF --oznacz-zastosowane 0005 0006 0007 0008 0009 --wykonaj

Token: Supabase → Account → Access Tokens → Generate new token, potem

    export SUPABASE_PAT=sbp_...

Ref projektu to człon z adresu bazy: https://<REF>.supabase.co
"""
import argparse, hashlib, json, os, pathlib, sys, urllib.error, urllib.request

KATALOG = pathlib.Path(__file__).resolve().parent.parent / "docs" / "sql" / "migrations"
API = "https://api.supabase.com/v1/projects/{ref}/database/query"


class BrakDostepu(SystemExit):
    """401/403/404 z API — ta baza jest dla tokenu niedostępna. Przy --wszyscy
    NIE zatrzymuje pozostałych klientów (w odróżnieniu od błędu w SQL)."""


def zapytanie(ref, token, sql):
    req = urllib.request.Request(
        API.format(ref=ref),
        method="POST",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Cloudflare przed api.supabase.com odrzuca domyślne
            # "Python-urllib/3.x" błędem 403 / "error code: 1010" — to nie jest
            # problem z tokenem, tylko z User-Agentem. Bez tej linii runner
            # nie zadziała w ogóle.
            "User-Agent": "gastro-migrate/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else []
    except urllib.error.HTTPError as e:
        tresc = e.read().decode()
        podpowiedz = {
            401: "  Token odrzucony — sprawdź, czy SUPABASE_PAT jest ustawiony i nie wygasł.",
            403: ("  Brak dostępu do tego projektu tym tokenem. Najczęściej: projekt jest w\n"
                  "  organizacji Supabase, w której konto tokenu nie jest członkiem albo ma rolę\n"
                  "  bez dostępu do SQL (potrzebny Owner / Administrator). Sprawdź, które\n"
                  "  projekty token widzi:\n"
                  "    curl -s -H \"Authorization: Bearer $SUPABASE_PAT\" https://api.supabase.com/v1/projects\n"
                  "  („error code: 1010” zamiast JSON-a = blokada Cloudflare, nie uprawnienia.)"),
            404: "  Nie ma takiego projektu — sprawdź ref po --projekt.",
        }.get(e.code, "")
        print(f"\n  BŁĄD {e.code} od Supabase:\n{tresc}\n{podpowiedz}\n", file=sys.stderr)
        if e.code in (401, 403, 404):
            raise BrakDostepu(1)
        raise SystemExit(1)


# ⚠️ Jedyny wyjątek od zasady „zastosowanej migracji się nie edytuje”.
# 0001–0004 odtworzono ze ZRZUTU produkcji (2026-09-07), w którym były już
# kolumny dodawane potem przez 0005 i 0009 — więc pusta baza (pierwszy nowy
# klient, 2026-10-08: demo) padała na `column ... already exists`. Te dwa pliki
# dostały `add column if not exists`, co w bazach, gdzie już przeszły, niczego
# nie zmienia. Tu stoją ich STARE sumy: baza, która je ma, dostaje po cichu
# nową sumę zamiast alarmu o rozjeździe. Nie dopisuj tu nic bez takiego samego
# uzasadnienia — każda inna zmiana zastosowanego pliku ma zatrzymać runner.
POPRAWIONE_PO_FAKCIE = {
    "0005_grafik_podstawy": {"86e2fa127789f412"},
    "0009_grafik_dostep_pracownika": {"be36990c77c18ccc"},
}


def suma(sciezka):
    return hashlib.sha256(sciezka.read_bytes()).hexdigest()[:16]


def wczytaj_pliki():
    pliki = sorted(p for p in KATALOG.glob("*.sql"))
    if not pliki:
        sys.exit(f"Brak migracji w {KATALOG}")
    numery = [int(p.name[:4]) for p in pliki]
    dziury = [n for n in range(min(numery), max(numery)) if n not in numery]
    if dziury:
        print(f"  UWAGA: brakuje numerów {dziury} — pusta baza NIE zbuduje się w całości.")
        print("  (0001–0004 czekają na odtworzenie ze zrzutu, patrz docs/sql/migrations/README.md)\n")
    return pliki


def zastosowane(ref, token):
    istnieje = zapytanie(ref, token,
        "select to_regclass('public.schema_migrations') is not null as jest;")
    if not (istnieje and istnieje[0].get("jest")):
        return None
    wiersze = zapytanie(ref, token, "select version, checksum from schema_migrations;")
    return {w["version"]: w["checksum"] for w in wiersze}


def zapisz_rejestr(ref, token, wersja, csum, kto):
    zapytanie(ref, token,
        "insert into schema_migrations (version, checksum, applied_by) values "
        f"('{wersja}', '{csum}', '{kto}') "
        "on conflict (version) do update set checksum = excluded.checksum;")


def migruj(ref, token, wykonaj, do_numeru=None, oznacz=(), kto="migrate.py"):
    """Plan albo zapis migracji dla jednej bazy. Zwraca liczbę czekających.

    Woła ją `main` (jedna baza albo --wszyscy) i `nowy-klient.py`. Błąd API
    kończy CAŁY przebieg (SystemExit z `zapytanie`) — przy --wszyscy to
    świadome: migracja, która padła u pierwszego klienta, nie ma iść dalej.
    """
    print(f"\n  Projekt: {ref}")
    print(f"  Tryb:    {'ZAPIS' if wykonaj else 'suchy przebieg (bez --wykonaj nic się nie zmieni)'}\n")

    pliki = wczytaj_pliki()
    stan = zastosowane(ref, token)

    if stan is None:
        boot = KATALOG / "0000_rejestr_migracji.sql"
        print("  Rejestru migracji jeszcze nie ma — pierwszy krok to 0000_rejestr_migracji")
        if wykonaj:
            zapytanie(ref, token, boot.read_text())
            zapisz_rejestr(ref, token, boot.stem, suma(boot), kto)
            print("    zastosowano 0000_rejestr_migracji")
            stan = {boot.stem: suma(boot)}
        else:
            stan = {}

    tylko_oznacz = {n.zfill(4) for n in oznacz}
    do_zrobienia, rozjazdy, nowe_sumy = [], [], []

    for p in pliki:
        w, csum = p.stem, suma(p)
        if w in stan:
            if stan[w] in POPRAWIONE_PO_FAKCIE.get(w, ()):
                nowe_sumy.append((w, csum))
            elif stan[w] != csum:
                rozjazdy.append(w)
            continue
        do_zrobienia.append((p, w, csum, p.name[:4] in tylko_oznacz))

    if rozjazdy:
        print("  ZASTOSOWANA MIGRACJA ZOSTAŁA ZMIENIONA PO FAKCIE:")
        for w in rozjazdy:
            print(f"    {w}")
        print("  Bazy klientów już się rozjechały albo zaraz się rozjadą.")
        print("  Nie edytuj zastosowanych plików — dopisz nową migrację.\n")
        sys.exit(1)

    for w, csum in nowe_sumy:
        print(f"  [nowa suma kontrolna] {w} — plik poprawiony po fakcie, treść "
              "bez skutku dla tej bazy (patrz POPRAWIONE_PO_FAKCIE)")
        if wykonaj:
            zapisz_rejestr(ref, token, w, csum, kto)

    # ⚠️ Migracja bywa związana z KOLEJNOŚCIĄ wdrożenia i nie wolno jej puścić
    # razem z poprzednią: `0029` musiała pójść przed deployem 0.43.0, a `0030`
    # dopiero po nim — puszczone razem zostawiały tablety z pustym ekranem
    # wyboru osoby. Domyślnie runner stosuje WSZYSTKO, co czeka, więc taki
    # przypadek trzeba ograniczyć jawnie.
    if do_numeru:
        granica = do_numeru.zfill(4)
        odrzucone = [w for _, w, _, _ in do_zrobienia if w[:4] > granica]
        do_zrobienia = [x for x in do_zrobienia if x[1][:4] <= granica]
        if odrzucone:
            print(f"  Zatrzymuję się na {granica}. Czekają dalej: "
                  + ", ".join(odrzucone) + "\n")

    if not do_zrobienia:
        print("  Nic do zrobienia, baza jest aktualna.\n")
        return 0

    for p, w, csum, tylko in do_zrobienia:
        etykieta = "oznacz jako zastosowane" if tylko else "zastosuj"
        print(f"  [{etykieta}] {w}")
        if not wykonaj:
            continue
        if not tylko:
            zapytanie(ref, token, p.read_text())
        zapisz_rejestr(ref, token, w, csum, kto)
        print("      gotowe")

    if not wykonaj:
        print("\n  To był suchy przebieg. Dodaj --wykonaj, żeby zastosować.\n")
    else:
        print(f"\n  Gotowe: {len(do_zrobienia)} migracji.\n")
    return len(do_zrobienia)


def main():
    ap = argparse.ArgumentParser()
    cel = ap.add_mutually_exclusive_group(required=True)
    cel.add_argument("--projekt", help="ref projektu Supabase")
    # ⚠️ Model silo: każda migracja musi trafić do KAŻDEJ bazy. Pilnowane z
    # pamięci, prędzej czy później któraś zostanie w tyle i aplikacja (jedna
    # dla wszystkich) zacznie pytać o kolumnę, której u jednego klienta nie ma.
    cel.add_argument("--wszyscy", action="store_true",
                     help="wszystkie bazy z rejestru klientów (klienci.json)")
    ap.add_argument("--wykonaj", action="store_true")
    ap.add_argument("--oznacz-zastosowane", nargs="*", default=[], metavar="NR",
                    help="zapisz jako zastosowane BEZ uruchamiania (istniejąca baza)")
    ap.add_argument("--do", dest="do_numeru", metavar="NR",
                    help="zatrzymaj się na tej migracji włącznie — dla migracji, "
                         "która musi poczekać na deploy (patrz 0030)")
    args = ap.parse_args()

    token = os.environ.get("SUPABASE_PAT")
    if not token:
        sys.exit("Brak SUPABASE_PAT w środowisku — patrz docstring na górze pliku.")
    kto = os.environ.get("USER", "migrate.py")

    if not args.wszyscy:
        migruj(args.projekt, token, args.wykonaj, args.do_numeru,
               args.oznacz_zastosowane, kto)
        return

    if args.oznacz_zastosowane:
        sys.exit("--oznacz-zastosowane dotyczy jednej konkretnej bazy — użyj --projekt.")
    from shiftro_ops import wczytaj_rejestr
    klienci = wczytaj_rejestr()["klienci"]
    if not klienci:
        sys.exit("Rejestr klientów jest pusty.")
    podsumowanie = []
    for k in klienci:
        print(f"\n===== {k['slug']} — {k.get('nazwa', '')} ({k['supabase_ref']}) =====")
        # Brak DOSTĘPU do jednej bazy (401/403/404) nie zatrzymuje pozostałych —
        # to sprawa tokenu, nie migracji. Błąd w SQL dalej kończy cały przebieg
        # (patrz docstring `migruj`): migracja, która padła u jednego klienta,
        # nie ma iść dalej.
        try:
            n = migruj(k["supabase_ref"], token, args.wykonaj, args.do_numeru, (), kto)
        except BrakDostepu:
            n = None
        podsumowanie.append((k["slug"], n))
    print("\n===== Podsumowanie =====")
    for slug, n in podsumowanie:
        co = ("BRAK DOSTĘPU — patrz wyżej" if n is None else "aktualna" if n == 0
              else (f"zastosowano {n}" if args.wykonaj else f"czeka {n}"))
        print(f"  {slug:<20} {co}")
    print()
    if any(n is None for _, n in podsumowanie):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
