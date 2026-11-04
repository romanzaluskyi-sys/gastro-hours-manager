#!/usr/bin/env python3
"""Zrzut bazy klienta do plików JSON — przed migracją, „na wszelki wypadek”.

Tylko ODCZYT. Idzie tym samym API i tym samym tokenem co migrate.py
(SUPABASE_PAT), więc nie wymaga pg_dump ani hasła do bazy.

    export SUPABASE_PAT=sbp_...
    python3 scripts/eksport-bazy.py --wszyscy          # każda baza z klienci.json
    python3 scripts/eksport-bazy.py --klient emka      # jedna baza

Wynik: kopie/<klient>-<RRRR-MM-DD_GGMM>/
    <tabela>.json          — wszystkie wiersze każdej tabeli ze schematu public
    _funkcje.sql           — definicje funkcji public (w tym triggerów — np.
                             dyspozycja_autor sprzed 0052, do cofnięcia ręcznie)
    _polityki.json         — pg_policies
    _schema_migrations.json, _liczniki.json

⚠️ Pliki zawierają dane osobowe pracowników (stawki, telefony, e-maile).
Katalog `kopie/` jest w .gitignore — NIE wrzucaj go nigdzie, trzymaj lokalnie
i skasuj, gdy przestanie być potrzebny.

⚠️ To NIE jest pełna kopia do odtworzenia jednym poleceniem (bez kont Auth,
bez schematu). Od katastrof są automatyczne kopie Supabase (Database →
Backups) — patrz docs/KOPIE-ZAPASOWE.md. Ten zrzut pozwala odzyskać konkretne
wiersze albo porównać stan przed i po migracji.
"""
import argparse
import datetime
import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from shiftro_ops import ROOT, BladApi, klient, sql, wczytaj_rejestr  # noqa: E402

PORCJA = 2000  # wierszy na zapytanie — odpowiedź API ma limit rozmiaru


def ref_klienta(k):
    return k.get("supabase_ref") or k.get("ref") or next((v for kk, v in k.items() if "ref" in kk and isinstance(v, str)), None)


def zrzuc_tabele(token, ref, tabela):
    wiersze = []
    od = 0
    while True:
        q = (
            f'select coalesce(json_agg(t), \'[]\'::json) as dane from '
            f'(select * from public."{tabela}" order by 1 limit {PORCJA} offset {od}) t;'
        )
        wynik = sql(token, ref, q)
        porcja = wynik[0]["dane"] if wynik else []
        if isinstance(porcja, str):
            porcja = json.loads(porcja)
        wiersze.extend(porcja or [])
        if len(porcja or []) < PORCJA:
            return wiersze
        od += PORCJA


def eksportuj(token, slug, ref):
    znacznik = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
    katalog = ROOT / "kopie" / f"{slug}-{znacznik}"
    katalog.mkdir(parents=True, exist_ok=True)
    print(f"\n== {slug} ({ref}) → {katalog.relative_to(ROOT)}")

    tabele = [r["tablename"] for r in sql(token, ref,
              "select tablename from pg_tables where schemaname = 'public' order by tablename;")]
    liczniki = {}
    for t in tabele:
        try:
            w = zrzuc_tabele(token, ref, t)
        except BladApi as e:
            print(f"  ! {t}: {e}")
            liczniki[t] = f"BŁĄD: {e}"
            continue
        (katalog / f"{t}.json").write_text(json.dumps(w, ensure_ascii=False, indent=1, default=str))
        liczniki[t] = len(w)
        print(f"  {t:32} {len(w):>6}")

    funkcje = sql(token, ref, """
        select p.proname, pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
        order by p.proname;""")
    (katalog / "_funkcje.sql").write_text(
        "\n\n".join(f"-- {f['proname']}\n{f['def']};" for f in funkcje) + "\n")
    polityki = sql(token, ref, "select * from pg_policies where schemaname = 'public' order by tablename, policyname;")
    (katalog / "_polityki.json").write_text(json.dumps(polityki, ensure_ascii=False, indent=1, default=str))
    (katalog / "_liczniki.json").write_text(json.dumps(liczniki, ensure_ascii=False, indent=1))
    if "schema_migrations" in liczniki and isinstance(liczniki["schema_migrations"], int):
        mig = json.loads((katalog / "schema_migrations.json").read_text())
        nazwy = sorted(str(m.get("wersja") or m.get("version") or m.get("nazwa") or m.get("name") or "") for m in mig)
        print(f"  migracje w bazie: {len(mig)} (ostatnia: {nazwy[-1] if nazwy else '—'})")
    print(f"  funkcje: {len(funkcje)}, polityki: {len(polityki)}")
    bledy = [t for t, v in liczniki.items() if not isinstance(v, int)]
    return not bledy


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--klient", help="slug z klienci.json (np. emka)")
    g.add_argument("--wszyscy", action="store_true", help="każda baza z klienci.json")
    a = ap.parse_args()

    token = os.environ.get("SUPABASE_PAT", "").strip()
    if not token:
        sys.exit("Brak SUPABASE_PAT w środowisku — export SUPABASE_PAT=sbp_... (ten sam co do migrate.py).")

    rej = wczytaj_rejestr()
    lista = rej.get("klienci", []) if a.wszyscy else [klient(rej, a.klient)]
    if not lista or lista[0] is None:
        sys.exit(f"Nie ma klienta „{a.klient}” w klienci.json.")

    ok = True
    for k in lista:
        ref = ref_klienta(k)
        if not ref:
            print(f"\n== {k.get('slug')}: brak ref projektu w klienci.json — pomijam")
            ok = False
            continue
        try:
            ok = eksportuj(token, k["slug"], ref) and ok
        except BladApi as e:
            print(f"  ! {k['slug']}: {e}")
            ok = False
    print("\nGotowe." if ok else "\nGotowe, ale z błędami — patrz wyżej.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
