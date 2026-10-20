#!/usr/bin/env python3
"""Przegląd wszystkich klientów z rejestru (klienci.json).

    python3 scripts/klienci.py lista
    python3 scripts/klienci.py sprawdz          # wymaga SUPABASE_PAT

`sprawdz` pyta /api/zdrowie każdego wdrożenia i porównuje z repozytorium:
wersję aplikacji, liczbę migracji, komplet zmiennych, Brevo. Puść go po
każdym wydaniu — w modelu silo jeden zapomniany klient wygląda dokładnie jak
działający, dopóki ktoś tam nie zadzwoni.

CRON_SECRET bierze z Vault bazy klienta (przez SUPABASE_PAT), więc nic nie
trzeba trzymać lokalnie.

Od 0.77.0 `sprawdz` mówi też o cronach (czy każdy miał udany przebieg w swoim
oknie — dziennik z migracji 0046) i o błędach aplikacji z ostatniej doby. Kod
wyjścia 1 = coś wymaga uwagi; na tym stoi codzienny monitoring
(.github/workflows/monitoring.yml).

Monitoring w GitHub Actions NIE dostaje SUPABASE_PAT (ten token otwiera
wszystkie bazy na koncie). Zamiast tego sekrety cronów podaje się wprost:

    SHIFTRO_SEKRETY_CRONA='{"emka": "…", "demo": "…"}' python3 scripts/klienci.py sprawdz

CRON_SECRET otwiera tylko crony i /api/zdrowie danego klienta.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shiftro_ops import (  # noqa: E402
    ROOT, BladApi, sekret_crona_z_vault, wczytaj_rejestr, wersja_lokalna,
    wymagaj_env, zdrowie,
)


def lista(rej):
    for k in rej["klienci"]:
        print(f"  {k['slug']:<16} {k.get('nazwa', ''):<28} {k['domena']:<26} {k['supabase_ref']}")


def sprawdz(rej):
    sekrety = None
    if os.environ.get("SHIFTRO_SEKRETY_CRONA"):
        try:
            sekrety = json.loads(os.environ["SHIFTRO_SEKRETY_CRONA"])
        except json.JSONDecodeError:
            sys.exit("SHIFTRO_SEKRETY_CRONA to nie jest poprawny JSON ({\"slug\": \"sekret\"}).")
        pat = None
    else:
        pat = wymagaj_env("SUPABASE_PAT", "Supabase → Account → Access Tokens")
    wersja = wersja_lokalna()
    migracji = len(list((ROOT / "docs" / "sql" / "migrations").glob("*.sql")))
    print(f"\n  Repozytorium: wersja {wersja}, migracji {migracji}\n")
    zle = 0
    for k in rej["klienci"]:
        uwagi = []
        if sekrety is not None:
            sekret = sekrety.get(k["slug"])
            if not sekret:
                uwagi.append("brak sekretu w SHIFTRO_SEKRETY_CRONA")
        else:
            try:
                sekret = sekret_crona_z_vault(pat, k["supabase_ref"])
            except BladApi as e:
                sekret, uwagi = None, [f"Vault niedostępny ({e.kod})"]
        if not sekret:
            if sekrety is None:
                uwagi.append("brak CRON_SECRET w Vault — uruchom nowy-klient.py dla tego klienta")
            z = {}
        else:
            z = zdrowie(k["domena"], sekret)
            if z.get("wersja") and z["wersja"] != wersja:
                uwagi.append(f"wersja {z['wersja']}")
            baza = z.get("baza") or {}
            if not baza.get("ok"):
                uwagi.append("baza: " + str(baza.get("blad") or "brak połączenia"))
            elif baza.get("migracji") != migracji:
                uwagi.append(f"migracji {baza.get('migracji')} (ostatnia {baza.get('ostatnia_migracja')})")
            if z.get("brak"):
                uwagi.append("brak zmiennych: " + ", ".join(z["brak"]))
            uwagi += z.get("problemy") or []
            if z.get("brevo") not in (None, "ok") and not z.get("demo"):
                uwagi.append(f"Brevo: {z['brevo']}")
            if z.get("blad"):
                uwagi.append(str(z["blad"]))
        zle += bool(uwagi)
        # Błędy z doby pokazujemy zawsze — także pod progiem alarmu, żeby było
        # widać, czy coś zaczyna rosnąć.
        b = (z.get("bledy") or {}) if sekret else {}
        dopisek = f" · błędy 24 h: {b['ostatnie_24h']}" if b.get("ostatnie_24h") is not None else ""
        bez_pomiaru = [c["nazwa"] for c in (z.get("crony") or []) if c.get("stan") == "bez pomiaru"]
        if bez_pomiaru:
            dopisek += f" · crony bez pomiaru: {len(bez_pomiaru)}"
        print(f"  {'✓' if not uwagi else '✗'} {k['slug']:<16} {k['domena']:<26} "
              + ("w porządku" if not uwagi else "; ".join(uwagi)) + dopisek)
    print()
    return 1 if zle else 0


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("lista", "sprawdz"):
        sys.exit(__doc__)
    rej = wczytaj_rejestr()
    if sys.argv[1] == "lista":
        lista(rej)
        return 0
    return sprawdz(rej)


if __name__ == "__main__":
    sys.exit(main())
