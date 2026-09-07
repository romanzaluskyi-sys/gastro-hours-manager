#!/usr/bin/env python3
"""Stosowanie migracji SQL do bazy Supabase.

Domyślnie SUCHY PRZEBIEG — niczego nie zmienia, tylko drukuje plan.
Zapis dopiero z --wykonaj (ta sama konwencja co scripts/import-grafik.py).

    python3 scripts/migrate.py --projekt gdzossvaauznqsrfqovw
    python3 scripts/migrate.py --projekt gdzossvaauznqsrfqovw --wykonaj

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
            403: "  Brak dostępu do tego projektu tym tokenem (albo blokada Cloudflare).",
            404: "  Nie ma takiego projektu — sprawdź ref po --projekt.",
        }.get(e.code, "")
        print(f"\n  BŁĄD {e.code} od Supabase:\n{tresc}\n{podpowiedz}\n", file=sys.stderr)
        raise SystemExit(1)


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--projekt", required=True, help="ref projektu Supabase")
    ap.add_argument("--wykonaj", action="store_true")
    ap.add_argument("--oznacz-zastosowane", nargs="*", default=[], metavar="NR",
                    help="zapisz jako zastosowane BEZ uruchamiania (istniejąca baza)")
    args = ap.parse_args()

    token = os.environ.get("SUPABASE_PAT")
    if not token:
        sys.exit("Brak SUPABASE_PAT w środowisku — patrz docstring na górze pliku.")
    kto = os.environ.get("USER", "migrate.py")

    print(f"\n  Projekt: {args.projekt}")
    print(f"  Tryb:    {'ZAPIS' if args.wykonaj else 'suchy przebieg (bez --wykonaj nic się nie zmieni)'}\n")

    pliki = wczytaj_pliki()
    stan = zastosowane(args.projekt, token)

    if stan is None:
        boot = KATALOG / "0000_rejestr_migracji.sql"
        print("  Rejestru migracji jeszcze nie ma — pierwszy krok to 0000_rejestr_migracji")
        if args.wykonaj:
            zapytanie(args.projekt, token, boot.read_text())
            zapisz_rejestr(args.projekt, token, boot.stem, suma(boot), kto)
            print("    zastosowano 0000_rejestr_migracji")
            stan = {boot.stem: suma(boot)}
        else:
            stan = {}

    tylko_oznacz = {n.zfill(4) for n in args.oznacz_zastosowane}
    do_zrobienia, rozjazdy = [], []

    for p in pliki:
        w, csum = p.stem, suma(p)
        if w in stan:
            if stan[w] != csum:
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

    if not do_zrobienia:
        print("  Nic do zrobienia, baza jest aktualna.\n")
        return

    for p, w, csum, oznacz in do_zrobienia:
        etykieta = "oznacz jako zastosowane" if oznacz else "zastosuj"
        print(f"  [{etykieta}] {w}")
        if not args.wykonaj:
            continue
        if not oznacz:
            zapytanie(args.projekt, token, p.read_text())
        zapisz_rejestr(args.projekt, token, w, csum, kto)
        print("      gotowe")

    if not args.wykonaj:
        print("\n  To był suchy przebieg. Dodaj --wykonaj, żeby zastosować.\n")
    else:
        print(f"\n  Gotowe: {len(do_zrobienia)} migracji.\n")


if __name__ == "__main__":
    main()
